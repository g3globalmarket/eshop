/**
 * QPay Payment Reconciliation Service
 *
 * Background job that periodically checks for QPay sessions that are PAID
 * but haven't had orders created yet. This provides eventual consistency
 * in case webhooks are missed or fail.
 *
 * Key features:
 * - Distributed lock (Redis) for multi-instance safety
 * - Rate limiting per session (lastCheckAt)
 * - Uses same order creation flow as webhook
 * - Idempotent (via QPayProcessedInvoice)
 */

import { PrismaClient } from "@prisma/client";
import { getQPayClient } from "./qpay.client";
import { createOrdersFromSession } from "../controllers/order.controller";
import redis from "@packages/libs/redis";

const prisma = new PrismaClient();

// Configuration
const RECONCILE_INTERVAL_MS = 60 * 1000; // 60 seconds
const LOCK_KEY = "qpay:reconcile:lock";
const LOCK_TTL_SECONDS = 55; // Lock expires before next cycle
const BATCH_SIZE = 25; // Max sessions to process per cycle
const MIN_SESSION_AGE_SECONDS = 30; // Avoid racing with fresh updates
const MIN_CHECK_INTERVAL_SECONDS = 30; // Rate limit QPay API calls
const AMOUNT_TOLERANCE_MNT = 1; // 1 MNT tolerance for amount matching

// Ebarimt configuration
const QPAY_EBARIMT_ENABLED = process.env.QPAY_EBARIMT_ENABLED === "true";
const QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE =
  process.env.QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE || "CITIZEN";
const QPAY_EBARIMT_DEFAULT_DISTRICT_CODE =
  process.env.QPAY_EBARIMT_DEFAULT_DISTRICT_CODE || "3505";
const QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE =
  process.env.QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE || "0000010";

let isRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Try to acquire distributed lock
 * Returns true if lock acquired, false otherwise
 */
async function acquireLock(): Promise<boolean> {
  try {
    // SET NX EX: Set if Not eXists with EXpiry
    const result = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL_SECONDS, "NX");
    return result === "OK";
  } catch (error) {
    console.error("[QPay Reconcile] Failed to acquire lock:", error);
    return false;
  }
}

/**
 * Release distributed lock
 */
async function releaseLock(): Promise<void> {
  try {
    await redis.del(LOCK_KEY);
  } catch (error) {
    console.error("[QPay Reconcile] Failed to release lock:", error);
  }
}

/**
 * Create Ebarimt (Mongolian e-receipt) for a paid session
 * This is best-effort and never throws - failures are logged and stored in DB
 */
async function createEbarimtForSession(
  sessionId: string,
  paymentId: string,
  sessionPayload: any
): Promise<void> {
  try {
    // Check if Ebarimt creation is enabled
    if (!QPAY_EBARIMT_ENABLED) {
      console.debug("[QPay Ebarimt] Skipped (disabled)", { sessionId });
      await prisma.qPayPaymentSession.updateMany({
        where: { sessionId },
        data: { ebarimtStatus: "SKIPPED" },
      });
      return;
    }

    // Check if already created
    const session = await prisma.qPayPaymentSession.findUnique({
      where: { sessionId },
      select: { ebarimtReceiptId: true, ebarimtStatus: true },
    });

    if (session?.ebarimtReceiptId || session?.ebarimtStatus === "REGISTERED") {
      console.debug("[QPay Ebarimt] Already created", {
        sessionId,
        receiptId: session.ebarimtReceiptId,
      });
      return;
    }

    // Get Ebarimt parameters from session payload or use defaults
    const ebarimtConfig = sessionPayload?.ebarimt ?? {};
    const receiverType =
      ebarimtConfig.receiverType ?? QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE;
    const receiver = ebarimtConfig.receiver; // Optional
    const districtCode =
      ebarimtConfig.districtCode ?? QPAY_EBARIMT_DEFAULT_DISTRICT_CODE;
    const classificationCode =
      ebarimtConfig.classificationCode ??
      QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE;

    console.info("[QPay Ebarimt] Creating receipt", {
      sessionId,
      paymentId,
      receiverType,
      hasReceiver: !!receiver,
      districtCode,
      classificationCode,
    });

    // Call QPay API to create Ebarimt
    const qpayClient = getQPayClient();
    const result = await qpayClient.createEbarimtV3({
      payment_id: paymentId,
      ebarimt_receiver_type: receiverType,
      ebarimt_receiver: receiver,
      district_code: districtCode,
      classification_code: classificationCode,
    });

    if (result.success && result.data) {
      // Success - store receipt data
      await prisma.qPayPaymentSession.updateMany({
        where: { sessionId },
        data: {
          ebarimtStatus: result.data.barimt_status ?? "REGISTERED",
          ebarimtReceiptId: result.data.ebarimt_receipt_id,
          ebarimtQrData: result.data.ebarimt_qr_data,
          ebarimtRaw: result.data as any,
          ebarimtCreatedAt: new Date(),
          ebarimtLastError: null, // Clear any previous error
        },
      });

      console.info("✅ [QPay Ebarimt] Receipt created successfully", {
        sessionId,
        paymentId,
        receiptId: result.data.ebarimt_receipt_id,
        status: result.data.barimt_status,
      });
    } else {
      // Failed - store error
      const errorMsg = result.error ?? "Unknown error";
      await prisma.qPayPaymentSession.updateMany({
        where: { sessionId },
        data: {
          ebarimtStatus: "ERROR",
          ebarimtLastError: errorMsg.substring(0, 500), // Truncate to 500 chars
        },
      });

      console.error("❌ [QPay Ebarimt] Creation failed", {
        sessionId,
        paymentId,
        error: errorMsg,
      });
    }
  } catch (error: any) {
    // Unexpected error - log and store
    console.error("[QPay Ebarimt] Unexpected error", {
      sessionId,
      paymentId,
      error: error.message,
      stack: error.stack,
    });

    try {
      await prisma.qPayPaymentSession.updateMany({
        where: { sessionId },
        data: {
          ebarimtStatus: "ERROR",
          ebarimtLastError: `Unexpected error: ${error.message}`.substring(
            0,
            500
          ),
        },
      });
    } catch (dbError: any) {
      console.error("[QPay Ebarimt] Failed to store error in DB", {
        sessionId,
        dbError: dbError.message,
      });
    }
  }
}

/**
 * Get candidate sessions for reconciliation
 * Excludes CANCELLED and EXPIRED sessions (user cancelled or session expired - no need to check)
 * Policy: Only webhook will create orders for cancelled sessions if payment is verified
 */
async function getCandidateSessions() {
  const cutoffTime = new Date(Date.now() - MIN_SESSION_AGE_SECONDS * 1000);

  try {
    const sessions = await prisma.qPayPaymentSession.findMany({
      where: {
        provider: "qpay",
        invoiceId: { not: null },
        status: { in: ["PENDING", "PAID"] }, // Excludes CANCELLED, EXPIRED, PROCESSED, FAILED
        updatedAt: { lt: cutoffTime },
      },
      orderBy: { updatedAt: "asc" }, // Oldest first
      take: BATCH_SIZE,
    });

    return sessions;
  } catch (error) {
    console.error("[QPay Reconcile] Error querying candidate sessions:", error);
    return [];
  }
}

/**
 * Process a single session
 */
async function processSession(session: any): Promise<void> {
  const { sessionId, invoiceId, amount: expectedAmount } = session;

  if (!invoiceId) {
    console.warn("[QPay Reconcile] Session has no invoiceId, skipping", {
      sessionId,
    });
    return;
  }

  // Rate limit: Skip if checked recently
  if (session.lastCheckAt) {
    const timeSinceLastCheck =
      Date.now() - new Date(session.lastCheckAt).getTime();
    if (timeSinceLastCheck < MIN_CHECK_INTERVAL_SECONDS * 1000) {
      console.debug("[QPay Reconcile] Session checked recently, skipping", {
        sessionId,
        invoiceId,
        lastCheckAt: session.lastCheckAt,
      });
      return;
    }
  }

  console.info("[QPay Reconcile] Processing session", {
    sessionId,
    invoiceId,
    currentStatus: session.status,
  });

  try {
    // Call QPay API to check payment status
    const qpayClient = getQPayClient();
    const paymentCheckResult = await qpayClient.paymentCheckInvoice(invoiceId);

    // Update lastCheckAt
    await prisma.qPayPaymentSession.update({
      where: { sessionId },
      data: { lastCheckAt: new Date() },
    });

    // Check if paid and extract payment_id
    const paidRow = paymentCheckResult.rows?.find(
      (r) => r.payment_status === "PAID"
    );
    const isPaid = !!paidRow;
    const paymentId = paidRow?.payment_id ?? null;
    const paidAmount = Number(paymentCheckResult.paid_amount ?? 0);
    const expectedAmountNum = Number(expectedAmount);
    const amountOk =
      Math.abs(paidAmount - expectedAmountNum) < AMOUNT_TOLERANCE_MNT;

    console.info("[QPay Reconcile] Payment check result", {
      sessionId,
      invoiceId,
      isPaid,
      paymentId,
      paidAmount,
      expectedAmount: expectedAmountNum,
      amountOk,
    });

    // If not paid or amount mismatch, keep status as-is
    if (!isPaid || !amountOk) {
      if (session.status === "PAID") {
        // Downgrade to PENDING if amount doesn't match
        await prisma.qPayPaymentSession.update({
          where: { sessionId },
          data: { status: "PENDING" },
        });
        console.warn("[QPay Reconcile] Payment status downgraded to PENDING", {
          sessionId,
          invoiceId,
          reason: !isPaid ? "NOT_PAID" : "AMOUNT_MISMATCH",
        });
      }
      return;
    }

    // Payment is PAID and amount is OK
    // Update status to PAID if not already, and store paymentId
    if (session.status !== "PAID" || !session.paymentId) {
      await prisma.qPayPaymentSession.update({
        where: { sessionId },
        data: {
          status: "PAID",
          paymentId: paymentId ?? undefined,
        },
      });
    }

    // Check if order already created (idempotency)
    const existingProcessed = await prisma.qPayProcessedInvoice.findUnique({
      where: { invoiceId },
    });

    if (existingProcessed) {
      // Order already created, just update session status
      await prisma.qPayPaymentSession.update({
        where: { sessionId },
        data: { status: "PROCESSED" },
      });
      console.info(
        "[QPay Reconcile] Order already exists, updated session status",
        {
          sessionId,
          invoiceId,
          orderIds: existingProcessed.orderIds,
        }
      );

      // Try to create Ebarimt if not already created (best effort)
      if (paymentId) {
        await createEbarimtForSession(sessionId, paymentId, session.payload);
      }

      return;
    }

    // Create order idempotently
    console.info("[QPay Reconcile] Creating order for paid session", {
      sessionId,
      invoiceId,
    });

    // Create QPayProcessedInvoice record first (acts as lock)
    try {
      await prisma.qPayProcessedInvoice.create({
        data: {
          invoiceId,
          sessionId,
          status: "PAID",
          orderIds: [],
        },
      });
    } catch (error: any) {
      // Race condition: another process created it first
      if (error.code === 11000 || error.message?.includes("duplicate")) {
        console.info(
          "[QPay Reconcile] Order being created by another process",
          {
            sessionId,
            invoiceId,
          }
        );
        return;
      }
      throw error;
    }

    // Load session data from DB
    const sessionData = JSON.stringify(session.payload);
    const userId = session.userId;
    const sessionKey = `payment-session:${sessionId}`;

    // Create orders using same logic as webhook
    const orderIds = await createOrdersFromSession(
      sessionData,
      userId,
      sessionKey,
      sessionId
    );

    // Update QPayProcessedInvoice with order IDs
    await prisma.qPayProcessedInvoice.update({
      where: { invoiceId },
      data: {
        orderIds,
        processedAt: new Date(),
      },
    });

    // Update session status to PROCESSED
    await prisma.qPayPaymentSession.update({
      where: { sessionId },
      data: { status: "PROCESSED" },
    });

    console.info("✅ [QPay Reconcile] Order created successfully", {
      sessionId,
      invoiceId,
      orderIds,
      paidAmount,
      expectedAmount: expectedAmountNum,
    });

    // Create Ebarimt (Mongolian e-receipt) - best effort, never throws
    // This runs AFTER order creation to ensure orders are always created even if Ebarimt fails
    if (paymentId) {
      await createEbarimtForSession(sessionId, paymentId, session.payload);
    } else {
      console.warn("[QPay Reconcile] No paymentId available for Ebarimt", {
        sessionId,
        invoiceId,
      });
    }
  } catch (error: any) {
    console.error("[QPay Reconcile] Error processing session", {
      sessionId,
      invoiceId,
      error: error.message,
      stack: error.stack,
    });
    // Continue with next session (don't let one failure stop the whole batch)
  }
}

/**
 * Run one reconciliation cycle
 */
async function runReconcileCycle(): Promise<void> {
  if (isRunning) {
    console.debug("[QPay Reconcile] Previous cycle still running, skipping");
    return;
  }

  isRunning = true;

  try {
    // Try to acquire distributed lock
    const lockAcquired = await acquireLock();

    if (!lockAcquired) {
      console.debug(
        "[QPay Reconcile] Could not acquire lock, another instance is running"
      );
      return;
    }

    console.info("[QPay Reconcile] Starting reconciliation cycle");

    // Get candidate sessions
    const sessions = await getCandidateSessions();

    if (sessions.length === 0) {
      console.info("[QPay Reconcile] No sessions to reconcile");
      return;
    }

    console.info("[QPay Reconcile] Found sessions to process", {
      count: sessions.length,
    });

    // Process each session
    for (const session of sessions) {
      await processSession(session);
    }

    console.info("[QPay Reconcile] Cycle complete", {
      processed: sessions.length,
    });
  } catch (error: any) {
    console.error("[QPay Reconcile] Error in reconciliation cycle", {
      error: error.message,
      stack: error.stack,
    });
  } finally {
    // Always release lock and reset running flag
    await releaseLock();
    isRunning = false;
  }
}

/**
 * Start the reconciliation service
 */
export function startQPayReconciliation(): void {
  if (intervalHandle) {
    console.warn("[QPay Reconcile] Service already running");
    return;
  }

  console.info("[QPay Reconcile] Starting reconciliation service", {
    intervalMs: RECONCILE_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    minSessionAgeSeconds: MIN_SESSION_AGE_SECONDS,
    minCheckIntervalSeconds: MIN_CHECK_INTERVAL_SECONDS,
  });

  // Run first cycle immediately (but async)
  setTimeout(() => runReconcileCycle(), 5000); // 5s delay to let server start

  // Schedule periodic cycles
  intervalHandle = setInterval(() => {
    runReconcileCycle();
  }, RECONCILE_INTERVAL_MS);
}

/**
 * Stop the reconciliation service
 */
export function stopQPayReconciliation(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.info("[QPay Reconcile] Service stopped");
  }
}

/**
 * Force run a reconciliation cycle (for testing/manual trigger)
 */
export async function forceReconcile(): Promise<void> {
  console.info("[QPay Reconcile] Force running reconciliation cycle");
  await runReconcileCycle();
}
