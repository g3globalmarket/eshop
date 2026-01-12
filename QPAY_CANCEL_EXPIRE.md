# QPay Cancel/Expire Mechanism - Implementation Summary

## Overview

Added cancel and expiry mechanisms for QPay payment sessions to improve UX and keep the database clean. Users can now cancel pending payments, and old sessions automatically expire after 30 minutes.

## Policy: User-Friendly (Policy A)

**If user cancels but later pays anyway:**
- ✅ Webhook will still create order (money was received)
- ❌ Reconciliation won't check cancelled sessions
- ❌ Frontend stops polling immediately

This policy reduces support tickets from users who accidentally paid after cancelling.

---

## Implementation Complete

### 🎯 Goals Achieved

Users can now:
1. **Cancel active payments** via "Cancel Payment" button
2. **See clear status** for cancelled/expired sessions
3. **Return to cart** easily after cancellation
4. **Sessions auto-expire** after 30 minutes of inactivity

Admins benefit from:
- **Cleaner database** (fewer abandoned pending sessions)
- **Reduced confusion** (clear status instead of forever-pending)
- **Automatic cleanup** (expired sessions marked and cleaned up)

---

## 📝 Files Changed

### Backend Changes

#### 1. Prisma Schema (`prisma/schema.prisma`)

**Added:**
- `cancelledAt DateTime?` field to `QPayPaymentSession`
- Updated status comment to include `CANCELLED` and `EXPIRED`

```prisma
model QPayPaymentSession {
  // ... existing fields ...
  status        String    @default("PENDING") // PENDING, PAID, PROCESSED, FAILED, CANCELLED, EXPIRED
  cancelledAt   DateTime? // When user manually cancelled the payment
  // ... rest of fields ...
}
```

#### 2. Order Service Controller (`apps/order-service/src/controllers/order.controller.ts`)

**New Function**: `cancelQPayPayment`

**Features:**
- JWT authentication required (via API Gateway)
- Ownership verification (session belongs to requesting user)
- Only allows cancelling PENDING/PAID sessions (not PROCESSED)
- Idempotent (already cancelled → returns success)
- Sets `status = "CANCELLED"` and `cancelledAt = now()`

**Response:**
```json
{
  "ok": true,
  "message": "Payment cancelled successfully",
  "sessionId": "...",
  "status": "CANCELLED"
}
```

**Updated Function**: `getQPayPaymentStatus`

- Early return for `CANCELLED` or `EXPIRED` status
- Does NOT call QPay API for these statuses (stops polling)
- Returns `cancelledAt` in response

#### 3. Order Service Routes (`apps/order-service/src/routes/order.route.ts`)

**New Route:**
- `POST /api/payments/qpay/cancel` - Public endpoint (JWT required)

#### 4. API Gateway (`apps/api-gateway/src/(routes)/qpay.ts`)

**New Endpoint**: `POST /payments/qpay/cancel`

**Features:**
- Proxies to order-service
- Forwards authentication headers/cookies
- JWT required
- 10-second timeout
- Pass-through response

#### 5. Reconciliation Service (`apps/order-service/src/payments/qpay-reconcile.service.ts`)

**Updated**: `getCandidateSessions()`

**Change:**
- Query explicitly excludes `CANCELLED` and `EXPIRED` statuses
- Only checks `PENDING` and `PAID` sessions
- Added comment explaining policy

```typescript
status: { in: ["PENDING", "PAID"] }, // Excludes CANCELLED, EXPIRED, PROCESSED, FAILED
```

#### 6. Cleanup Service (`apps/order-service/src/payments/qpay-cleanup.service.ts`)

**New Function**: `expirePendingSessions()`

**Features:**
- Marks `PENDING` sessions older than 30 minutes as `EXPIRED`
- Runs during each cleanup cycle (every 6 hours)
- Configurable via `QPAY_SESSION_EXPIRY_MINUTES` env var
- Updates `updatedAt` timestamp

**New Environment Variable:**
- `QPAY_SESSION_EXPIRY_MINUTES` (default: 30)

---

### Frontend Changes

#### 7. API Client (`apps/user-ui/src/utils/qpay-api.ts`)

**Updated Types:**
- Added `"CANCELLED"` and `"EXPIRED"` to `QPayPaymentStatus` type

**New Function**: `cancelQPayPayment(sessionId: string)`

**Features:**
- Calls gateway endpoint `POST /payments/qpay/cancel`
- Returns typed response
- Throws error on failure (for user feedback)

**New Interface:**
- `QPayCancelResponse` - Response type for cancel

**Updated Function**: `getStatusDisplayText()`
- Added display text for `"CANCELLED"` and `"EXPIRED"`

#### 8. QPay Checkout Form (`apps/user-ui/src/shared/components/checkout/qpayCheckoutForm.tsx`)

**New UI Elements:**
- **Cancel button** - Shows for `PENDING` and `PAID` statuses
- **Confirmation dialog** - Asks user to confirm cancellation
- **Cancelling state** - Shows "Cancelling..." while processing

**Updated Behavior:**
- Stops polling when status is `CANCELLED` or `EXPIRED`
- Shows appropriate error messages
- Displays help text for cancelled/expired sessions
- "Back to Cart" button for all error states

**Visual Design:**
```
┌─────────────────────────────────────────────────┐
│ [QR Code]                                       │
│                                                  │
│ ⏳ Waiting for payment...                       │
│                                                  │
│ [Cancel Payment]  (red border button)          │
└─────────────────────────────────────────────────┘
```

**After Cancellation:**
```
┌─────────────────────────────────────────────────┐
│ ❌ Payment cancelled                            │
│                                                  │
│ You can start a new payment from your cart      │
│                                                  │
│ [Back to Cart]                                  │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Data Flow

### Cancel Flow

```
Frontend (Cancel button clicked)
    ↓
Confirmation dialog
    ↓
cancelQPayPayment(sessionId)
    ↓
API Gateway: POST /payments/qpay/cancel
    ↓
Order Service: POST /api/payments/qpay/cancel
    ↓
Verify Ownership (userId matches)
    ↓
Update DB: status="CANCELLED", cancelledAt=now()
    ↓
Return { ok: true, status: "CANCELLED" }
    ↓
Frontend: Stop polling, show "Payment cancelled"
```

### Expiry Flow

```
Cleanup Service (runs every 6 hours)
    ↓
expirePendingSessions()
    ↓
Find sessions: status="PENDING" AND createdAt < now - 30min
    ↓
Update: status="EXPIRED"
    ↓
Log: "Expired N old pending sessions"
```

### Webhook Still Works (Policy A)

```
User cancels payment (status="CANCELLED")
    ↓
User later pays anyway via QPay app
    ↓
QPay sends webhook
    ↓
Webhook calls /v2/payment/check
    ↓
Payment verified as PAID + amount OK
    ↓
Create order (money received - allow it!)
    ↓
User gets order confirmation
```

**But:**
- Reconciliation won't check cancelled sessions
- Status endpoint won't call QPay API for cancelled sessions
- Frontend already stopped polling

---

## 🧪 Testing

### Manual Test: Cancel Payment

1. **Start QPay payment:**
   ```bash
   # Add items to cart → Checkout → Pay with QPay
   ```

2. **On payment page:**
   - See QR code + "Waiting for payment..."
   - See "Cancel Payment" button (red border)

3. **Click "Cancel Payment":**
   - Confirmation dialog appears
   - Click "Yes" to confirm

4. **Result:**
   - Status changes to "Payment cancelled"
   - Shows "You can start a new payment from your cart"
   - "Back to Cart" button appears
   - Polling stops

5. **Verify in DB:**
   ```javascript
   db.QPayPaymentSession.findOne({ sessionId: "..." })
   // Should have: status="CANCELLED", cancelledAt: <timestamp>
   ```

6. **Try to poll status:**
   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:8080/payments/qpay/status?sessionId=<sessionId>"
   
   # Response:
   {
     "ok": true,
     "sessionId": "...",
     "status": "CANCELLED",
     "cancelledAt": "2026-01-07T12:34:56Z",
     ...
   }
   ```

### Manual Test: Auto Expiry

1. **Create a payment session** (don't pay)

2. **Wait 30+ minutes** OR manually update DB:
   ```javascript
   db.QPayPaymentSession.updateOne(
     { sessionId: "..." },
     { $set: { createdAt: new Date(Date.now() - 31 * 60 * 1000) } }
   )
   ```

3. **Trigger cleanup** (or wait for next cycle):
   ```bash
   # Cleanup runs every 6 hours automatically
   # Or manually call expirePendingSessions() for testing
   ```

4. **Verify in DB:**
   ```javascript
   db.QPayPaymentSession.findOne({ sessionId: "..." })
   // Should have: status="EXPIRED"
   ```

5. **Check status endpoint:**
   ```bash
   curl -H "Authorization: Bearer <token>" \
     "http://localhost:8080/payments/qpay/status?sessionId=<sessionId>"
   
   # Response:
   {
     "ok": true,
     "sessionId": "...",
     "status": "EXPIRED",
     ...
   }
   ```

### API Tests

```bash
# 1. Cancel payment
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sessionId>"}' \
  "http://localhost:8080/payments/qpay/cancel"

# Expected: { "ok": true, "status": "CANCELLED", ... }

# 2. Try to cancel already processed order
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<processedSessionId>"}' \
  "http://localhost:8080/payments/qpay/cancel"

# Expected: { "ok": false, "error": "Cannot cancel: Order already created", ... }

# 3. Try to cancel someone else's session
curl -X POST \
  -H "Authorization: Bearer <otherUserToken>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<yourSessionId>"}' \
  "http://localhost:8080/payments/qpay/cancel"

# Expected: 403 { "ok": false, "error": "Access denied", ... }
```

---

## 🚀 Deployment

### Environment Variables

**New:**
- `QPAY_SESSION_EXPIRY_MINUTES` - Minutes before PENDING sessions expire (default: 30)

**Existing (used):**
- `QPAY_CLEANUP_INTERVAL_MS` - Cleanup interval (default: 6 hours)

### Deploy Steps

```bash
# 1. Update Prisma schema
pnpm exec prisma generate

# 2. Build services
pnpm exec nx build order-service
pnpm exec nx build api-gateway
pnpm exec nx build user-ui

# 3. Set environment variables (optional, defaults work)
export QPAY_SESSION_EXPIRY_MINUTES=30

# 4. Deploy all three services

# 5. Verify cancel endpoint is accessible
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<sessionId>"}' \
  "https://your-domain.com/payments/qpay/cancel"
```

### Migration Notes

**No database migration needed** - `cancelledAt` is optional:
- Existing sessions continue to work
- New cancellations will populate `cancelledAt`
- Old sessions without `cancelledAt` are fine

**Backward compatible:**
- Old sessions with no status update still work
- Cleanup only marks PENDING as EXPIRED (won't touch old records)
- Reconciliation already used status filters

---

## 🐛 Troubleshooting

### Issue: Cancel button not showing

**Check:**
- Status is `PENDING` or `PAID` (not `PROCESSED`)
- Polling is active (`polling === true`)
- User is on payment page with valid `sessionId`

### Issue: Cancel returns 403 Forbidden

**Check:**
- User is logged in (JWT token valid)
- Session belongs to current user
- API Gateway is forwarding auth headers correctly

### Issue: Sessions not expiring

**Check:**
- `QPAY_SESSION_EXPIRY_MINUTES` env var (default 30)
- Cleanup service is running
- Check logs for `[QPay Cleanup] Expired old pending sessions`
- Verify session `createdAt` is older than expiry time

### Issue: User paid after cancelling, no order created

**This is by design (Policy A):**
- Reconciliation skips cancelled sessions
- **But webhook should still create order**
- Check webhook logs: `[QPay Webhook]`
- Verify webhook endpoint is reachable from QPay
- Check `QPayProcessedInvoice` for idempotency record

---

## 📊 Monitoring

### Backend Logs

**Cancel:**
- `[QPay Cancel] Cancelling payment session` - Request received
- `✅ [QPay Cancel] Payment session cancelled` - Success
- `[QPay Cancel] Ownership violation attempt` - Security issue (investigate)

**Expiry:**
- `[QPay Cleanup] Expired old pending sessions` - Sessions expired
- Check `count` field for number expired

**Reconciliation:**
- Cancelled sessions won't appear in reconciliation logs
- Look for: `[QPay Reconcile] Processing session batch` (only PENDING/PAID)

### Database Queries

```javascript
// Find cancelled sessions
db.QPayPaymentSession.find({
  status: "CANCELLED",
  cancelledAt: { $exists: true }
}).count()

// Find expired sessions
db.QPayPaymentSession.find({
  status: "EXPIRED"
}).count()

// Find sessions about to expire (createdAt > 25min ago)
db.QPayPaymentSession.find({
  status: "PENDING",
  createdAt: {
    $lt: new Date(Date.now() - 25 * 60 * 1000),
    $gt: new Date(Date.now() - 30 * 60 * 1000)
  }
})
```

### Metrics to Track

1. **Cancellation rate**: `CANCELLED` / total sessions
2. **Expiry rate**: `EXPIRED` / total sessions
3. **Late payment rate**: Orders created from `CANCELLED` sessions (via webhook)

---

## 🎛️ Configuration

### Environment Variables

```bash
# Session expiry (minutes)
QPAY_SESSION_EXPIRY_MINUTES=30  # Default: 30 minutes

# Cleanup interval (milliseconds)
QPAY_CLEANUP_INTERVAL_MS=21600000  # Default: 6 hours

# Other existing vars (unchanged)
QPAY_SESSION_PROCESSED_RETENTION_DAYS=30
QPAY_SESSION_FAILED_RETENTION_DAYS=30
```

### Defaults Summary

| Setting | Default | Description |
|---------|---------|-------------|
| Session expiry | 30 min | PENDING sessions expire after this |
| Cleanup interval | 6 hours | How often expiry runs |
| Processed retention | 30 days | Keep PROCESSED sessions |
| Failed retention | 30 days | Keep FAILED sessions |
| Cancelled retention | 30 days | Keep CANCELLED sessions (same as FAILED) |
| Expired retention | 30 days | Keep EXPIRED sessions (same as FAILED) |

---

## 🔒 Security

### Ownership Verification

✅ **Cancel endpoint protected:**
- JWT authentication required
- `userId` extracted from JWT
- Verified against `QPayPaymentSession.userId`
- 403 error if mismatch

### Cannot Cancel Others' Sessions

❌ User A cannot cancel User B's session:
- Ownership check in controller
- Logged as `[QPay Cancel] Ownership violation attempt`

### Idempotent Cancellation

✅ Calling cancel multiple times is safe:
- First call: Sets status to `CANCELLED`
- Subsequent calls: Returns success (already cancelled)

---

## ✅ Summary

**Completed:**
- ✅ Backend cancel endpoint with JWT auth and ownership check
- ✅ API Gateway proxy for cancel endpoint
- ✅ Automatic expiry of old PENDING sessions (30 min)
- ✅ Reconciliation excludes CANCELLED and EXPIRED
- ✅ Status endpoint stops polling for CANCELLED/EXPIRED
- ✅ Frontend cancel button with confirmation dialog
- ✅ Frontend handles CANCELLED/EXPIRED statuses
- ✅ Clear error messages and help text
- ✅ Policy A implementation (allow late payments)

**User Experience:**
- Cancel button available on payment page
- Confirmation dialog prevents accidental cancellation
- Clear status messages (cancelled/expired)
- "Back to Cart" button to restart
- Sessions auto-expire after 30 minutes

**Admin Experience:**
- Cleaner database (fewer abandoned sessions)
- Automatic expiry reduces pending session buildup
- Clear status tracking (CANCELLED vs EXPIRED)
- Reconciliation optimized (skips cancelled sessions)

**Security:**
- JWT authentication required
- Ownership verification enforced
- Cannot cancel others' sessions
- Idempotent operations

**Production Ready:**
- No breaking changes
- Backward compatible
- Optional field (cancelledAt)
- Configurable expiry time
- Comprehensive logging

---

*Implementation Date: January 7, 2026*  
*Docs Version: 1.0*  
*Policy: A (User-Friendly)*

