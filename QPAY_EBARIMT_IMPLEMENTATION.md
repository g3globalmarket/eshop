# QPay Ebarimt 3.0 Implementation

## Overview

This document describes the implementation of QPay Ebarimt (Mongolian e-receipt) integration as an **optional, non-blocking post-payment action**.

### Key Principles

1. **Never blocks order creation** - Ebarimt creation happens AFTER orders are created
2. **Best-effort** - Failures are logged and stored, but never cause transaction failures
3. **Retryable** - Failed Ebarimt creation is automatically retried in reconciliation loop
4. **Auditable** - All attempts, successes, and failures are stored in database

## Architecture

### Flow Diagram

```
Payment Webhook/Reconciliation
    ↓
Verify Payment (QPay /v2/payment/check)
    ↓
Extract & Store payment_id ← Required for Ebarimt
    ↓
Create Orders (idempotent)
    ↓
Mark Session as PROCESSED
    ↓
Create Ebarimt (best-effort) ← NEVER throws
    ↓
Store Result (success or error)
```

## Database Schema

### QPayPaymentSession Model (Extended)

```prisma
model QPayPaymentSession {
  // ... existing fields ...
  
  // Ebarimt fields
  paymentId           String?   @unique // QPay payment_id from /v2/payment/check
  ebarimtStatus       String?   // REGISTERED | ERROR | SKIPPED
  ebarimtReceiptId    String?   // ebarimt_receipt_id from QPay
  ebarimtQrData       String?   // ebarimt_qr_data (QR code for receipt)
  ebarimtRaw          Json?     // Full response from QPay
  ebarimtLastError    String?   // Last error message
  ebarimtCreatedAt    DateTime? // When Ebarimt was created
  
  // ... indexes ...
  @@index([ebarimtStatus])
}
```

## Implementation Details

### 1. QPay Client (`qpay.client.ts`)

Added `createEbarimtV3()` method:

```typescript
async createEbarimtV3(input: QPayEbarimtV3Request): Promise<{
  success: boolean;
  data?: QPayEbarimtV3Response;
  error?: string;
}>
```

**Key Features:**
- Uses Bearer token (same as invoice/payment APIs)
- Returns success/error without throwing
- Logs all attempts (success and failure)
- Optional `ebarimt_receiver` field (PII - not logged)

**Request Body:**
```json
{
  "payment_id": "PAYMENT_12345",
  "ebarimt_receiver_type": "CITIZEN",
  "ebarimt_receiver": "88614450",  // Optional
  "district_code": "3505",
  "classification_code": "0000010"
}
```

**Response:**
```json
{
  "ebarimt_receipt_id": "EBARIMT_12345",
  "ebarimt_qr_data": "data:image/png;base64,...",
  "barimt_status": "REGISTERED",
  "status": "success"
}
```

### 2. Webhook Handler (`order.controller.ts`)

**Changes:**
- Extract `payment_id` from verified PAID payment row
- Store in `QPayPaymentSession.paymentId` when marking as PAID
- No Ebarimt creation in webhook (handled by reconciliation)

```typescript
// Extract payment_id
const paidRow = paymentCheckResult.rows?.find(r => r.payment_status === "PAID");
const paymentId = paidRow?.payment_id ?? null;

// Store payment_id
await prisma.qPayPaymentSession.updateMany({
  where: { sessionId },
  data: {
    status: "PAID",
    paymentId: paymentId ?? undefined,
  },
});
```

### 3. Reconciliation Service (`qpay-reconcile.service.ts`)

**New Function: `createEbarimtForSession()`**

Called after order creation is complete:

```typescript
// After orders created and status = PROCESSED
if (paymentId) {
  await createEbarimtForSession(sessionId, paymentId, session.payload);
}
```

**Logic:**
1. Check if enabled (`QPAY_EBARIMT_ENABLED`)
2. Check if already created (skip if exists)
3. Extract config from session payload or use defaults
4. Call QPay API
5. Store result (success or error)
6. **Never throw** - always catch and log errors

**Config Priority:**
1. Session payload: `sessionData.ebarimt.receiverType`
2. Environment variables: `QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE`
3. Hard-coded default: `"CITIZEN"`

## Configuration

### Environment Variables

See `QPAY_EBARIMT_ENV_VARS.md` for full details.

**Minimum Configuration:**
```bash
QPAY_EBARIMT_ENABLED=true
```

**Full Configuration:**
```bash
QPAY_EBARIMT_ENABLED=true
QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE=CITIZEN
QPAY_EBARIMT_DEFAULT_DISTRICT_CODE=3505
QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE=0000010
```

### Per-Session Configuration

Override defaults by including `ebarimt` in payment session payload:

```javascript
const sessionData = {
  userId: "...",
  cart: [...],
  sellers: [...],
  totalAmount: 10000,
  ebarimt: {
    receiverType: "BUSINESS",
    receiver: "1234567890",
    districtCode: "3506",
    classificationCode: "0000020"
  }
};
```

## Testing

### Manual Test Flow

1. **Start services with Ebarimt enabled:**
```bash
export QPAY_EBARIMT_ENABLED=true
pnpm exec nx run order-service:serve:development
```

2. **Create a payment session:**
```bash
curl -X POST http://localhost:6003/api/internal/payments/qpay/seed-session \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionData": {
      "userId": "507f1f77bcf86cd799439011",
      "cart": [...],
      "sellers": [...],
      "totalAmount": 10000
    }
  }'
```

3. **Simulate payment (or use real QPay):**
   - Get invoiceId from response
   - Pay via QPay (sandbox or production)
   - QPay calls webhook

4. **Check reconciliation logs:**
```
[QPay Reconcile] Processing session
[QPay Reconcile] Payment check result
[QPay Reconcile] Order created successfully
[QPay Ebarimt] Creating receipt
✅ [QPay Ebarimt] Receipt created successfully
```

5. **Verify in database:**
```javascript
const session = await prisma.qPayPaymentSession.findUnique({
  where: { sessionId: "..." }
});

console.log({
  status: session.status,              // PROCESSED
  paymentId: session.paymentId,        // PAYMENT_12345
  ebarimtStatus: session.ebarimtStatus, // REGISTERED
  ebarimtReceiptId: session.ebarimtReceiptId,
  hasQrData: !!session.ebarimtQrData,
});
```

### Test Script

See `test-qpay-ebarimt.sh` for automated testing.

## Error Handling

### Types of Errors

1. **Ebarimt Disabled**
   - Status: `SKIPPED`
   - No error logged
   - Orders still created

2. **Missing payment_id**
   - Warning logged
   - No Ebarimt created
   - Orders still created

3. **QPay API Error**
   - Status: `ERROR`
   - Error stored in `ebarimtLastError`
   - Will retry on next reconciliation cycle
   - Orders still created

4. **Unexpected Error**
   - Status: `ERROR`
   - Error stored in `ebarimtLastError`
   - Logged with stack trace
   - Orders still created

### Retry Logic

Failed Ebarimt creation is automatically retried:

1. Reconciliation loop runs every 60 seconds
2. Checks sessions with `status = PROCESSED`
3. If `ebarimtReceiptId` is null and `paymentId` exists:
   - Retry Ebarimt creation
   - Update status based on result

### Monitoring

**Key Log Markers:**
- `[QPay Ebarimt] Creating receipt` - Attempt started
- `✅ [QPay Ebarimt] Receipt created successfully` - Success
- `❌ [QPay Ebarimt] Creation failed` - Failed (with error)
- `[QPay Ebarimt] Skipped (disabled)` - Feature disabled
- `[QPay Ebarimt] Already created` - Skip (idempotent)

**Database Queries:**

```sql
-- Count Ebarimt by status
db.QPayPaymentSession.aggregate([
  { $group: { _id: "$ebarimtStatus", count: { $sum: 1 } } }
])

-- Find failed Ebarimt attempts
db.QPayPaymentSession.find({
  ebarimtStatus: "ERROR",
  ebarimtLastError: { $exists: true }
})

-- Find sessions missing Ebarimt (but have paymentId)
db.QPayPaymentSession.find({
  status: "PROCESSED",
  paymentId: { $ne: null },
  ebarimtReceiptId: null
})
```

## Security & Privacy

### PII Protection

- **DO NOT log** `ebarimt_receiver` field (contains citizen ID or business registration number)
- Mask or redact in logs: `hasReceiver: !!receiver`
- Store only in database (never in application logs)

### Access Control

- Ebarimt receipt data stored in `QPayPaymentSession`
- Access controlled by session ownership (userId)
- QR data can be exposed to session owner via status endpoint

## API Integration

### QPay Ebarimt V3 Endpoint

- **URL**: `POST https://merchant.qpay.mn/v2/ebarimt_v3/create`
- **Auth**: Bearer token (from `/v2/auth/token`)
- **Docs**: QPay V2 API documentation

### Error Responses

**Common Errors:**
- `400 Bad Request` - Invalid parameters (district code, classification code)
- `401 Unauthorized` - Invalid or expired Bearer token
- `404 Not Found` - payment_id not found
- `500 Internal Server Error` - QPay service error

**Handling:**
- All errors are caught and stored in `ebarimtLastError`
- Retry on next reconciliation cycle
- Orders are never affected

## Future Enhancements

### Optional: Webhook Handler Integration

Could add Ebarimt creation to webhook handler (after order creation):

```typescript
// In handleQPayWebhook, after order creation:
if (paymentId && QPAY_EBARIMT_ENABLED) {
  // Non-blocking
  createEbarimtForSession(sessionId, paymentId, session).catch(err => {
    console.warn("[QPay Webhook] Ebarimt creation failed (will retry)", err);
  });
}
```

**Pros:** Faster (immediate)  
**Cons:** Webhook must wait for Ebarimt API call  
**Current approach:** Let reconciliation handle it (more robust)

### Optional: Manual Retry Endpoint

Add internal endpoint to manually retry failed Ebarimt:

```typescript
POST /api/internal/payments/qpay/ebarimt/retry/:sessionId
```

### Optional: Expose Receipt to Frontend

Add Ebarimt data to status endpoint response:

```typescript
{
  status: "PROCESSED",
  orderIds: [...],
  ebarimt: {
    receiptId: "EBARIMT_12345",
    qrData: "data:image/png;base64,...",
    createdAt: "2026-01-07T..."
  }
}
```

## Rollback Plan

To disable Ebarimt without code changes:

```bash
# Set in environment or .env
QPAY_EBARIMT_ENABLED=false
```

All sessions will be marked as `ebarimtStatus: "SKIPPED"`.

## Summary

✅ **Implemented:**
- Prisma schema with Ebarimt fields
- QPay client `createEbarimtV3()` method
- Webhook captures `payment_id`
- Reconciliation creates Ebarimt (best-effort)
- Environment variable configuration
- Per-session config overrides
- Error handling and retry logic
- Comprehensive logging

✅ **Guarantees:**
- Order creation NEVER blocked by Ebarimt
- All errors caught and stored
- Automatic retry via reconciliation
- PII protection (no logging of receiver)
- Fully auditable (DB + logs)

🎯 **Production Ready:**
- Enable with `QPAY_EBARIMT_ENABLED=true`
- Monitor logs for `[QPay Ebarimt]`
- Check DB `ebarimtStatus` field
- Failed attempts auto-retry every 60s

