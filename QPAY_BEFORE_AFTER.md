# QPay Payment Flow: Before vs After

## ❌ BEFORE (Insecure - Trust Webhook Payload)

```
┌─────────────────────────────────────────────────────────────┐
│                     Webhook Received                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│            Extract: invoiceId, status, payload              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│               Load session from Redis                       │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│         ⚠️  Check if payload.status === "paid"  ⚠️          │
│         (TRUST WEBHOOK PAYLOAD - INSECURE!)                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
                       ✅ "paid"?
                           ↓
┌─────────────────────────────────────────────────────────────┐
│              🚨 CREATE ORDERS IMMEDIATELY 🚨                │
│                  (NO VERIFICATION!)                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   Return 200 OK                             │
└─────────────────────────────────────────────────────────────┘
```

### 🚨 Security Issues:
1. **Trusts webhook payload** - Can be replayed or spoofed
2. **No payment verification** - Never checks with QPay if payment actually happened
3. **No amount verification** - Doesn't verify paid amount matches expected amount
4. **Race conditions** - Multiple webhooks could create duplicate orders
5. **Weak idempotency** - Only checks Redis session (which expires)

---

## ✅ AFTER (Secure - Verify via QPay API)

```
┌─────────────────────────────────────────────────────────────┐
│                     Webhook Received                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│   🔒 Step 1: Idempotency Check (Database - Persistent)     │
│   Check QPayProcessedInvoice.findUnique({ invoiceId })     │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    Already exists?
                    ↙           ↘
               YES ✋          NO 👍
                  ↓               ↓
     ┌─────────────────┐   ┌──────────────────────────────────┐
     │ Return 200:     │   │ Step 2: Load Redis Session      │
     │ DUPLICATE       │   │ (includes qpayInvoiceId)         │
     │ (with orderIds) │   └──────────────────────────────────┘
     └─────────────────┘                  ↓
                              ┌──────────────────────────────────┐
                              │ Step 3: Verify Invoice ID Match  │
                              │ (webhook ID === session ID)      │
                              └──────────────────────────────────┘
                                          ↓
                              ┌──────────────────────────────────┐
                              │ ⭐ Step 4: PAYMENT VERIFICATION ⭐│
                              │                                  │
                              │ Call QPay API:                   │
                              │ POST /v2/payment/check           │
                              │ {                                │
                              │   object_type: "INVOICE",        │
                              │   object_id: invoiceId           │
                              │ }                                │
                              │                                  │
                              │ 🎯 THIS IS THE SOURCE OF TRUTH 🎯│
                              └──────────────────────────────────┘
                                          ↓
                              ┌──────────────────────────────────┐
                              │ Step 5: Verify Response:         │
                              │ ✓ payment_status === "PAID"      │
                              │ ✓ paid_amount === expected       │
                              │   (with <1 MNT tolerance)        │
                              └──────────────────────────────────┘
                                          ↓
                                   Verified? ✓
                                  ↙          ↘
                         YES 🎉          NO 🛑
                            ↓               ↓
            ┌────────────────────────┐  ┌─────────────────────┐
            │ Step 6: CREATE ORDER   │  │ Return 200:         │
            │ (Race-safe with DB     │  │ NOT_PAID or         │
            │  unique constraint)    │  │ AMOUNT_MISMATCH     │
            ├────────────────────────┤  │ (Don't create order)│
            │ 1. Create              │  └─────────────────────┘
            │    QPayProcessedInvoice│
            │ 2. Create orders       │
            │ 3. Update with orderIds│
            └────────────────────────┘
                       ↓
            ┌────────────────────────┐
            │ Return 200:            │
            │ processed: true        │
            │ orderIds: [...]        │
            └────────────────────────┘
```

### ✅ Security Features:
1. **✓ Idempotency-first** - Check database BEFORE Redis (survives expiry)
2. **✓ Payment verification via API** - Always calls QPay to verify payment
3. **✓ Amount verification** - Compares paid_amount with expected amount
4. **✓ Invoice ID matching** - Ensures webhook matches stored invoice
5. **✓ Race-safe order creation** - Uses unique constraint as distributed lock
6. **✓ Never trust webhook payload** - Only uses it to trigger verification
7. **✓ Persistent idempotency** - Database record never expires

---

## 🔍 Key Differences Table

| Aspect | ❌ Before | ✅ After |
|--------|----------|---------|
| **Payment Verification** | ❌ None - trusts webhook | ✅ Calls QPay API (`/v2/payment/check`) |
| **Source of Truth** | ❌ Webhook payload | ✅ QPay API response |
| **Amount Verification** | ❌ None | ✅ Compares paid vs expected |
| **Idempotency Check** | ❌ After session check | ✅ FIRST (before everything) |
| **Idempotency Storage** | ❌ Redis (expires) | ✅ Database (persistent) |
| **Race Condition Safety** | ❌ Weak | ✅ Strong (unique constraint) |
| **Invoice ID Verification** | ❌ None | ✅ Matches webhook vs session |
| **Security Level** | 🚨 Low | 🔒 High |

---

## 📊 Response Examples

### Scenario 1: First Webhook (Customer Paid)

**BEFORE**:
```json
{
  "success": true,
  "processed": true,
  "invoiceId": "INV_123",
  "sessionId": "sess-abc",
  "orderIds": ["order-1"]
}
```
**Issue**: ❌ Never verified payment actually happened

**AFTER**:
```json
{
  "success": true,
  "processed": true,
  "invoiceId": "INV_123",
  "sessionId": "sess-abc",
  "orderIds": ["order-1"],
  "paidAmount": 340000
}
```
**Improvement**: ✅ Payment verified via QPay API, amount confirmed

---

### Scenario 2: Duplicate Webhook

**BEFORE**:
```json
{
  "success": true,
  "processed": false,
  "reason": "SESSION_MISSING"
}
```
**Issue**: ❌ Can't detect duplicate if Redis session expired (creates duplicate orders!)

**AFTER**:
```json
{
  "success": true,
  "processed": false,
  "reason": "DUPLICATE",
  "invoiceId": "INV_123",
  "sessionId": "sess-abc",
  "orderIds": ["order-1"],
  "processedAt": "2024-01-07T10:30:00Z"
}
```
**Improvement**: ✅ Database-backed idempotency, returns existing orderIds

---

### Scenario 3: Customer Didn't Actually Pay

**BEFORE**:
```json
{
  "success": true,
  "processed": true,
  "orderIds": ["order-1"]
}
```
**Issue**: ❌ Creates order even if payment failed (trusts webhook payload!)

**AFTER**:
```json
{
  "success": true,
  "processed": false,
  "reason": "NOT_PAID",
  "isPaid": false,
  "paidAmount": 0,
  "expectedAmountMnt": 340000,
  "invoiceId": "INV_123",
  "sessionId": "sess-abc"
}
```
**Improvement**: ✅ Verifies via API, doesn't create order if not paid

---

### Scenario 4: Amount Mismatch (Partial Payment)

**BEFORE**:
```json
{
  "success": true,
  "processed": true,
  "orderIds": ["order-1"]
}
```
**Issue**: ❌ Creates order even if customer paid wrong amount

**AFTER**:
```json
{
  "success": true,
  "processed": false,
  "reason": "AMOUNT_MISMATCH",
  "isPaid": true,
  "paidAmount": 100000,
  "expectedAmountMnt": 340000,
  "invoiceId": "INV_123",
  "sessionId": "sess-abc"
}
```
**Improvement**: ✅ Detects amount mismatch, doesn't create order

---

## 🎯 Summary

### BEFORE Implementation Issues:
1. 🚨 **Security Risk**: Trusted webhook payload (can be forged)
2. 🚨 **No Verification**: Never checked with QPay if payment actually happened
3. 🚨 **Duplicate Orders**: Weak idempotency (Redis expires)
4. 🚨 **No Amount Check**: Could create order for wrong amount
5. 🚨 **Race Conditions**: Multiple webhooks could create multiple orders

### AFTER Implementation Benefits:
1. ✅ **Secure**: Always verifies via QPay API (source of truth)
2. ✅ **Accurate**: Checks payment_status and paid_amount
3. ✅ **Idempotent**: Database-backed, survives Redis expiry
4. ✅ **Race-Safe**: Unique constraint prevents duplicates
5. ✅ **Reliable**: Returns existing orderIds for duplicates
6. ✅ **Best Practice**: Follows QPay recommended flow

---

## 🏆 Compliance with QPay Best Practices

| Best Practice | Before | After |
|---------------|--------|-------|
| Verify payment via API | ❌ No | ✅ Yes |
| Check payment_status | ❌ No | ✅ Yes |
| Verify paid_amount | ❌ No | ✅ Yes |
| Implement idempotency | ⚠️ Weak | ✅ Strong |
| Handle webhook retries | ⚠️ Partial | ✅ Complete |
| Secure webhook endpoint | ✅ Yes | ✅ Yes (unchanged) |

---

**Recommendation**: 🚀 **Use AFTER implementation** for production. The BEFORE implementation has critical security and reliability issues that could lead to:
- Fraudulent orders (forged webhooks)
- Duplicate orders (weak idempotency)
- Wrong amount orders (no verification)

The AFTER implementation is production-ready and follows QPay's documented best practices.

