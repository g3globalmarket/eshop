# QPay Webhook Handler - Outcome-Based Metrics Instrumentation

## Summary

Instrumented the QPay webhook handler (`handleQPayWebhook`) with unified outcome-based metrics to track all webhook processing results, durations, and error types in a consolidated, queryable format.

## Changes Made

### 1. Added Outcome-Based Metrics

**File:** `apps/order-service/src/metrics/qpay.metrics.ts`

**New Metrics:**

```typescript
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
```

### 2. Instrumented Webhook Handler

**File:** `apps/order-service/src/controllers/order.controller.ts`

**Implementation:**

```typescript
export const handleQPayWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ============================================================================
  // METRICS: Start timer and prepare tracking
  // ============================================================================
  const start = Date.now();
  const isInternalRequest = req.headers["x-internal-request"] === "true";
  const source = isInternalRequest ? "internal" : "public";
  let outcome:
    | "ORDER_CREATED"
    | "DUPLICATE"
    | "NOT_PAID"
    | "AMOUNT_MISMATCH"
    | "SESSION_MISSING"
    | "INVALID_TOKEN"
    | "INVOICE_MISMATCH"
    | "PAYMENT_CHECK_FAILED"
    | "ERROR" = "ERROR"; // Default to ERROR

  try {
    // ... handler logic ...
    
    // Before each return, set appropriate outcome:
    outcome = "DUPLICATE";
    return res.status(200).json({ ... });
    
  } catch (error: any) {
    // Outcome defaults to ERROR
    return next(error);
  } finally {
    // ============================================================================
    // METRICS: Record outcome and duration
    // ============================================================================
    const duration = Date.now() - start;
    qpayWebhookOutcomeTotal.inc({ source, outcome });
    qpayWebhookOutcomeDurationMs.observe({ source, outcome }, duration);
  }
};
```

### 3. Outcome Mapping

All webhook return paths now set the appropriate outcome:

| Condition | Outcome | Description |
|-----------|---------|-------------|
| Missing sessionId/token params | `ERROR` | Validation error |
| Invalid callback token | `INVALID_TOKEN` | Token verification failed |
| Missing invoiceId/status | `ERROR` | Missing required fields |
| Idempotency check hit | `DUPLICATE` | Invoice already processed |
| No sessionId in query/payload | `SESSION_MISSING` | Session identifier missing |
| Session not found (Redis/DB) | `SESSION_MISSING` | Session data unavailable |
| No invoiceId in session | `ERROR` | Configuration/data error |
| Invoice ID mismatch | `INVOICE_MISMATCH` | Webhook invoice ≠ session invoice |
| QPay payment check API fails | `PAYMENT_CHECK_FAILED` | External API error |
| Payment not paid | `NOT_PAID` | Payment status not confirmed |
| Amount mismatch | `AMOUNT_MISMATCH` | Paid amount ≠ expected amount |
| Race condition duplicate | `DUPLICATE` | Concurrent processing detected |
| Order created successfully | `ORDER_CREATED` | ✅ Success |
| Unexpected exception | `ERROR` | Unhandled error |

---

## Verification

### 1. Check Metrics Endpoint

```bash
# Start order-service
pnpm exec nx run order-service:serve:development

# Check metrics are exposed
curl http://localhost:6003/metrics | grep qpay_webhook_outcome
```

**Expected Output:**
```
# HELP qpay_webhook_outcome_total Total number of QPay webhooks by outcome
# TYPE qpay_webhook_outcome_total counter
qpay_webhook_outcome_total{source="public",outcome="ORDER_CREATED"} 0
qpay_webhook_outcome_total{source="public",outcome="DUPLICATE"} 0
qpay_webhook_outcome_total{source="internal",outcome="ORDER_CREATED"} 0
...

# HELP qpay_webhook_outcome_duration_ms Duration of QPay webhook processing by outcome in milliseconds
# TYPE qpay_webhook_outcome_duration_ms histogram
qpay_webhook_outcome_duration_ms_bucket{le="10",source="public",outcome="ORDER_CREATED"} 0
qpay_webhook_outcome_duration_ms_bucket{le="50",source="public",outcome="ORDER_CREATED"} 0
...
```

### 2. Test Individual Outcomes

#### Test: Invalid Token
```bash
# Trigger webhook with bad token
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=test&token=badtoken" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_test","status":"paid"}'

# Check metrics
curl http://localhost:6003/metrics | grep 'qpay_webhook_outcome_total.*INVALID_TOKEN'
# Expected: qpay_webhook_outcome_total{source="public",outcome="INVALID_TOKEN"} 1
```

#### Test: Duplicate Detection
```bash
# First request creates order
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=sess1&token=validtoken" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_123","status":"paid"}'

# Second request with same invoiceId
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=sess1&token=validtoken" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_123","status":"paid"}'

# Check metrics
curl http://localhost:6003/metrics | grep 'qpay_webhook_outcome_total.*DUPLICATE'
# Expected: qpay_webhook_outcome_total{source="public",outcome="DUPLICATE"} 1
```

#### Test: Session Missing
```bash
# Webhook with non-existent session
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=nonexistent&token=validtoken" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_456","status":"paid"}'

# Check metrics
curl http://localhost:6003/metrics | grep 'qpay_webhook_outcome_total.*SESSION_MISSING'
# Expected: qpay_webhook_outcome_total{source="public",outcome="SESSION_MISSING"} 1
```

#### Test: Successful Order Creation
```bash
# Valid webhook after seed-session
# 1. Seed session first
curl -X POST http://localhost:8080/payments/qpay/seed-session \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionData":{...},"userId":"...",...}'

# 2. Trigger webhook
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=<sessionId>&token=<token>" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"<invoiceId>","status":"paid"}'

# Check metrics
curl http://localhost:6003/metrics | grep 'qpay_webhook_outcome_total.*ORDER_CREATED'
# Expected: qpay_webhook_outcome_total{source="public",outcome="ORDER_CREATED"} 1
```

### 3. Verify Duration Tracking

```bash
curl http://localhost:6003/metrics | grep qpay_webhook_outcome_duration_ms_sum
```

**Expected (after several requests):**
```
qpay_webhook_outcome_duration_ms_sum{source="public",outcome="ORDER_CREATED"} 1234.56
qpay_webhook_outcome_duration_ms_sum{source="public",outcome="DUPLICATE"} 45.78
qpay_webhook_outcome_duration_ms_sum{source="public",outcome="INVALID_TOKEN"} 12.34
```

---

## Prometheus Queries

### Overall Success Rate

```promql
# Percentage of webhooks that created orders
100 * (
  rate(qpay_webhook_outcome_total{outcome="ORDER_CREATED"}[5m])
    /
  rate(qpay_webhook_outcome_total[5m])
)
```

### Outcome Distribution

```promql
# Count by outcome type
sum(rate(qpay_webhook_outcome_total[5m])) by (outcome)

# Breakdown by source (public vs internal)
sum(rate(qpay_webhook_outcome_total[5m])) by (source, outcome)
```

### Error Rates

```promql
# Rate of actual errors (not business logic outcomes)
rate(qpay_webhook_outcome_total{outcome="ERROR"}[5m])

# Rate of payment check failures
rate(qpay_webhook_outcome_total{outcome="PAYMENT_CHECK_FAILED"}[5m])

# Rate of invalid tokens
rate(qpay_webhook_outcome_total{outcome="INVALID_TOKEN"}[5m])
```

### Duration by Outcome

```promql
# Average duration by outcome
rate(qpay_webhook_outcome_duration_ms_sum[5m]) by (outcome)
  /
rate(qpay_webhook_outcome_duration_ms_count[5m]) by (outcome)

# P95 latency for successful order creation
histogram_quantile(0.95, 
  rate(qpay_webhook_outcome_duration_ms_bucket{outcome="ORDER_CREATED"}[5m])
)

# Compare duration: duplicates vs new orders
histogram_quantile(0.95,
  rate(qpay_webhook_outcome_duration_ms_bucket{outcome="DUPLICATE"}[5m])
)
vs
histogram_quantile(0.95,
  rate(qpay_webhook_outcome_duration_ms_bucket{outcome="ORDER_CREATED"}[5m])
)
```

### Duplicate Detection Rate

```promql
# How often do we see duplicate webhooks?
rate(qpay_webhook_outcome_total{outcome="DUPLICATE"}[1h])
  /
rate(qpay_webhook_outcome_total[1h])
```

### Session Availability

```promql
# Rate of webhooks with missing sessions (potential Redis issue)
rate(qpay_webhook_outcome_total{outcome="SESSION_MISSING"}[5m])
```

---

## Grafana Dashboard Panels

### 1. Webhook Outcome Distribution (Pie Chart)
```promql
sum(increase(qpay_webhook_outcome_total[1h])) by (outcome)
```

### 2. Success Rate Over Time (Graph)
```promql
100 * (
  rate(qpay_webhook_outcome_total{outcome="ORDER_CREATED"}[5m])
    /
  rate(qpay_webhook_outcome_total[5m])
)
```

### 3. Webhooks Per Second by Outcome (Stacked Graph)
```promql
sum(rate(qpay_webhook_outcome_total[5m])) by (outcome)
```

### 4. Duration Heatmap by Outcome
```promql
# Multi-line graph showing p50, p95, p99 for each outcome
histogram_quantile(0.50, 
  rate(qpay_webhook_outcome_duration_ms_bucket[5m])
) by (outcome)

histogram_quantile(0.95, 
  rate(qpay_webhook_outcome_duration_ms_bucket[5m])
) by (outcome)
```

### 5. Error Rate (Gauge)
```promql
sum(rate(qpay_webhook_outcome_total{
  outcome=~"ERROR|PAYMENT_CHECK_FAILED"
}[5m]))
```

### 6. Public vs Internal Webhook Comparison (Bar Chart)
```promql
sum(rate(qpay_webhook_outcome_total[1h])) by (source, outcome)
```

---

## Alerting Rules

### Critical: High Error Rate
```yaml
- alert: QPay Webhook High Error Rate
  expr: |
    (
      rate(qpay_webhook_outcome_total{outcome="ERROR"}[5m])
        /
      rate(qpay_webhook_outcome_total[5m])
    ) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "QPay webhook error rate > 5%"
    description: "{{ $value | humanizePercentage }} of webhooks are failing with ERROR outcome"
```

### Warning: Payment Check Failures
```yaml
- alert: QPay Payment Check API Failing
  expr: |
    rate(qpay_webhook_outcome_total{outcome="PAYMENT_CHECK_FAILED"}[5m]) > 0.1
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "QPay payment/check API is failing"
    description: "{{ $value }} payment check failures per second"
```

### Warning: High Duplicate Rate
```yaml
- alert: QPay High Duplicate Webhook Rate
  expr: |
    (
      rate(qpay_webhook_outcome_total{outcome="DUPLICATE"}[5m])
        /
      rate(qpay_webhook_outcome_total[5m])
    ) > 0.20
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High duplicate webhook rate (> 20%)"
    description: "{{ $value | humanizePercentage }} of webhooks are duplicates. Check QPay retry configuration."
```

### Warning: Session Missing Rate High
```yaml
- alert: QPay Sessions Missing
  expr: |
    rate(qpay_webhook_outcome_total{outcome="SESSION_MISSING"}[5m]) > 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Sessions frequently missing for QPay webhooks"
    description: "{{ $value }} webhooks/sec cannot find session data. Check Redis health."
```

### Critical: No Successful Orders
```yaml
- alert: QPay No Successful Orders
  expr: |
    rate(qpay_webhook_outcome_total{outcome="ORDER_CREATED"}[30m]) == 0
  for: 30m
  labels:
    severity: critical
  annotations:
    summary: "No QPay orders created in 30 minutes"
    description: "Zero successful order creations. Check webhook processing and payment verification."
```

### Warning: Slow Webhook Processing
```yaml
- alert: QPay Webhook High Latency
  expr: |
    histogram_quantile(0.95,
      rate(qpay_webhook_outcome_duration_ms_bucket{outcome="ORDER_CREATED"}[5m])
    ) > 5000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "QPay webhook processing P95 > 5s"
    description: "Webhook processing is slow: {{ $value }}ms"
```

---

## Benefits

1. **Unified Metrics:** All webhook outcomes tracked in two metrics with labels (vs. 8+ separate counters)
2. **Better Queries:** Single metric for success rate, error distribution, and outcome analysis
3. **Duration Tracking:** Measure latency for each outcome type
4. **Cardinality Control:** No high-cardinality labels (sessionId, invoiceId excluded)
5. **Actionable Insights:** Clearly distinguish business outcomes (NOT_PAID, DUPLICATE) from errors (ERROR, PAYMENT_CHECK_FAILED)
6. **Source Tracking:** Separate public vs internal webhook metrics
7. **Debugging:** Quickly identify which webhook outcomes are most common and slowest

---

## Comparison: Old vs New Metrics

### Old Approach (Granular Counters)
```
qpay_webhook_received_total
qpay_webhook_invalid_token_total
qpay_webhook_duplicate_total
qpay_webhook_order_created_total
qpay_webhook_session_missing_total
qpay_webhook_verify_paid_total
qpay_webhook_verify_not_paid_total
qpay_webhook_amount_mismatch_total
qpay_webhook_duration_ms (no labels)
```

**Pros:** Simple to increment  
**Cons:** Hard to query for overall success rate, no outcome-specific durations

### New Approach (Outcome Labels)
```
qpay_webhook_outcome_total{source, outcome}
qpay_webhook_outcome_duration_ms{source, outcome}
```

**Pros:** 
- Unified success rate queries
- Duration per outcome
- Better dashboard visualizations
- Lower metric count

**Cons:** Slightly more complex label management (handled in code)

**Note:** Both approaches coexist. Old metrics remain for backward compatibility. New metrics provide better queryability.

---

## Files Modified

1. ✅ `apps/order-service/src/metrics/qpay.metrics.ts` - Added outcome-based metrics
2. ✅ `apps/order-service/src/controllers/order.controller.ts` - Instrumented all return paths with outcome tracking

---

## Build Status

✅ **Build Successful** - `pnpm exec nx build order-service`

All return paths instrumented. No breaking changes.

---

## Next Steps

1. **Deploy** updated order-service with new metrics
2. **Create Grafana dashboard** using the provided panel queries
3. **Set up alerts** for critical and warning conditions
4. **Monitor** outcome distribution to identify issues:
   - High `DUPLICATE` rate → QPay retry misconfiguration
   - High `SESSION_MISSING` → Redis retention issue
   - High `NOT_PAID` → Payment flow incomplete
   - High `PAYMENT_CHECK_FAILED` → QPay API degradation
   - High `INVALID_TOKEN` → Security issue or bad integration

---

*Implementation Date: January 7, 2026*  
*Version: 1.0*

