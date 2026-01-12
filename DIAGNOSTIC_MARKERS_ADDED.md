# QPay Webhook Diagnostic Markers - Summary

## Handlers That Can Return SESSION_MISSING

### Handler 1: `confirmQPayPayment`
- **Route:** `/api/qpay/confirm`
- **File:** `apps/order-service/src/controllers/order.controller.ts` (line ~708)
- **Purpose:** User-facing endpoint to confirm QPay payment
- **Returns SESSION_MISSING when:** Redis session doesn't exist
- **Response shape:** `{ success, created, reason: "SESSION_MISSING", sessionId, invoiceId }`
- ❌ **NO idempotency check** - goes straight to Redis

### Handler 2: `handleQPayWebhook`
- **Route:** `/api/internal/payments/qpay/webhook`
- **File:** `apps/order-service/src/controllers/order.controller.ts` (line ~890)
- **Purpose:** Internal webhook from API Gateway
- **Returns SESSION_MISSING when:** Redis session doesn't exist (ONLY for NEW invoiceId)
- **Response shape:** `{ success, processed, reason: "SESSION_MISSING", invoiceId, sessionId }`
- ✅ **Has idempotency check** - checks QPayProcessedInvoice BEFORE Redis

---

## Changes Made

### All Changes: Diagnostic Markers Only (No Business Logic Changes)

#### 1. Entry Point Logging

Both handlers now log when hit (guarded by `INTERNAL_WEBHOOK_DEBUG=true`):

```typescript
if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
  console.log("### QPAY_HANDLER_HIT ###", {
    handler: "confirmQPayPayment", // or "handleQPayWebhook"
    url: req.originalUrl,
    invoiceId: req.body?.invoiceId,
    status: req.body?.status,
    sessionFromPayload: req.body?.payload?.sender_invoice_no ?? req.body?.payload?.sessionId,
  });
}
```

#### 2. Response Diagnostics

All JSON responses in both handlers now include (when `INTERNAL_WEBHOOK_DEBUG=true`):

```typescript
{
  // ... existing response fields ...
  ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
    handler: "confirmQPayPayment", // or "handleQPayWebhook"
    url: req.originalUrl,
  }),
}
```

### Responses Modified:

**`confirmQPayPayment`:**
- ✅ SESSION_MISSING response
- ✅ Success response (created: true)

**`handleQPayWebhook`:**
- ✅ DUPLICATE response (idempotency hit)
- ✅ SESSION_MISSING response (new invoice, no session)
- ✅ Missing sessionId response
- ✅ Success response (processed: true)
- ✅ Payment not completed response
- ✅ Race condition DUPLICATE response

---

## Exact Diff

### File: `apps/order-service/src/controllers/order.controller.ts`

```diff
@@ confirmQPayPayment (line ~708) @@
+ // DEBUG: Runtime marker
+ if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
+   console.log("### QPAY_HANDLER_HIT ###", {
+     handler: "confirmQPayPayment",
+     url: req.originalUrl,
+     invoiceId: req.body?.invoiceId,
+     status: req.body?.status,
+     sessionFromPayload: req.body?.payload?.sender_invoice_no ?? req.body?.payload?.sessionId,
+   });
+ }

@@ confirmQPayPayment SESSION_MISSING response @@
  return res.status(200).json({
    success: true,
    created: false,
    reason: "SESSION_MISSING",
    sessionId,
    invoiceId,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "confirmQPayPayment",
+     url: req.originalUrl,
+   }),
  });

@@ confirmQPayPayment success response @@
  return res.status(200).json({
    success: true,
    paid: true,
    created: true,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "confirmQPayPayment",
+     url: req.originalUrl,
+   }),
  });

@@ handleQPayWebhook (line ~890) @@
+ // DEBUG: Runtime marker
+ if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
+   console.log("### QPAY_HANDLER_HIT ###", {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+     invoiceId: req.body?.invoiceId,
+     status: req.body?.status,
+     sessionFromPayload: req.body?.payload?.sender_invoice_no ?? req.body?.payload?.sessionId,
+   });
+ }

@@ handleQPayWebhook DUPLICATE response @@
  return res.status(200).json({
    success: true,
    processed: false,
    reason: "DUPLICATE",
    invoiceId,
    sessionId: derivedSessionId,
    orderIds: existing.orderIds ?? [],
    processedAt: existing.processedAt,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+   }),
  });

@@ handleQPayWebhook Missing sessionId response @@
  return res.status(200).json({
    success: true,
    processed: false,
    reason: "Missing sessionId",
    invoiceId,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+   }),
  });

@@ handleQPayWebhook SESSION_MISSING response @@
  console.warn("⚠️ [QPay Webhook] SESSION_MISSING (NEW invoice)", {
    invoiceId,
    sessionId,
+   handler: "handleQPayWebhook",
+   url: req.originalUrl,
  });
  return res.status(200).json({
    success: true,
    processed: false,
    reason: "SESSION_MISSING",
    invoiceId,
    sessionId,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+   }),
  });

@@ handleQPayWebhook Success response @@
  return res.status(200).json({
    success: true,
    processed: true,
    invoiceId,
    sessionId,
    orderIds: createdOrderIds,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+   }),
  });

@@ handleQPayWebhook Payment not completed response @@
  return res.status(200).json({
    success: true,
    processed: false,
    reason: `Payment status: ${status}`,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+   }),
  });

@@ handleQPayWebhook Race condition DUPLICATE response @@
  return res.status(200).json({
    success: true,
    processed: false,
    reason: "DUPLICATE",
    invoiceId,
    sessionId: existingRace?.sessionId ?? sessionId,
    orderIds: existingRace?.orderIds ?? [],
    processedAt: existingRace?.processedAt,
+   ...(process.env.INTERNAL_WEBHOOK_DEBUG === "true" && {
+     handler: "handleQPayWebhook",
+     url: req.originalUrl,
+   }),
  });
```

---

## Verification Commands

### Prerequisites:

```bash
cd /Users/user/Desktop/Final\ Project/eshop

# Regenerate Prisma client (fixes TypeScript errors)
pnpm exec prisma generate

# Rebuild
pnpm exec nx reset order-service
pnpm exec nx build order-service

# Start with debug enabled
INTERNAL_WEBHOOK_DEBUG=true pnpm exec nx run order-service:serve:development
```

### Test Command:

```bash
# Test the internal webhook endpoint
INVOICE_ID="diag_test_$(date +%s)"
SESSION_ID="sess_diag_$(date +%s)"

# Seed Redis session first
redis-cli SET "payment-session:$SESSION_ID" '{"userId":"test-user","cart":[{"productId":"507f1f77bcf86cd799439011","quantity":1,"price":10000,"selectedOptions":[]}],"sellers":[{"sellerId":"507f1f77bcf86cd799439012","items":[{"productId":"507f1f77bcf86cd799439011","shopId":"507f1f77bcf86cd799439013","quantity":1,"price":10000,"selectedOptions":[]}]}],"totalAmount":10000}' EX 600

echo "=== CALL #1 (should create order) ==="
curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"invoiceId\": \"$INVOICE_ID\",
    \"status\": \"paid\",
    \"payload\": {
      \"sender_invoice_no\": \"$SESSION_ID\",
      \"payment_status\": \"PAID\"
    }
  }" | jq .

echo ""
echo "=== CALL #2 (should return DUPLICATE with handler/url fields) ==="
curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"invoiceId\": \"$INVOICE_ID\",
    \"status\": \"paid\",
    \"payload\": {
      \"sender_invoice_no\": \"$SESSION_ID\",
      \"payment_status\": \"PAID\"
    }
  }" | jq .

echo ""
echo "Expected in response #2:"
echo "  - reason: 'DUPLICATE'"
echo "  - handler: 'handleQPayWebhook'"
echo "  - url: '/api/internal/payments/qpay/webhook'"
```

### Test After Redis Deletion:

```bash
# Delete session
redis-cli DEL "payment-session:$SESSION_ID"

echo "=== CALL #3 (after Redis delete - should STILL return DUPLICATE) ==="
curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{
    \"invoiceId\": \"$INVOICE_ID\",
    \"status\": \"paid\",
    \"payload\": {
      \"sender_invoice_no\": \"$SESSION_ID\",
      \"payment_status\": \"PAID\"
    }
  }" | jq .

echo ""
echo "Expected: STILL reason:'DUPLICATE' with handler/url fields"
echo "NOT: reason:'SESSION_MISSING'"
```

---

## Expected Output With Debug Enabled

### Console Logs:

```
### QPAY_HANDLER_HIT ### {
  handler: 'handleQPayWebhook',
  url: '/api/internal/payments/qpay/webhook',
  invoiceId: 'diag_test_...',
  status: 'paid',
  sessionFromPayload: 'sess_diag_...'
}
[QPay Webhook] Checking idempotency { invoiceId: 'diag_test_...' }
✅ [QPay Webhook] DUPLICATE detected { invoiceId: 'diag_test_...', orderIds: [...] }
```

### Response (Call #2):

```json
{
  "success": true,
  "processed": false,
  "reason": "DUPLICATE",
  "invoiceId": "diag_test_...",
  "sessionId": "sess_diag_...",
  "orderIds": ["..."],
  "processedAt": "2026-01-06T...",
  "handler": "handleQPayWebhook",
  "url": "/api/internal/payments/qpay/webhook"
}
```

---

## What The Diagnostics Reveal

### If response shows:
```json
{
  "handler": "confirmQPayPayment",
  "url": "/api/qpay/confirm"
}
```
❌ **WRONG HANDLER** - Something is calling the user-facing endpoint instead of the internal webhook

### If response shows:
```json
{
  "handler": "handleQPayWebhook",
  "url": "/api/internal/payments/qpay/webhook"
}
```
✅ **CORRECT HANDLER** - But if `reason: "SESSION_MISSING"` for duplicate, then idempotency check failed

### If NO `handler` field appears:
❌ **Debug mode not enabled** or **stale build** - Rebuild with `INTERNAL_WEBHOOK_DEBUG=true`

---

## Next Steps After Diagnostics

1. **If wrong handler** → Fix calling code/API Gateway routing
2. **If correct handler but wrong reason** → Investigate Prisma client (regenerate)
3. **If no diagnostic fields** → Ensure rebuild and env var set

The `handler` and `url` fields will definitively identify the source of SESSION_MISSING responses!

