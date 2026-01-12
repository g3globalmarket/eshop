# QPay Integration - Quick Reference Card

## 🎯 Key Concepts

1. **NEVER trust webhook payload as source of truth.**  
   **ALWAYS verify payment via QPay API before creating orders.**

2. **Session data stored in Redis + Database.** 🔥 **NEW**  
   **Redis expires → Webhook loads from database (100% reliable).**

## 🔄 Payment Verification Flow (One-Liner)

```
Webhook → Check Idempotency → Load Session → Call QPay API ✅ → Verify PAID + Amount → Create Orders
```

## 📝 Essential Endpoints

### Create Invoice + Session (Public) 🔥 **NEW**

```bash
POST /payments/qpay/seed-session
Headers: Authorization: Bearer <jwt_token> OR Cookie: access_token=<token>
Body: { cart, sellers, totalAmount, shippingAddressId?, coupon? }
Returns: { success, sessionId, ttlSec, invoice: { invoiceId, qrText, qrImage, shortUrl, deeplinks } }
```

**Purpose**: Frontend creates payment session (userId from JWT, not body)

### Create Invoice + Session (Internal)

```bash
POST /order/api/internal/payments/qpay/seed-session
Headers: x-internal-request: true
Body: { sessionData: { userId, cart, sellers, totalAmount } }
Returns: { success, sessionId, ttlSec, invoice: { invoiceId, qrText, qrImage, shortUrl, deeplinks } }
```

**Purpose**: Internal/admin use (userId from request body)

### Webhook (Public) 🔥 **NEW**

```bash
POST /payments/qpay/webhook?sessionId=<id>&token=<token>
Body: { invoiceId, status, payload }
Returns: { ok, processed, invoiceId, sessionId, orderIds }
```

**Purpose**: QPay calls this directly (token-based auth, no internal header required)

### Webhook (Internal)

```bash
POST /order/api/internal/payments/qpay/webhook?sessionId=<id>
Headers: x-internal-request: true
Body: { invoiceId, status, payload }
Returns: { success, processed, reason, orderIds }
```

**Purpose**: Microservice-to-microservice webhook calls

### Payment Status (Public) 🔥

```bash
GET /payments/qpay/status?sessionId=<id>
Headers: Authorization: Bearer <jwt_token> OR Cookie: access_token=<token>
Returns: { ok, status: "PENDING"|"PAID"|"PROCESSED", invoiceId, orderIds, paidAmount, expectedAmount }
```

**Purpose**: Frontend polling to show payment status (authenticated, ownership verified)

### Payment Status (Internal)

```bash
GET /order/api/internal/payments/qpay/status?sessionId=<id>&userId=<userId>
Headers: x-internal-request: true
Returns: { ok, status: "PENDING"|"PAID"|"PROCESSED", invoiceId, orderIds, paidAmount, expectedAmount }
```

**Purpose**: Microservice-to-microservice polling (does NOT create orders)

### Payment Verification (API - Source of Truth)

```typescript
// Internal call in webhook handler
const result = await qpayClient.paymentCheckInvoice(invoiceId);
// Returns: { count, paid_amount, rows: [{ payment_status, payment_amount, ... }] }
```

## 🔐 Environment Variables (Minimum Required)

```bash
QPAY_BASE_URL=https://merchant.qpay.mn
QPAY_CLIENT_ID=<your_client_id>
QPAY_CLIENT_SECRET=<your_client_secret>
QPAY_INVOICE_CODE=<your_invoice_code>
QPAY_CALLBACK_PUBLIC_BASE_URL=<your_api_gateway_domain>  # 🔥 NEW: Public webhook URL
QPAY_USD_TO_MNT_RATE=3400
REDIS_DATABASE_URI=redis://localhost:6379
```

## 📊 Response Codes (All 200 OK)

| Reason            | processed | Meaning                            |
| ----------------- | --------- | ---------------------------------- |
| `DUPLICATE`       | `false`   | Already processed (idempotency)    |
| `NOT_PAID`        | `false`   | QPay API says not paid yet         |
| `AMOUNT_MISMATCH` | `false`   | Paid amount ≠ expected amount      |
| `SESSION_MISSING` | `false`   | Redis session expired/not found    |
| (none)            | `true`    | ✅ Payment verified, order created |

## 🧪 Quick Test Commands

### 1. Create Invoice

```bash
curl -X POST http://localhost:8080/order/api/internal/payments/qpay/seed-session \
  -H "x-internal-request: true" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionData": {
      "userId": "test123",
      "cart": [{"productId": "677e7b5c8f9a1b2c3d4e5f6a", "quantity": 1, "sale_price": 100, "shopId": "shop1"}],
      "sellers": ["shop1"],
      "totalAmount": 100
    }
  }'
```

### 2. Simulate Webhook

```bash
curl -X POST "http://localhost:6003/api/internal/payments/qpay/webhook?sessionId=<SESSION_ID>" \
  -H "x-internal-request: true" \
  -H "Content-Type: application/json" \
  -d '{"invoiceId": "<INVOICE_ID>", "status": "paid", "payload": {}}'
```

### 3. Run Full Test

```bash
./test-qpay-payment-verification.sh
```

### 4. Test Database Fallback 🔥 **NEW**

```bash
./test-qpay-db-fallback.sh
```

**Tests order creation after Redis expires (database fallback)**

### 5. Test Status Endpoint 🔥 **NEW**

```bash
./test-qpay-status-endpoint.sh
```

**Tests payment status polling and rate limiting**

## 🛠️ Troubleshooting One-Liners

### Check Redis Token

```bash
redis-cli GET qpay:access_token
```

### Check Session

```bash
redis-cli GET "payment-session:<sessionId>"
```

### Check Processed Invoices

```bash
npx prisma studio
# Navigate to QPayProcessedInvoice model
```

### Clear Token Cache

```bash
redis-cli DEL qpay:access_token
```

### View Logs (Debug Mode)

```bash
INTERNAL_WEBHOOK_DEBUG=true pnpm exec nx run order-service:serve:development
```

## 🚨 Common Issues

### ❌ "NOT_PAID" but customer paid

**Solution**: Check QPay merchant dashboard. If truly paid, manually retry webhook.

### ❌ "AMOUNT_MISMATCH"

**Solution**: Verify `QPAY_USD_TO_MNT_RATE` env var matches current exchange rate.

### ❌ "SESSION_MISSING" on first webhook

**Solution**:

1. Check database: `npx prisma studio` → QPayPaymentSession → search by sessionId
2. If in database but not Redis: Database fallback should work (check logs for "Session loaded from database")
3. If not in database: Session creation failed (check seed-session logs)
4. Increase Redis TTL if needed (default: 600s, consider 1800s for slower payments)

### ❌ Token expired / 401 errors

**Solution**: Check `QPAY_CLIENT_ID` and `QPAY_CLIENT_SECRET`. Clear token cache: `redis-cli DEL qpay:access_token`

### ❌ "DUPLICATE" but no orders

**Solution**: Previous webhook failed during order creation. Check logs for errors in `createOrdersFromSession()`.

## 📚 Documentation Files

- `QPAY_IMPLEMENTATION_SUMMARY.md` - Complete overview
- `QPAY_PAYMENT_VERIFICATION.md` - Detailed verification flow
- `QPAY_DATABASE_PERSISTENCE.md` - 🔥 **NEW** Database fallback (Redis expiry resilience)
- `QPAY_V2_TOKEN_IMPLEMENTATION.md` - Token caching details
- `QPAY_INVOICE_CREATION_IMPLEMENTATION.md` - Invoice creation
- `QPAY_QUICK_START.md` - Getting started guide
- `QPAY_BEFORE_AFTER.md` - Visual comparison of old vs new flow

## 🎯 Critical Code Locations

| Component        | File                                                     | Key Function               |
| ---------------- | -------------------------------------------------------- | -------------------------- |
| Token Cache      | `apps/order-service/src/payments/qpay-auth.service.ts`   | `getAccessToken()`         |
| QPay Client      | `apps/order-service/src/payments/qpay.client.ts`         | `paymentCheckInvoice()` ⭐ |
| Webhook Handler  | `apps/order-service/src/controllers/order.controller.ts` | `handleQPayWebhook()`      |
| Signature Verify | `apps/api-gateway/src/(routes)/qpay.ts`                  | HMAC verification          |

## 💡 Remember

1. **Payment verification is the source of truth** - Not the webhook payload
2. **Idempotency check comes FIRST** - Before Redis session
3. **Always return 200 OK** - For webhooks (even on errors)
4. **Amount tolerance** - Allow `< 1 MNT` difference for rounding
5. **Race-safe** - Use `QPayProcessedInvoice.create()` as distributed lock

## 🔗 QPay API Endpoints

| Endpoint            | Method | Purpose                              |
| ------------------- | ------ | ------------------------------------ |
| `/v2/auth/token`    | POST   | Get access token (Basic Auth)        |
| `/v2/invoice`       | POST   | Create invoice (Bearer token)        |
| `/v2/payment/check` | POST   | **Verify payment** ⭐ (Bearer token) |

## 📞 Quick Links

- QPay API Docs: https://developer.qpay.mn/
- Merchant Portal: https://merchant.qpay.mn/
- Test Sandbox: https://merchant-sandbox.qpay.mn/

---

**Last Updated**: January 7, 2026  
**Implementation Version**: V2 (with payment verification)
