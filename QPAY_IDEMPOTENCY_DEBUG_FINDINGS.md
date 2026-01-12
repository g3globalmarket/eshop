# QPay Webhook Idempotency Bug - Debug Findings & Fix

## Investigation Summary

### Problem Statement
Duplicate QPay webhooks (same invoiceId) return `SESSION_MISSING` instead of `DUPLICATE`, even though:
1. QPayProcessedInvoice record exists in MongoDB
2. Source code appears to check idempotency BEFORE Redis

The response is missing `invoiceId` and `sessionId` fields.

---

## FINDINGS

### 1. Route Registration (VERIFIED ✓)

**File:** `apps/order-service/src/main.ts`
- Router mounted at: `app.use("/api", router)` (line 36)

**File:** `apps/order-service/src/routes/order.route.ts`
- Internal webhook: `router.post("/internal/payments/qpay/webhook", handleQPayWebhook)` (line 42)
- **Full path:** `/api/internal/payments/qpay/webhook`

### 2. Handler Identification (FOUND ISSUE ⚠️)

There are **TWO handlers** that could return `SESSION_MISSING`:

#### Handler A: `handleQPayWebhook` (CORRECT)
**Location:** `apps/order-service/src/controllers/order.controller.ts` (line 890)
**Route:** `/api/internal/payments/qpay/webhook`
**SESSION_MISSING Response:**
```json
{
  "success": true,
  "processed": false,
  "reason": "SESSION_MISSING",
  "invoiceId": "...",
  "sessionId": "..."
}
```
✅ **Includes invoiceId and sessionId**
✅ **Has idempotency check BEFORE Redis**

#### Handler B: `confirmQPayPayment` (PROBLEMATIC)
**Location:** `apps/order-service/src/controllers/order.controller.ts` (line 708)
**Route:** `/api/qpay/confirm`
**SESSION_MISSING Response (BEFORE FIX):**
```json
{
  "success": true,
  "created": false,
  "reason": "SESSION_MISSING"
}
```
❌ **MISSING invoiceId and sessionId**
❌ **NO idempotency check - goes straight to Redis**

### 3. Root Cause Analysis

**Possible scenarios:**

**Scenario 1: Wrong Endpoint Being Called**
- User/client is calling `/api/qpay/confirm` instead of `/api/internal/payments/qpay/webhook`
- This would explain missing fields and lack of idempotency

**Scenario 2: Stale Build**
- Order service running old compiled code
- Recent source changes not reflected in runtime

**Scenario 3: TypeScript Compilation Errors**
- Linter shows 4 errors: `Property 'qPayProcessedInvoice' does not exist on type 'PrismaClient'`
- This means Prisma client wasn't regenerated after schema changes
- Runtime might be using fallback code path or failing silently

---

## FIXES APPLIED

### Fix 1: Added Runtime Debug Markers

Both handlers now log when hit (guarded by `INTERNAL_WEBHOOK_DEBUG=true`):

```typescript
// In handleQPayWebhook:
if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
  console.log("### QPAY_WEBHOOK_HANDLER_HIT ###", {
    invoiceId: req.body?.invoiceId,
    url: req.originalUrl,
    method: req.method,
    handler: "handleQPayWebhook",
  });
}

// In confirmQPayPayment:
if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
  console.log("### QPAY_CONFIRM_HANDLER_HIT ###", {
    invoiceId: req.body?.invoiceId,
    url: req.originalUrl,
    method: req.method,
    handler: "confirmQPayPayment",
  });
}
```

### Fix 2: Improved confirmQPayPayment Response

Added missing fields to SESSION_MISSING response for consistency:

```typescript
// BEFORE:
return res.status(200).json({
  success: true,
  created: false,
  reason: "SESSION_MISSING",
});

// AFTER:
return res.status(200).json({
  success: true,
  created: false,
  reason: "SESSION_MISSING",
  sessionId,
  invoiceId,
});
```

### Fix 3: Integration Test Script

Created: `scripts/test-qpay-idempotency.js`
- Seeds Redis session
- Calls webhook #1 (creates order)
- Calls webhook #2 (should return DUPLICATE)
- Deletes Redis session
- Calls webhook #3 (MUST still return DUPLICATE)
- Validates response includes all required fields

---

## VERIFICATION STEPS

### Step 1: Regenerate Prisma Client

```bash
cd /Users/user/Desktop/Final\ Project/eshop

# Regenerate Prisma client to fix TypeScript errors
pnpm exec prisma generate

# Verify model exists
grep -A 10 "model QPayProcessedInvoice" prisma/schema.prisma
```

### Step 2: Rebuild & Restart Order Service

```bash
# Kill existing process
pkill -f "order-service" || true

# Clean build
pnpm exec nx reset order-service
pnpm exec nx build order-service

# Start with debug logging enabled
INTERNAL_WEBHOOK_DEBUG=true pnpm exec nx run order-service:serve:development
```

### Step 3: Run Integration Test

```bash
# Ensure Redis is running
redis-cli ping  # Should return PONG

# Run test script
cd /Users/user/Desktop/Final\ Project/eshop
node scripts/test-qpay-idempotency.js
```

Expected output:
```
✓ Response includes invoiceId
✓ Response includes sessionId
✓ Response includes orderIds
✓ Reason is DUPLICATE (not SESSION_MISSING)

🎉 ALL TESTS PASSED
```

### Step 4: Manual Verification

```bash
INVOICE_ID="manual_test_$(date +%s)"
SESSION_ID="sess_manual_$(date +%s)"

# Seed session first
redis-cli SET "payment-session:$SESSION_ID" '{"userId":"test-user","cart":[{"productId":"507f1f77bcf86cd799439011","quantity":1,"price":10000,"selectedOptions":[]}],"sellers":[{"sellerId":"507f1f77bcf86cd799439012","items":[{"productId":"507f1f77bcf86cd799439011","shopId":"507f1f77bcf86cd799439013","quantity":1,"price":10000,"selectedOptions":[]}]}],"totalAmount":10000}' EX 600

# Call webhook #1
curl -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
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

# Check logs for:
# ### QPAY_WEBHOOK_HANDLER_HIT ###
# [QPay Webhook] Checking idempotency

# Call webhook #2
curl -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
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

# Expected: { "reason": "DUPLICATE", "invoiceId": "...", "sessionId": "...", "orderIds": [...] }

# Delete Redis session
redis-cli DEL "payment-session:$SESSION_ID"

# Call webhook #3 (CRITICAL TEST)
curl -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
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

# Expected: STILL { "reason": "DUPLICATE", ... }
# NOT: { "reason": "SESSION_MISSING" }
```

---

## DEBUG OUTPUT INTERPRETATION

### If you see `### QPAY_CONFIRM_HANDLER_HIT ###`:
❌ **Wrong endpoint is being called**
- Check the calling code/API Gateway
- Should be calling `/api/internal/payments/qpay/webhook`
- NOT `/api/qpay/confirm`

### If you see `### QPAY_WEBHOOK_HANDLER_HIT ###`:
✅ **Correct endpoint**
- Check if idempotency lookup finds existing record
- Check logs for `[QPay Webhook] Checking idempotency`
- If `found: false` but record exists in DB → Prisma client issue

### If TypeScript errors persist:
```
Property 'qPayProcessedInvoice' does not exist on type 'PrismaClient'
```
Run:
```bash
pnpm exec prisma generate
pnpm exec nx reset order-service
pnpm exec nx build order-service
```

---

## DIFF SUMMARY

### Changed Files:

**1. `apps/order-service/src/controllers/order.controller.ts`**

```diff
@@ handleQPayWebhook (line 890)
+  // DEBUG: Runtime marker to confirm this handler is executed
+  if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
+    console.log("### QPAY_WEBHOOK_HANDLER_HIT ###", { ... });
+  }

@@ confirmQPayPayment (line 708)
+  // DEBUG: Runtime marker to confirm this handler is executed
+  if (process.env.INTERNAL_WEBHOOK_DEBUG === "true") {
+    console.log("### QPAY_CONFIRM_HANDLER_HIT ###", { ... });
+  }

@@ confirmQPayPayment SESSION_MISSING response (line 727)
   return res.status(200).json({
     success: true,
     created: false,
     reason: "SESSION_MISSING",
+    sessionId,     // Added for consistency
+    invoiceId,     // Added for consistency
   });
```

**2. `scripts/test-qpay-idempotency.js` (NEW FILE)**
- Full integration test for idempotency
- Seeds session, tests duplicate detection, verifies response fields

---

## NEXT STEPS

1. **Regenerate Prisma client** (fixes TypeScript errors)
2. **Rebuild order-service** (ensures latest code runs)
3. **Enable debug logging** (`INTERNAL_WEBHOOK_DEBUG=true`)
4. **Run integration test** to verify fix
5. **Check logs** to confirm correct handler is hit
6. **Disable debug logging** in production

---

## SUCCESS CRITERIA

✅ Duplicate webhooks return `DUPLICATE` (not `SESSION_MISSING`)
✅ Response includes `invoiceId`, `sessionId`, `orderIds`
✅ Idempotency works even after Redis session expires
✅ Integration test passes
✅ Debug logs show `### QPAY_WEBHOOK_HANDLER_HIT ###` (not CONFIRM handler)

