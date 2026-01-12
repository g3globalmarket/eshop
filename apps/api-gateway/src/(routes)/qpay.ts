import { Router, type Request, type Response } from "express";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  qpayGatewayRequestTotal,
  qpayGatewayRequestDurationMs,
} from "../metrics/qpay.metrics";

// Global singleton pattern to avoid creating new PrismaClient instances on hot reload
declare global {
  var __apiGatewayPrisma: PrismaClient | undefined;
}

const prisma = global.__apiGatewayPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__apiGatewayPrisma = prisma;
}

const router = Router();

const QPAY_WEBHOOK_SECRET = process.env.QPAY_WEBHOOK_SECRET;
const isProduction = process.env.NODE_ENV === "production";

// Helper function to get order-service base URL
// Respects SERVICE_URL_MODE environment variable:
// - "local" => use localhost (for local dev even with NODE_ENV=production)
// - "docker" => use Docker service names
// - unset => use isProduction logic (backward compatible)
const getOrderServiceUrl = () => {
  const serviceUrlMode = process.env.SERVICE_URL_MODE?.toLowerCase();
  const useDocker =
    serviceUrlMode === "docker" || (serviceUrlMode !== "local" && isProduction);

  if (useDocker) {
    return "http://order-service:6003";
  }
  return "http://localhost:6003";
};

// Helper function to forward webhook event to order-service
async function forwardToOrderService(
  invoiceId: string,
  status: string,
  payload: any
): Promise<{ success: boolean; error?: string }> {
  const orderServiceBaseUrl = getOrderServiceUrl();
  const timeout = 5000; // 5 seconds

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(
      `${orderServiceBaseUrl}/api/internal/payments/qpay/webhook`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-request": "true", // Required by order-service internal endpoint
        },
        body: JSON.stringify({
          invoiceId,
          status,
          payload,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Treat 2xx responses as success (order-service returns 200 even when processed=false)
    if (response.status >= 200 && response.status < 300) {
      return { success: true };
    }

    // Non-2xx response - treat as failed forward
    const errorText = await response.text().catch(() => "Unknown error");
    return {
      success: false,
      error: `Order service returned ${response.status}: ${errorText}`,
    };
  } catch (error: any) {
    if (error.name === "AbortError") {
      return { success: false, error: "Request timeout" };
    }
    return {
      success: false,
      error: error.message || "Failed to forward to order service",
    };
  }
}

router.get("/_health", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

// Callback route handler - raw body parsing is handled in main.ts before global JSON parser
// This ensures raw request body bytes are preserved for HMAC signature verification
router.post("/callback", async (req: Request, res: Response) => {
  // Check if secret is configured
  if (!QPAY_WEBHOOK_SECRET) {
    console.warn("[QPay] Missing QPAY_WEBHOOK_SECRET");
    return res.status(500).json({ ok: false, error: "Missing secret" });
  }

  // Read signature from headers (check both possible header names)
  const signatureHeader =
    req.headers["x-qpay-signature"] || req.headers["x-webhook-signature"];

  // Check if signature header is present
  if (!signatureHeader) {
    return res.status(401).json({ ok: false, error: "Missing signature" });
  }

  // Get raw body as Buffer (required for HMAC computation)
  // express.raw() middleware provides the raw body as Buffer for signature verification
  const rawBody = req.body as Buffer;
  if (!Buffer.isBuffer(rawBody)) {
    // If body is not a Buffer, it was likely parsed by global express.json() middleware
    // This shouldn't happen if express.raw() is applied correctly, but handle gracefully
    return res.status(500).json({
      ok: false,
      error:
        "Invalid body format - raw body required for signature verification",
    });
  }

  // Compute expected HMAC-SHA256 signature
  const hmac = crypto.createHmac("sha256", QPAY_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const expectedSignatureHex = hmac.digest("hex");

  // Normalize signature header (support multiple formats)
  let receivedSignature: string;
  if (typeof signatureHeader === "string") {
    receivedSignature = signatureHeader;
  } else if (Array.isArray(signatureHeader)) {
    receivedSignature = signatureHeader[0];
  } else {
    return res
      .status(401)
      .json({ ok: false, error: "Invalid signature format" });
  }

  // Extract signature value (support formats: "sha256=<hex>", plain hex, or base64)
  let signatureToCompare: Buffer;
  const expectedSignatureBuffer = Buffer.from(expectedSignatureHex, "hex");

  if (receivedSignature.startsWith("sha256=")) {
    // Format: sha256=<hex>
    const hexValue = receivedSignature.substring(7);
    try {
      signatureToCompare = Buffer.from(hexValue, "hex");
    } catch {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid signature format" });
    }
  } else if (/^[0-9a-fA-F]+$/.test(receivedSignature)) {
    // Plain hex format
    try {
      signatureToCompare = Buffer.from(receivedSignature, "hex");
    } catch {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid signature format" });
    }
  } else {
    // Try base64 format
    try {
      signatureToCompare = Buffer.from(receivedSignature, "base64");
    } catch {
      return res
        .status(401)
        .json({ ok: false, error: "Invalid signature format" });
    }
  }

  // Constant-time comparison (prevents timing attacks)
  if (
    signatureToCompare.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureToCompare, expectedSignatureBuffer)
  ) {
    return res.status(401).json({ ok: false, error: "Invalid signature" });
  }

  // Signature verification passed - parse JSON safely
  let parsedBody: any;
  try {
    parsedBody = JSON.parse(rawBody.toString("utf-8"));
  } catch (error) {
    // If JSON parsing fails, log raw string and return error
    console.error(
      "[QPay] callback - JSON parse failed, raw body:",
      rawBody.toString("utf-8")
    );
    return res.status(400).json({ ok: false, error: "Invalid JSON payload" });
  }

  // Extract required fields from payload
  const invoiceId = parsedBody.invoiceId || parsedBody.invoice_id;
  const status = parsedBody.status || parsedBody.payment_status || "unknown";

  if (!invoiceId) {
    console.error("[QPay] callback - Missing invoiceId in payload", {
      payload: parsedBody,
    });
    return res
      .status(400)
      .json({ ok: false, error: "Missing invoiceId in payload" });
  }

  // Check idempotency: if this invoiceId was already processed, return immediately
  const existingEvent = await prisma.qPayWebhookEvent.findUnique({
    where: { invoiceId },
  });

  if (existingEvent) {
    // Event already processed - idempotent response
    console.log("[QPay] callback - Duplicate webhook (idempotent)", {
      invoiceId,
      status,
      result: "duplicate",
      originalProcessedAt: existingEvent.processedAt,
    });
    return res.status(200).json({ ok: true, duplicate: true });
  }

  // Store webhook event with initial status
  let webhookEvent;
  try {
    webhookEvent = await prisma.qPayWebhookEvent.create({
      data: {
        invoiceId,
        status,
        rawPayload: parsedBody,
        forwardStatus: "pending",
      },
    });
  } catch (error: any) {
    // Race condition: another request processed this invoiceId first
    if (error.code === 11000 || error.message?.includes("duplicate")) {
      console.log("[QPay] callback - Race condition: duplicate detected", {
        invoiceId,
        status,
        result: "duplicate",
      });
      return res.status(200).json({ ok: true, duplicate: true });
    }
    throw error;
  }

  // Forward to order-service
  const forwardResult = await forwardToOrderService(
    invoiceId,
    status,
    parsedBody
  );

  // Update event status based on forwarding result
  if (forwardResult.success) {
    await prisma.qPayWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        forwardStatus: "forwarded",
      },
    });

    console.log("[QPay] callback - Processed and forwarded", {
      invoiceId,
      status,
      result: "forwarded",
    });
  } else {
    // Forwarding failed - mark as failed but respond 200 to QPay
    await prisma.qPayWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        forwardStatus: "failed",
        lastError: forwardResult.error || "Unknown error",
      },
    });

    console.error("[QPay] callback - Forwarding failed", {
      invoiceId,
      status,
      result: "failed-forward",
      error: forwardResult.error,
    });
  }

  // Always respond 200 OK to QPay (even if forwarding failed - we'll retry later)
  res.status(200).json({ ok: true });
});

// Retry endpoint for failed webhook forwarding
// TODO: Add authentication middleware for production use
router.post("/retry/:invoiceId", async (req: Request, res: Response) => {
  const { invoiceId } = req.params;

  try {
    // Find the webhook event
    const webhookEvent = await prisma.qPayWebhookEvent.findUnique({
      where: { invoiceId },
    });

    if (!webhookEvent) {
      return res.status(404).json({
        ok: false,
        error: "Webhook event not found",
      });
    }

    // Only retry if forwarding failed
    if (webhookEvent.forwardStatus !== "failed") {
      return res.status(400).json({
        ok: false,
        error: `Event is not in failed state. Current status: ${webhookEvent.forwardStatus}`,
      });
    }

    // Retry forwarding
    const forwardResult = await forwardToOrderService(
      webhookEvent.invoiceId,
      webhookEvent.status,
      webhookEvent.rawPayload as any
    );

    if (forwardResult.success) {
      await prisma.qPayWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          forwardStatus: "forwarded",
          lastError: null,
          retryCount: webhookEvent.retryCount + 1,
        },
      });

      console.log("[QPay] retry - Successfully forwarded", {
        invoiceId,
        retryCount: webhookEvent.retryCount + 1,
      });

      const updatedEvent = await prisma.qPayWebhookEvent.findUnique({
        where: { id: webhookEvent.id },
      });

      return res.status(200).json({
        ok: true,
        invoiceId,
        forwardStatus: updatedEvent?.forwardStatus || "forwarded",
        retryCount: webhookEvent.retryCount + 1,
        lastError: null,
      });
    } else {
      // Retry failed again
      await prisma.qPayWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          lastError: forwardResult.error || "Unknown error",
          retryCount: webhookEvent.retryCount + 1,
        },
      });

      console.error("[QPay] retry - Failed again", {
        invoiceId,
        retryCount: webhookEvent.retryCount + 1,
        error: forwardResult.error,
      });

      const updatedEvent = await prisma.qPayWebhookEvent.findUnique({
        where: { id: webhookEvent.id },
      });

      return res.status(500).json({
        ok: false,
        invoiceId,
        forwardStatus: updatedEvent?.forwardStatus || "failed",
        retryCount: webhookEvent.retryCount + 1,
        lastError: forwardResult.error || "Failed to forward",
      });
    }
  } catch (error: any) {
    console.error("[QPay] retry - Error", {
      invoiceId,
      error: error.message,
    });

    return res.status(500).json({
      ok: false,
      error: error.message || "Internal server error",
    });
  }
});

// Public webhook endpoint for QPay callbacks (no JWT, token-based auth)
// QPay calls this endpoint when payment status changes
router.post("/webhook", async (req: Request, res: Response) => {
  const start = Date.now();
  let result: "ok" | "error" = "ok";
  let upstream_status = "unknown";
  const route = "webhook";

  const sessionId = req.query.sessionId as string;
  const token = req.query.token as string;

  if (!sessionId || !token) {
    console.warn("[QPay Public Webhook] Missing sessionId or token", {
      sessionId,
      hasToken: !!token,
    });
    result = "error";
    upstream_status = "400";
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
    return res.status(400).json({
      ok: false,
      error: "sessionId and token query parameters are required",
    });
  }

  try {
    const orderServiceBaseUrl = getOrderServiceUrl();
    const timeout = 10000; // 10 seconds

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Extract invoiceId and status from webhook payload (QPay uses snake_case)
    // Order-service expects envelope: { invoiceId, status, payload }
    const rawPayload = req.body;
    const invoiceId =
      rawPayload.invoiceId || rawPayload.invoice_id || rawPayload.invoiceID;
    const status =
      rawPayload.status ||
      rawPayload.payment_status ||
      rawPayload.paymentStatus ||
      "unknown";

    console.log("[QPay Public Webhook] Forwarding to order-service", {
      sessionId,
      invoiceId,
      status,
      hasPayload: !!rawPayload,
    });

    // Forward to order-service public webhook endpoint with envelope format
    const response = await fetch(
      `${orderServiceBaseUrl}/api/payments/qpay/webhook?sessionId=${encodeURIComponent(
        sessionId
      )}&token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          invoiceId,
          status,
          payload: rawPayload,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Capture upstream status
    upstream_status = String(response.status);

    // Pass through the response from order-service
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        ok: false,
        error: responseText || "Invalid response from order service",
      };
    }

    // Log the webhook processing (don't log token)
    console.log("[QPay Public Webhook] Processed", {
      sessionId,
      status: response.status,
      result: responseData.ok ? "success" : "error",
    });

    return res.status(response.status).json(responseData);
  } catch (error: any) {
    result = "error";

    if (error.name === "AbortError") {
      upstream_status = "timeout";
      console.error("[QPay Public Webhook] Request timeout", {
        sessionId,
      });
      return res.status(504).json({
        ok: false,
        error: "Request timeout - order service did not respond in time",
      });
    }

    console.error("[QPay Public Webhook] Error", {
      sessionId,
      error: error.message,
    });

    return res.status(500).json({
      ok: false,
      error: "Failed to process webhook",
    });
  } finally {
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
  }
});

// Public endpoint to create payment session (authenticated)
// Frontend calls this to start a QPay payment
// Authentication and userId extraction are handled by order-service
router.post("/seed-session", async (req: Request, res: Response) => {
  const start = Date.now();
  let result: "ok" | "error" = "ok";
  let upstream_status = "unknown";
  const route = "seed_session";

  try {
    const orderServiceBaseUrl = getOrderServiceUrl();
    const timeout = 15000; // 15 seconds (invoice creation can be slow)

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Prepare headers to forward to order-service
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-internal-request": "false", // Mark as public request (needs auth)
    };

    // Forward authentication headers/cookies
    if (req.headers.authorization) {
      headers["authorization"] = req.headers.authorization;
    }

    if (req.headers.cookie) {
      headers["cookie"] = req.headers.cookie;
    }

    console.log(
      "[QPay Seed Session Gateway] Forwarding payment session request",
      {
        hasAuth: !!req.headers.authorization,
        hasCookie: !!req.headers.cookie,
      }
    );

    // Forward the entire request body to order-service
    // Order-service will:
    // 1. Verify JWT and extract userId
    // 2. Validate request
    // 3. Create session + invoice
    const response = await fetch(
      `${orderServiceBaseUrl}/api/payments/qpay/seed-session`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(req.body),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Capture upstream status
    upstream_status = String(response.status);

    // Pass through the response from order-service
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        success: false,
        error: responseText || "Invalid response from order service",
      };
    }

    if (!response.ok) {
      console.error("[QPay Seed Session Gateway] Order service error", {
        status: response.status,
        error:
          responseData.error || responseData.details || responseData.message,
      });
    } else {
      console.log("[QPay Seed Session Gateway] Payment session created", {
        sessionId: responseData.sessionId,
        hasInvoice: !!responseData.invoice,
      });
    }

    return res.status(response.status).json(responseData);
  } catch (error: any) {
    result = "error";

    if (error.name === "AbortError") {
      upstream_status = "timeout";
      console.error("[QPay Seed Session Gateway] Request timeout");
      return res.status(504).json({
        success: false,
        error: "Request timeout - order service did not respond in time",
      });
    }

    console.error("[QPay Seed Session Gateway] Error", {
      error: error.message,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to create payment session",
    });
  } finally {
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
  }
});

// Public endpoint to check payment status (authenticated)
// Frontend calls this to poll payment status
// Authentication and authorization are handled by order-service
router.get("/status", async (req: Request, res: Response) => {
  const start = Date.now();
  let result: "ok" | "error" = "ok";
  let upstream_status = "unknown";
  const route = "status";

  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    result = "error";
    upstream_status = "400";
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
    return res.status(400).json({
      ok: false,
      error: "sessionId query parameter is required",
    });
  }

  try {
    const orderServiceBaseUrl = getOrderServiceUrl();
    const timeout = 10000; // 10 seconds

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Extract authentication headers/cookies from the incoming request
    const authHeaders: Record<string, string> = {
      "x-internal-request": "false", // Mark as public request (not internal)
    };

    // Forward authorization header if present
    if (req.headers.authorization) {
      authHeaders["authorization"] = req.headers.authorization;
    }

    // Forward cookies for authentication (access_token, seller-access-token)
    if (req.headers.cookie) {
      authHeaders["cookie"] = req.headers.cookie;
    }

    // Call order-service status endpoint (will verify auth + ownership there)
    const response = await fetch(
      `${orderServiceBaseUrl}/api/payments/qpay/status?sessionId=${encodeURIComponent(
        sessionId
      )}`,
      {
        method: "GET",
        headers: authHeaders,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Capture upstream status
    upstream_status = String(response.status);

    // Pass through the response status and body from order-service
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        ok: false,
        error: responseText || "Invalid response from order service",
      };
    }

    return res.status(response.status).json(responseData);
  } catch (error: any) {
    result = "error";

    if (error.name === "AbortError") {
      upstream_status = "timeout";
      console.error("[QPay Status Gateway] Request timeout", {
        sessionId,
      });
      return res.status(504).json({
        ok: false,
        error: "Request timeout - order service did not respond in time",
      });
    }

    console.error("[QPay Status Gateway] Error", {
      sessionId,
      error: error.message,
    });

    return res.status(500).json({
      ok: false,
      error: "Failed to check payment status",
    });
  } finally {
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
  }
});

// Public endpoint to cancel a payment session (authenticated)
// Frontend calls this when user clicks "Cancel payment"
// Authentication and authorization are handled by order-service
router.post("/cancel", async (req: Request, res: Response) => {
  const start = Date.now();
  let result: "ok" | "error" = "ok";
  let upstream_status = "unknown";
  const route = "cancel";

  const sessionId = req.body?.sessionId;

  if (!sessionId) {
    result = "error";
    upstream_status = "400";
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
    return res.status(400).json({
      ok: false,
      error: "sessionId is required in request body",
    });
  }

  try {
    const orderServiceBaseUrl = getOrderServiceUrl();
    const timeout = 10000; // 10 seconds

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Extract authentication headers/cookies from the incoming request
    const authHeaders: Record<string, string> = {
      "x-internal-request": "false", // Mark as public request (not internal)
      "Content-Type": "application/json",
    };

    // Forward authorization header if present
    if (req.headers.authorization) {
      authHeaders["authorization"] = req.headers.authorization;
    }

    // Forward cookies for authentication (access_token, seller-access-token)
    if (req.headers.cookie) {
      authHeaders["cookie"] = req.headers.cookie;
    }

    // Call order-service cancel endpoint (will verify auth + ownership there)
    const response = await fetch(
      `${orderServiceBaseUrl}/api/payments/qpay/cancel`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sessionId }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Capture upstream status
    upstream_status = String(response.status);

    // Pass through the response status and body from order-service
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        ok: false,
        error: responseText || "Invalid response from order service",
      };
    }

    return res.status(response.status).json(responseData);
  } catch (error: any) {
    result = "error";

    if (error.name === "AbortError") {
      upstream_status = "timeout";
      console.error("[QPay Cancel Gateway] Request timeout", {
        sessionId,
      });
      return res.status(504).json({
        ok: false,
        error: "Request timeout - order service did not respond in time",
      });
    }

    console.error("[QPay Cancel Gateway] Error", {
      sessionId,
      error: error.message,
    });

    return res.status(500).json({
      ok: false,
      error: "Failed to cancel payment",
    });
  } finally {
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
  }
});

// Public endpoint to get Ebarimt (Mongolian e-receipt) info (authenticated)
// Frontend calls this to display Ebarimt receipt on order success page
// Authentication and authorization are handled by order-service
router.get("/ebarimt", async (req: Request, res: Response) => {
  const start = Date.now();
  let result: "ok" | "error" = "ok";
  let upstream_status = "unknown";
  const route = "ebarimt";

  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    result = "error";
    upstream_status = "400";
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
    return res.status(400).json({
      ok: false,
      error: "sessionId query parameter is required",
    });
  }

  try {
    const orderServiceBaseUrl = getOrderServiceUrl();
    const timeout = 10000; // 10 seconds

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Extract authentication headers/cookies from the incoming request
    const authHeaders: Record<string, string> = {
      "x-internal-request": "false", // Mark as public request (not internal)
    };

    // Forward authorization header if present
    if (req.headers.authorization) {
      authHeaders["authorization"] = req.headers.authorization;
    }

    // Forward cookies for authentication (access_token, seller-access-token)
    if (req.headers.cookie) {
      authHeaders["cookie"] = req.headers.cookie;
    }

    // Call order-service Ebarimt endpoint (will verify auth + ownership there)
    const response = await fetch(
      `${orderServiceBaseUrl}/api/payments/qpay/ebarimt?sessionId=${encodeURIComponent(
        sessionId
      )}`,
      {
        method: "GET",
        headers: authHeaders,
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    // Capture upstream status
    upstream_status = String(response.status);

    // Pass through the response status and body from order-service
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = {
        ok: false,
        error: responseText || "Invalid response from order service",
      };
    }

    return res.status(response.status).json(responseData);
  } catch (error: any) {
    result = "error";

    if (error.name === "AbortError") {
      upstream_status = "timeout";
      console.error("[QPay Ebarimt Gateway] Request timeout", {
        sessionId,
      });
      return res.status(504).json({
        ok: false,
        error: "Request timeout - order service did not respond in time",
      });
    }

    console.error("[QPay Ebarimt Gateway] Error", {
      sessionId,
      error: error.message,
    });

    return res.status(500).json({
      ok: false,
      error: "Failed to get Ebarimt info",
    });
  } finally {
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
  }
});

export default router;
