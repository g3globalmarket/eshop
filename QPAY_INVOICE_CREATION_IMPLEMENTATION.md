# QPay Invoice Creation with QR Code - Implementation Complete ✅

## Summary

Implemented QPay V2 invoice creation with QR code generation, integrated into the `seed-session` endpoint for testing and development.

## What Was Implemented

### 1. New QPay Client Method (`createInvoiceSimple`)

**Location:** `apps/order-service/src/payments/qpay.client.ts`

**Method Signature:**
```typescript
async createInvoiceSimple(input: {
  sessionId: string;
  userId: string;
  amount: number; // Amount in MNT (Mongolian Tugrik)
  description?: string;
}): Promise<QPayInvoiceSimpleResponse>
```

**Features:**
- ✅ Uses cached Bearer token from `QPayAuthService`
- ✅ Sanitizes `sender_invoice_no` (alphanumeric only)
- ✅ Auto-generates callback URL with sessionId
- ✅ Returns full QR code data
- ✅ Comprehensive error handling

**Request Fields:**
```typescript
{
  invoice_code: QPAY_INVOICE_CODE,        // From env
  sender_invoice_no: sanitized_sessionId, // Alphanumeric only
  invoice_receiver_code: userId,          // User identifier
  invoice_description: "Order ...",       // Human-readable
  amount: totalAmount,                    // In MNT
  callback_url: "http://...callback"      // Webhook URL
}
```

**Response:**
```typescript
{
  invoice_id: string;      // QPay invoice ID
  qr_text: string;         // QR code text (for generation)
  qr_image: string;        // Base64 QR image
  qPay_shortUrl: string;   // Short URL for payment
  qPay_deeplink?: Array;   // Deep links for mobile apps
}
```

### 2. Enhanced seed-session Endpoint

**Location:** `apps/order-service/src/controllers/order.controller.ts`
**Route:** `POST /api/internal/payments/qpay/seed-session`

**New Flow:**
```
1. Validate request (x-internal-request header + sessionData)
2. Generate/use provided sessionId
3. Store initial session in Redis
4. Create QPay invoice via createInvoiceSimple()
5. Enrich Redis session with invoice data:
   - qpayInvoiceId
   - qpayQrText
   - qpayQrImage
   - qpayShortUrl
   - qpayDeeplinks
   - qpayCreatedAt
6. Return QR data to client
```

**Request Body:**
```json
{
  "sessionId": "optional-custom-id",
  "ttlSec": 600,
  "sessionData": {
    "userId": "user-123",
    "cart": [...],
    "sellers": [...],
    "totalAmount": 50000
  }
}
```

**Success Response:**
```json
{
  "success": true,
  "sessionId": "session-abc-123",
  "ttlSec": 600,
  "invoice": {
    "invoiceId": "qpay-invoice-456",
    "qrText": "https://qpay.mn/...",
    "qrImage": "data:image/png;base64,...",
    "shortUrl": "https://qpay.mn/short/abc",
    "deeplinks": [...]
  }
}
```

**Error Response (Invoice Creation Failed):**
```json
{
  "success": false,
  "error": "Failed to create QPay invoice",
  "details": "QPay invoice creation failed: 401 Unauthorized",
  "sessionId": "session-abc-123",
  "ttlSec": 600
}
```

### 3. Redis Session Schema (Enhanced)

**Key:** `payment-session:<sessionId>`

**Original Fields:**
```json
{
  "userId": "string",
  "cart": [...],
  "sellers": [...],
  "totalAmount": number,
  "shippingAddressId": "string",
  "coupon": null
}
```

**New Fields (Added by Invoice Creation):**
```json
{
  ...original fields,
  "qpayInvoiceId": "string",
  "qpayQrText": "string",
  "qpayQrImage": "string (base64)",
  "qpayShortUrl": "string",
  "qpayDeeplinks": [...],
  "qpayCreatedAt": "ISO 8601 timestamp"
}
```

**On Error:**
```json
{
  ...original fields,
  "qpayInvoiceCreateError": "error message"
}
```

## Environment Variables

### Required

```bash
# Already configured
QPAY_CLIENT_ID=your_client_id
QPAY_CLIENT_SECRET=your_client_secret
QPAY_INVOICE_CODE=NOMAD_SHOP_INVOICE

# New (for callback URL)
QPAY_CALLBACK_URL_BASE=https://your-domain.com
# OR for local testing:
QPAY_CALLBACK_URL_BASE=http://localhost:8080

# Optional
QPAY_BASE_URL=https://merchant.qpay.mn  # Default (production)
# For sandbox: https://merchant-sandbox.qpay.mn
```

### Callback URL Format

The callback URL is automatically constructed as:
```
${QPAY_CALLBACK_URL_BASE}/payments/qpay/callback?sessionId=${sessionId}
```

Example:
```
https://your-domain.com/payments/qpay/callback?sessionId=abc-123
```

**Important:** This URL must be publicly accessible for QPay to send payment notifications!

## Usage Example

### Seed Session with QPay Invoice

```bash
curl -X POST http://localhost:6003/api/internal/payments/qpay/seed-session \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d '{
    "sessionId": "test-session-001",
    "ttlSec": 600,
    "sessionData": {
      "userId": "user-123",
      "cart": [
        {
          "productId": "507f1f77bcf86cd799439011",
          "name": "Test Product",
          "quantity": 1,
          "price": 50000,
          "selectedOptions": []
        }
      ],
      "sellers": [
        {
          "sellerId": "507f1f77bcf86cd799439012",
          "items": [
            {
              "productId": "507f1f77bcf86cd799439011",
              "shopId": "507f1f77bcf86cd799439013",
              "quantity": 1,
              "price": 50000,
              "selectedOptions": []
            }
          ]
        }
      ],
      "totalAmount": 50000,
      "shippingAddressId": "507f1f77bcf86cd799439014",
      "coupon": null
    }
  }'
```

### Expected Response

```json
{
  "success": true,
  "sessionId": "test-session-001",
  "ttlSec": 600,
  "invoice": {
    "invoiceId": "abc123def456",
    "qrText": "https://qpay.mn/abc123",
    "qrImage": "data:image/png;base64,iVBORw0KGgoAAAANSUh...",
    "shortUrl": "https://qpay.mn/s/abc",
    "deeplinks": [
      {
        "name": "QPay",
        "link": "qpay://payment/abc123"
      }
    ]
  }
}
```

### Client-Side Usage

```typescript
// Seed session and get QR code
const response = await fetch('/api/internal/payments/qpay/seed-session', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-request': 'true',
  },
  body: JSON.stringify({
    sessionData: {
      userId: currentUser.id,
      cart: cartItems,
      sellers: sellerGroups,
      totalAmount: calculateTotal(),
    },
  }),
});

const data = await response.json();

if (data.success && data.invoice) {
  // Display QR code
  showQRCode(data.invoice.qrImage);
  
  // Or redirect to payment URL
  window.location.href = data.invoice.shortUrl;
  
  // Or use deeplinks for mobile
  if (isMobile) {
    window.location.href = data.invoice.deeplinks[0].link;
  }
}
```

## Error Handling

### Invoice Creation Failures

```typescript
try {
  const invoice = await qpayClient.createInvoiceSimple({...});
} catch (error) {
  // Errors are logged and stored in Redis session
  // Returns 500 with error details
  // Session is preserved with error flag
}
```

**Possible Errors:**
- Invalid credentials (401)
- Invalid invoice_code (400)
- Network timeout
- QPay API downtime

### Graceful Degradation

If invoice creation fails:
1. ✅ Session still created in Redis
2. ✅ Error logged with full context
3. ✅ Error stored in session (`qpayInvoiceCreateError`)
4. ✅ Client receives clear error message
5. ❌ No invoice data returned

Client should handle:
```typescript
if (!data.success) {
  // Retry or show alternative payment method
  console.error('QPay invoice creation failed:', data.details);
}
```

## sender_invoice_no Sanitization

QPay requires `sender_invoice_no` to be alphanumeric only (no special characters).

**Implementation:**
```typescript
const sanitizedInvoiceNo = sessionId.replace(/[^a-zA-Z0-9]/g, "");
```

**Examples:**
```
session-abc-123  →  sessionabc123
test_session_001 →  testsession001
my-order-#456    →  myorder456
```

## Security Considerations

✅ **Protected Endpoint**
- Requires `x-internal-request: true` header
- Not exposed to public internet
- Only for internal/testing use

✅ **No Secrets Logged**
- Bearer token not logged
- Only invoice_id and sessionId logged

✅ **Callback URL Validation**
- Must be publicly accessible
- Should use HTTPS in production
- Consider IP whitelisting for QPay callbacks

## Testing

### Quick Test

```bash
# Set environment
export QPAY_CLIENT_ID=your_id
export QPAY_CLIENT_SECRET=your_secret
export QPAY_INVOICE_CODE=NOMAD_SHOP_INVOICE
export QPAY_CALLBACK_URL_BASE=http://localhost:8080
export QPAY_BASE_URL=https://merchant-sandbox.qpay.mn

# Start order-service
pnpm exec nx run order-service:serve:development

# Seed session (in another terminal)
curl -X POST http://localhost:6003/api/internal/payments/qpay/seed-session \
  -H "Content-Type: application/json" \
  -H "x-internal-request: true" \
  -d @test-session.json
```

### Verify in Redis

```bash
# Check session data
redis-cli GET "payment-session:test-session-001" | jq .

# Should include:
# - qpayInvoiceId
# - qpayQrText
# - qpayQrImage
# - qpayShortUrl
# - qpayCreatedAt
```

### Test QR Code

1. Copy `qrImage` from response (base64)
2. Paste into HTML: `<img src="data:image/png;base64,..." />`
3. Scan with QPay app
4. Verify payment screen shows correct amount

## Integration with Existing Flow

### Before (Manual Testing)

```
1. Seed session manually
2. Get invoiceId from somewhere else
3. Test webhook separately
```

### After (Automated)

```
1. Seed session → QPay invoice created automatically
2. Invoice data stored in Redis
3. QR code ready for display/scanning
4. Webhook configured automatically
5. End-to-end testable
```

## Production Deployment

### Checklist

- [ ] Set `QPAY_BASE_URL=https://merchant.qpay.mn` (production)
- [ ] Set `QPAY_INVOICE_CODE` to production value
- [ ] Set `QPAY_CALLBACK_URL_BASE` to public HTTPS URL
- [ ] Verify callback URL is accessible from internet
- [ ] Test with real QPay app
- [ ] Monitor invoice creation logs
- [ ] Set up alerts for failures

### Monitoring

Watch for these log messages:
```
[QPay] Seeded payment session
[QPay] Invoice created successfully
[QPay] Invoice created and stored in session
```

Errors:
```
[QPay] Failed to create invoice
QPay invoice creation failed: <status> <message>
```

## Files Modified

```
Modified:
  ✏️  apps/order-service/src/payments/qpay.client.ts
      + Added createInvoiceSimple() method
      + Added QPayInvoiceSimpleRequest/Response interfaces

  ✏️  apps/order-service/src/controllers/order.controller.ts
      + Enhanced seedPaymentSessionInternal()
      + Invoice creation after session seed
      + Enriched Redis session with invoice data
      + Error handling for invoice failures

Created:
  ✨ QPAY_INVOICE_CREATION_IMPLEMENTATION.md
      - This documentation
```

## Next Steps

1. **Integrate with Frontend**
   - Display QR code to user
   - Add payment status polling
   - Handle payment success/failure

2. **Enhance Error Handling**
   - Retry logic for transient failures
   - Fallback payment methods
   - User-friendly error messages

3. **Add Monitoring**
   - Track invoice creation success rate
   - Alert on repeated failures
   - Monitor callback webhook delivery

## Troubleshooting

### "Failed to create QPay invoice: 401"

```bash
# Check credentials
echo $QPAY_CLIENT_ID
echo $QPAY_CLIENT_SECRET

# Verify token works
curl -X POST https://merchant-sandbox.qpay.mn/v2/auth/token \
  -u "$QPAY_CLIENT_ID:$QPAY_CLIENT_SECRET"
```

### "Failed to create QPay invoice: 400 Bad Request"

Check:
- `QPAY_INVOICE_CODE` is correct
- `sender_invoice_no` is alphanumeric (sanitization should handle this)
- `amount` is a valid number
- `callback_url` is well-formed

### Invoice Created but QR Not Working

Verify:
- QR code scans correctly
- QPay app is installed
- Test with QPay sandbox app first
- Check invoice expiry time

### Callback URL Not Reachable

```bash
# Test from external network
curl -I https://your-domain.com/payments/qpay/callback

# Should return 2xx or 4xx (not connection refused)
```

---

**Status:** ✅ Complete and Ready for Testing
**Implementation Date:** January 2026
**Dependencies:** QPay V2 Token Auth Service (already implemented)
**Breaking Changes:** ❌ None - Additive only

