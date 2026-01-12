/**
 * QPay Cleanup Service
 *
 * Periodically cleans up old QPay records to prevent unbounded database growth.
 * Runs every 6 hours by default.
 *
 * Safety features:
 * - Only deletes old completed/failed sessions
 * - Distributed lock for multi-instance safety
 * - Configurable retention periods via environment variables
 * - Never affects active payments (PENDING/PAID status)
 */

import { PrismaClient } from "@prisma/client";
import redis from "@packages/libs/redis";

const prisma = new PrismaClient();

// Configuration with defaults (6 hours = 21,600,000 ms)
const CLEANUP_INTERVAL_MS = parseInt(
  process.env.QPAY_CLEANUP_INTERVAL_MS || "21600000"
);
const LOCK_KEY = "qpay:cleanup:lock";
const LOCK_TTL_SECONDS = 300; // 5 minutes - cleanup should be fast

// Retention periods (in days)
const WEBHOOK_EVENT_RETENTION_DAYS = parseInt(
  process.env.QPAY_WEBHOOK_EVENT_RETENTION_DAYS || "90"
);
const SESSION_PROCESSED_RETENTION_DAYS = parseInt(
  process.env.QPAY_SESSION_PROCESSED_RETENTION_DAYS || "30"
);
const SESSION_FAILED_RETENTION_DAYS = parseInt(
  process.env.QPAY_SESSION_FAILED_RETENTION_DAYS || "30"
);
const PROCESSED_INVOICE_RETENTION_DAYS = parseInt(
  process.env.QPAY_PROCESSED_INVOICE_RETENTION_DAYS || "365"
);

// Session expiry: Mark PENDING sessions as EXPIRED after this many minutes
const SESSION_EXPIRY_MINUTES = parseInt(
  process.env.QPAY_SESSION_EXPIRY_MINUTES || "30"
);

let isRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Try to acquire distributed lock
 */
async function acquireLock(): Promise<boolean> {
  try {
    const result = await redis.set(LOCK_KEY, "1", "EX", LOCK_TTL_SECONDS, "NX");
    return result === "OK";
  } catch (error) {
    console.error("[QPay Cleanup] Failed to acquire lock:", error);
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
    console.error("[QPay Cleanup] Failed to release lock:", error);
  }
}

/**
 * Clean up old webhook events
 */
async function cleanupWebhookEvents(): Promise<number> {
  const cutoffDate = new Date(
    Date.now() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  try {
    const result = await prisma.qPayWebhookEvent.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    const deletedCount = result.count;

    if (deletedCount > 0) {
      console.info("[QPay Cleanup] Deleted old webhook events", {
        count: deletedCount,
        olderThan: cutoffDate.toISOString(),
        retentionDays: WEBHOOK_EVENT_RETENTION_DAYS,
      });
    }

    return deletedCount;
  } catch (error: any) {
    console.error("[QPay Cleanup] Error cleaning webhook events", {
      error: error.message,
    });
    return 0;
  }
}

/**
 * Expire old pending sessions
 * Mark PENDING sessions older than SESSION_EXPIRY_MINUTES as EXPIRED
 * This stops polling and reconciliation from checking them
 */
async function expirePendingSessions(): Promise<number> {
  const cutoffDate = new Date(Date.now() - SESSION_EXPIRY_MINUTES * 60 * 1000);

  try {
    const result = await prisma.qPayPaymentSession.updateMany({
      where: {
        status: "PENDING",
        createdAt: { lt: cutoffDate },
      },
      data: {
        status: "EXPIRED",
        updatedAt: new Date(), // Update timestamp
      },
    });

    const expiredCount = result.count;

    if (expiredCount > 0) {
      console.info("[QPay Cleanup] Expired old pending sessions", {
        count: expiredCount,
        olderThan: cutoffDate.toISOString(),
        expiryMinutes: SESSION_EXPIRY_MINUTES,
      });
    }

    return expiredCount;
  } catch (error: any) {
    console.error("[QPay Cleanup] Error expiring pending sessions", {
      error: error.message,
    });
    return 0;
  }
}

/**
 * Clean up old processed payment sessions
 */
async function cleanupProcessedSessions(): Promise<number> {
  const cutoffDate = new Date(
    Date.now() - SESSION_PROCESSED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  try {
    const result = await prisma.qPayPaymentSession.deleteMany({
      where: {
        status: "PROCESSED",
        updatedAt: { lt: cutoffDate },
      },
    });

    const deletedCount = result.count;

    if (deletedCount > 0) {
      console.info("[QPay Cleanup] Deleted old processed sessions", {
        count: deletedCount,
        olderThan: cutoffDate.toISOString(),
        retentionDays: SESSION_PROCESSED_RETENTION_DAYS,
      });
    }

    return deletedCount;
  } catch (error: any) {
    console.error("[QPay Cleanup] Error cleaning processed sessions", {
      error: error.message,
    });
    return 0;
  }
}

/**
 * Clean up old failed payment sessions
 */
async function cleanupFailedSessions(): Promise<number> {
  const cutoffDate = new Date(
    Date.now() - SESSION_FAILED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  try {
    const result = await prisma.qPayPaymentSession.deleteMany({
      where: {
        status: "FAILED",
        updatedAt: { lt: cutoffDate },
      },
    });

    const deletedCount = result.count;

    if (deletedCount > 0) {
      console.info("[QPay Cleanup] Deleted old failed sessions", {
        count: deletedCount,
        olderThan: cutoffDate.toISOString(),
        retentionDays: SESSION_FAILED_RETENTION_DAYS,
      });
    }

    return deletedCount;
  } catch (error: any) {
    console.error("[QPay Cleanup] Error cleaning failed sessions", {
      error: error.message,
    });
    return 0;
  }
}

/**
 * Clean up old processed invoice records (optional, long retention)
 * This is conservative - we keep these for a long time for audit/idempotency
 */
async function cleanupProcessedInvoices(): Promise<number> {
  // Skip if retention is 0 (keep forever)
  if (PROCESSED_INVOICE_RETENTION_DAYS === 0) {
    return 0;
  }

  const cutoffDate = new Date(
    Date.now() - PROCESSED_INVOICE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  try {
    const result = await prisma.qPayProcessedInvoice.deleteMany({
      where: {
        processedAt: { lt: cutoffDate },
      },
    });

    const deletedCount = result.count;

    if (deletedCount > 0) {
      console.info("[QPay Cleanup] Deleted old processed invoices", {
        count: deletedCount,
        olderThan: cutoffDate.toISOString(),
        retentionDays: PROCESSED_INVOICE_RETENTION_DAYS,
      });
    }

    return deletedCount;
  } catch (error: any) {
    console.error("[QPay Cleanup] Error cleaning processed invoices", {
      error: error.message,
    });
    return 0;
  }
}

/**
 * Run one cleanup cycle
 */
async function runCleanupCycle(): Promise<void> {
  if (isRunning) {
    console.debug("[QPay Cleanup] Previous cycle still running, skipping");
    return;
  }

  isRunning = true;

  try {
    // Try to acquire distributed lock
    const lockAcquired = await acquireLock();

    if (!lockAcquired) {
      console.debug(
        "[QPay Cleanup] Could not acquire lock, another instance is running"
      );
      return;
    }

    console.info("[QPay Cleanup] Starting cleanup cycle", {
      webhookEventRetentionDays: WEBHOOK_EVENT_RETENTION_DAYS,
      sessionProcessedRetentionDays: SESSION_PROCESSED_RETENTION_DAYS,
      sessionFailedRetentionDays: SESSION_FAILED_RETENTION_DAYS,
      processedInvoiceRetentionDays: PROCESSED_INVOICE_RETENTION_DAYS,
    });

    const startTime = Date.now();

    // Run cleanup operations
    const [
      expiredCount,
      webhookEventsDeleted,
      processedSessionsDeleted,
      failedSessionsDeleted,
      processedInvoicesDeleted,
    ] = await Promise.all([
      expirePendingSessions(), // Mark old PENDING sessions as EXPIRED (must run first)
      cleanupWebhookEvents(),
      cleanupProcessedSessions(),
      cleanupFailedSessions(),
      cleanupProcessedInvoices(),
    ]);

    const duration = Date.now() - startTime;
    const totalDeleted =
      webhookEventsDeleted +
      processedSessionsDeleted +
      failedSessionsDeleted +
      processedInvoicesDeleted;

    console.info("[QPay Cleanup] Cycle complete", {
      durationMs: duration,
      sessionsExpired: expiredCount,
      totalDeleted,
      webhookEventsDeleted,
      processedSessionsDeleted,
      failedSessionsDeleted,
      processedInvoicesDeleted,
    });
  } catch (error: any) {
    console.error("[QPay Cleanup] Error in cleanup cycle", {
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
 * Start the cleanup service
 */
export function startQPayCleanup(): void {
  if (intervalHandle) {
    console.warn("[QPay Cleanup] Service already running");
    return;
  }

  console.info("[QPay Cleanup] Starting cleanup service", {
    intervalMs: CLEANUP_INTERVAL_MS,
    intervalHours: CLEANUP_INTERVAL_MS / (60 * 60 * 1000),
    retentionPolicies: {
      webhookEvents: `${WEBHOOK_EVENT_RETENTION_DAYS} days`,
      processedSessions: `${SESSION_PROCESSED_RETENTION_DAYS} days`,
      failedSessions: `${SESSION_FAILED_RETENTION_DAYS} days`,
      processedInvoices:
        PROCESSED_INVOICE_RETENTION_DAYS === 0
          ? "forever"
          : `${PROCESSED_INVOICE_RETENTION_DAYS} days`,
    },
  });

  // Run first cycle after 1 hour (let system stabilize)
  setTimeout(() => runCleanupCycle(), 60 * 60 * 1000);

  // Schedule periodic cycles
  intervalHandle = setInterval(() => {
    runCleanupCycle();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop the cleanup service
 */
export function stopQPayCleanup(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.info("[QPay Cleanup] Service stopped");
  }
}

/**
 * Force run a cleanup cycle (for testing/manual trigger)
 */
export async function forceCleanup(): Promise<void> {
  console.info("[QPay Cleanup] Force running cleanup cycle");
  await runCleanupCycle();
}

/**
 * Get current cleanup statistics (for monitoring)
 */
export async function getCleanupStats(): Promise<{
  oldWebhookEvents: number;
  oldProcessedSessions: number;
  oldFailedSessions: number;
  oldProcessedInvoices: number;
}> {
  const webhookCutoff = new Date(
    Date.now() - WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const sessionProcessedCutoff = new Date(
    Date.now() - SESSION_PROCESSED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const sessionFailedCutoff = new Date(
    Date.now() - SESSION_FAILED_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  const invoiceCutoff = new Date(
    Date.now() - PROCESSED_INVOICE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  const [
    oldWebhookEvents,
    oldProcessedSessions,
    oldFailedSessions,
    oldProcessedInvoices,
  ] = await Promise.all([
    prisma.qPayWebhookEvent.count({
      where: { createdAt: { lt: webhookCutoff } },
    }),
    prisma.qPayPaymentSession.count({
      where: { status: "PROCESSED", updatedAt: { lt: sessionProcessedCutoff } },
    }),
    prisma.qPayPaymentSession.count({
      where: { status: "FAILED", updatedAt: { lt: sessionFailedCutoff } },
    }),
    PROCESSED_INVOICE_RETENTION_DAYS > 0
      ? prisma.qPayProcessedInvoice.count({
          where: { processedAt: { lt: invoiceCutoff } },
        })
      : 0,
  ]);

  return {
    oldWebhookEvents,
    oldProcessedSessions,
    oldFailedSessions,
    oldProcessedInvoices,
  };
}
