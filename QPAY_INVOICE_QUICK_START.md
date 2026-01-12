# QPay Invoice Creation - Quick Start Guide

## ✅ Implementation Complete!

QPay invoice creation with QR code generation has been integrated into the `seed-session` endpoint.

## 📁 What Was Added

### Files Modified

```
✏️  apps/order-service/src/payments/qpay.client.ts
    + createInvoiceSimple() method
    + QPayInvoiceSimpleRequest/Response interfaces

✏️  apps/order-service/src/controllers/order.controller.ts
    + Enhanced seedPaymentSessionInternal()
    + QPay invoice creation after session seed
    + Invoice data stored in Redis session

📄 QPAY_INVOICE_CREATION_IMPLEMENTATION.md (complete docs)
📄 QPAY_INVOICE_QUICK_START.md (this file)
🧪 test-qpay-invoice.sh (test script)
📝 test-qpay-invoice.json (test data)
```

## 🚀 Quick Test (1 minute)

### Prerequisites

```bash
# Set environment variables
export QPAY_CLIENT_ID=your_client_id
export QPAY_CLIENT_SECRET=your_secret
export QPAY_INVOICE_CODE=NOMAD_SHOP_INVOICE
export QPAY_CALLBACK_URL_BASE=http://localhost:8080
export QPAY_BASE_URL=https://merchant-sandbox.qpay.mn  # For testing
export REDIS_DATABASE_URI=redis://localhost:6379

# Ensure Redis is running
redis-cli ping
# Expected: PONG
```

### Run Test

```bash
cd /Users/user/Desktop/Final\ Project/eshop

# Start order service (if not running)
pnpm exec nx run order-service:serve:development &

# Run test script
./test-qpay-invoice.sh
```

### Expected Output

```
═══════════════════════════════════════════════
QPay Invoice Creation Test
═══════════════════════════════════════════════

✓ Order service is running
✓ QPAY_CLIENT_ID is set
✓ QPAY_INVOICE_CODE is set

Creating payment session + QPay invoice...

{
  "success": true,
  "sessionId": "test-qpay-1234567890",
  "ttlSec": 600,
  "invoice": {
    "invoiceId": "abc123def456",
    "qrText": "https://qpay.mn/abc123",
    "qrImage": "data:image/png;base64,iVBOR...",
    "shortUrl": "https://qpay.mn/s/abc",
    "deeplinks": [...]
  }
}

═══════════════════════════════════════════════
Results
═══════════════════════════════════════════════
✓ SUCCESS

Session ID: test-qpay-1234567890
Invoice ID: abc123def456
Payment URL: https://qpay.mn/s/abc

✓ QPay invoice created successfully
✓ QR code data included in response

✓ Session found in Redis
✓ Invoice data stored in session

Test completed successfully! 🎉
```

## 💻 Manual Test

### Using curl

```bash
curl -X POST http://localhost:6003/api/internal/payments/qpay/seed-session \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d @test-qpay-invoice.json | jq .
```

### Expected Response

```json
{
  "success": true,
  "sessionId": "test-qpay-invoice-001",
  "ttlSec": 600,
  "invoice": {
    "invoiceId": "qpay-invoice-id",
    "qrText": "https://qpay.mn/...",
    "qrImage": "data:image/png;base64,...",
    "shortUrl": "https://qpay.mn/short/...",
    "deeplinks": [...]
  }
}
```

## 🔧 How It Works

### Flow Diagram

```
Client Request
     │
     ▼
POST /api/internal/payments/qpay/seed-session
     │
     ├─> Validate request
     │
     ├─> Store session in Redis
     │
     ├─> Create QPay invoice
     │   │
     │   ├─> Get cached token (Redis)
     │   │
     │   ├─> Call QPay API
     │   │   POST /v2/invoice
     │   │   - invoice_code
     │   │   - sender_invoice_no (sanitized)
     │   │   - amount (MNT)
     │   │   - callback_url
     │   │
     │   └─> Receive QR data
     │       - invoice_id
     │       - qr_text
     │       - qr_image
     │       - qPay_shortUrl
     │
     ├─> Update Redis with invoice data
     │   - qpayInvoiceId
     │   - qpayQrText
     │   - qpayQrImage
     │   - qpayShortUrl
     │
     └─> Return to client
         - sessionId
         - invoice data
```

### Redis Session Structure

```json
{
  "userId": "user-123",
  "cart": [...],
  "sellers": [...],
  "totalAmount": 50000,
  "shippingAddressId": "...",
  "coupon": null,
  
  // New fields added by invoice creation
  "qpayInvoiceId": "abc123def456",
  "qpayQrText": "https://qpay.mn/abc123",
  "qpayQrImage": "data:image/png;base64,...",
  "qpayShortUrl": "https://qpay.mn/s/abc",
  "qpayDeeplinks": [...],
  "qpayCreatedAt": "2026-01-07T12:34:56.789Z"
}
```

## 🎯 Key Features

✅ **Automatic Invoice Creation**
   - Happens automatically when seeding session
   - No separate API call needed

✅ **QR Code Ready**
   - Base64 image returned
   - Ready to display to user
   - Can be scanned immediately

✅ **Short URL**
   - Easy payment link
   - Can be shared via SMS/email
   - Mobile-friendly

✅ **Deep Links**
   - Direct app integration
   - Better mobile UX
   - One-tap payment

✅ **Redis Caching**
   - Invoice data persisted
   - Available for webhook processing
   - TTL managed automatically

✅ **Error Handling**
   - Graceful failure
   - Session preserved
   - Clear error messages

## 🔍 Verify It Works

### Check Redis

```bash
# Get session
redis-cli GET "payment-session:test-qpay-invoice-001"

# Pretty print
redis-cli GET "payment-session:test-qpay-invoice-001" | jq .

# Check specific fields
redis-cli GET "payment-session:test-qpay-invoice-001" | jq '{
  invoiceId: .qpayInvoiceId,
  qrText: .qpayQrText,
  shortUrl: .qpayShortUrl,
  createdAt: .qpayCreatedAt
}'
```

### Test QR Code

1. **Copy QR image from response:**
   ```json
   "qrImage": "data:image/png;base64,iVBORw0KGgo..."
   ```

2. **Display in HTML:**
   ```html
   <img src="data:image/png;base64,iVBORw0KGgo..." alt="QPay QR Code" />
   ```

3. **Scan with QPay app** to verify payment screen

### Test Payment URL

```bash
# Open in browser
open "https://qpay.mn/s/abc"  # macOS
xdg-open "https://qpay.mn/s/abc"  # Linux
```

## 📱 Client Integration

### Display QR Code

```typescript
// Fetch invoice
const response = await fetch('/api/internal/payments/qpay/seed-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-request': 'true',
  },
  body: JSON.stringify({
    sessionData: {
      userId: user.id,
      cart: cart,
      sellers: sellers,
      totalAmount: total,
    },
  }),
});

const data = await response.json();

if (data.success && data.invoice) {
  // Option 1: Display QR code
  document.getElementById('qr-image').src = data.invoice.qrImage;
  
  // Option 2: Redirect to payment page
  window.location.href = data.invoice.shortUrl;
  
  // Option 3: Use deep link (mobile)
  if (isMobile && data.invoice.deeplinks?.length > 0) {
    window.location.href = data.invoice.deeplinks[0].link;
  }
}
```

### React Component

```tsx
function PaymentQRCode({ sessionData }) {
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function createInvoice() {
      try {
        const response = await fetch('/api/internal/payments/qpay/seed-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-request': 'true',
          },
          body: JSON.stringify({ sessionData }),
        });

        const data = await response.json();

        if (data.success) {
          setInvoice(data.invoice);
        } else {
          setError(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    createInvoice();
  }, [sessionData]);

  if (loading) return <div>Creating invoice...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!invoice) return null;

  return (
    <div className="payment-qr">
      <h3>Scan to Pay</h3>
      <img src={invoice.qrImage} alt="QPay QR Code" />
      <p>Amount: {sessionData.totalAmount} MNT</p>
      <a href={invoice.shortUrl} target="_blank">
        Or pay via browser →
      </a>
    </div>
  );
}
```

## 🐛 Troubleshooting

### "Failed to create QPay invoice: 401"

```bash
# Verify credentials
echo $QPAY_CLIENT_ID
echo $QPAY_CLIENT_SECRET

# Test token endpoint
curl -X POST https://merchant-sandbox.qpay.mn/v2/auth/token \
  -u "$QPAY_CLIENT_ID:$QPAY_CLIENT_SECRET"
```

### "Failed to create QPay invoice: 400"

Check:
- `QPAY_INVOICE_CODE` is correct and active
- `amount` is a valid positive number
- `callback_url` is well-formed

### No QR Code in Response

Check order-service logs:
```bash
# Look for
[QPay] Invoice created successfully
[QPay] Invoice created and stored in session

# Or errors
[QPay] Failed to create invoice
```

### Session Created but No Invoice Data

```bash
# Check Redis
redis-cli GET "payment-session:your-session-id" | jq .

# Look for qpayInvoiceCreateError field
redis-cli GET "payment-session:your-session-id" | jq .qpayInvoiceCreateError
```

## 📚 Complete Documentation

See `QPAY_INVOICE_CREATION_IMPLEMENTATION.md` for:
- Detailed API documentation
- Environment variables
- Error handling
- Security considerations
- Production deployment guide

## 🎉 You're Done!

The implementation is complete and ready to use:

✅ Invoice creation integrated into seed-session
✅ QR code data returned automatically
✅ Redis session enriched with invoice data
✅ Test script ready to run
✅ Client integration examples provided

**Test it now:**
```bash
./test-qpay-invoice.sh
```

**Next step:** Integrate QR code display into your frontend! 🚀

