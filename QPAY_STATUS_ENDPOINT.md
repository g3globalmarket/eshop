# QPay Payment Status Endpoint

## Overview

The **Payment Status Endpoint** allows clients to poll for the current payment status of a QPay session without creating duplicate orders. This is designed for UX purposes - showing real-time payment status to users while they wait.

## Endpoint

```
GET /api/internal/payments/qpay/status?sessionId=<sessionId>
```

**Headers**:
- `x-internal-request: true` (Required for internal endpoints)

**Query Parameters**:
- `sessionId` (required): The payment session ID

## Response Format

```typescript
{
  ok: boolean;
  sessionId: string;
  status: "PENDING" | "PAID" | "PROCESSED" | "SESSION_NOT_FOUND" | "FAILED";
  invoiceId: string | null;
  orderIds: string[] | null;
  paidAmount: number | null;
  expectedAmount: number | null;
  lastCheckAt: string | null;  // ISO 8601 timestamp
  processedAt?: string | null;  // Only present when status is PROCESSED
}
```

### Status Values

| Status | Meaning | Order Created? |
|--------|---------|----------------|
| `SESSION_NOT_FOUND` | No session found in database | ❌ No |
| `PENDING` | Payment not yet completed | ❌ No |
| `PAID` | Payment verified by QPay API | ❌ Not yet (waiting for webhook) |
| `PROCESSED` | Order successfully created | ✅ **Yes** |
| `FAILED` | Payment failed or expired | ❌ No |

---

## How It Works

### 1. Database as Source of Truth

The endpoint **always** loads session data from the database first (not Redis):

```typescript
const dbSession = await prisma.qPayPaymentSession.findUnique({
  where: { sessionId }
});
```

**Why?** Database persists even when Redis expires. Clients can poll for hours/days.

### 2. Status Determination Logic

```
Load from QPayPaymentSession
    ↓
No record found?
    └─> Return SESSION_NOT_FOUND
    
Check QPayProcessedInvoice (by invoiceId)
    ↓
Order already created?
    └─> Return PROCESSED (with orderIds)
    
Status already "PAID"?
    └─> Return PAID
    
Status is "PENDING" AND has invoiceId?
    ↓
Check rate limit (lastCheckAt < 10 seconds ago?)
    ├─> YES: Skip API call, return cached status
    └─> NO: Call QPay payment/check API
        ├─> Payment PAID + Amount OK?
        │   └─> Update DB status to PAID, return PAID
        └─> Still pending?
            └─> Update lastCheckAt, return PENDING
```

### 3. Rate Limiting (10 Seconds)

To prevent excessive QPay API calls, the endpoint rate-limits checks:

- **First poll**: Calls QPay API, updates `lastCheckAt`
- **Subsequent polls (< 10s)**: Returns cached status (no API call)
- **After 10s**: Calls QPay API again

**Why?** Clients may poll every 2-3 seconds. This prevents hitting QPay's rate limits.

### 4. Payment Verification (On-Demand)

When status is `PENDING` and rate limit allows, the endpoint:

1. Calls `qpayClient.paymentCheckInvoice(invoiceId)`
2. Checks if `payment_status === "PAID"`
3. Verifies `paid_amount` matches `expected_amount` (±1 MNT tolerance)
4. Updates database:
   - If PAID + amount OK → Set status to `PAID`
   - Always update `lastCheckAt`

**Important**: This endpoint **NEVER creates orders**. Order creation happens only via the webhook.

---

## Use Cases

### Use Case 1: Client Polling UI

**Scenario**: Show payment status to user while they wait.

```javascript
// Client-side polling (React/Vue/Angular)
const pollPaymentStatus = async (sessionId) => {
  const response = await fetch(
    `/order/api/internal/payments/qpay/status?sessionId=${sessionId}`,
    {
      headers: { 'x-internal-request': 'true' }
    }
  );
  const data = await response.json();
  
  switch (data.status) {
    case 'PENDING':
      // Show "Waiting for payment..." with QR code
      break;
    case 'PAID':
      // Show "Payment received! Processing order..."
      break;
    case 'PROCESSED':
      // Redirect to order confirmation page
      window.location.href = `/orders/${data.orderIds[0]}`;
      break;
    case 'SESSION_NOT_FOUND':
      // Show error "Session expired"
      break;
  }
};

// Poll every 5 seconds
const pollInterval = setInterval(() => {
  pollPaymentStatus(sessionId);
}, 5000);
```

### Use Case 2: Admin Dashboard

**Scenario**: Monitor pending payments in admin panel.

```javascript
// Fetch all pending sessions
const pendingSessions = await prisma.qPayPaymentSession.findMany({
  where: { status: 'PENDING' },
  orderBy: { createdAt: 'desc' }
});

// For each session, get real-time status
for (const session of pendingSessions) {
  const status = await fetch(
    `/order/api/internal/payments/qpay/status?sessionId=${session.sessionId}`
  );
  // Display in dashboard
}
```

### Use Case 3: Payment Timeout Handling

**Scenario**: Detect stale payments that never completed.

```javascript
// Check if payment is still pending after 30 minutes
const checkStalePayment = async (sessionId) => {
  const response = await fetch(
    `/order/api/internal/payments/qpay/status?sessionId=${sessionId}`
  );
  const data = await response.json();
  
  if (data.status === 'PENDING' && isOlderThan(data.lastCheckAt, 30 * 60 * 1000)) {
    // Payment likely abandoned - notify user or cleanup
    await markSessionAsExpired(sessionId);
  }
};
```

---

## Response Examples

### Example 1: Pending Payment

**Request**:
```bash
curl -X GET "http://localhost:6003/api/internal/payments/qpay/status?sessionId=abc-123" \
  -H "x-internal-request: true"
```

**Response**:
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

**Request**: Same as above

**Response**:
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

**Note**: Status is `PAID` but `orderIds` is `null` because the webhook hasn't processed yet.

### Example 3: Order Created

**Request**: Same as above

**Response**:
```json
{
  "ok": true,
  "sessionId": "abc-123",
  "status": "PROCESSED",
  "invoiceId": "INV_12345",
  "orderIds": ["67879d7c5286a9ddad7c857b", "67879d7c5286a9ddad7c857c"],
  "paidAmount": 340000,
  "expectedAmount": 340000,
  "lastCheckAt": "2024-01-07T10:36:00.000Z",
  "processedAt": "2024-01-07T10:36:15.000Z"
}
```

**Note**: Status is `PROCESSED` and `orderIds` contains the created order IDs.

### Example 4: Session Not Found

**Request**:
```bash
curl -X GET "http://localhost:6003/api/internal/payments/qpay/status?sessionId=nonexistent" \
  -H "x-internal-request: true"
```

**Response**:
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

### Example 5: Rate Limited (No API Call)

When polled within 10 seconds of the last check:

**Logs**:
```
[QPay Status] Skipping API check (rate limited) {
  sessionId: 'abc-123',
  lastCheckAt: '2024-01-07T10:30:00.000Z',
  secondsSinceLastCheck: 3.5
}
```

**Response**: Same as previous status (cached)

---

## Rate Limiting Details

### Configuration

```typescript
const RATE_LIMIT_SECONDS = 10;
```

### Logic

```typescript
const now = new Date();
const lastCheckAt = dbSession.lastCheckAt;
const shouldCheckApi = !lastCheckAt || 
  (now.getTime() - lastCheckAt.getTime()) > 10000; // 10 seconds

if (shouldCheckApi) {
  // Call QPay API
} else {
  // Return cached status
}
```

### Benefits

1. **Reduces QPay API load**: Most client polls use cached status
2. **Prevents rate limiting**: QPay may have rate limits on payment/check
3. **Cost savings**: Fewer API calls = lower costs
4. **Better performance**: Database read is faster than API call

### Tuning

You can adjust the rate limit by changing the constant:

```typescript
// More aggressive polling (check more often)
const RATE_LIMIT_SECONDS = 5;

// Less aggressive (reduce API calls)
const RATE_LIMIT_SECONDS = 30;
```

**Recommendation**: 10 seconds is a good balance for UX and API load.

---

## Database Updates

### Fields Updated

The endpoint updates these fields in `QPayPaymentSession`:

1. **`status`**: Updated to `PAID` when payment is verified
2. **`lastCheckAt`**: Updated on every QPay API call

### Example Update

```typescript
// When payment verified
await prisma.qPayPaymentSession.update({
  where: { sessionId },
  data: {
    status: "PAID",
    lastCheckAt: new Date(),
  }
});

// When still pending
await prisma.qPayPaymentSession.update({
  where: { sessionId },
  data: {
    lastCheckAt: new Date(),
  }
});
```

---

## Testing

### Manual Test

```bash
# 1. Create payment session
curl -X POST http://localhost:8080/order/api/internal/payments/qpay/seed-session \
  -H "x-internal-request: true" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionData": {
      "userId": "user123",
      "cart": [...],
      "sellers": [...],
      "totalAmount": 100
    }
  }'

# Response: { sessionId: "abc-123", ... }

# 2. Poll status
curl -X GET "http://localhost:6003/api/internal/payments/qpay/status?sessionId=abc-123" \
  -H "x-internal-request: true"

# 3. Poll again immediately (should be rate limited)
curl -X GET "http://localhost:6003/api/internal/payments/qpay/status?sessionId=abc-123" \
  -H "x-internal-request: true"

# 4. Check logs for "Skipping API check (rate limited)"
```

### Automated Test

```bash
./test-qpay-status-endpoint.sh
```

This script:
1. Creates a payment session
2. Polls status multiple times
3. Tests rate limiting
4. Tests non-existent session
5. Tests security (without x-internal-request header)

---

## Integration with Frontend

### React Example

```typescript
import { useState, useEffect } from 'react';

const PaymentStatusChecker = ({ sessionId }: { sessionId: string }) => {
  const [status, setStatus] = useState<'PENDING' | 'PAID' | 'PROCESSED'>('PENDING');
  const [orderIds, setOrderIds] = useState<string[]>([]);

  useEffect(() => {
    const checkStatus = async () => {
      const response = await fetch(
        `/order/api/internal/payments/qpay/status?sessionId=${sessionId}`,
        { headers: { 'x-internal-request': 'true' } }
      );
      const data = await response.json();
      
      setStatus(data.status);
      if (data.orderIds) {
        setOrderIds(data.orderIds);
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    checkStatus(); // Check immediately

    return () => clearInterval(interval);
  }, [sessionId]);

  return (
    <div>
      {status === 'PENDING' && <p>⏳ Waiting for payment...</p>}
      {status === 'PAID' && <p>✅ Payment received! Processing...</p>}
      {status === 'PROCESSED' && (
        <div>
          <p>🎉 Order created successfully!</p>
          {orderIds.map(id => <a key={id} href={`/orders/${id}`}>View Order</a>)}
        </div>
      )}
    </div>
  );
};
```

---

## Security Considerations

### 1. Internal-Only Endpoint

Currently protected by `x-internal-request: true` header check:

```typescript
if (req.headers["x-internal-request"] !== "true") {
  return res.status(403).json({
    ok: false,
    error: "This endpoint is for internal use only"
  });
}
```

### 2. Future: User Authentication

When exposing to clients, add authentication:

```typescript
router.get(
  "/payments/qpay/status",
  isAuthenticated, // Middleware to verify JWT
  async (req, res) => {
    const userId = req.user.id;
    const sessionId = req.query.sessionId;
    
    // Verify user owns this session
    const session = await prisma.qPayPaymentSession.findFirst({
      where: { sessionId, userId }
    });
    
    if (!session) {
      return res.status(404).json({ ok: false, error: "Not found" });
    }
    
    // Return status
  }
);
```

### 3. Rate Limiting (Application-Level)

Consider adding application-level rate limiting to prevent abuse:

```typescript
import rateLimit from 'express-rate-limit';

const statusLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  message: { ok: false, error: "Too many requests" }
});

router.get(
  "/internal/payments/qpay/status",
  statusLimiter,
  getQPayPaymentStatus
);
```

---

## Monitoring

### Key Metrics to Track

1. **Status distribution**: How many sessions are in each status?
2. **Rate limit effectiveness**: How many polls are rate-limited vs. API calls?
3. **Average time to PAID**: How long does it take for payments to complete?
4. **Stale sessions**: How many sessions remain PENDING for > 30 minutes?

### Database Queries

```typescript
// Count by status
const statusCounts = await prisma.qPayPaymentSession.groupBy({
  by: ['status'],
  _count: true
});

// Find stale sessions (pending > 30 min)
const staleSessions = await prisma.qPayPaymentSession.findMany({
  where: {
    status: 'PENDING',
    createdAt: {
      lt: new Date(Date.now() - 30 * 60 * 1000)
    }
  }
});

// Average payment time
const avgPaymentTime = await prisma.$queryRaw`
  SELECT AVG(TIMESTAMPDIFF(SECOND, createdAt, updatedAt)) as avgSeconds
  FROM QPayPaymentSession
  WHERE status = 'PAID'
`;
```

---

## Troubleshooting

### "Status stuck at PENDING"

**Possible causes**:
1. Customer hasn't paid yet (normal)
2. QPay API returning incorrect status
3. Rate limiting preventing status check

**Solution**:
- Check database `lastCheckAt` field
- Wait 10+ seconds and poll again
- Check QPay merchant dashboard manually

### "Status is PAID but no order"

**Explanation**: This is **normal** behavior.

- Status endpoint can update to `PAID` via API check
- Order creation happens only via **webhook**
- There may be a delay between payment verification and webhook delivery

**Solution**: Wait for webhook to arrive and create order.

### "SESSION_NOT_FOUND but session exists"

**Check**:
1. Verify `sessionId` in request matches database
2. Check database connection
3. Ensure Prisma client is up-to-date

### "Rate limiting not working"

**Check logs**: Should see "Skipping API check (rate limited)" within 10 seconds.

**Debug**:
```typescript
console.log({
  now: now.getTime(),
  lastCheckAt: lastCheckAt?.getTime(),
  diff: now.getTime() - (lastCheckAt?.getTime() ?? 0),
  shouldCheck: shouldCheckApi
});
```

---

## Summary

| Feature | Implementation |
|---------|----------------|
| **Endpoint** | `GET /api/internal/payments/qpay/status?sessionId=<id>` |
| **Source of Truth** | Database (`QPayPaymentSession`) |
| **Status Values** | PENDING, PAID, PROCESSED, SESSION_NOT_FOUND |
| **Rate Limiting** | 10 seconds between QPay API calls |
| **Order Creation** | ❌ Never (webhook-only) |
| **Authentication** | `x-internal-request: true` (internal only) |
| **Use Case** | Client polling / UX feedback |

---

## Next Steps

### Optional Enhancements

1. **Expose to Frontend**: Add user authentication, route via API Gateway
2. **WebSocket/SSE**: Real-time updates instead of polling
3. **Metrics Dashboard**: Track status distribution and payment times
4. **Cleanup Job**: Mark old PENDING sessions as EXPIRED

---

**Status**: ✅ **Implemented & Ready for Testing**

Test the endpoint with:
```bash
./test-qpay-status-endpoint.sh
```

**Last Updated**: January 7, 2026

