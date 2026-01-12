# QPay Observability - Metrics & Tracing

## Overview

Structured metrics and tracing for QPay payment flows using Prometheus (prom-client). Tracks counts, durations, and error reasons across all QPay services.

**Stack:**
- **prom-client** v15.1.0 - Prometheus metrics library
- **Prometheus-compatible** - Metrics exposed at `/metrics` endpoint
- **Lightweight** - No vendor lock-in, standard Prometheus format

---

## 📊 Metrics Exposed

### Order Service Metrics

#### Webhook Metrics

```
# Total webhooks received
qpay_webhook_received_total{source="public|internal"}

# Invalid callback tokens
qpay_webhook_invalid_token_total

# Payment verification results
qpay_webhook_verify_paid_total
qpay_webhook_verify_not_paid_total

# Amount mismatches
qpay_webhook_amount_mismatch_total

# Duplicate webhooks (idempotency)
qpay_webhook_duplicate_total

# Orders created via webhook
qpay_webhook_order_created_total

# Session not found
qpay_webhook_session_missing_total

# Webhook processing duration (histogram)
qpay_webhook_duration_ms
  Buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000] ms
```

#### Payment Check API Metrics

```
# QPay /v2/payment/check API calls
qpay_payment_check_total{result="ok|error"}

# API call duration (histogram)
qpay_payment_check_duration_ms
  Buckets: [50, 100, 200, 500, 1000, 2000, 5000] ms
```

#### Reconciliation Loop Metrics

```
# Reconciliation ticks
qpay_reconcile_tick_total{result="ran|skipped_lock"}

# Sessions scanned
qpay_reconcile_sessions_scanned_total

# Orders created
qpay_reconcile_orders_created_total

# Cycle duration (histogram)
qpay_reconcile_duration_ms
  Buckets: [100, 500, 1000, 2000, 5000, 10000, 30000] ms

# Ebarimt receipts created
qpay_reconcile_ebarimt_created_total{result="ok|error|skipped"}
```

#### Cleanup Loop Metrics

```
# Cleanup ticks
qpay_cleanup_tick_total{result="ran|skipped_lock"}

# Records deleted
qpay_cleanup_deleted_total{table="webhook_events|payment_sessions|processed_invoices"}

# Sessions expired
qpay_sessions_expired_total

# Cycle duration (histogram)
qpay_cleanup_duration_ms
  Buckets: [100, 500, 1000, 2000, 5000, 10000, 30000] ms
```

#### Status & Cancel Metrics

```
# Payment status checks
qpay_status_check_total{status="PENDING|PAID|PROCESSED|CANCELLED|EXPIRED"}

# Payment cancellations
qpay_cancel_total{result="success|already_cancelled|error"}
```

---

### API Gateway Metrics

```
# Seed session requests
qpay_gateway_seed_session_total{result="ok|error"}
qpay_gateway_seed_session_duration_ms
  Buckets: [100, 200, 500, 1000, 2000, 5000, 10000] ms

# Status check requests
qpay_gateway_status_total{result="ok|error"}
qpay_gateway_status_duration_ms
  Buckets: [10, 50, 100, 200, 500, 1000, 2000] ms

# Webhook forwards
qpay_gateway_webhook_total{result="ok|error"}
qpay_gateway_webhook_duration_ms
  Buckets: [50, 100, 200, 500, 1000, 2000, 5000] ms

# Cancel requests
qpay_gateway_cancel_total{result="ok|error"}
qpay_gateway_cancel_duration_ms
  Buckets: [10, 50, 100, 200, 500, 1000] ms

# Ebarimt info requests
qpay_gateway_ebarimt_total{result="ok|error"}
qpay_gateway_ebarimt_duration_ms
  Buckets: [10, 50, 100, 200, 500, 1000] ms

# HMAC signature verification
qpay_gateway_hmac_verify_total{result="valid|invalid|missing"}
```

---

## 🔧 Implementation

### 1. Metrics Modules Created

**Order Service:**
```
apps/order-service/src/metrics/qpay.metrics.ts
```

**API Gateway:**
```
apps/api-gateway/src/metrics/qpay.metrics.ts
```

### 2. Instrumentation Pattern

**Example: Webhook Handler Instrumentation**

```typescript
import {
  qpayWebhookReceivedTotal,
  qpayWebhookInvalidTokenTotal,
  qpayWebhookVerifyPaidTotal,
  qpayWebhookVerifyNotPaidTotal,
  qpayWebhookAmountMismatchTotal,
  qpayWebhookDuplicateTotal,
  qpayWebhookOrderCreatedTotal,
  qpayWebhookSessionMissingTotal,
  recordWebhookStart,
} from "../metrics/qpay.metrics";

export const handleQPayWebhook = async (req: Request, res: Response, next: NextFunction) => {
  // Start duration tracking
  const endDuration = recordWebhookStart();
  
  try {
    // Determine source
    const isInternalRequest = req.headers["x-internal-request"] === "true";
    const source = isInternalRequest ? "internal" : "public";
    
    // Track webhook received
    qpayWebhookReceivedTotal.inc({ source });
    
    // Log with correlation ID
    const correlationId = req.headers["x-correlation-id"] || crypto.randomUUID();
    console.log("[QPay Webhook]", { correlationId, sessionId, invoiceId });
    
    // For public requests, verify token
    if (isPublicRequest) {
      // ... token verification ...
      if (!tokenValid) {
        qpayWebhookInvalidTokenTotal.inc();
        return res.status(403).json({ ok: false });
      }
    }
    
    // Load session
    if (!session) {
      qpayWebhookSessionMissingTotal.inc();
      return res.status(200).json({ success: true, reason: "SESSION_MISSING" });
    }
    
    // Verify payment via QPay API
    const paymentCheckResult = await qpayClient.paymentCheckInvoice(invoiceId);
    
    const isPaid = paymentCheckResult.rows?.some(r => r.payment_status === "PAID");
    
    if (isPaid) {
      qpayWebhookVerifyPaidTotal.inc();
      
      // Verify amount
      if (!amountOk) {
        qpayWebhookAmountMismatchTotal.inc();
        return res.status(200).json({ success: true, reason: "AMOUNT_MISMATCH" });
      }
      
      // Check idempotency
      const existing = await prisma.qPayProcessedInvoice.findUnique({ where: { invoiceId } });
      if (existing) {
        qpayWebhookDuplicateTotal.inc();
        return res.status(200).json({ success: true, reason: "DUPLICATE" });
      }
      
      // Create order
      const orders = await createOrdersFromSession(...);
      qpayWebhookOrderCreatedTotal.inc();
      
      return res.status(200).json({ success: true, processed: true });
    } else {
      qpayWebhookVerifyNotPaidTotal.inc();
      return res.status(200).json({ success: true, reason: "NOT_PAID" });
    }
  } catch (error) {
    console.error("[QPay Webhook] Error", { correlationId, error });
    return next(error);
  } finally {
    // Record duration
    endDuration();
  }
};
```

**Example: Payment Check Client Instrumentation**

```typescript
import {
  qpayPaymentCheckTotal,
  recordPaymentCheckStart,
} from "../metrics/qpay.metrics";

async paymentCheckInvoice(invoiceId: string) {
  const endDuration = recordPaymentCheckStart();
  
  try {
    const response = await fetch(`${this.baseUrl}/v2/payment/check`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ... },
      body: JSON.stringify({ object_type: "INVOICE", object_id: invoiceId, ... }),
    });
    
    if (!response.ok) {
      qpayPaymentCheckTotal.inc({ result: "error" });
      throw new Error(`Payment check failed: ${response.status}`);
    }
    
    const data = await response.json();
    qpayPaymentCheckTotal.inc({ result: "ok" });
    return data;
  } catch (error) {
    qpayPaymentCheckTotal.inc({ result: "error" });
    throw error;
  } finally {
    endDuration();
  }
}
```

**Example: Reconciliation Loop Instrumentation**

```typescript
import {
  qpayReconcileTickTotal,
  qpayReconcileSessionsScannedTotal,
  qpayReconcileOrdersCreatedTotal,
  qpayReconcileEbarimtCreatedTotal,
  recordReconcileStart,
} from "../metrics/qpay.metrics";

async function runReconcileTick() {
  // Try to acquire lock
  const lockAcquired = await acquireLock();
  
  if (!lockAcquired) {
    qpayReconcileTickTotal.inc({ result: "skipped_lock" });
    return;
  }
  
  const endDuration = recordReconcileStart();
  qpayReconcileTickTotal.inc({ result: "ran" });
  
  try {
    const sessions = await getCandidateSessions();
    qpayReconcileSessionsScannedTotal.inc(sessions.length);
    
    for (const session of sessions) {
      // Process session...
      const orderCreated = await processSession(session);
      
      if (orderCreated) {
        qpayReconcileOrdersCreatedTotal.inc();
      }
      
      // Create Ebarimt if needed
      const ebarimtResult = await createEbarimtForSession(session);
      if (ebarimtResult.success) {
        qpayReconcileEbarimtCreatedTotal.inc({ result: "ok" });
      } else if (ebarimtResult.skipped) {
        qpayReconcileEbarimtCreatedTotal.inc({ result: "skipped" });
      } else {
        qpayReconcileEbarimtCreatedTotal.inc({ result: "error" });
      }
    }
  } finally {
    endDuration();
    await releaseLock();
  }
}
```

**Example: Cleanup Loop Instrumentation**

```typescript
import {
  qpayCleanupTickTotal,
  qpayCleanupDeletedTotal,
  qpaySessionsExpiredTotal,
  recordCleanupStart,
} from "../metrics/qpay.metrics";

async function runCleanupTick() {
  const lockAcquired = await acquireLock();
  
  if (!lockAcquired) {
    qpayCleanupTickTotal.inc({ result: "skipped_lock" });
    return;
  }
  
  const endDuration = recordCleanupStart();
  qpayCleanupTickTotal.inc({ result: "ran" });
  
  try {
    // Expire old PENDING sessions
    const expiredCount = await expirePendingSessions();
    qpaySessionsExpiredTotal.inc(expiredCount);
    
    // Delete old webhook events
    const webhookEventsDeleted = await cleanupWebhookEvents();
    qpayCleanupDeletedTotal.inc({ table: "webhook_events" }, webhookEventsDeleted);
    
    // Delete old payment sessions
    const sessionsDeleted = await cleanupProcessedSessions() + await cleanupFailedSessions();
    qpayCleanupDeletedTotal.inc({ table: "payment_sessions" }, sessionsDeleted);
    
    // Delete old processed invoices
    const invoicesDeleted = await cleanupProcessedInvoices();
    qpayCleanupDeletedTotal.inc({ table: "processed_invoices" }, invoicesDeleted);
  } finally {
    endDuration();
    await releaseLock();
  }
}
```

**Example: API Gateway Endpoint Instrumentation**

```typescript
import {
  qpayGatewaySeedSessionTotal,
  recordSeedSessionStart,
} from "../metrics/qpay.metrics";

router.post("/seed-session", async (req: Request, res: Response) => {
  const endDuration = recordSeedSessionStart();
  const correlationId = req.headers["x-correlation-id"] || crypto.randomUUID();
  
  try {
    console.log("[QPay Gateway] Seed session", { correlationId });
    
    // Proxy to order-service
    const response = await fetch(`${orderServiceUrl}/api/internal/payments/qpay/seed-session`, {
      method: "POST",
      headers: {
        "x-correlation-id": correlationId,
        "x-internal-request": "false",
        ...authHeaders,
      },
      body: JSON.stringify(req.body),
    });
    
    if (response.ok) {
      qpayGatewaySeedSessionTotal.inc({ result: "ok" });
    } else {
      qpayGatewaySeedSessionTotal.inc({ result: "error" });
    }
    
    return res.status(response.status).json(await response.json());
  } catch (error) {
    qpayGatewaySeedSessionTotal.inc({ result: "error" });
    console.error("[QPay Gateway] Seed session error", { correlationId, error });
    return res.status(500).json({ error: "Failed to create payment session" });
  } finally {
    endDuration();
  }
});
```

---

## 🌐 /metrics Endpoints

### Order Service

**Add to `apps/order-service/src/main.ts`:**

```typescript
import { register } from "prom-client";

// Import metrics module to ensure they're registered
import "./metrics/qpay.metrics";

// ... existing app setup ...

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
});

// ... rest of server setup ...
```

**Access metrics:**
```bash
curl http://localhost:6003/metrics
```

### API Gateway

**Add to `apps/api-gateway/src/main.ts`:**

```typescript
import { register } from "prom-client";

// Import metrics module
import "./metrics/qpay.metrics";

// ... existing app setup ...

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
});
```

**Access metrics:**
```bash
curl http://localhost:8080/metrics
```

---

## 🔍 Request Correlation

### Correlation ID Flow

```
Frontend Request
    ↓
API Gateway (generate x-correlation-id if missing)
    ↓
Order Service (forward x-correlation-id)
    ↓
All logs include correlationId
```

### Implementation

**Generate/Forward Correlation ID:**

```typescript
// In request handler
const correlationId = (req.headers["x-correlation-id"] as string) || crypto.randomUUID();

// Log with correlation ID
console.log("[QPay]", {
  correlationId,
  sessionId,
  invoiceId,
  status,
  // No PII, no tokens
});

// Forward to downstream services
fetch(url, {
  headers: {
    "x-correlation-id": correlationId,
    ...
  }
});
```

### Log Format

```json
{
  "timestamp": "2026-01-07T12:34:56.789Z",
  "level": "info",
  "message": "[QPay Webhook] Processing",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "session_abc123",
  "invoiceId": "inv_xyz789",
  "status": "PAID"
}
```

**❌ Do NOT log:**
- Callback tokens
- User PII (email, phone, receiver ID)
- JWT tokens
- API keys

**✅ DO log:**
- correlationId
- sessionId
- invoiceId
- status
- error reasons
- durations

---

## 📈 Using Metrics

### Prometheus Configuration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'qpay-order-service'
    static_configs:
      - targets: ['order-service:6003']
    metrics_path: '/metrics'
    scrape_interval: 15s

  - job_name: 'qpay-api-gateway'
    static_configs:
      - targets: ['api-gateway:8080']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Example Queries

**Webhook success rate:**
```promql
rate(qpay_webhook_order_created_total[5m])
  /
rate(qpay_webhook_received_total[5m])
```

**Average webhook duration:**
```promql
rate(qpay_webhook_duration_ms_sum[5m])
  /
rate(qpay_webhook_duration_ms_count[5m])
```

**Payment check error rate:**
```promql
rate(qpay_payment_check_total{result="error"}[5m])
  /
rate(qpay_payment_check_total[5m])
```

**Reconciliation orders per cycle:**
```promql
rate(qpay_reconcile_orders_created_total[1h])
  /
rate(qpay_reconcile_tick_total{result="ran"}[1h])
```

**Sessions expired per hour:**
```promql
increase(qpay_sessions_expired_total[1h])
```

---

## 🚨 Alerting Rules

**High webhook error rate:**
```yaml
- alert: QPay Webhook High Error Rate
  expr: |
    rate(qpay_webhook_verify_not_paid_total[5m])
      /
    rate(qpay_webhook_received_total[5m])
    > 0.5
  for: 5m
  annotations:
    summary: "QPay webhook error rate > 50%"
```

**Payment check failures:**
```yaml
- alert: QPay Payment Check Failures
  expr: rate(qpay_payment_check_total{result="error"}[5m]) > 1
  for: 5m
  annotations:
    summary: "QPay payment check API failing"
```

**Reconciliation not running:**
```yaml
- alert: QPay Reconciliation Not Running
  expr: |
    (time() - qpay_reconcile_tick_total{result="ran"}) > 300
  annotations:
    summary: "QPay reconciliation hasn't run in 5 minutes"
```

---

## 📊 Grafana Dashboard

### Panels to Create

1. **Webhook Overview**
   - Webhooks received/sec (by source)
   - Success rate
   - Average duration (p50, p95, p99)

2. **Payment Verification**
   - PAID vs NOT_PAID ratio
   - Amount mismatches
   - Duplicate webhooks

3. **Order Creation**
   - Orders created/sec (webhook vs reconciliation)
   - Order creation success rate

4. **Reconciliation**
   - Cycles run/hour
   - Sessions scanned/cycle
   - Orders created/cycle
   - Average cycle duration

5. **Cleanup**
   - Records deleted/cycle (by table)
   - Sessions expired/hour

6. **API Performance**
   - Payment check API latency (p50, p95, p99)
   - Payment check error rate

7. **Gateway**
   - Requests/sec (by endpoint)
   - Success rate (by endpoint)
   - Average latency (by endpoint)

---

## 🧪 Testing

### Verify Metrics Endpoint

```bash
# Order service
curl http://localhost:6003/metrics | grep qpay

# API Gateway
curl http://localhost:8080/metrics | grep qpay
```

### Generate Test Data

```bash
# Trigger webhook
curl -X POST http://localhost:8080/payments/qpay/webhook?sessionId=test&token=test123 \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_test","status":"paid"}'

# Check status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/payments/qpay/status?sessionId=test

# Check metrics
curl http://localhost:6003/metrics | grep qpay_webhook_received_total
```

---

## 🚀 Deployment

### 1. Install Dependencies

```bash
# Already added to package.json
# pnpm install will install prom-client
```

### 2. Update Services

```bash
# Import metrics module in main.ts
# Add /metrics endpoint
# Rebuild services
pnpm exec nx build order-service
pnpm exec nx build api-gateway
```

### 3. Configure Prometheus

- Add scrape configs
- Restart Prometheus

### 4. Import Grafana Dashboard

- Create dashboard from queries above
- Or use pre-built dashboard template

---

## 📝 Summary

**Metrics Implemented:**
- ✅ 20+ metrics across order-service
- ✅ 10+ metrics for api-gateway
- ✅ Counters for all key events
- ✅ Histograms for duration tracking
- ✅ Labels for granular filtering

**Tracing Implemented:**
- ✅ Request correlation IDs
- ✅ Consistent log format
- ✅ No PII in logs
- ✅ Context propagation across services

**Endpoints:**
- ✅ `/metrics` on both services
- ✅ Prometheus-compatible format
- ✅ Standard histogram buckets

**Production Ready:**
- ✅ Lightweight (minimal overhead)
- ✅ No vendor lock-in
- ✅ Works with standard Prometheus stack
- ✅ Easy to extend with new metrics

---

*Documentation Date: January 7, 2026*  
*Version: 1.0*

