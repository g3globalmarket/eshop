# QPay Metrics - Implementation Guide

## ✅ What's Implemented

### 1. Metrics Infrastructure
- ✅ **prom-client** installed in both services
- ✅ **Metrics modules** created:
  - `apps/order-service/src/metrics/qpay.metrics.ts`
  - `apps/api-gateway/src/metrics/qpay.metrics.ts`
- ✅ **/metrics endpoints** exposed:
  - `http://localhost:6003/metrics` (order-service)
  - `http://localhost:8080/metrics` (api-gateway)

### 2. Metrics Defined

**Order Service (20+ metrics):**
- Webhook counters (received, verified, orders created, etc.)
- Payment check API counters and duration
- Reconciliation counters and duration
- Cleanup counters and duration
- Status/cancel counters

**API Gateway (10+ metrics):**
- Seed session counters and duration
- Status check counters and duration
- Webhook forward counters and duration
- Cancel counters and duration
- Ebarimt counters and duration
- HMAC verification counters

### 3. Utility Functions
- `recordWebhookStart()` - Duration tracking for webhooks
- `recordPaymentCheckStart()` - Duration tracking for payment checks
- `recordReconcileStart()` - Duration tracking for reconciliation
- `recordCleanupStart()` - Duration tracking for cleanup
- Gateway equivalents for all endpoints

### 4. Documentation
- ✅ **QPAY_OBSERVABILITY.md** - Complete metrics documentation
- ✅ Code examples for all instrumentation patterns
- ✅ Prometheus queries and alerting rules
- ✅ Grafana dashboard suggestions

---

## 🚧 Next Steps: Add Instrumentation

The metrics framework is ready. Now you need to add instrumentation calls to the actual code.

### Step 1: Instrument Webhook Handler

**File:** `apps/order-service/src/controllers/order.controller.ts`

**Function:** `handleQPayWebhook`

**Add at top of file:**
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
```

**Add at start of handler:**
```typescript
export const handleQPayWebhook = async (req: Request, res: Response, next: NextFunction) => {
  const endDuration = recordWebhookStart(); // Start duration tracking
  
  try {
    const isInternalRequest = req.headers["x-internal-request"] === "true";
    const source = isInternalRequest ? "internal" : "public";
    qpayWebhookReceivedTotal.inc({ source }); // Track webhook received
    
    // ... rest of handler ...
    
    // When token is invalid:
    if (!tokenValid) {
      qpayWebhookInvalidTokenTotal.inc();
      return res.status(403).json({ ... });
    }
    
    // When session is missing:
    if (!session) {
      qpayWebhookSessionMissingTotal.inc();
      return res.status(200).json({ ... });
    }
    
    // After payment check:
    if (isPaid) {
      qpayWebhookVerifyPaidTotal.inc();
      
      if (!amountOk) {
        qpayWebhookAmountMismatchTotal.inc();
        return res.status(200).json({ ... });
      }
      
      // Check idempotency:
      if (existingProcessedInvoice) {
        qpayWebhookDuplicateTotal.inc();
        return res.status(200).json({ ... });
      }
      
      // After creating order:
      qpayWebhookOrderCreatedTotal.inc();
    } else {
      qpayWebhookVerifyNotPaidTotal.inc();
    }
    
    return res.status(200).json({ ... });
  } catch (error) {
    console.error("[QPay Webhook] Error", error);
    return next(error);
  } finally {
    endDuration(); // Record duration
  }
};
```

### Step 2: Instrument Payment Check Client

**File:** `apps/order-service/src/payments/qpay.client.ts`

**Function:** `paymentCheckInvoice`

**Add at top of file:**
```typescript
import {
  qpayPaymentCheckTotal,
  recordPaymentCheckStart,
} from "../metrics/qpay.metrics";
```

**Instrument method:**
```typescript
async paymentCheckInvoice(invoiceId: string): Promise<QPayPaymentCheckResponse> {
  const endDuration = recordPaymentCheckStart();
  
  try {
    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/v2/payment/check`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        object_type: "INVOICE",
        object_id: invoiceId,
        offset: { page_number: 1, page_limit: 100 },
      }),
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

### Step 3: Instrument Reconciliation Loop

**File:** `apps/order-service/src/payments/qpay-reconcile.service.ts`

**Function:** `runQPayReconcileTick`

**Add at top of file:**
```typescript
import {
  qpayReconcileTickTotal,
  qpayReconcileSessionsScannedTotal,
  qpayReconcileOrdersCreatedTotal,
  qpayReconcileEbarimtCreatedTotal,
  recordReconcileStart,
} from "../metrics/qpay.metrics";
```

**Instrument tick function:**
```typescript
async function runQPayReconcileTick(): Promise<void> {
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
      const result = await processSession(session);
      
      if (result.orderCreated) {
        qpayReconcileOrdersCreatedTotal.inc();
      }
      
      if (result.ebarimtCreated) {
        qpayReconcileEbarimtCreatedTotal.inc({ result: "ok" });
      } else if (result.ebarimtSkipped) {
        qpayReconcileEbarimtCreatedTotal.inc({ result: "skipped" });
      } else if (result.ebarimtError) {
        qpayReconcileEbarimtCreatedTotal.inc({ result: "error" });
      }
    }
  } finally {
    endDuration();
    await releaseLock();
  }
}
```

### Step 4: Instrument Cleanup Loop

**File:** `apps/order-service/src/payments/qpay-cleanup.service.ts`

**Function:** Main cleanup cycle

**Add at top of file:**
```typescript
import {
  qpayCleanupTickTotal,
  qpayCleanupDeletedTotal,
  qpaySessionsExpiredTotal,
  recordCleanupStart,
} from "../metrics/qpay.metrics";
```

**Instrument cleanup cycle:**
```typescript
async function runQPayCleanupTick(): Promise<void> {
  const lockAcquired = await acquireLock();
  
  if (!lockAcquired) {
    qpayCleanupTickTotal.inc({ result: "skipped_lock" });
    return;
  }
  
  const endDuration = recordCleanupStart();
  qpayCleanupTickTotal.inc({ result: "ran" });
  
  try {
    // Expire old sessions
    const expiredCount = await expirePendingSessions();
    qpaySessionsExpiredTotal.inc(expiredCount);
    
    // Clean up webhook events
    const webhookEventsDeleted = await cleanupWebhookEvents();
    qpayCleanupDeletedTotal.inc({ table: "webhook_events" }, webhookEventsDeleted);
    
    // Clean up payment sessions
    const processedSessionsDeleted = await cleanupProcessedSessions();
    const failedSessionsDeleted = await cleanupFailedSessions();
    qpayCleanupDeletedTotal.inc(
      { table: "payment_sessions" },
      processedSessionsDeleted + failedSessionsDeleted
    );
    
    // Clean up processed invoices
    const invoicesDeleted = await cleanupProcessedInvoices();
    qpayCleanupDeletedTotal.inc({ table: "processed_invoices" }, invoicesDeleted);
  } finally {
    endDuration();
    await releaseLock();
  }
}
```

### Step 5: Instrument Gateway Endpoints

**File:** `apps/api-gateway/src/(routes)/qpay.ts`

**Add at top:**
```typescript
import {
  qpayGatewaySeedSessionTotal,
  qpayGatewayStatusTotal,
  qpayGatewayWebhookTotal,
  qpayGatewayCancelTotal,
  qpayGatewayEbarimtTotal,
  qpayGatewayHmacVerifyTotal,
  recordSeedSessionStart,
  recordStatusCheckStart,
  recordWebhookStart,
  recordCancelStart,
  recordEbarimtStart,
} from "../metrics/qpay.metrics";
```

**Instrument each endpoint:**

**Seed session:**
```typescript
router.post("/seed-session", async (req: Request, res: Response) => {
  const endDuration = recordSeedSessionStart();
  
  try {
    const response = await fetch(...);
    
    if (response.ok) {
      qpayGatewaySeedSessionTotal.inc({ result: "ok" });
    } else {
      qpayGatewaySeedSessionTotal.inc({ result: "error" });
    }
    
    return res.status(response.status).json(await response.json());
  } catch (error) {
    qpayGatewaySeedSessionTotal.inc({ result: "error" });
    return res.status(500).json({ error: "..." });
  } finally {
    endDuration();
  }
});
```

**Status check:**
```typescript
router.get("/status", async (req: Request, res: Response) => {
  const endDuration = recordStatusCheckStart();
  
  try {
    const response = await fetch(...);
    
    if (response.ok) {
      qpayGatewayStatusTotal.inc({ result: "ok" });
    } else {
      qpayGatewayStatusTotal.inc({ result: "error" });
    }
    
    return res.status(response.status).json(await response.json());
  } catch (error) {
    qpayGatewayStatusTotal.inc({ result: "error" });
    return res.status(500).json({ error: "..." });
  } finally {
    endDuration();
  }
});
```

**Webhook (with HMAC verification):**
```typescript
router.post("/callback", async (req: Request, res: Response) => {
  const endDuration = recordWebhookStart();
  
  try {
    // HMAC verification
    const signature = req.headers["x-qpay-signature"];
    
    if (!signature) {
      qpayGatewayHmacVerifyTotal.inc({ result: "missing" });
      return res.status(401).json({ ok: false, error: "Missing signature" });
    }
    
    const isValid = verifyHmac(rawBody, signature, secret);
    
    if (!isValid) {
      qpayGatewayHmacVerifyTotal.inc({ result: "invalid" });
      return res.status(401).json({ ok: false, error: "Invalid signature" });
    }
    
    qpayGatewayHmacVerifyTotal.inc({ result: "valid" });
    
    // Forward to order-service
    const response = await fetch(...);
    
    if (response.ok) {
      qpayGatewayWebhookTotal.inc({ result: "ok" });
    } else {
      qpayGatewayWebhookTotal.inc({ result: "error" });
    }
    
    return res.status(200).json({ ok: true });
  } catch (error) {
    qpayGatewayWebhookTotal.inc({ result: "error" });
    return res.status(500).json({ error: "..." });
  } finally {
    endDuration();
  }
});
```

### Step 6: Add Request Correlation IDs

**Create middleware for correlation ID:**

**File:** `apps/api-gateway/src/middleware/correlation-id.ts`
```typescript
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = (req.headers["x-correlation-id"] as string) || crypto.randomUUID();
  (req as any).correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
}
```

**Add to main.ts:**
```typescript
import { correlationIdMiddleware } from "./middleware/correlation-id";

app.use(correlationIdMiddleware);
```

**Use in handlers:**
```typescript
const correlationId = (req as any).correlationId;

console.log("[QPay]", {
  correlationId,
  sessionId,
  invoiceId,
  status,
});

// Forward to downstream services
fetch(url, {
  headers: {
    "x-correlation-id": correlationId,
    ...
  }
});
```

---

## 🧪 Testing

### 1. Verify Metrics Endpoints

```bash
# Order service
curl http://localhost:6003/metrics | grep qpay

# API Gateway
curl http://localhost:8080/metrics | grep qpay
```

### 2. Generate Test Traffic

```bash
# Trigger webhook
curl -X POST http://localhost:8080/payments/qpay/webhook?sessionId=test&token=test123 \
  -H "Content-Type: application/json" \
  -d '{"invoiceId":"inv_test","status":"paid"}'

# Check metrics
curl http://localhost:6003/metrics | grep qpay_webhook_received_total
```

### 3. Verify Metrics Are Incremented

```bash
# Before request
curl http://localhost:6003/metrics | grep qpay_webhook_received_total
# Output: qpay_webhook_received_total{source="public"} 0

# Make request (above)

# After request
curl http://localhost:6003/metrics | grep qpay_webhook_received_total
# Output: qpay_webhook_received_total{source="public"} 1
```

---

## 📊 Prometheus Setup

**Add to `prometheus.yml`:**
```yaml
scrape_configs:
  - job_name: 'order-service'
    static_configs:
      - targets: ['order-service:6003']
    metrics_path: '/metrics'

  - job_name: 'api-gateway'
    static_configs:
      - targets: ['api-gateway:8080']
    metrics_path: '/metrics'
```

---

## ✅ Summary

**Framework is ready:**
- ✅ Metrics modules created
- ✅ /metrics endpoints exposed
- ✅ Utility functions for duration tracking
- ✅ Comprehensive documentation

**Next: Add instrumentation calls:**
- Add `import` statements
- Add `inc()` calls at decision points
- Add `recordXxxStart()` / `endDuration()` for timing
- Add correlation ID middleware
- Test metrics endpoint

**Estimated time:** 1-2 hours to instrument all handlers

---

*Implementation Guide Version: 1.0*  
*Date: January 7, 2026*

