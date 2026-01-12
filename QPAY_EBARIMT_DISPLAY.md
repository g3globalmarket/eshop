# QPay Ebarimt Receipt Display - Implementation Summary

## Overview

Added Ebarimt (Mongolian tax receipt) display functionality to the order success/details page. Users can now view their Ebarimt receipt info, including QR code and receipt ID, after completing a QPay payment.

## Implementation Complete

### 🎯 Goal Achieved

Users can now:
1. **View Ebarimt receipt** on order success page
2. **Copy receipt ID** to clipboard
3. **View QR code** and open in new tab
4. **See status** of receipt creation (REGISTERED, ERROR, or pending)
5. **Refresh** receipt info to check for updates

## 📝 Files Changed/Created

### Backend Changes

#### 1. Order Service Controller (`apps/order-service/src/controllers/order.controller.ts`)

**New Function**: `getQPayEbarimtInfo`

**Features:**
- Fetches Ebarimt info from `QPayPaymentSession` by `sessionId`
- JWT authentication required (via API Gateway)
- Ownership verification (session belongs to requesting user)
- Returns safe fields only (NO PII - receiver field excluded)
- Works for both internal (testing) and public (gateway) requests

**Response:**
```json
{
  "ok": true,
  "sessionId": "...",
  "status": "PROCESSED",
  "invoiceId": "...",
  "paymentId": "...",
  "ebarimt": {
    "status": "REGISTERED",
    "receiptId": "EBARIMT_12345",
    "qrData": "data:image/png;base64,...",
    "createdAt": "2026-01-07T...",
    "lastError": null
  }
}
```

#### 2. Order Service Routes (`apps/order-service/src/routes/order.route.ts`)

**New Routes:**
- `GET /api/internal/payments/qpay/ebarimt` - Internal endpoint (testing/admin)
- `GET /api/payments/qpay/ebarimt` - Public endpoint (JWT required)

#### 3. API Gateway (`apps/api-gateway/src/(routes)/qpay.ts`)

**New Endpoint**: `GET /payments/qpay/ebarimt?sessionId=...`

**Features:**
- Proxies to order-service
- Forwards authentication headers/cookies
- JWT required
- 10-second timeout
- Pass-through response

### Frontend Changes

#### 4. API Client (`apps/user-ui/src/utils/qpay-api.ts`)

**New Function**: `getQPayEbarimtInfo(sessionId: string)`

**Features:**
- Calls gateway endpoint
- Returns typed response
- Graceful error handling (returns failed state instead of throwing)

**New Interfaces:**
- `QPayEbarimtResponse` - Response type for Ebarimt info

#### 5. Ebarimt Display Component (`apps/user-ui/src/shared/components/order/EbarimtReceipt.tsx`) - **NEW**

**Features:**
- Auto-fetches Ebarimt info on mount
- Displays different states:
  - **REGISTERED**: Shows receipt ID, QR code, copy/open buttons
  - **ERROR**: Shows error message + retry info
  - **null/pending**: Shows "being generated" message
  - **SKIPPED**: Hides component (no Ebarimt requested)
- Copy receipt ID to clipboard
- Open QR in new tab
- Refresh button to check for updates
- Loading and error states
- Responsive design

**Props:**
```typescript
interface EbarimtReceiptProps {
  sessionId: string;
  autoFetch?: boolean; // Auto-fetch on mount (default: true)
}
```

#### 6. Checkout Form (`apps/user-ui/src/shared/components/checkout/qpayCheckoutForm.tsx`)

**Changed:**
- Updated redirect URL to include `qpaySessionId` query parameter
- Now redirects to: `/order/{orderId}?qpaySessionId={sessionId}`

#### 7. Order Details Page (`apps/user-ui/src/app/(routes)/order/[orderId]/page.tsx`)

**Changed:**
- Reads `qpaySessionId` from query parameters
- Imports and renders `EbarimtReceipt` component
- Shows Ebarimt section between shipping info and order items

---

## 🎨 User Experience

### Order Success Flow (QPay Payment)

1. User completes payment via QPay
2. Payment status polling detects "PROCESSED"
3. Redirects to: `/order/{orderId}?qpaySessionId={sessionId}`
4. Order page loads and displays:
   - Order details
   - Delivery status
   - Shipping address
   - **Ebarimt Receipt section** (NEW)
   - Order items

### Ebarimt Display States

#### 1. Receipt Created (REGISTERED)

```
┌─────────────────────────────────────────────────────┐
│ 📄 Ebarimt (Tax Receipt)            [Refresh 🔄]   │
├─────────────────────────────────────────────────────┤
│ ✅ Receipt created successfully                     │
│    Your tax receipt has been registered with the    │
│    Mongolian tax authority                          │
│                                                      │
│ Receipt ID                                          │
│ ┌───────────────────────────────┐  [Copy 📋]       │
│ │ EBARIMT_12345                 │                  │
│ └───────────────────────────────┘                  │
│                                                      │
│ Receipt QR Code                                     │
│ ┌─────────┐  Scan this QR code to view your        │
│ │ [QR]    │  receipt details                        │
│ │         │  [Open QR in New Tab]                   │
│ └─────────┘                                         │
│                                                      │
│ Created: Jan 7, 2026, 12:34:56 PM                   │
└─────────────────────────────────────────────────────┘
```

#### 2. Receipt Creation Failed (ERROR)

```
┌─────────────────────────────────────────────────────┐
│ 📄 Ebarimt (Tax Receipt)            [Refresh 🔄]   │
├─────────────────────────────────────────────────────┤
│ ⚠️  Receipt creation failed                         │
│    We will retry automatically. If the issue        │
│    persists, please contact support.                │
│                                                      │
│    QPay Ebarimt creation failed: 400 Invalid...    │
│                                                      │
│ ⏳ Retrying automatically...                        │
└─────────────────────────────────────────────────────┘
```

#### 3. Receipt Being Generated (null status)

```
┌─────────────────────────────────────────────────────┐
│ 📄 Ebarimt (Tax Receipt)            [Refresh 🔄]   │
├─────────────────────────────────────────────────────┤
│ ⏳ Receipt is being generated...                    │
│                                                      │
│ Your receipt will be available shortly. This page   │
│ will update automatically.                          │
└─────────────────────────────────────────────────────┘
```

#### 4. No Ebarimt Requested (SKIPPED or null)

Component is not rendered at all.

---

## 🔄 Data Flow

```
Order Page (with qpaySessionId)
    ↓
EbarimtReceipt Component
    ↓
getQPayEbarimtInfo(sessionId)
    ↓
API Gateway: GET /payments/qpay/ebarimt?sessionId=...
    ↓
Order Service: GET /api/payments/qpay/ebarimt?sessionId=...
    ↓
Load QPayPaymentSession from MongoDB
    ↓
Verify Ownership (userId matches)
    ↓
Return Safe Fields (NO receiver PII)
    ↓
Frontend displays:
  - Receipt ID (with copy button)
  - QR code (with open button)
  - Status message
  - Created date
```

---

## 🔒 Security & Privacy

### PII Protection

✅ **Receiver field is PII** (citizen ID / company registration)
- ✅ NEVER returned by API endpoint
- ✅ Excluded from `getQPayEbarimtInfo` response
- ✅ Only stored encrypted in MongoDB
- ✅ No way for frontend to access it

### Ownership Verification

✅ **Session ownership enforced**
- JWT authentication required
- `userId` extracted from JWT
- Verified against `QPayPaymentSession.userId`
- 403 error if mismatch

### Data Returned

**Safe fields (returned):**
- `sessionId`
- `status` (PENDING, PAID, PROCESSED)
- `invoiceId`
- `paymentId`
- `ebarimt.status` (REGISTERED, ERROR, SKIPPED)
- `ebarimt.receiptId`
- `ebarimt.qrData`
- `ebarimt.createdAt`
- `ebarimt.lastError`

**Excluded (never returned):**
- `payload.ebarimt.receiver` (PII)
- `payload.ebarimt.receiverType` (not needed for display)
- `payload.ebarimt.districtCode` (not needed for display)
- `payload.ebarimt.classificationCode` (not needed for display)

---

## 🧪 Testing

### Manual Test Flow

1. **Complete QPay payment with Ebarimt:**
   ```bash
   # Start services
   pnpm exec nx run user-ui:serve:development
   pnpm exec nx run order-service:serve:development
   pnpm exec nx run api-gateway:serve:development
   
   # Enable Ebarimt
   export QPAY_EBARIMT_ENABLED=true
   ```

2. **Add items to cart** → Go to checkout

3. **Check "Need Ebarimt receipt?"** → Fill details → Continue to Payment

4. **Complete payment** via QPay

5. **Wait for reconciliation** (up to 60 seconds)
   - Reconciliation creates Ebarimt receipt

6. **View order page**:
   - Should see "Ebarimt (Tax Receipt)" section
   - If receipt created: Shows receipt ID + QR code
   - If still pending: Shows "being generated" message
   - If error: Shows error message + retry info

7. **Test features**:
   - Click "Copy" → Receipt ID copied to clipboard
   - Click "Open QR in New Tab" → QR opens in new window
   - Click "Refresh" → Re-fetches latest data

### API Test

```bash
# Get Ebarimt info (with JWT token)
curl -H "Authorization: Bearer <token>" \
  "http://localhost:8080/payments/qpay/ebarimt?sessionId=<sessionId>"

# Expected response:
{
  "ok": true,
  "sessionId": "...",
  "status": "PROCESSED",
  "invoiceId": "...",
  "paymentId": "...",
  "ebarimt": {
    "status": "REGISTERED",
    "receiptId": "EBARIMT_12345",
    "qrData": "data:image/png;base64,...",
    "createdAt": "2026-01-07T12:34:56Z",
    "lastError": null
  }
}
```

---

## 🚀 Deployment

### Prerequisites

1. **Ebarimt backend integration** must be deployed:
   - Prisma schema updated with Ebarimt fields
   - `QPAY_EBARIMT_ENABLED=true` in order-service
   - Reconciliation service running

2. **Database has Ebarimt data**:
   - `QPayPaymentSession` has `ebarimtStatus`, `ebarimtReceiptId`, `ebarimtQrData`

### Deploy Steps

```bash
# 1. No new env vars needed (uses existing JWT auth)

# 2. Build services
pnpm exec nx build order-service
pnpm exec nx build api-gateway
pnpm exec nx build user-ui

# 3. Deploy all three services

# 4. Verify endpoint is accessible
curl -H "Authorization: Bearer <token>" \
  "https://your-domain.com/payments/qpay/ebarimt?sessionId=<sessionId>"
```

### Verify

1. Complete a QPay payment with Ebarimt
2. Go to order page
3. Should see Ebarimt section with receipt info
4. Test copy/open QR buttons
5. Test refresh button

---

## 🐛 Troubleshooting

### Issue: Ebarimt section not showing

**Check:**
- `qpaySessionId` in URL: `/order/{orderId}?qpaySessionId=...`
- Payment was completed via QPay (not Stripe)
- Ebarimt was requested during checkout (checkbox checked)
- Browser console for errors

### Issue: Shows "being generated" forever

**Check:**
- `QPAY_EBARIMT_ENABLED=true` in order-service env
- Reconciliation service is running
- Database: `QPayPaymentSession.paymentId` exists
- Database: `QPayPaymentSession.ebarimtStatus` field
- Backend logs for `[QPay Ebarimt]` entries

### Issue: 403 Forbidden error

**Check:**
- User is logged in (JWT token valid)
- Session belongs to current user
- API Gateway is forwarding auth headers correctly

### Issue: QR image not loading

**Check:**
- `ebarimtQrData` is valid base64 or URL
- Browser console for image load errors
- Check response in network tab

---

## 📊 Monitoring

### Backend Logs

**Key markers:**
- `[QPay Ebarimt] Getting Ebarimt info` - Request received
- `[QPay Ebarimt] Ebarimt info retrieved` - Success
- `[QPay Ebarimt] Session not found` - Invalid sessionId
- `[QPay Ebarimt] Ownership violation attempt` - Security issue

### Database Queries

```javascript
// Find sessions with Ebarimt receipts
db.QPayPaymentSession.find({
  ebarimtStatus: "REGISTERED",
  ebarimtReceiptId: { $ne: null }
})

// Find sessions with Ebarimt errors
db.QPayPaymentSession.find({
  ebarimtStatus: "ERROR",
  ebarimtLastError: { $exists: true }
})
```

---

## 🎛️ Configuration

### No New Environment Variables

Uses existing configuration:
- **Backend**: `QPAY_EBARIMT_ENABLED` (already exists)
- **Auth**: JWT authentication (already configured)
- **No frontend env vars needed**

---

## ✅ Summary

**Completed:**
- ✅ Backend endpoint to fetch Ebarimt info by sessionId
- ✅ API Gateway proxy with JWT auth
- ✅ Frontend API client function
- ✅ Ebarimt display component with all states
- ✅ Integration in order details page
- ✅ Copy/open QR functionality
- ✅ Refresh button
- ✅ PII protection (receiver not returned)
- ✅ Ownership verification
- ✅ Responsive UI design

**User Experience:**
- Receipt info displayed on order success page
- Copy receipt ID to clipboard
- Open QR in new tab
- Refresh to check for updates
- Error messages with retry info
- "Being generated" message for pending receipts

**Security:**
- JWT authentication required
- Ownership verification enforced
- PII (receiver) never exposed
- Safe fields only returned

**Production Ready:**
- No linting errors (after `prisma generate`)
- Type-safe API
- Error handling
- Loading states
- Graceful fallbacks

---

*Implementation Date: January 7, 2026*  
*Docs Version: 1.0*

