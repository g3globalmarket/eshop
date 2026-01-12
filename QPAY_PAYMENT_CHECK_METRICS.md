# QPay Payment Check API - Metrics Instrumentation

## Summary

Instrumented the QPay `/v2/payment/check` API client method with Prometheus metrics to track success/error rates, HTTP status codes, and request durations.

## Changes Made

### 1. Updated Metrics Module

**File:** `apps/order-service/src/metrics/qpay.metrics.ts`

**Changes:**
- Added `http_status` label to `qpay_payment_check_total` counter
- Updated `qpay_payment_check_duration_ms` histogram to include `result` label

**Metrics:**
```typescript
// Counter with result and HTTP status
export const qpayPaymentCheckTotal = new Counter({
  name: "qpay_payment_check_total",
  help: "Total number of QPay payment/check API calls",
  labelNames: ["result", "http_status"], 
  // result: "ok" or "error"
  // http_status: HTTP status code (e.g. "200", "400", "500") or "unknown"
  registers: [register],
});

// Histogram with result label
export const qpayPaymentCheckDurationMs = new Histogram({
  name: "qpay_payment_check_duration_ms",
  help: "Duration of QPay payment/check API calls in milliseconds",
  labelNames: ["result"], // "ok" or "error"
  buckets: [50, 100, 200, 500, 1000, 2000, 5000], // 50ms to 5s
  registers: [register],
});
```

### 2. Instrumented QPay Client

**File:** `apps/order-service/src/payments/qpay.client.ts`

**Method:** `paymentCheckInvoice(invoiceId: string)`

**Implementation:**

```typescript
async paymentCheckInvoice(invoiceId: string): Promise<QPayPaymentCheckResponse> {
  const start = Date.now();
  let resultLabel: "ok" | "error" = "ok";
  let httpStatusLabel = "unknown";

  // ... existing token and request setup ...

  try {
    const response = await fetch(`${this.baseUrl}/v2/payment/check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ... },
      body: JSON.stringify(requestBody),
    });

    // Capture HTTP status
    httpStatusLabel = String(response.status);

    if (!response.ok) {
      resultLabel = "error";
      const errorText = await response.text();
      throw new Error(`QPay payment check failed: ${response.status} ${errorText}`);
    }

    const data: QPayPaymentCheckResponse = await response.json();

    // Increment success counter
    qpayPaymentCheckTotal.inc({ result: "ok", http_status: httpStatusLabel });

    return data;
  } catch (error: any) {
    // Increment error counter
    resultLabel = "error";
    
    // Try to extract HTTP status from error if available
    if (error?.response?.status) {
      httpStatusLabel = String(error.response.status);
    }
    
    qpayPaymentCheckTotal.inc({ result: "error", http_status: httpStatusLabel });
    
    throw new Error(`Failed to check QPay invoice payment: ${error.message}`);
  } finally {
    // Observe duration in histogram
    const duration = Date.now() - start;
    qpayPaymentCheckDurationMs.observe({ result: resultLabel }, duration);
  }
}
```

**Key Features:**
- ✅ Tracks HTTP status codes for both success and error cases
- ✅ Measures request duration for all outcomes
- ✅ Preserves existing behavior (no semantic changes)
- ✅ Properly handles errors and re-throws them
- ✅ No secrets logged

---

## Verification

### 1. Check Metrics Endpoint

```bash
# Start order-service
pnpm exec nx run order-service:serve:development

# Check metrics are exposed
curl http://localhost:6003/metrics | grep qpay_payment_check
```

**Expected Output:**
```
# HELP qpay_payment_check_total Total number of QPay payment/check API calls
# TYPE qpay_payment_check_total counter
qpay_payment_check_total{result="ok",http_status="200"} 0
qpay_payment_check_total{result="error",http_status="unknown"} 0

# HELP qpay_payment_check_duration_ms Duration of QPay payment/check API calls in milliseconds
# TYPE qpay_payment_check_duration_ms histogram
qpay_payment_check_duration_ms_bucket{le="50",result="ok"} 0
qpay_payment_check_duration_ms_bucket{le="100",result="ok"} 0
qpay_payment_check_duration_ms_bucket{le="200",result="ok"} 0
...
```

### 2. Trigger Payment Check

**Via Status Endpoint:**
```bash
# Get JWT token from login
TOKEN="<your-jwt-token>"

# Check payment status (triggers payment/check)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/payments/qpay/status?sessionId=<sessionId>"
```

**Via Webhook:**
```bash
# Trigger webhook (also calls payment/check)
curl -X POST http://localhost:8080/payments/qpay/webhook?sessionId=test&token=test123 \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_test","status":"paid"}'
```

### 3. Verify Metrics Updated

```bash
curl http://localhost:6003/metrics | grep qpay_payment_check_total
```

**Expected (after requests):**
```
qpay_payment_check_total{result="ok",http_status="200"} 3
qpay_payment_check_total{result="error",http_status="400"} 1
```

```bash
curl http://localhost:6003/metrics | grep qpay_payment_check_duration_ms_sum
```

**Expected:**
```
qpay_payment_check_duration_ms_sum{result="ok"} 456.78
qpay_payment_check_duration_ms_sum{result="error"} 123.45
```

---

## Prometheus Queries

### Success Rate

```promql
# Overall success rate
rate(qpay_payment_check_total{result="ok"}[5m])
  /
rate(qpay_payment_check_total[5m])
```

### Error Rate by Status Code

```promql
# Count by HTTP status
sum(rate(qpay_payment_check_total[5m])) by (http_status)

# Error rate for 4xx vs 5xx
sum(rate(qpay_payment_check_total{http_status=~"4.."}[5m]))
  vs
sum(rate(qpay_payment_check_total{http_status=~"5.."}[5m]))
```

### Average Duration

```promql
# Average duration (p50)
rate(qpay_payment_check_duration_ms_sum{result="ok"}[5m])
  /
rate(qpay_payment_check_duration_ms_count{result="ok"}[5m])

# P95 latency
histogram_quantile(0.95, 
  rate(qpay_payment_check_duration_ms_bucket[5m])
)
```

### Duration by Result

```promql
# Compare successful vs failed request durations
rate(qpay_payment_check_duration_ms_sum[5m]) by (result)
  /
rate(qpay_payment_check_duration_ms_count[5m]) by (result)
```

---

## Grafana Dashboard Panels

### 1. Payment Check Success Rate
```promql
# Gauge showing percentage
100 * (
  rate(qpay_payment_check_total{result="ok"}[5m])
    /
  rate(qpay_payment_check_total[5m])
)
```

### 2. Requests Per Second
```promql
# Graph of requests/sec by result
sum(rate(qpay_payment_check_total[5m])) by (result)
```

### 3. HTTP Status Distribution
```promql
# Bar chart of status codes
sum(increase(qpay_payment_check_total[1h])) by (http_status)
```

### 4. Latency Percentiles
```promql
# Multi-line graph: p50, p95, p99
histogram_quantile(0.50, rate(qpay_payment_check_duration_ms_bucket[5m]))
histogram_quantile(0.95, rate(qpay_payment_check_duration_ms_bucket[5m]))
histogram_quantile(0.99, rate(qpay_payment_check_duration_ms_bucket[5m]))
```

---

## Alerting Rules

### High Error Rate
```yaml
- alert: QPay Payment Check High Error Rate
  expr: |
    (
      rate(qpay_payment_check_total{result="error"}[5m])
        /
      rate(qpay_payment_check_total[5m])
    ) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "QPay payment check error rate > 10%"
    description: "{{ $value | humanizePercentage }} of payment checks are failing"
```

### High Latency
```yaml
- alert: QPay Payment Check High Latency
  expr: |
    histogram_quantile(0.95,
      rate(qpay_payment_check_duration_ms_bucket[5m])
    ) > 2000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "QPay payment check P95 latency > 2s"
    description: "P95 latency is {{ $value }}ms"
```

### QPay API Degradation
```yaml
- alert: QPay API Returning 5xx Errors
  expr: |
    rate(qpay_payment_check_total{http_status=~"5.."}[5m]) > 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "QPay API is returning 5xx errors"
    description: "{{ $value }} requests/sec failing with 5xx status"
```

---

## Benefits

1. **Visibility:** Track payment check API health in real-time
2. **Debugging:** Identify HTTP status codes for failures
3. **Performance:** Monitor request latency (p50, p95, p99)
4. **Alerting:** Set up alerts for error rates and latency spikes
5. **SLO Tracking:** Measure success rate for SLA compliance

---

## Files Modified

1. ✅ `apps/order-service/src/metrics/qpay.metrics.ts` - Updated metric labels
2. ✅ `apps/order-service/src/payments/qpay.client.ts` - Instrumented paymentCheckInvoice method

---

## Build Status

✅ **Build Successful** - `pnpm exec nx build order-service`

No breaking changes. All existing functionality preserved.

---

*Implementation Date: January 7, 2026*  
*Version: 1.0*

