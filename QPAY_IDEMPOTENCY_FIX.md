# QPay Webhook Idempotency Fix

## Changes Made

### File: `apps/order-service/src/controllers/order.controller.ts`

#### Summary of Changes:

1. **Added Raw Request Body Diagnostics (Lines 904-912)**
   - Logs all keys in request body
   - Shows raw invoiceId and status before normalization
   - Helps identify if data is in wrong location

2. **Added Normalized Inputs Log (Lines 919-923)**
   - Shows invoiceId, status, and payload after normalization
   - Confirms String().trim() worked correctly

3. **Enhanced IDEM Lookup Log (Lines 934-939)**
   - Shows invoiceId length and type
   - Shows exact Prisma query being executed
   - Helps identify whitespace or type issues

4. **Added Collection Diagnostics (Lines 945-950)**
   - Counts total records in QPayProcessedInvoice collection
   - Lists sample invoiceIds from collection
   - Verifies Prisma can access the collection

5. **Enhanced IDEM Result Log (Lines 952-961)**
   - Shows if record was found
   - Shows all fields from found record
   - Shows total records and sample invoiceIds for comparison

## Strict Execution Order (Verified):

```
1. ✅ Validate x-internal-request header (line 897)
2. ✅ Log raw request body structure (lines 904-912)
3. ✅ Normalize invoiceId from req.body.invoiceId (line 915)
4. ✅ Normalize status from req.body.status (line 916)
5. ✅ Log normalized inputs (lines 919-923)
6. ✅ Validate invoiceId and status required (lines 925-930)
7. ✅ IDEMPOTENCY CHECK (Prisma lookup) (lines 932-943)
   - BEFORE any Redis checks
   - BEFORE sessionId extraction
8. ✅ Count and sample records (diagnostics) (lines 945-950)
9. ✅ Log IDEM result (lines 952-961)
10. ✅ If found → Return DUPLICATE (lines 963-987)
11. ✅ Extract sessionId from payload (line 990)
12. ✅ Check Redis session (lines 1002-1019)
    - Only reached if NOT duplicate
13. ✅ Process payment (lines 1024+)
```

## Test Commands

### Prerequisites:

```bash
cd /Users/user/Desktop/Final\ Project/eshop

# Ensure order-service is running
pnpm exec nx run order-service:serve:development
```

### Test 1: First Webhook Call (Create Order)

```bash
INVOICE_ID="inv_idem_test_$(date +%s)"
SESSION_ID="sess_idem_test_$(date +%s)"

echo "Testing with:"
echo "  Invoice ID: $INVOICE_ID"
echo "  Session ID: $SESSION_ID"
echo ""

# First call - should create order
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

echo ""
echo "Check logs for:"
echo "  - [QPay Webhook] Raw request body keys"
echo "  - [QPay Webhook] Normalized inputs"
echo "  - [QPay Webhook] IDEM lookup"
echo "  - [QPay Webhook] IDEM result { found: false }"
echo ""
```

**Expected Response (if session exists in Redis):**
```json
{
  "success": true,
  "processed": true,
  "invoiceId": "inv_idem_test_...",
  "sessionId": "sess_idem_test_...",
  "orderIds": ["<order-id>"]
}
```

**Expected Logs:**
```
[QPay Webhook] Raw request body keys { keys: ['invoiceId', 'status', 'payload'], ... }
[QPay Webhook] Normalized inputs { invoiceId: 'inv_idem_test_...', status: 'paid', hasPayload: true }
[QPay Webhook] IDEM lookup { invoiceId: 'inv_idem_test_...', len: 28, type: 'string', ... }
[QPay Webhook] IDEM result { found: false, totalRecordsInCollection: N, ... }
[QPay Webhook] IDEM lookup: no duplicate, proceeding
```

---

### Test 2: Second Webhook Call (Should Return DUPLICATE)

```bash
# Use the SAME invoiceId from Test 1
# Replace with your actual invoice ID from above

INVOICE_ID="inv_idem_test_1234567890"  # Replace with actual value
SESSION_ID="sess_idem_test_1234567890"  # Replace with actual value

echo "Testing duplicate with:"
echo "  Invoice ID: $INVOICE_ID"
echo "  Session ID: $SESSION_ID"
echo ""

# Second call - should return DUPLICATE
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

echo ""
echo "✅ EXPECTED: reason: 'DUPLICATE'"
echo "❌ FAILURE: reason: 'SESSION_MISSING'"
echo ""
echo "Check logs for:"
echo "  - [QPay Webhook] IDEM result { found: true, ... }"
echo "  - ✅ [QPay Webhook] IDEM DUPLICATE"
echo ""
```

**Expected Response:**
```json
{
  "success": true,
  "processed": false,
  "reason": "DUPLICATE",
  "invoiceId": "inv_idem_test_...",
  "sessionId": "sess_idem_test_...",
  "orderIds": ["<order-id>"],
  "processedAt": "2026-01-06T..."
}
```

**Expected Logs:**
```
[QPay Webhook] Raw request body keys { keys: ['invoiceId', 'status', 'payload'], ... }
[QPay Webhook] Normalized inputs { invoiceId: 'inv_idem_test_...', status: 'paid', hasPayload: true }
[QPay Webhook] IDEM lookup { invoiceId: 'inv_idem_test_...', len: 28, type: 'string', ... }
[QPay Webhook] IDEM result { found: true, existingId: '...', totalRecordsInCollection: N, sampleInvoiceIds: [...] }
✅ [QPay Webhook] IDEM DUPLICATE { invoiceId: 'inv_idem_test_...', orderIdsLen: 1, ... }
```

**CRITICAL: You should NOT see:**
```
⚠️ [QPay Webhook] SESSION_MISSING (new invoice)
```

---

### Test 3: Duplicate After Redis Session Expires

```bash
# Delete the Redis session key
redis-cli DEL "payment-session:$SESSION_ID"

echo "Redis session deleted. Testing duplicate detection..."
echo ""

# Call webhook again with same invoiceId
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

echo ""
echo "✅ MUST return reason: 'DUPLICATE' (NOT 'SESSION_MISSING')"
echo ""
```

---

### Test 4: Test with Your Problematic invoiceId

```bash
# Use the exact invoiceId from your bug report
curl -X POST http://localhost:6003/api/internal/payments/qpay/webhook \
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
echo "Check the IDEM result log to see:"
echo "  - Was the record found?"
echo "  - What are the sampleInvoiceIds in the collection?"
echo "  - Does 'inv_idem_fix_1767682971' appear in sampleInvoiceIds?"
echo ""
```

## Diagnostic Interpretation

### If `found: false` but record exists in MongoDB:

1. **Check `sampleInvoiceIds` in logs**
   - If your invoiceId is in the list → case sensitivity issue
   - If list is empty → collection name mismatch
   - If list has different invoiceIds → wrong database

2. **Check `totalRecordsInCollection`**
   - If 0 → Prisma not connected to correct collection
   - If > 0 → Connection works, lookup logic issue

3. **Check `len` and `type` in IDEM lookup**
   - Should be `type: 'string'`
   - Check for unexpected length (whitespace)

4. **Check raw vs normalized inputs**
   - `invoiceIdRaw` should match what you sent
   - `invoiceId` (normalized) should be trimmed

### If you see SESSION_MISSING instead of DUPLICATE:

This means `existing` is null/undefined. The diagnostic logs will show:
- `found: false`
- `sampleInvoiceIds: [...]` - compare your invoiceId with these
- `totalRecordsInCollection: N` - verifies collection access

## Diff Summary

### Lines Changed:

- **Lines 904-912**: Added raw request body diagnostics
- **Lines 915-917**: No change (kept normalization)
- **Lines 919-923**: Added normalized inputs log
- **Lines 934-939**: Enhanced IDEM lookup log (added len, type, query)
- **Lines 945-950**: Added collection count and sample query
- **Lines 952-961**: Enhanced IDEM result log (added diagnostics)
- **Lines 963-987**: No change (DUPLICATE return logic)

### Total New Lines: ~20 diagnostic log lines

### Logic Order: UNCHANGED (already correct)

The idempotency check was already in the correct position (before Redis check).
The new diagnostics will help identify WHY the Prisma lookup is not finding the record.

## Clean Up After Debugging

Once the issue is identified and fixed, you can remove the verbose diagnostic logs:
- Lines 904-912 (raw body keys log)
- Lines 919-923 (normalized inputs log)  
- Lines 945-950 (count and sample query)
- Parts of lines 952-961 (keep basic log, remove diagnostics)

Keep the essential logs:
- `[QPay Webhook] IDEM lookup` with invoiceId
- `[QPay Webhook] IDEM result` with found status
- `✅ [QPay Webhook] IDEM DUPLICATE`

