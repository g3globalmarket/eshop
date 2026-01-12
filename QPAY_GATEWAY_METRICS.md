# QPay API Gateway - Unified Route Metrics

## Summary

Instrumented all QPay routes in the API Gateway with unified Prometheus metrics to track request counts, durations, results, and upstream status codes. Uses a single counter and histogram with route labels for better queryability and lower cardinality.

## Changes Made

### 1. Added Unified Gateway Metrics

**File:** `apps/api-gateway/src/metrics/qpay.metrics.ts`

**New Metrics:**

```typescript
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
```

**Removed:** Old per-route metrics (consolidated into unified metrics above)

### 2. Instrumented All Route Handlers

**File:** `apps/api-gateway/src/(routes)/qpay.ts`

**Routes Instrumented:**

1. **`POST /seed-session`** - `route="seed_session"`
2. **`GET /status`** - `route="status"`
3. **`POST /webhook`** - `route="webhook"`
4. **`POST /cancel`** - `route="cancel"`
5. **`GET /ebarimt`** - `route="ebarimt"`

**Implementation Pattern:**

```typescript
router.post("/seed-session", async (req: Request, res: Response) => {
  const start = Date.now();
  let result: "ok" | "error" = "ok";
  let upstream_status = "unknown";
  const route = "seed_session";

  try {
    // ... fetch call to order-service ...
    const response = await fetch(...);
    
    // Capture upstream status
    upstream_status = String(response.status);
    
    // ... return response ...
    return res.status(response.status).json(responseData);
  } catch (error: any) {
    result = "error";
    
    // Detect timeout
    if (error.name === "AbortError") {
      upstream_status = "timeout";
    }
    
    // ... return error response ...
    return res.status(504).json(...);
  } finally {
    qpayGatewayRequestTotal.inc({ route, result, upstream_status });
    qpayGatewayRequestDurationMs.observe({ route, result }, Date.now() - start);
  }
});
```

**Key Features:**
- ✅ Timer starts at handler entry
- ✅ Captures HTTP status from upstream (order-service)
- ✅ Detects timeouts (`AbortError`)
- ✅ Tracks result (ok/error) separately from HTTP status
- ✅ Records metrics in `finally` block (always executes)
- ✅ No high-cardinality labels (sessionId, invoiceId excluded)

---

## Verification

### 1. Check Metrics Endpoint

```bash
# Start api-gateway
pnpm exec nx run api-gateway:serve:development

# Check metrics are exposed
curl http://localhost:8080/metrics | grep qpay_gateway_request
```

**Expected Output:**
```
# HELP qpay_gateway_request_total Total number of QPay gateway requests
# TYPE qpay_gateway_request_total counter
qpay_gateway_request_total{route="seed_session",result="ok",upstream_status="200"} 0
qpay_gateway_request_total{route="seed_session",result="error",upstream_status="timeout"} 0
qpay_gateway_request_total{route="status",result="ok",upstream_status="200"} 0
qpay_gateway_request_total{route="webhook",result="ok",upstream_status="200"} 0
qpay_gateway_request_total{route="cancel",result="ok",upstream_status="200"} 0
qpay_gateway_request_total{route="ebarimt",result="ok",upstream_status="200"} 0
...

# HELP qpay_gateway_request_duration_ms Duration of QPay gateway requests in milliseconds
# TYPE qpay_gateway_request_duration_ms histogram
qpay_gateway_request_duration_ms_bucket{le="10",route="seed_session",result="ok"} 0
qpay_gateway_request_duration_ms_bucket{le="50",route="seed_session",result="ok"} 0
...
```

### 2. Test Individual Routes

#### Test: Seed Session
```bash
TOKEN="<your-jwt-token>"

curl -X POST http://localhost:8080/payments/qpay/seed-session \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionData": {...},
    "userId": "...",
    "totalAmount": 100
  }'

# Check metrics
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*seed_session'
# Expected: qpay_gateway_request_total{route="seed_session",result="ok",upstream_status="200"} 1
```

#### Test: Status Check
```bash
TOKEN="<your-jwt-token>"
SESSION_ID="<sessionId>"

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/payments/qpay/status?sessionId=$SESSION_ID"

# Check metrics
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*status'
# Expected: qpay_gateway_request_total{route="status",result="ok",upstream_status="200"} 1
```

#### Test: Webhook
```bash
curl -X POST "http://localhost:8080/payments/qpay/webhook?sessionId=test&token=test123" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_test","status":"paid"}'

# Check metrics
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*webhook'
# Expected: qpay_gateway_request_total{route="webhook",result="ok",upstream_status="200"} 1
```

#### Test: Cancel
```bash
TOKEN="<your-jwt-token>"

curl -X POST http://localhost:8080/payments/qpay/cancel \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test123"}'

# Check metrics
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*cancel'
# Expected: qpay_gateway_request_total{route="cancel",result="ok",upstream_status="200"} 1
```

#### Test: Ebarimt
```bash
TOKEN="<your-jwt-token>"
SESSION_ID="<sessionId>"

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/payments/qpay/ebarimt?sessionId=$SESSION_ID"

# Check metrics
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*ebarimt'
# Expected: qpay_gateway_request_total{route="ebarimt",result="ok",upstream_status="200"} 1
```

### 3. Test Error Scenarios

#### Test: Timeout
```bash
# Stop order-service to simulate timeout
# Then call any route

curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/payments/qpay/status?sessionId=test123"

# Check metrics
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*timeout'
# Expected: qpay_gateway_request_total{route="status",result="error",upstream_status="timeout"} 1
```

#### Test: Validation Error
```bash
# Missing required parameter
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/payments/qpay/status"

# Check metrics (upstream_status="400" because we return 400 before calling upstream)
curl http://localhost:8080/metrics | grep 'qpay_gateway_request_total.*status.*400'
# Expected: qpay_gateway_request_total{route="status",result="error",upstream_status="400"} 1
```

---

## Prometheus Queries

### Overall Gateway Success Rate

```promql
# Percentage of successful gateway requests
100 * (
  rate(qpay_gateway_request_total{result="ok"}[5m])
    /
  rate(qpay_gateway_request_total[5m])
)
```

### Requests Per Second by Route

```promql
# RPS breakdown by route
sum(rate(qpay_gateway_request_total[5m])) by (route)

# RPS by route and result
sum(rate(qpay_gateway_request_total[5m])) by (route, result)
```

### Upstream Status Distribution

```promql
# Count by HTTP status
sum(rate(qpay_gateway_request_total[5m])) by (upstream_status)

# 2xx vs 4xx vs 5xx vs timeout
sum(rate(qpay_gateway_request_total{upstream_status=~"2.."}[5m]))  # 2xx
sum(rate(qpay_gateway_request_total{upstream_status=~"4.."}[5m]))  # 4xx
sum(rate(qpay_gateway_request_total{upstream_status=~"5.."}[5m]))  # 5xx
sum(rate(qpay_gateway_request_total{upstream_status="timeout"}[5m]))  # Timeout
```

### Duration Metrics

```promql
# Average duration by route
rate(qpay_gateway_request_duration_ms_sum[5m]) by (route)
  /
rate(qpay_gateway_request_duration_ms_count[5m]) by (route)

# P95 latency by route
histogram_quantile(0.95, 
  rate(qpay_gateway_request_duration_ms_bucket[5m])
) by (route)

# Compare successful vs failed request durations
rate(qpay_gateway_request_duration_ms_sum{result="ok"}[5m]) by (route)
  /
rate(qpay_gateway_request_duration_ms_count{result="ok"}[5m]) by (route)
vs
rate(qpay_gateway_request_duration_ms_sum{result="error"}[5m]) by (route)
  /
rate(qpay_gateway_request_duration_ms_count{result="error"}[5m]) by (route)
```

### Timeout Rate

```promql
# Rate of timeouts by route
rate(qpay_gateway_request_total{upstream_status="timeout"}[5m]) by (route)

# Timeout percentage
100 * (
  rate(qpay_gateway_request_total{upstream_status="timeout"}[5m])
    /
  rate(qpay_gateway_request_total[5m])
) by (route)
```

### Most Used Routes

```promql
# Top routes by request count (last hour)
topk(5, sum(increase(qpay_gateway_request_total[1h])) by (route))
```

---

## Grafana Dashboard Panels

### 1. Gateway Request Rate (Graph)
```promql
sum(rate(qpay_gateway_request_total[5m])) by (route)
```

### 2. Success Rate by Route (Bar Chart)
```promql
100 * (
  sum(rate(qpay_gateway_request_total{result="ok"}[5m])) by (route)
    /
  sum(rate(qpay_gateway_request_total[5m])) by (route)
)
```

### 3. Upstream Status Distribution (Pie Chart)
```promql
sum(increase(qpay_gateway_request_total[1h])) by (upstream_status)
```

### 4. Latency Heatmap (Multi-line Graph)
```promql
# P50, P95, P99 by route
histogram_quantile(0.50, rate(qpay_gateway_request_duration_ms_bucket[5m])) by (route)
histogram_quantile(0.95, rate(qpay_gateway_request_duration_ms_bucket[5m])) by (route)
histogram_quantile(0.99, rate(qpay_gateway_request_duration_ms_bucket[5m])) by (route)
```

### 5. Error Rate (Gauge)
```promql
sum(rate(qpay_gateway_request_total{result="error"}[5m]))
```

### 6. Timeout Rate (Graph)
```promql
sum(rate(qpay_gateway_request_total{upstream_status="timeout"}[5m])) by (route)
```

---

## Alerting Rules

### Critical: High Error Rate
```yaml
- alert: QPay Gateway High Error Rate
  expr: |
    (
      rate(qpay_gateway_request_total{result="error"}[5m])
        /
      rate(qpay_gateway_request_total[5m])
    ) > 0.10
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "QPay gateway error rate > 10%"
    description: "{{ $value | humanizePercentage }} of gateway requests are failing"
```

### Warning: High Timeout Rate
```yaml
- alert: QPay Gateway High Timeout Rate
  expr: |
    (
      rate(qpay_gateway_request_total{upstream_status="timeout"}[5m])
        /
      rate(qpay_gateway_request_total[5m])
    ) > 0.05
  for: 3m
  labels:
    severity: warning
  annotations:
    summary: "QPay gateway timeout rate > 5%"
    description: "{{ $value | humanizePercentage }} of requests timing out. Check order-service health."
```

### Warning: High Latency for Specific Route
```yaml
- alert: QPay Gateway High Latency
  expr: |
    histogram_quantile(0.95,
      rate(qpay_gateway_request_duration_ms_bucket[5m])
    ) > 5000
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "QPay gateway P95 latency > 5s"
    description: "Route {{ $labels.route }} P95 latency: {{ $value }}ms"
```

### Critical: Order Service Returning 5xx
```yaml
- alert: QPay Order Service Errors
  expr: |
    rate(qpay_gateway_request_total{upstream_status=~"5.."}[5m]) > 0.5
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "Order service returning 5xx errors"
    description: "{{ $value }} requests/sec receiving 5xx from order-service"
```

### Info: No Traffic on Route
```yaml
- alert: QPay Gateway No Traffic
  expr: |
    rate(qpay_gateway_request_total[30m]) == 0
  for: 30m
  labels:
    severity: info
  annotations:
    summary: "No QPay gateway traffic in 30 minutes"
    description: "Route {{ $labels.route }} has received zero requests"
```

---

## Benefits

1. **Unified Metrics:** Single counter/histogram for all routes (vs. 10+ separate metrics)
2. **Better Queries:** Easy to compare routes, aggregate by result, filter by status
3. **Lower Cardinality:** Only 5 route values (not N sessionIds/invoiceIds)
4. **Timeout Detection:** Explicit tracking of timeout errors
5. **Upstream Visibility:** See exactly what status order-service returns
6. **Result vs Status:** Distinguish gateway errors from upstream errors
7. **Consistent Pattern:** Same instrumentation across all handlers

---

## Comparison: Old vs New Metrics

### Old Approach (Per-Route Metrics)
```
qpay_gateway_seed_session_total{result}
qpay_gateway_seed_session_duration_ms
qpay_gateway_status_total{result}
qpay_gateway_status_duration_ms
qpay_gateway_webhook_total{result}
qpay_gateway_webhook_duration_ms
qpay_gateway_cancel_total{result}
qpay_gateway_cancel_duration_ms
qpay_gateway_ebarimt_total{result}
qpay_gateway_ebarimt_duration_ms
```
**Total:** 10 metrics

**Pros:** Simple naming  
**Cons:** Hard to query across routes, more metrics to manage

### New Approach (Unified with Route Labels)
```
qpay_gateway_request_total{route, result, upstream_status}
qpay_gateway_request_duration_ms{route, result}
```
**Total:** 2 metrics

**Pros:**
- Single query for all routes
- Easy route comparison
- Lower metric count
- Upstream status visibility

**Cons:** Slightly more complex label management (handled in code)

---

## Files Modified

1. ✅ `apps/api-gateway/src/metrics/qpay.metrics.ts` - Added unified metrics
2. ✅ `apps/api-gateway/src/(routes)/qpay.ts` - Instrumented 5 route handlers

---

## Build Status

✅ **Build Successful** - `pnpm exec nx build api-gateway`

All routes instrumented. No breaking changes.

---

## Next Steps

1. **Deploy** updated API Gateway with new metrics
2. **Create Grafana dashboard** for gateway monitoring
3. **Set up alerts** for high error/timeout rates
4. **Monitor** route performance and upstream status distribution
5. **Correlate** with order-service metrics for end-to-end visibility

---

## Example Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  QPay API Gateway Overview                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐│
│  │ Total RPS       │  │ Success Rate    │  │ P95 Latency ││
│  │  42.3 req/s     │  │    98.5%        │  │   234 ms    ││
│  └─────────────────┘  └─────────────────┘  └─────────────┘│
│                                                             │
│  ┌─────────────────────────────────────────────────────────┤
│  │ Request Rate by Route                   (stacked graph) │
│  │                                                          │
│  │     seed_session ━━━                                    │
│  │     status ━━━━━━━━━━━━━                                │
│  │     webhook ━━━                                         │
│  │     cancel ━━━                                          │
│  │     ebarimt ━━━                                         │
│  └─────────────────────────────────────────────────────────┘
│                                                             │
│  ┌──────────────────────┐  ┌──────────────────────────────┐│
│  │ Upstream Status      │  │ P95 Latency by Route        ││
│  │ Distribution         │  │                              ││
│  │  (pie chart)         │  │  seed_session: 450ms        ││
│  │                      │  │  status: 120ms              ││
│  │  200: 92%            │  │  webhook: 180ms             ││
│  │  400: 5%             │  │  cancel: 95ms               ││
│  │  500: 2%             │  │  ebarimt: 110ms             ││
│  │  timeout: 1%         │  │                              ││
│  └──────────────────────┘  └──────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

---

*Implementation Date: January 7, 2026*  
*Version: 1.0*

