# Quick Verification Guide

## What Was Found

### TWO Handlers Can Return SESSION_MISSING:

1. **`handleQPayWebhook`** (`/api/internal/payments/qpay/webhook`) ✅ CORRECT
   - Has idempotency check
   - Includes invoiceId/sessionId in response

2. **`confirmQPayPayment`** (`/api/qpay/confirm`) ❌ WRONG
   - NO idempotency check
   - Was missing invoiceId/sessionId in SESSION_MISSING response

### Root Cause:
Either:
- Wrong endpoint being called, OR
- Stale build (Prisma client not regenerated after schema changes)

---

## Fix & Verify (5 Commands)

```bash
cd /Users/user/Desktop/Final\ Project/eshop

# 1. Regenerate Prisma client (fixes TypeScript errors)
pnpm exec prisma generate

# 2. Rebuild order-service
pnpm exec nx reset order-service && pnpm exec nx build order-service

# 3. Start with debug logging
INTERNAL_WEBHOOK_DEBUG=true pnpm exec nx run order-service:serve:development &

# 4. Run integration test
sleep 5 && node scripts/test-qpay-idempotency.js

# 5. Check logs - should see:
#    ### QPAY_WEBHOOK_HANDLER_HIT ### (NOT QPAY_CONFIRM_HANDLER_HIT)
#    ✅ [QPay Webhook] DUPLICATE detected
```

---

## What To Look For

### In Logs (with INTERNAL_WEBHOOK_DEBUG=true):

**✅ GOOD (correct handler):**
```
### QPAY_WEBHOOK_HANDLER_HIT ### { handler: 'handleQPayWebhook', ... }
[QPay Webhook] Checking idempotency { invoiceId: '...' }
✅ [QPay Webhook] DUPLICATE detected
```

**❌ BAD (wrong handler):**
```
### QPAY_CONFIRM_HANDLER_HIT ### { handler: 'confirmQPayPayment', ... }
```

### In Response:

**✅ GOOD:**
```json
{
  "success": true,
  "processed": false,
  "reason": "DUPLICATE",
  "invoiceId": "...",
  "sessionId": "...",
  "orderIds": ["..."]
}
```

**❌ BAD:**
```json
{
  "success": true,
  "processed": false,
  "reason": "SESSION_MISSING"
  // Missing: invoiceId, sessionId, orderIds
}
```

---

## Files Changed

1. **`apps/order-service/src/controllers/order.controller.ts`**
   - Added debug markers to both handlers (guarded by env var)
   - Fixed `confirmQPayPayment` to include invoiceId/sessionId in SESSION_MISSING response

2. **`scripts/test-qpay-idempotency.js`** (NEW)
   - Full integration test

See `QPAY_IDEMPOTENCY_DEBUG_FINDINGS.md` for complete analysis.

