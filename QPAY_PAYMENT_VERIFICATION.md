# QPay Payment Verification Implementation

## Overview

This implementation follows QPay's best practices by **always verifying payments via the API** before processing orders. The webhook payload is never trusted as the source of truth.

## Flow Diagram

```
Webhook Received
    ↓
1. Idempotency Check (QPayProcessedInvoice)
    ↓ (if not duplicate)
2. Extract sessionId from query params (?sessionId=...)
    ↓
3. Load payment-session from Redis
    ↓
4. Get stored qpayInvoiceId from session
    ↓
5. Call QPay API: POST /v2/payment/check ✅ SOURCE OF TRUTH
    ↓
6. Verify: payment_status === "PAID" AND amount matches
    ↓
7. Create orders + QPayProcessedInvoice record
    ↓
8. Return 200 OK
```

## Key Components

### 1. QPay Client: `paymentCheckInvoice()`

**File**: `apps/order-service/src/payments/qpay.client.ts`

```typescript
async paymentCheckInvoice(invoiceId: string): Promise<QPayPaymentCheckResponse>
```

**Request**:
- URL: `POST /v2/payment/check`
- Auth: `Bearer <access_token>`
- Body:
  ```json
  {
    "object_type": "INVOICE",
    "object_id": "<invoice_id>",
    "offset": { "page_number": 1, "page_limit": 100 }
  }
  ```

**Response**:
```typescript
{
  count: number;
  paid_amount: number;
  rows: Array<{
    payment_id: string;
    payment_status: string; // "NEW" | "PAID" | "FAILED" | "PARTIAL" | "REFUNDED"
    payment_amount: number;
    ...
  }>;
}
```

**Payment Status Values**:
- `NEW`: Payment initiated but not completed
- `PAID`: ✅ Payment successful (only this triggers order creation)
- `FAILED`: Payment failed
- `PARTIAL`: Partial payment received
- `REFUNDED`: Payment was refunded

### 2. Webhook Handler: `handleQPayWebhook()`

**File**: `apps/order-service/src/controllers/order.controller.ts`

**Endpoint**: `POST /api/internal/payments/qpay/webhook?sessionId=<sessionId>`

**Security**:
- Requires header: `x-internal-request: "true"`
- Called only by API Gateway after HMAC signature verification

**Process Flow**:

#### Step 1: Idempotency Check (First Line of Defense)
```typescript
const existing = await prisma.qPayProcessedInvoice.findUnique({ where: { invoiceId } });
if (existing) {
  return { success: true, processed: false, reason: "DUPLICATE", orderIds: existing.orderIds };
}
```

**Why first?** Because Redis sessions may expire/be deleted after processing, but the database record persists forever.

#### Step 2: Extract Session ID
```typescript
const sessionId = req.query.sessionId ?? payload?.sender_invoice_no ?? payload?.sessionId;
```

**Priority**:
1. Query param `?sessionId=...` (set in callback URL during invoice creation)
2. Fallback to payload fields (backup)

#### Step 3: Load Session from Redis
```typescript
const sessionData = await redis.get(`payment-session:${sessionId}`);
const session = JSON.parse(sessionData);
const storedInvoiceId = session.qpayInvoiceId;
```

**Session contains**:
- `userId`, `cart`, `sellers`, `totalAmount`
- `qpayInvoiceId` ← Stored during `seed-session`
- `qpayQrText`, `qpayQrImage`, `qpayShortUrl`, `qpayDeeplinks`

#### Step 4: Verify Invoice ID Match
```typescript
if (invoiceId !== storedInvoiceId) {
  return { reason: "INVOICE_ID_MISMATCH" };
}
```

#### Step 5: Call QPay Payment Check API ✅
```typescript
const qpayClient = getQPayClient();
const paymentCheckResult = await qpayClient.paymentCheckInvoice(invoiceId);
```

**This is the source of truth** - webhook payload is NOT trusted.

#### Step 6: Verify Payment Status and Amount
```typescript
const isPaid = paymentCheckResult.rows?.some(r => r.payment_status === "PAID");
const paidAmount = Number(paymentCheckResult.paid_amount ?? 0);

const expectedAmountUsd = Number(session.totalAmount ?? 0);
const usdToMntRate = parseFloat(process.env.QPAY_USD_TO_MNT_RATE || "3400");
const expectedAmountMnt = Math.round(expectedAmountUsd * usdToMntRate);

const amountOk = Math.abs(paidAmount - expectedAmountMnt) < 1;

if (!isPaid || !amountOk) {
  return {
    reason: !isPaid ? "NOT_PAID" : "AMOUNT_MISMATCH",
    isPaid,
    paidAmount,
    expectedAmountMnt
  };
}
```

**Amount verification**:
- Tolerance: `< 1 MNT` (allows for rounding differences)
- Uses `QPAY_USD_TO_MNT_RATE` env var (default: 3400)

#### Step 7: Create Orders (Race-Safe)
```typescript
// Create idempotency record FIRST (acts as distributed lock)
const processedRecord = await prisma.qPayProcessedInvoice.create({
  data: { invoiceId, sessionId, status: "PAID", orderIds: [] }
});

// Then create orders
const createdOrderIds = await createOrdersFromSession(...);

// Update record with order IDs
await prisma.qPayProcessedInvoice.update({
  where: { id: processedRecord.id },
  data: { orderIds: createdOrderIds }
});
```

**Race condition handling**: If another webhook creates the record first, catch the unique constraint error and return `DUPLICATE`.

## Response Codes

All webhook responses return **200 OK** (to acknowledge receipt to QPay).

**Success responses**:

1. **DUPLICATE** (idempotency - already processed):
```json
{
  "success": true,
  "processed": false,
  "reason": "DUPLICATE",
  "invoiceId": "...",
  "sessionId": "...",
  "orderIds": ["..."],
  "processedAt": "2024-01-07T..."
}
```

2. **NOT_PAID** or **AMOUNT_MISMATCH** (payment not confirmed):
```json
{
  "success": true,
  "processed": false,
  "reason": "NOT_PAID", // or "AMOUNT_MISMATCH"
  "isPaid": false,
  "paidAmount": 0,
  "expectedAmountMnt": 340000,
  "invoiceId": "...",
  "sessionId": "..."
}
```

3. **PROCESSED** (order created successfully):
```json
{
  "success": true,
  "processed": true,
  "invoiceId": "...",
  "sessionId": "...",
  "orderIds": ["67879d7c5286a9ddad7c857b"],
  "paidAmount": 340000
}
```

**Error responses** (still 200 OK):
- `NO_SESSION_ID`: Missing sessionId in query/payload
- `SESSION_MISSING`: Redis session expired/not found
- `NO_INVOICE_ID_IN_SESSION`: Session doesn't have qpayInvoiceId
- `INVOICE_ID_MISMATCH`: Webhook invoiceId ≠ stored invoiceId
- `PAYMENT_CHECK_API_FAILED`: QPay API call failed

## Environment Variables

```bash
# QPay Configuration
QPAY_BASE_URL=https://merchant.qpay.mn
QPAY_CLIENT_ID=your_client_id
QPAY_CLIENT_SECRET=your_client_secret
QPAY_INVOICE_CODE=YOUR_INVOICE_CODE
QPAY_USD_TO_MNT_RATE=3400
QPAY_CALLBACK_URL_BASE=https://your-domain.com

# Redis
REDIS_DATABASE_URI=redis://localhost:6379

# Debug (optional)
INTERNAL_WEBHOOK_DEBUG=true
```

## Testing

### 1. Seed a Payment Session
```bash
curl -X POST http://localhost:8080/order/api/internal/payments/qpay/seed-session \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionData": {
      "userId": "user123",
      "cart": [
        {
          "productId": "677e7b5c8f9a1b2c3d4e5f6a",
          "quantity": 1,
          "sale_price": 100,
          "shopId": "shop123"
        }
      ],
      "sellers": ["shop123"],
      "totalAmount": 100
    },
    "ttlSec": 600
  }'
```

**Response**:
```json
{
  "success": true,
  "sessionId": "abc-123-def",
  "ttlSec": 600,
  "invoiceId": "INV_123",
  "qrText": "...",
  "qrImage": "data:image/png;base64,...",
  "shortUrl": "https://...",
  "deeplinks": [...]
}
```

### 2. Simulate Webhook (Manual Test)

**First call** (should create order):
```bash
curl -X POST "http://localhost:8080/order/api/internal/payments/qpay/webhook?sessionId=abc-123-def" \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "invoiceId": "INV_123",
    "status": "paid",
    "payload": {}
  }'
```

**Expected**: `{ "success": true, "processed": true, "orderIds": [...] }`

**Second call** (should return DUPLICATE):
```bash
# Same command as above
```

**Expected**: `{ "success": true, "processed": false, "reason": "DUPLICATE", "orderIds": [...] }`

### 3. Verify Database

```bash
# Check QPayProcessedInvoice record
npx ts-node -e "
import prisma from './packages/libs/prisma';
prisma.qPayProcessedInvoice.findUnique({ where: { invoiceId: 'INV_123' } })
  .then(console.log)
  .then(() => process.exit(0));
"
```

## Security Considerations

1. **Never trust webhook payload**:
   - Payload can be replayed, modified, or spoofed
   - Always call `/v2/payment/check` API to verify

2. **Idempotency is critical**:
   - Check `QPayProcessedInvoice` BEFORE checking Redis session
   - Prevents duplicate orders if webhook is retried after session expires

3. **Amount verification**:
   - Always compare `paid_amount` from API with expected amount
   - Use tolerance for rounding differences

4. **HMAC signature verification**:
   - Done in API Gateway before forwarding to order-service
   - Uses `QPAY_WEBHOOK_SECRET`

5. **Internal-only endpoint**:
   - Requires `x-internal-request: "true"` header
   - Only API Gateway can call this endpoint

## Troubleshooting

### Webhook returns "NOT_PAID" but customer says they paid

1. Check QPay merchant dashboard to confirm payment status
2. Run manual payment check:
   ```bash
   curl -X POST http://localhost:6003/api/internal/payments/qpay/webhook?sessionId=<sessionId> \
     -H "x-internal-request: true" \
     -H "Content-Type: application/json" \
     -d '{"invoiceId":"<invoiceId>","status":"paid","payload":{}}'
   ```
3. Enable debug mode: `INTERNAL_WEBHOOK_DEBUG=true`
4. Check logs for payment check API response

### "AMOUNT_MISMATCH" error

1. Check `QPAY_USD_TO_MNT_RATE` environment variable
2. Verify `totalAmount` in Redis session matches the expected value
3. Check QPay invoice amount vs. paid amount in logs

### "SESSION_MISSING" on first webhook

- Payment session expired before webhook was received
- Check Redis TTL (default: 600 seconds = 10 minutes)
- Consider increasing TTL for slower payment methods

### "DUPLICATE" but no orders created

- Check `orderIds` in the response
- If `orderIds: []`, the previous webhook failed during order creation
- Check logs for errors during `createOrdersFromSession()`

## References

- [QPay V2 API Documentation](https://developer.qpay.mn/)
- [QPay Payment Check Endpoint](https://developer.qpay.mn/v2/payment/check)
- [Redis Token Caching](./QPAY_V2_TOKEN_IMPLEMENTATION.md)
- [Invoice Creation](./QPAY_INVOICE_CREATION_IMPLEMENTATION.md)

