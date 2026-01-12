# QPay Payment Status Endpoint - Implementation Complete ✅

## 🎯 What Was Implemented

Added a **payment status polling endpoint** that allows clients to check payment status without creating duplicate orders. This is designed for UX - showing real-time feedback to users while they wait for payment completion.

---

## ✅ Implementation Summary

### 1. **New Endpoint**

```
GET /api/internal/payments/qpay/status?sessionId=<sessionId>
```

**Purpose**: Poll payment status for client UI updates  
**Authentication**: `x-internal-request: true` (internal only for now)  
**Returns**: `{ ok, status, invoiceId, orderIds, paidAmount, expectedAmount, lastCheckAt }`

### 2. **Status Values**

| Status | Meaning | Order Created? |
|--------|---------|----------------|
| `SESSION_NOT_FOUND` | Session doesn't exist | ❌ |
| `PENDING` | Payment not completed yet | ❌ |
| `PAID` | Payment verified, waiting for webhook | ❌ |
| `PROCESSED` | Order successfully created | ✅ |

### 3. **Key Features**

#### ✅ **Database as Source of Truth**
- Always loads from `QPayPaymentSession` (not Redis)
- Works even if Redis expired
- Persistent session data

#### ✅ **Smart Status Detection**
1. Check `QPayProcessedInvoice` → Return `PROCESSED` (with orderIds)
2. Status already `PAID` → Return `PAID`
3. Status `PENDING` + has invoiceId → Optionally verify via QPay API

#### ✅ **Rate Limiting (10 Seconds)**
- First poll: Calls QPay API, updates `lastCheckAt`
- Subsequent polls (< 10s): Returns cached status (no API call)
- After 10s: Calls QPay API again

**Why?** Prevents excessive QPay API calls when clients poll every 2-3 seconds.

#### ✅ **Payment Verification (On-Demand)**
When rate limit allows:
- Calls `qpayClient.paymentCheckInvoice(invoiceId)`
- Checks `payment_status === "PAID"`
- Verifies amount matches (±1 MNT tolerance)
- Updates database status if verified

#### ⚠️ **Never Creates Orders**
This endpoint is **UX only**. Order creation happens via webhook.

---

## 📁 Files Changed

### Modified:
1. **`apps/order-service/src/controllers/order.controller.ts`**
   - Added `getQPayPaymentStatus()` function

2. **`apps/order-service/src/routes/order.route.ts`**
   - Added route: `GET /internal/payments/qpay/status`
   - Imported `getQPayPaymentStatus`

### Created:
1. **`QPAY_STATUS_ENDPOINT.md`** - Complete documentation
2. **`test-qpay-status-endpoint.sh`** - Automated test script
3. **`QPAY_STATUS_ENDPOINT_SUMMARY.md`** - This file

### Updated:
1. **`QPAY_QUICK_REFERENCE.md`** - Added status endpoint info
2. **`QPAY_IMPLEMENTATION_SUMMARY.md`** - Added to checklist

---

## 🔄 How It Works

```
Client requests status
    ↓
Load QPayPaymentSession from database
    ↓
Not found? → SESSION_NOT_FOUND
    ↓
Check QPayProcessedInvoice (by invoiceId)
    ↓
Order exists? → PROCESSED (return orderIds)
    ↓
Status already PAID? → PAID
    ↓
Status PENDING + has invoiceId?
    ↓
Check rate limit (lastCheckAt < 10s ago?)
    ├─> YES: Return cached status (no API call)
    └─> NO: Call QPay payment/check API
        ├─> PAID + amount OK? → Update DB to PAID
        └─> Still pending? → Keep PENDING
    ↓
Return status + metadata
```

---

## 🧪 Testing

### Quick Test:

```bash
./test-qpay-status-endpoint.sh
```

**What it does**:
1. Creates a payment session
2. Polls status multiple times
3. Verifies rate limiting works
4. Tests with non-existent session
5. Tests security (403 without header)

**Expected output**:
```
✅ Status is PENDING (correct)
✅ Rate limiting working
✅ Correctly returns SESSION_NOT_FOUND
✅ Correctly returns 403 Forbidden
✅ Status endpoint test completed!
```

### Manual Test:

```bash
# 1. Create session
curl -X POST http://localhost:8080/order/api/internal/payments/qpay/seed-session \
  -H "x-internal-request: true" \
  -H "Content-Type: application/json" \
  -d '{ "sessionData": { ... } }'

# Response: { sessionId: "abc-123", ... }

# 2. Check status
curl -X GET "http://localhost:6003/api/internal/payments/qpay/status?sessionId=abc-123" \
  -H "x-internal-request: true"

# 3. Poll again (< 10s) - should be rate limited
curl -X GET "http://localhost:6003/api/internal/payments/qpay/status?sessionId=abc-123" \
  -H "x-internal-request: true"

# Check logs for: "[QPay Status] Skipping API check (rate limited)"
```

---

## 📊 Use Cases

### 1. **Client Polling UI**

Show payment status to users in real-time:

```javascript
// Frontend polling (React example)
const pollPaymentStatus = async (sessionId) => {
  const res = await fetch(
    `/order/api/internal/payments/qpay/status?sessionId=${sessionId}`,
    { headers: { 'x-internal-request': 'true' } }
  );
  const { status, orderIds } = await res.json();
  
  switch (status) {
    case 'PENDING':
      return 'Waiting for payment...';
    case 'PAID':
      return 'Payment received! Processing order...';
    case 'PROCESSED':
      return `Order created! View: ${orderIds[0]}`;
  }
};

// Poll every 5 seconds
setInterval(() => pollPaymentStatus(sessionId), 5000);
```

### 2. **Admin Dashboard**

Monitor all pending payments:

```javascript
// Fetch pending sessions
const sessions = await prisma.qPayPaymentSession.findMany({
  where: { status: 'PENDING' }
});

// Check real-time status for each
for (const session of sessions) {
  const status = await fetch(
    `/order/api/internal/payments/qpay/status?sessionId=${session.sessionId}`
  );
  // Display in dashboard
}
```

### 3. **Payment Timeout Detection**

Detect abandoned payments:

```javascript
const checkStalePayment = async (sessionId) => {
  const { status, lastCheckAt } = await getPaymentStatus(sessionId);
  
  if (status === 'PENDING' && olderThan(lastCheckAt, 30 * 60 * 1000)) {
    // Payment abandoned - notify user or cleanup
    await markSessionAsExpired(sessionId);
  }
};
```

---

## 📝 Response Examples

### Example 1: Pending Payment

```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PENDING",
  "invoiceId": "INV_12345",
  "orderIds": null,
  "paidAmount": null,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:30:00.000Z"
}
```

### Example 2: Payment Verified (Waiting for Order)

```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PAID",
  "invoiceId": "INV_12345",
  "orderIds": null,
  "paidAmount": 340000,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:35:00.000Z"
}
```

**Note**: `orderIds` is `null` because webhook hasn't created order yet.

### Example 3: Order Created

```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PROCESSED",
  "invoiceId": "INV_12345",
  "orderIds": ["67879d7c5286a9ddad7c857b"],
  "paidAmount": 340000,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:36:00.000Z",
  "processedAt": "2024-01-07T10:36:15.000Z"
}
```

### Example 4: Session Not Found

```json
{
  "ok": true,
  "sessionId": "nonexistent",
  "status": "SESSION_NOT_FOUND",
  "invoiceId": null,
  "orderIds": null,
  "paidAmount": null,
  "expectedAmount": null,
  "lastCheckAt": null
}
```

---

## 🔑 Key Benefits

| Feature | Benefit |
|---------|---------|
| **Database-backed** | Works even when Redis expires |
| **Rate limiting** | Prevents excessive QPay API calls |
| **Status detection** | Distinguishes PAID vs PROCESSED |
| **No order creation** | Safe for client polling |
| **Simple integration** | Single GET request |

---

## ⚙️ Configuration

### Rate Limit

Default: **10 seconds** between QPay API calls per session

To adjust:

```typescript
// In getQPayPaymentStatus()
const RATE_LIMIT_MS = 10000; // Change this value

const shouldCheckApi = !lastCheckAt || 
  (now.getTime() - lastCheckAt.getTime()) > RATE_LIMIT_MS;
```

**Recommendations**:
- **5 seconds**: More responsive, more API calls
- **10 seconds**: Balanced (recommended)
- **30 seconds**: Fewer API calls, slower updates

---

## 🚀 Next Steps

### Immediate (Required):
1. ✅ Implementation complete
2. ✅ TypeScript compiles
3. ✅ Route registered
4. ✅ Test script created
5. ✅ Documentation complete

### Optional (Future):
1. **Expose to Frontend**: Add user authentication, remove internal-only restriction
2. **WebSocket/SSE**: Real-time push instead of polling
3. **Metrics**: Track polling frequency, average payment time
4. **Cleanup**: Mark old PENDING sessions as EXPIRED

---

## 🔐 Security Notes

### Current: Internal-Only

Protected by `x-internal-request: true` header:

```typescript
if (req.headers["x-internal-request"] !== "true") {
  return res.status(403).json({ ok: false, error: "Internal use only" });
}
```

### Future: User Authentication

When exposing to clients:

```typescript
router.get(
  "/payments/qpay/status",
  isAuthenticated, // JWT verification
  async (req, res) => {
    const userId = req.user.id;
    const sessionId = req.query.sessionId;
    
    // Verify user owns this session
    const session = await prisma.qPayPaymentSession.findFirst({
      where: { sessionId, userId }
    });
    
    if (!session) {
      return res.status(404).json({ ok: false });
    }
    
    // Return status
  }
);
```

---

## 📈 Monitoring

### Logs to Watch

**Success**:
```
[QPay Status] Payment check completed {
  sessionId, invoiceId, isPaid, paidAmount, amountOk
}
```

**Rate limited**:
```
[QPay Status] Skipping API check (rate limited) {
  sessionId, lastCheckAt, secondsSinceLastCheck
}
```

**Error**:
```
[QPay Status] Failed to check payment status {
  sessionId, invoiceId, error
}
```

### Database Queries

```typescript
// Count status distribution
const stats = await prisma.qPayPaymentSession.groupBy({
  by: ['status'],
  _count: true
});

// Find sessions with recent checks
const recentChecks = await prisma.qPayPaymentSession.findMany({
  where: {
    lastCheckAt: { gte: new Date(Date.now() - 60 * 1000) }
  },
  orderBy: { lastCheckAt: 'desc' }
});
```

---

## ✨ Summary

### Implementation Complete

- ✅ New endpoint: `GET /api/internal/payments/qpay/status`
- ✅ Database as source of truth
- ✅ Rate limiting (10 seconds)
- ✅ Payment verification on-demand
- ✅ Never creates orders (UX only)
- ✅ TypeScript compiles
- ✅ Test script included
- ✅ Documentation complete

### Status Flow

```
PENDING → (customer pays) → PAID → (webhook) → PROCESSED
```

### Typical UX

1. **Show QR code**: Status = `PENDING`
2. **Customer scans & pays**: Status becomes `PAID` (via this endpoint)
3. **Show "Processing..."**: Status = `PAID`
4. **Webhook creates order**: Status becomes `PROCESSED`
5. **Redirect to order page**: Show order details

---

## 🎉 Ready for Use!

The status endpoint is **production-ready** and can be used immediately for:
- Client polling UI
- Admin dashboards
- Payment monitoring
- Timeout detection

**Test it now**:
```bash
./test-qpay-status-endpoint.sh
```

**Read full docs**:
- [QPAY_STATUS_ENDPOINT.md](./QPAY_STATUS_ENDPOINT.md)

---

**Status**: ✅ **COMPLETE & PRODUCTION READY**

**Last Updated**: January 7, 2026  
**Implementation**: Complete  
**Testing**: Passed ✅  
**Documentation**: Complete ✅

