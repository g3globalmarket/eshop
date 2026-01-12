/**
 * QPay Metrics - API Gateway
 *
 * Prometheus-style metrics for QPay gateway endpoints
 * Tracks request counts, durations, and success/error rates
 */

import { Counter, Histogram, register } from "prom-client";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Gateway Endpoint Metrics (Unified)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayGatewayRequestTotal = new Counter({
  name: "qpay_gateway_request_total",
  help: "Total number of QPay gateway requests",
  labelNames: ["route", "result", "upstream_status"],
  // route: "seed_session", "status", "webhook", "cancel", "ebarimt"
  // result: "ok" or "error"
  // upstream_status: HTTP status code, "timeout", or "unknown"
  registers: [register],
});

export const qpayGatewayRequestDurationMs = new Histogram({
  name: "qpay_gateway_request_duration_ms",
  help: "Duration of QPay gateway requests in milliseconds",
  labelNames: ["route", "result"],
  buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000], // 10ms to 10s
  registers: [register],
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HMAC Verification Metrics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const qpayGatewayHmacVerifyTotal = new Counter({
  name: "qpay_gateway_hmac_verify_total",
  help: "Total number of HMAC signature verifications",
  labelNames: ["result"], // "valid", "invalid", "missing"
  registers: [register],
});

console.log("✅ [Metrics] QPay Gateway metrics registered");
