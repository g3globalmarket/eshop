/**
 * QPay Metrics
 *
 * Prometheus-style metrics for QPay payment flows
 * Tracks counts, durations, and error reasons across webhook, reconciliation, and cleanup
 */

import { Counter, Histogram, register } from "prom-client";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Webhook Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayWebhookReceivedTotal = new Counter({
  name: "qpay_webhook_received_total",
  help: "Total number of QPay webhooks received",
  labelNames: ["source"], // "public" or "internal"
  registers: [register],
});

export const qpayWebhookInvalidTokenTotal = new Counter({
  name: "qpay_webhook_invalid_token_total",
  help: "Total number of QPay webhooks with invalid callback token",
  registers: [register],
});

export const qpayWebhookVerifyPaidTotal = new Counter({
  name: "qpay_webhook_verify_paid_total",
  help: "Total number of QPay webhooks verified as PAID",
  registers: [register],
});

export const qpayWebhookVerifyNotPaidTotal = new Counter({
  name: "qpay_webhook_verify_not_paid_total",
  help: "Total number of QPay webhooks verified as NOT PAID",
  registers: [register],
});

export const qpayWebhookAmountMismatchTotal = new Counter({
  name: "qpay_webhook_amount_mismatch_total",
  help: "Total number of QPay webhooks with amount mismatch",
  registers: [register],
});

export const qpayWebhookDuplicateTotal = new Counter({
  name: "qpay_webhook_duplicate_total",
  help: "Total number of duplicate QPay webhooks (idempotency check)",
  registers: [register],
});

export const qpayWebhookOrderCreatedTotal = new Counter({
  name: "qpay_webhook_order_created_total",
  help: "Total number of orders created via QPay webhook",
  registers: [register],
});

export const qpayWebhookSessionMissingTotal = new Counter({
  name: "qpay_webhook_session_missing_total",
  help: "Total number of QPay webhooks with missing session",
  registers: [register],
});

export const qpayWebhookDurationMs = new Histogram({
  name: "qpay_webhook_duration_ms",
  help: "Duration of QPay webhook processing in milliseconds",
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000], // 10ms to 10s
  registers: [register],
});

// Outcome-based webhook metrics (consolidated)
export const qpayWebhookOutcomeTotal = new Counter({
  name: "qpay_webhook_outcome_total",
  help: "Total number of QPay webhooks by outcome",
  labelNames: ["source", "outcome"],
  // source: "public" or "internal"
  // outcome: "ORDER_CREATED", "DUPLICATE", "NOT_PAID", "AMOUNT_MISMATCH",
  //          "SESSION_MISSING", "INVALID_TOKEN", "INVOICE_MISMATCH",
  //          "PAYMENT_CHECK_FAILED", "ERROR"
  registers: [register],
});

export const qpayWebhookOutcomeDurationMs = new Histogram({
  name: "qpay_webhook_outcome_duration_ms",
  help: "Duration of QPay webhook processing by outcome in milliseconds",
  labelNames: ["source", "outcome"],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000], // 10ms to 10s
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Payment Check API Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayPaymentCheckTotal = new Counter({
  name: "qpay_payment_check_total",
  help: "Total number of QPay payment/check API calls",
  labelNames: ["result", "http_status"], // result: "ok" or "error", http_status: HTTP status code or "unknown"
  registers: [register],
});

export const qpayPaymentCheckDurationMs = new Histogram({
  name: "qpay_payment_check_duration_ms",
  help: "Duration of QPay payment/check API calls in milliseconds",
  labelNames: ["result"], // "ok" or "error"
  buckets: [50, 100, 200, 500, 1000, 2000, 5000], // 50ms to 5s
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Reconciliation Loop Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayReconcileTickTotal = new Counter({
  name: "qpay_reconcile_tick_total",
  help: "Total number of QPay reconciliation ticks",
  labelNames: ["result"], // "ran" or "skipped_lock"
  registers: [register],
});

export const qpayReconcileSessionsScannedTotal = new Counter({
  name: "qpay_reconcile_sessions_scanned_total",
  help: "Total number of payment sessions scanned by reconciliation",
  registers: [register],
});

export const qpayReconcileOrdersCreatedTotal = new Counter({
  name: "qpay_reconcile_orders_created_total",
  help: "Total number of orders created via reconciliation",
  registers: [register],
});

export const qpayReconcileDurationMs = new Histogram({
  name: "qpay_reconcile_duration_ms",
  help: "Duration of QPay reconciliation cycle in milliseconds",
  buckets: [100, 500, 1000, 2000, 5000, 10000, 30000], // 100ms to 30s
  registers: [register],
});

export const qpayReconcileEbarimtCreatedTotal = new Counter({
  name: "qpay_reconcile_ebarimt_created_total",
  help: "Total number of Ebarimt receipts created via reconciliation",
  labelNames: ["result"], // "ok", "error", or "skipped"
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cleanup Loop Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayCleanupTickTotal = new Counter({
  name: "qpay_cleanup_tick_total",
  help: "Total number of QPay cleanup ticks",
  labelNames: ["result"], // "ran" or "skipped_lock"
  registers: [register],
});

export const qpayCleanupDeletedTotal = new Counter({
  name: "qpay_cleanup_deleted_total",
  help: "Total number of records deleted by cleanup",
  labelNames: ["table"], // "webhook_events", "payment_sessions", "processed_invoices"
  registers: [register],
});

export const qpaySessionsExpiredTotal = new Counter({
  name: "qpay_sessions_expired_total",
  help: "Total number of payment sessions marked as EXPIRED",
  registers: [register],
});

export const qpayCleanupDurationMs = new Histogram({
  name: "qpay_cleanup_duration_ms",
  help: "Duration of QPay cleanup cycle in milliseconds",
  buckets: [100, 500, 1000, 2000, 5000, 10000, 30000], // 100ms to 30s
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Status Endpoint Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayStatusCheckTotal = new Counter({
  name: "qpay_status_check_total",
  help: "Total number of payment status checks",
  labelNames: ["status"], // PENDING, PAID, PROCESSED, CANCELLED, EXPIRED, etc.
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cancel Endpoint Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayCancelTotal = new Counter({
  name: "qpay_cancel_total",
  help: "Total number of payment cancellations",
  labelNames: ["result"], // "success", "already_cancelled", "error"
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Utility Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Record webhook processing duration
 * Usage: const end = recordWebhookStart(); ... end();
 */
export function recordWebhookStart() {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    qpayWebhookDurationMs.observe(duration);
  };
}

/**
 * Record payment check duration
 */
export function recordPaymentCheckStart() {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    qpayPaymentCheckDurationMs.observe(duration);
  };
}

/**
 * Record reconciliation duration
 */
export function recordReconcileStart() {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    qpayReconcileDurationMs.observe(duration);
  };
}

/**
 * Record cleanup duration
 */
export function recordCleanupStart() {
  const start = Date.now();
  return () => {
    const duration = Date.now() - start;
    qpayCleanupDurationMs.observe(duration);
  };
}

console.log("✅ [Metrics] QPay metrics registered");
