# QPay Webhook Idempotency Fix - Final

## Changes Summary (Diff-Style)

### File: `apps/order-service/src/controllers/order.controller.ts`

```diff
Function: handleQPayWebhook (lines 890-1190)

Lines 904-914: ✅ UNCHANGED
  - Normalize invoiceId from req.body.invoiceId (NOT payload)
  - Normalize status from req.body.status
  - Validate both are present

Lines 916-950: ✅ RESTRUCTURED & CLEANED
  BEFORE (was scattered with diagnostics):
    - Multiple diagnostic logs (removed)
    - Idempotency check mixed with diagnostics
  
  AFTER (clean and clear):
    ============================================================================
    IDEMPOTENCY CHECK - MUST HAPPEN BEFORE ANY SESSION/REDIS CHECKS
    ============================================================================
    - Single clear log: "[QPay Webhook] Checking idempotency"
    - Prisma lookup: findUnique({ where: { invoiceId } })
    - If found: Return DUPLICATE immediately (NO Redis checks)
    - Clean log: "✅ [QPay Webhook] DUPLICATE detected"

Lines 952-985: ✅ RESTRUCTURED
  BEFORE:
    - Session extraction mixed with idempotency logic
  
  AFTER:
    ============================================================================
    SESSION VALIDATION - Only reached if NOT duplicate
    ============================================================================
    - Extract sessionId from payload (only for NEW invoices)
    - Check Redis session (only for NEW invoices)
    - Return SESSION_MISSING with "(NEW invoice)" clarification

Lines 990-1030: ✅ UNCHANGED (race condition handling)
  - Create QPayProcessedInvoice record before orders
  - Catch duplicate key error (P2002/11000)
  - Return DUPLICATE (consistent with main check)
```

## Execution Order (Verified):

```
1. ✅ Validate x-internal-request header
2. ✅ Normalize invoiceId from req.body.invoiceId
3. ✅ Normalize status from req.body.status
4. ✅ Validate invoiceId and status required
   ↓
5. ✅ ═══════════════════════════════════════════════
   ✅ IDEMPOTENCY CHECK (Prisma)
   ✅ ═══════════════════════════════════════════════
   ✅ prisma.qPayProcessedInvoice.findUnique({ where: { invoiceId } })
   ✅ If found → Return DUPLICATE (200) immediately
   ✅ NO Redis checks, NO session extraction
   ↓
6. ✅ ═══════════════════════════════════════════════
   ✅ SESSION VALIDATION (Only if NOT duplicate)
   ✅ ═══════════════════════════════════════════════
   ✅ Extract sessionId from payload
   ✅ Check Redis: redis.get(payment-session:${sessionId})
   ✅ If missing → Return SESSION_MISSING (200)
   ↓
7. ✅ Process payment (create orders)
8. ✅ Create/update QPayProcessedInvoice with orderIds
```

## Key Guarantees:

✅ **No path returns SESSION_MISSING for duplicate invoiceId**
  - All SESSION_MISSING returns are AFTER idempotency check
  - Logs clarify "(NEW invoice)" for SESSION_MISSING

✅ **Idempotency check uses correct invoiceId**
  - From req.body.invoiceId (top-level)
  - NOT from payload.invoiceId
  - Normalized with String().trim()

✅ **Race condition handling**
  - Create lock record before orders
  - Catch duplicate key error
  - Return DUPLICATE consistently

## Test Commands

### Setup:

```bash
cd /Users/user/Desktop/Final\ Project/eshop

# Kill and restart order-service
pkill -f "order-service" || true
pnpm exec nx run order-service:serve:development
```

### Test 1: First Webhook Call (Creates Order)

```bash
# Generate unique IDs
INVOICE_ID="test_$(date +%s)"
SESSION_ID="sess_$(date +%s)"

echo "═══════════════════════════════════════════════"
echo "TEST 1: First webhook call (should create order)"
echo "═══════════════════════════════════════════════"
echo "Invoice ID: $INVOICE_ID"
echo "Session ID: $SESSION_ID"
echo ""

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
echo "Expected logs:"
echo "  [QPay Webhook] Checking idempotency { invoiceId: '$INVOICE_ID' }"
echo "  [QPay Webhook] No duplicate found, proceeding with new invoice"
echo ""
echo "Expected response:"
echo "  { processed: true, invoiceId: '$INVOICE_ID', orderIds: [...] }"
echo ""
```

---

### Test 2: Second Webhook Call (MUST Return DUPLICATE)

```bash
echo "═══════════════════════════════════════════════"
echo "TEST 2: Second call with SAME invoiceId"
echo "═══════════════════════════════════════════════"
echo "Invoice ID: $INVOICE_ID (SAME as Test 1)"
echo ""

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
echo "Expected logs:"
echo "  [QPay Webhook] Checking idempotency { invoiceId: '$INVOICE_ID' }"
echo "  ✅ [QPay Webhook] DUPLICATE detected { invoiceId: '$INVOICE_ID', orderIds: [...] }"
echo ""
echo "Expected response:"
echo "  { processed: false, reason: 'DUPLICATE', orderIds: [...] }"
echo ""
echo "✅ PASS: Returns DUPLICATE"
echo "❌ FAIL: Returns SESSION_MISSING"
echo ""
```

---

### Test 3: Duplicate After Redis Session Deleted (Critical Test)

```bash
echo "═══════════════════════════════════════════════"
echo "TEST 3: Duplicate after Redis session expired"
echo "═══════════════════════════════════════════════"
echo "Deleting Redis session key..."
redis-cli DEL "payment-session:$SESSION_ID"
echo "Redis session deleted: payment-session:$SESSION_ID"
echo ""

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
echo "Expected logs:"
echo "  [QPay Webhook] Checking idempotency { invoiceId: '$INVOICE_ID' }"
echo "  ✅ [QPay Webhook] DUPLICATE detected"
echo ""
echo "Expected response:"
echo "  { processed: false, reason: 'DUPLICATE', orderIds: [...] }"
echo ""
echo "🎯 CRITICAL: MUST return DUPLICATE, NOT SESSION_MISSING"
echo "   (Proves idempotency check happens BEFORE Redis check)"
echo ""
```

---

### Test 4: With Your Problematic invoiceId

```bash
echo "═══════════════════════════════════════════════"
echo "TEST 4: Test with existing problematic invoiceId"
echo "═══════════════════════════════════════════════"

curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "invoiceId": "inv_idem_fix_1767682971",
    "status": "paid",
    "payload": {
      "sender_invoice_no": "sess_idem_fix_1767682971",
      "payment_status": "PAID"
    }
  }' | jq .

echo ""
echo "If this record exists in DB, should return:"
echo "  { reason: 'DUPLICATE', orderIds: [...] }"
echo ""
```

## Automated Test Script

```bash
#!/bin/bash
# test-idempotency.sh

set -e

INVOICE_ID="test_$(date +%s)"
SESSION_ID="sess_$(date +%s)"

echo "Testing QPay Webhook Idempotency"
echo "================================="
echo "Invoice ID: $INVOICE_ID"
echo "Session ID: $SESSION_ID"
echo ""

# Test 1
echo "Test 1: First call..."
RESP1=$(curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{\"invoiceId\":\"$INVOICE_ID\",\"status\":\"paid\",\"payload\":{\"sender_invoice_no\":\"$SESSION_ID\",\"payment_status\":\"PAID\"}}")
PROCESSED1=$(echo "$RESP1" | jq -r '.processed')
echo "Result: processed=$PROCESSED1"
echo ""

# Test 2
sleep 1
echo "Test 2: Second call (duplicate)..."
RESP2=$(curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{\"invoiceId\":\"$INVOICE_ID\",\"status\":\"paid\",\"payload\":{\"sender_invoice_no\":\"$SESSION_ID\",\"payment_status\":\"PAID\"}}")
REASON2=$(echo "$RESP2" | jq -r '.reason')
echo "Result: reason=$REASON2"

if [ "$REASON2" == "DUPLICATE" ]; then
  echo "✅ PASS: Returned DUPLICATE"
else
  echo "❌ FAIL: Returned $REASON2 (expected DUPLICATE)"
fi
echo ""

# Test 3
echo "Test 3: After Redis deletion..."
redis-cli DEL "payment-session:$SESSION_ID" > /dev/null
RESP3=$(curl -s -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d "{\"invoiceId\":\"$INVOICE_ID\",\"status\":\"paid\",\"payload\":{\"sender_invoice_no\":\"$SESSION_ID\",\"payment_status\":\"PAID\"}}")
REASON3=$(echo "$RESP3" | jq -r '.reason')
echo "Result: reason=$REASON3"

if [ "$REASON3" == "DUPLICATE" ]; then
  echo "✅ PASS: Still returned DUPLICATE (idempotency works!)"
else
  echo "❌ FAIL: Returned $REASON3 (should be DUPLICATE even without Redis)"
fi
```

Save as `test-idempotency.sh`, make executable, and run:

```bash
chmod +x test-idempotency.sh
./test-idempotency.sh
```

## Expected Behavior:

| Scenario | Expected Response | Expected Logs |
|----------|------------------|---------------|
| 1st call (new) | `processed: true` | "No duplicate found, proceeding" |
| 2nd call (dup) | `reason: "DUPLICATE"` | "✅ DUPLICATE detected" |
| 2nd call (no Redis) | `reason: "DUPLICATE"` | "✅ DUPLICATE detected" |

## Success Criteria:

✅ **Never** see `SESSION_MISSING` for duplicate invoiceId
✅ **Always** see `DUPLICATE` when QPayProcessedInvoice record exists
✅ Idempotency works **independent** of Redis session state
✅ Logs clearly show "(NEW invoice)" for genuine SESSION_MISSING cases

