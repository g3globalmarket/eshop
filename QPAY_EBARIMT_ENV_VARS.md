# QPay Ebarimt Environment Variables

## Overview
These environment variables control the QPay Ebarimt (Mongolian e-receipt) integration. Ebarimt creation is **optional** and **never blocks order creation**.

## Required Environment Variables

### QPAY_EBARIMT_ENABLED
- **Type**: `boolean` (string "true" or "false")
- **Default**: `false`
- **Description**: Master switch to enable/disable Ebarimt creation
- **Example**: `QPAY_EBARIMT_ENABLED=true`

## Optional Environment Variables (with defaults)

### QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE
- **Type**: `string`
- **Default**: `CITIZEN`
- **Valid values**: `CITIZEN`, `BUSINESS`
- **Description**: Default receiver type for Ebarimt receipts
- **Example**: `QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE=CITIZEN`
- **Note**: Can be overridden per-session by including `ebarimt.receiverType` in session payload

### QPAY_EBARIMT_DEFAULT_DISTRICT_CODE
- **Type**: `string`
- **Default**: `3505`
- **Description**: Tax district code for Ebarimt (Mongolian tax authority code)
- **Example**: `QPAY_EBARIMT_DEFAULT_DISTRICT_CODE=3505`
- **Note**: Can be overridden per-session by including `ebarimt.districtCode` in session payload

### QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE
- **Type**: `string`
- **Default**: `0000010`
- **Description**: Product classification code for Ebarimt
- **Example**: `QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE=0000010`
- **Note**: Can be overridden per-session by including `ebarimt.classificationCode` in session payload

## Per-Session Overrides

You can override default Ebarimt parameters per payment session by including an `ebarimt` object in the session payload:

```json
{
  "userId": "...",
  "cart": [...],
  "sellers": [...],
  "totalAmount": 10000,
  "ebarimt": {
    "receiverType": "BUSINESS",
    "receiver": "1234567890",  // Optional: registration number or citizen ID
    "districtCode": "3506",
    "classificationCode": "0000020"
  }
}
```

## Security Notes

- **DO NOT log** the `ebarimt_receiver` field (PII - personal identification)
- Ebarimt creation errors are logged but **never block** order creation
- Failed Ebarimt attempts are stored in `QPayPaymentSession.ebarimtLastError` for retry/debugging

## Database Fields

When Ebarimt is created, the following fields are populated in `QPayPaymentSession`:

- `paymentId` - QPay payment_id (required for Ebarimt)
- `ebarimtStatus` - `REGISTERED` | `ERROR` | `SKIPPED`
- `ebarimtReceiptId` - Receipt ID from QPay
- `ebarimtQrData` - QR code data for the receipt
- `ebarimtRaw` - Full response from QPay (JSON)
- `ebarimtLastError` - Error message if creation failed
- `ebarimtCreatedAt` - Timestamp of successful creation

## When is Ebarimt Created?

1. **Reconciliation Loop** (primary): After payment is verified as PAID and order is created
2. **Webhook** (future): Could be added to webhook handler after order creation
3. **Retry**: The reconciliation loop will retry failed Ebarimt creation on subsequent runs

## Testing

### Enable Ebarimt in Development
```bash
export QPAY_EBARIMT_ENABLED=true
export QPAY_EBARIMT_DEFAULT_RECEIVER_TYPE=CITIZEN
export QPAY_EBARIMT_DEFAULT_DISTRICT_CODE=3505
export QPAY_EBARIMT_DEFAULT_CLASSIFICATION_CODE=0000010
```

### Check Ebarimt Status
```javascript
// Query session
const session = await prisma.qPayPaymentSession.findUnique({
  where: { sessionId: "..." }
});

console.log({
  paymentId: session.paymentId,
  ebarimtStatus: session.ebarimtStatus,
  ebarimtReceiptId: session.ebarimtReceiptId,
  ebarimtQrData: session.ebarimtQrData,
  ebarimtLastError: session.ebarimtLastError,
});
```

## API Endpoint

QPay Ebarimt V3 endpoint:
- **URL**: `POST /v2/ebarimt_v3/create`
- **Auth**: Bearer token (same as invoice/payment APIs)
- **Docs**: See QPay V2 API documentation

## Example Response

Successful Ebarimt creation:
```json
{
  "ebarimt_receipt_id": "EBARIMT_12345",
  "ebarimt_qr_data": "data:image/png;base64,...",
  "barimt_status": "REGISTERED",
  "status": "success"
}
```

## Troubleshooting

### Ebarimt not created
- Check `QPAY_EBARIMT_ENABLED=true`
- Verify `paymentId` is captured (should be stored after payment verification)
- Check `ebarimtLastError` in database for error details
- Ensure reconciliation loop is running (logs: `[QPay Reconcile]`)

### Ebarimt creation fails
- Check QPay API credentials are valid
- Verify district/classification codes are valid for your QPay account
- Check logs for `[QPay Ebarimt]` entries
- Errors are stored in `ebarimtLastError` field

### Orders not created due to Ebarimt error
- **This should NEVER happen** - Ebarimt creation is designed to never block order creation
- If orders are not created, the issue is elsewhere (not Ebarimt-related)

