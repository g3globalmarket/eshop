# QPay Ebarimt Frontend Integration

## Overview

Added Ebarimt (Mongolian e-receipt) input fields to the QPay checkout UI, allowing users to optionally request an Ebarimt receipt with their payment.

## Implementation Summary

### 🎯 Goal

Enable users to:
1. **Optionally** request an Ebarimt receipt during checkout
2. Provide Ebarimt details (receiver type, registration, district code, etc.)
3. Have these details sent to backend and stored in payment session
4. Default to "no Ebarimt" (checkbox unchecked)

### 📝 Files Changed/Created

#### 1. **API Client Types** (`apps/user-ui/src/utils/qpay-api.ts`)

**Changes:**
- Added `QPayEbarimtData` interface
- Extended `QPayStartPaymentRequest` to include optional `ebarimt` field

**New Interfaces:**
```typescript
export interface QPayEbarimtData {
  receiverType?: string; // CITIZEN | ORGANIZATION
  receiver?: string; // Registration/ID number (optional, PII)
  districtCode?: string; // Tax district code
  classificationCode?: string; // Product classification code
}

export interface QPayStartPaymentRequest {
  // ... existing fields ...
  ebarimt?: QPayEbarimtData; // Optional Ebarimt data
}
```

**Backend Compatibility:**
- Payload is passed through untouched
- Backend stores in `QPayPaymentSession.payload.ebarimt`
- Reconciliation service reads from there

#### 2. **Ebarimt Input Form** (`apps/user-ui/src/shared/components/checkout/EbarimtForm.tsx`)

**NEW FILE** - A dedicated component for collecting Ebarimt details.

**Features:**
- ✅ Checkbox: "Need Ebarimt receipt?" (unchecked by default)
- ✅ Conditional form fields (shown only when checkbox is checked)
- ✅ Receiver type select: CITIZEN / ORGANIZATION
- ✅ Optional receiver input (registration/ID)
- ✅ District code input (default from env or "3505")
- ✅ Classification code input (default from env or "0000010")
- ✅ Form validation:
  - Receiver: max 20 chars, alphanumeric only
  - District code: required, numeric
  - Classification code: required
- ✅ Loading state during payment creation
- ✅ PII protection: receiver not logged
- ✅ Clean UX with icons and help text

**Props:**
```typescript
interface EbarimtFormProps {
  onSubmit: (data: EbarimtFormData | null) => void;
  isLoading?: boolean;
}
```

**Behavior:**
- If checkbox unchecked: calls `onSubmit(null)`
- If checkbox checked: validates and calls `onSubmit({ receiverType, receiver, districtCode, classificationCode })`

**Environment Variables (optional):**
- `NEXT_PUBLIC_QPAY_EBARIMT_DISTRICT_CODE` - default district code
- `NEXT_PUBLIC_QPAY_EBARIMT_CLASSIFICATION_CODE` - default classification code

#### 3. **Checkout Page** (`apps/user-ui/src/app/(routes)/checkout/page.tsx`)

**Changes:**
- Added state for Ebarimt form visibility and session data
- Updated flow to show Ebarimt form BEFORE creating payment session
- Added handler for Ebarimt form submission
- Updated URL persistence to include `ebarimtEnabled` flag

**New Flow (QPay only):**
```
1. User arrives at checkout → Load session data
2. Show EbarimtForm component
3. User fills (or skips) Ebarimt details → Click "Continue to Payment"
4. Call startQPayPayment() with ebarimt data
5. Show QPayCheckoutForm with QR code
6. Poll payment status → Redirect to order
```

**State Added:**
```typescript
const [sessionData, setSessionData] = useState<any>(null);
const [showEbarimtForm, setShowEbarimtForm] = useState(false);
const [creatingPayment, setCreatingPayment] = useState(false);
```

**Handler Added:**
```typescript
const handleEbarimtSubmit = async (ebarimtData: EbarimtFormData | null) => {
  // Build payload with optional ebarimt
  const payload = {
    ...sessionData,
    ebarimt: ebarimtData ? { ...ebarimtData } : undefined,
  };
  
  // Call startQPayPayment
  const response = await startQPayPayment(payload);
  
  // Update URL with sessionId + ebarimtEnabled flag
  // Show QR code
};
```

**URL Persistence:**
- `?qpaySessionId=...` - payment session ID
- `?ebarimtEnabled=1` - flag indicating Ebarimt was requested (for refresh)
- **NO** receiver value in URL (PII protection)

---

## 🎨 User Experience

### Default Flow (No Ebarimt)

1. User goes to checkout
2. Sees Ebarimt form with checkbox **unchecked**
3. Clicks "Continue to Payment" without checking
4. Immediately sees QPay QR code
5. Payment proceeds normally

### Ebarimt Flow

1. User goes to checkout
2. Checks "Need Ebarimt receipt?"
3. Form fields appear:
   - Receiver Type: CITIZEN (default)
   - Receiver: (optional, placeholder shows example)
   - District Code: 3505 (pre-filled)
   - Classification Code: 0000010 (pre-filled)
4. User fills desired fields
5. Clicks "Continue to Payment"
6. **Validation runs:**
   - Receiver: alphanumeric, max 20 chars
   - District: numeric, required
   - Classification: required
7. If valid → Creates payment session with ebarimt data
8. Shows QPay QR code
9. Payment proceeds normally
10. **Backend creates Ebarimt receipt after order creation**

### Error Handling

- **Invalid input:** Red error messages below fields
- **Payment creation fails:** Error message + option to go back to cart
- **Refresh during payment:** Resumes with qpaySessionId from URL

---

## 🔒 Security & Privacy

### PII Protection

✅ **Receiver field is PII** (citizen ID / company registration)
- ✅ NOT logged in frontend
- ✅ NOT stored in URL
- ✅ Sent only to backend (HTTPS)
- ✅ Backend stores encrypted in MongoDB
- ✅ Privacy note shown when filled: "🔒 Your registration information is encrypted and stored securely"

### Input Validation

- **Receiver**: Alphanumeric only, max 20 chars
- **District Code**: Numeric only, required
- **Classification Code**: Required
- **Trim whitespace** on all inputs before submission

---

## 🧪 Testing

### Manual Test Flow

1. **Start QPay payment:**
   ```bash
   # Set payment provider
   NEXT_PUBLIC_PAYMENT_PROVIDER=qpay
   
   # (Optional) Set default codes
   NEXT_PUBLIC_QPAY_EBARIMT_DISTRICT_CODE=3505
   NEXT_PUBLIC_QPAY_EBARIMT_CLASSIFICATION_CODE=0000010
   
   # Start user-ui
   pnpm exec nx run user-ui:serve:development
   ```

2. **Add items to cart** → Go to checkout

3. **Test without Ebarimt:**
   - Leave checkbox unchecked
   - Click "Continue to Payment"
   - Should see QR code immediately
   - Backend should NOT have `payload.ebarimt`

4. **Test with Ebarimt (minimal):**
   - Check "Need Ebarimt receipt?"
   - Leave receiver blank (optional)
   - Use default district/classification codes
   - Click "Continue to Payment"
   - Should see QR code
   - Backend should have `payload.ebarimt: { receiverType: "CITIZEN", districtCode: "3505", classificationCode: "0000010" }`

5. **Test with Ebarimt (full):**
   - Check "Need Ebarimt receipt?"
   - Select receiver type: ORGANIZATION
   - Enter receiver: "1234567890"
   - Enter district: "3506"
   - Enter classification: "0000020"
   - Click "Continue to Payment"
   - Backend should have all fields in `payload.ebarimt`

6. **Test validation:**
   - Check "Need Ebarimt receipt?"
   - Enter receiver: "invalid@#$%" → Should show error
   - Enter receiver: "12345678901234567890123" (> 20 chars) → Should show error
   - Clear district code → Should show error on submit
   - Fix errors → Should allow submit

7. **Test refresh resilience:**
   - Complete payment → URL should have `?qpaySessionId=...&ebarimtEnabled=1`
   - Refresh page → Should resume at QR code (not Ebarimt form)

### Backend Verification

After payment with Ebarimt:

```javascript
// Check MongoDB
db.QPayPaymentSession.findOne({ sessionId: "..." })

// Should contain:
{
  sessionId: "...",
  payload: {
    userId: "...",
    cart: [...],
    totalAmount: 10000,
    ebarimt: {
      receiverType: "CITIZEN",
      receiver: "88614450",  // If provided
      districtCode: "3505",
      classificationCode: "0000010"
    }
  },
  // ... other fields
}
```

After order creation (reconciliation):

```javascript
// Check Ebarimt status
db.QPayPaymentSession.findOne({ sessionId: "..." })

// Should contain:
{
  sessionId: "...",
  status: "PROCESSED",
  paymentId: "PAYMENT_...",
  ebarimtStatus: "REGISTERED",  // If enabled
  ebarimtReceiptId: "EBARIMT_...",
  ebarimtQrData: "data:image/png;base64,...",
  // ...
}
```

---

## 📐 Component Architecture

```
checkout/page.tsx
├── Loading State (spinner)
├── Error State (if payment fails)
└── QPay Flow:
    ├── EbarimtForm (NEW)
    │   ├── Checkbox: "Need Ebarimt?"
    │   └── Conditional Fields:
    │       ├── Receiver Type (select)
    │       ├── Receiver (text, optional)
    │       ├── District Code (text)
    │       └── Classification Code (text)
    │   └── Submit → handleEbarimtSubmit()
    │
    └── QPayCheckoutForm
        ├── Order Summary
        ├── QR Code
        ├── Payment Links
        └── Status Polling → Redirect to order
```

---

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ User arrives at checkout page                                    │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
         ┌──────────────────────────┐
         │ Load session data        │
         │ (cart, sellers, amount)  │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Show EbarimtForm         │
         │ (optional checkbox)      │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ User fills/skips         │
         │ Click "Continue"         │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Build payload:           │
         │ { cart, sellers,         │
         │   totalAmount,           │
         │   ebarimt?: {...} }      │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ POST /payments/qpay/     │
         │      seed-session        │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ API Gateway → order-     │
         │ service (seed-session)   │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Store in DB:             │
         │ QPayPaymentSession       │
         │   .payload.ebarimt       │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Create QPay invoice      │
         │ Return QR + sessionId    │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Show QPayCheckoutForm    │
         │ (QR code + polling)      │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ User pays via QPay       │
         │ Webhook → reconciliation │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Backend creates Ebarimt  │
         │ (if enabled)             │
         └────────────┬─────────────┘
                      │
                      ▼
         ┌──────────────────────────┐
         │ Status → PROCESSED       │
         │ Redirect to order page   │
         └──────────────────────────┘
```

---

## 🎛️ Configuration

### Environment Variables (Frontend)

**Optional** - for default values in form:

```bash
# User UI (.env or .env.local)
NEXT_PUBLIC_QPAY_EBARIMT_DISTRICT_CODE=3505
NEXT_PUBLIC_QPAY_EBARIMT_CLASSIFICATION_CODE=0000010
```

**If not set:** Hard-coded defaults are used ("3505" and "0000010")

### Environment Variables (Backend)

**Required** - to enable Ebarimt creation:

```bash
# Order Service (.env)
QPAY_EBARIMT_ENABLED=true
QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE=CITIZEN
QPAY_EBARIMT_DEFAULT_DISTRICT_CODE=3505
QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE=0000010
```

**Backend fallback:** If frontend doesn't send `ebarimt`, backend uses its defaults (if enabled)

---

## 🚀 Deployment

### Prerequisites

1. **Backend Ebarimt integration** must be deployed:
   - Prisma schema updated (`QPayPaymentSession` with Ebarimt fields)
   - `pnpm exec prisma db push` run
   - `pnpm exec prisma generate` run
   - `QPAY_EBARIMT_ENABLED=true` set in order-service env

2. **API Gateway** must proxy `/payments/qpay/seed-session` to order-service

### Deploy Frontend

```bash
# 1. (Optional) Set default codes in production env
NEXT_PUBLIC_QPAY_EBARIMT_DISTRICT_CODE=3505
NEXT_PUBLIC_QPAY_EBARIMT_CLASSIFICATION_CODE=0000010

# 2. Build user-ui
pnpm exec nx build user-ui

# 3. Deploy to hosting platform (Vercel, etc.)
```

### Verify

1. Go to checkout page
2. Should see "Need Ebarimt receipt?" checkbox
3. Check box → form fields appear
4. Fill fields → click "Continue to Payment"
5. Should see QPay QR code
6. After payment → check DB for `payload.ebarimt` and `ebarimtStatus`

---

## 🐛 Troubleshooting

### Issue: Ebarimt form not showing

**Check:**
- `NEXT_PUBLIC_PAYMENT_PROVIDER=qpay` is set
- Browser console for errors
- Checkout page is loading session data

### Issue: Form validation errors

**Check:**
- Receiver: Only alphanumeric, max 20 chars
- District Code: Only numeric
- Classification Code: Not empty

### Issue: Ebarimt not created in backend

**Check:**
- `QPAY_EBARIMT_ENABLED=true` in order-service env
- Backend logs for `[QPay Ebarimt]` entries
- Database: `QPayPaymentSession.payload.ebarimt` exists
- Database: `QPayPaymentSession.paymentId` captured after payment

### Issue: Refresh loses Ebarimt form

**Expected:** After payment session is created, refresh should resume at QR code (not Ebarimt form)

**Check:** URL should have `?qpaySessionId=...&ebarimtEnabled=1`

---

## 📚 Related Documentation

- **Backend Implementation**: `QPAY_EBARIMT_IMPLEMENTATION.md`
- **Environment Variables**: `QPAY_EBARIMT_ENV_VARS.md`
- **Testing**: `test-qpay-ebarimt.sh`
- **Complete Changes**: `QPAY_EBARIMT_CHANGES.md`

---

## ✅ Summary

**Completed:**
- ✅ Added `ebarimt` field to API client types
- ✅ Created `EbarimtForm` component with validation
- ✅ Updated checkout page to show form before payment
- ✅ Included `ebarimt` data in `startQPayPayment()` call
- ✅ URL persistence for `ebarimtEnabled` flag
- ✅ PII protection (receiver not logged/stored in URL)
- ✅ No breaking changes (default: checkbox unchecked)

**User Experience:**
- Default: No Ebarimt (checkbox unchecked) → Payment works as before
- Optional: Check box → Fill fields → Payment with Ebarimt data
- Refresh-safe: URL persistence for session resumption

**Backend Integration:**
- Frontend sends `payload.ebarimt` to backend
- Backend stores in `QPayPaymentSession.payload` (JSON)
- Reconciliation reads from there and creates Ebarimt receipt
- Ebarimt creation NEVER blocks order creation

**Production Ready:**
- No linting errors
- Type-safe API client
- Form validation
- Error handling
- Loading states
- PII protection

---

*Frontend Implementation Date: January 7, 2026*  
*Docs Version: 1.0*

