# QPay Migration Plan

**Date:** 2025-01-05  
**Purpose:** Minimal, safe migration plan from Stripe to QPay  
**Approach:** Design-only, zero code changes, provider abstraction layer

## Migration Strategy

### Phase 1: Preparation (No Code Changes)

1. **Research QPay API**
   - Identify QPay product/service to use (Invoice API, QR Payment, etc.)
   - Document QPay webhook/callback format
   - Document QPay signature verification method
   - Document QPay seller/merchant onboarding process

2. **Design Provider Adapter**
   - Create adapter interface (see `PAYMENT_CONTRACT.md`)
   - Design QPay adapter implementation
   - Design feature flag mechanism

3. **Environment Setup**
   - Obtain QPay API credentials
   - Set up QPay webhook endpoint
   - Configure QPay merchant accounts

### Phase 2: Implementation (Minimal Changes)

1. **Backend Adapter Layer**
   - Create `packages/libs/payments/` package
   - Implement `PaymentProvider` interface
   - Implement `StripeAdapter` (wraps existing code)
   - Implement `QPayAdapter` (new implementation)

2. **Service Updates**
   - Update `order-service` to use adapter
   - Update `auth-service` to use adapter
   - Update `product-service` to use adapter
   - Add feature flag: `PAYMENT_PROVIDER=stripe|qpay`

3. **Frontend Updates**
   - Replace Stripe.js with QPay SDK (if available)
   - Update checkout form to use QPay components
   - Keep success page unchanged

4. **Database Migration**
   - Rename `sellers.stripeId` → `sellers.providerAccountId`
   - Add `orders.paymentProvider` field (optional)
   - Add `orders.paymentId` field (optional)

### Phase 3: Testing & Rollout

1. **Testing**
   - Test QPay adapter in development
   - Test webhook/callback handling
   - Test seller onboarding flow
   - Test payment flow end-to-end

2. **Gradual Rollout**
   - Deploy with feature flag `PAYMENT_PROVIDER=stripe` (default)
   - Test QPay with small subset of users
   - Monitor errors and performance
   - Gradually increase QPay usage

3. **Full Migration**
   - Switch default to `PAYMENT_PROVIDER=qpay`
   - Monitor for issues
   - Keep Stripe adapter as fallback

## Suggested QPay Integration Shape

### Backend Endpoints (Unchanged)

All existing endpoints remain unchanged. Only internal implementation changes:

- `POST /order/api/create-payment-intent` - Creates QPay invoice/QR instead of Stripe PaymentIntent
- `POST /order/api/create-order` - Handles QPay callback instead of Stripe webhook
- `POST /auth/api/create-stripe-link` - Creates QPay merchant account (endpoint name may change)
- `GET /product/api/get-stripe-account` - Retrieves QPay merchant info (endpoint name may change)

### QPay Adapter Methods

Based on `PAYMENT_CONTRACT.md`, the QPay adapter must implement:

```typescript
interface PaymentProvider {
  // Create payment intent/invoice
  createPayment(input: {
    sessionId: string;
    userId: string;
    amount: number; // In dollars
    currency?: string; // Default: "usd"
    sellerAccountId: string; // QPay merchant ID
    platformFeePercent?: number; // Default: 10%
    metadata?: Record<string, string>;
  }): Promise<{
    provider: "qpay";
    paymentId: string; // QPay invoice ID
    clientSecret: string; // Invoice ID or QR code data
    providerRef?: string;
  }>;

  // Handle webhook/callback
  handleWebhook(input: {
    rawBody: Buffer | string;
    headers: Record<string, string | string[]>;
    webhookSecret: string;
  }): Promise<{
    provider: "qpay";
    type: string; // e.g., "payment.succeeded"
    paymentId?: string;
    sessionId?: string; // From metadata
    userId?: string; // From metadata
    status?: string; // e.g., "succeeded", "failed"
    amount?: number;
    currency?: string;
    providerRef?: string;
    rawEventId?: string; // For idempotency
  }>;

  // Create seller onboarding link
  createSellerOnboardingLink(input: {
    sellerId: string;
    sellerEmail: string;
    country: string; // ISO country code
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{
    provider: "qpay";
    accountId: string; // QPay merchant ID
    onboardingUrl: string;
    providerRef?: string;
  }>;

  // Retrieve seller account information
  getSellerAccount(input: { accountId: string }): Promise<{
    provider: "qpay";
    accountId: string;
    email?: string;
    businessName?: string;
    country?: string;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
    dashboardUrl?: string;
    lastPayout?: Date;
    providerRef?: string;
  }>;
}
```

### QPay API Mapping (Hypothetical)

**Note:** Actual QPay API endpoints and methods need to be confirmed with QPay documentation.

| Stripe API Call | QPay Equivalent (Hypothetical) | Notes |
|----------------|--------------------------------|-------|
| `stripe.paymentIntents.create()` | `qpay.invoice.create()` or `qpay.qr.create()` | Create invoice/QR code |
| `stripe.webhooks.constructEvent()` | `qpay.webhook.verify()` | Verify callback signature |
| `stripe.accounts.create()` | `qpay.merchant.create()` | Create merchant account |
| `stripe.accountLinks.create()` | `qpay.merchant.onboard()` | Generate onboarding URL |
| `stripe.accounts.retrieve()` | `qpay.merchant.get()` | Get merchant details |
| `stripe.payouts.list()` | `qpay.payout.list()` | List payouts |

## Environment Variables

### New Variables (QPay)

| Variable | Purpose | Example Format | Notes |
|----------|---------|----------------|-------|
| `PAYMENT_PROVIDER` | Provider selection | `stripe` or `qpay` | Feature flag |
| `QPAY_SECRET_KEY` | QPay API secret key | `qpay_sk_...` | Server-side only |
| `QPAY_WEBHOOK_SECRET` | QPay webhook secret | `whsec_...` | For callback verification |
| `QPAY_MERCHANT_ID` | Platform merchant ID | `merchant_...` | For platform fees |
| `NEXT_PUBLIC_QPAY_PUBLIC_KEY` | QPay public key | `qpay_pk_...` | Client-side (if QPay has SDK) |
| `QPAY_API_BASE_URL` | QPay API base URL | `https://api.qpay.mn` | API endpoint |
| `QPAY_CURRENCY` | Default currency | `USD` or `MNT` | Currency code |
| `USD_TO_MNT_RATE` | Exchange rate | `3400` | If conversion needed |

### Existing Variables (Stripe)

| Variable | Status | Notes |
|----------|--------|-------|
| `STRIPE_SECRET_KEY` | Keep | For Stripe adapter |
| `STRIPE_WEBHOOK_SECRET` | Keep | For Stripe adapter |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | Keep | For Stripe adapter |

### Feature Flag Configuration

**Recommended Approach:**
```bash
# .env
PAYMENT_PROVIDER=stripe  # or "qpay"
```

**Service-Level Configuration:**
- `order-service`: Uses `PAYMENT_PROVIDER` to select adapter
- `auth-service`: Uses `PAYMENT_PROVIDER` to select adapter
- `product-service`: Uses `PAYMENT_PROVIDER` to select adapter

**Frontend Configuration:**
- `user-ui`: Uses `PAYMENT_PROVIDER` to load correct SDK
- `seller-ui`: Uses `PAYMENT_PROVIDER` to show correct branding

## Suggested Code Structure

### Package: `packages/libs/payments/`

```
packages/libs/payments/
├── index.ts                 # Export adapter interface and factory
├── PaymentProvider.ts       # Interface definition
├── adapters/
│   ├── StripeAdapter.ts    # Stripe implementation (wraps existing code)
│   └── QPayAdapter.ts      # QPay implementation (new)
└── factory.ts              # Factory function to create adapter based on env
```

### Factory Pattern

```typescript
// packages/libs/payments/factory.ts
export function createPaymentProvider(): PaymentProvider {
  const provider = process.env.PAYMENT_PROVIDER || 'stripe';
  
  switch (provider) {
    case 'stripe':
      return new StripeAdapter();
    case 'qpay':
      return new QPayAdapter();
    default:
      throw new Error(`Unknown payment provider: ${provider}`);
  }
}
```

### Service Usage

```typescript
// apps/order-service/src/controllers/order.controller.ts
import { createPaymentProvider } from '@packages/libs/payments';

const paymentProvider = createPaymentProvider();

export const createPaymentIntent = async (req: any, res: Response, next: NextFunction) => {
  const { amount, sellerStripeAccountId, sessionId } = req.body;
  
  const result = await paymentProvider.createPayment({
    sessionId,
    userId: req.user.id,
    amount,
    sellerAccountId: sellerStripeAccountId,
    platformFeePercent: 0.1,
  });
  
  res.send({ clientSecret: result.clientSecret });
};
```

## Risks & Mitigation

### 1. Callback Verification

**Risk:** QPay callback signature verification may differ from Stripe's method.

**Mitigation:**
- Research QPay webhook signature algorithm
- Implement signature verification in QPay adapter
- Test signature verification thoroughly
- Add logging for signature verification failures

**Diagnostic Step:**
- Review QPay webhook documentation
- Test webhook signature verification in sandbox

---

### 2. Idempotency

**Risk:** QPay may not provide idempotency keys like Stripe. Duplicate webhooks may create duplicate orders.

**Mitigation:**
- Store QPay payment ID in database (`orders.paymentId`)
- Check for existing order with same `paymentId` before creating
- Use `rawEventId` from webhook for idempotency check
- Implement idempotency check in webhook handler

**Current State:**
- Stripe implementation lacks explicit idempotency keys
- Risk exists in current system

**Diagnostic Step:**
- Review QPay webhook documentation for idempotency guarantees
- Implement idempotency check using payment ID

---

### 3. Currency & Amount Rounding

**Risk:** QPay may use MNT (Mongolian Tugrik) instead of USD. Conversion and rounding may cause discrepancies.

**Mitigation:**
- Determine QPay's supported currencies
- If MNT required, implement USD → MNT conversion
- Use real-time exchange rate API or fixed rate
- Round amounts appropriately (MNT has no decimals)
- Store original USD amount in database
- Store converted MNT amount in payment metadata

**Diagnostic Step:**
- Confirm QPay currency requirements
- Research exchange rate API or manual rate updates
- Test currency conversion accuracy

---

### 4. Refunds & Cancellations

**Risk:** QPay refund API may differ from Stripe. Current system has no refund functionality.

**Mitigation:**
- Research QPay refund API
- Implement refund endpoint in QPay adapter
- Add refund functionality to order-service
- Test refund flow thoroughly

**Current State:**
- No refund functionality exists (Stripe or QPay)
- Manual refunds required via provider dashboard

**Diagnostic Step:**
- Review QPay refund API documentation
- Design refund endpoint contract
- Implement refund functionality (future enhancement)

---

### 5. Timeout & Expiry

**Risk:** QPay invoices/QR codes may have different expiry times than Stripe PaymentIntents.

**Mitigation:**
- Research QPay invoice/QR expiry times
- Align Redis session TTL with QPay expiry
- Handle expired payments gracefully
- Notify user if payment expires

**Current State:**
- Redis session TTL: 10 minutes
- Stripe PaymentIntent expiry: Not explicitly set

**Diagnostic Step:**
- Confirm QPay invoice/QR expiry times
- Adjust session TTL if needed
- Test expired payment handling

---

### 6. Replay Attacks

**Risk:** Malicious actors may replay QPay webhooks to create duplicate orders.

**Mitigation:**
- Implement webhook signature verification (required)
- Implement idempotency checks (required)
- Store webhook event IDs in database
- Reject duplicate webhook events
- Add rate limiting to webhook endpoint

**Current State:**
- Stripe webhook signature verification implemented
- Idempotency checks missing (risk exists)

**Diagnostic Step:**
- Review QPay webhook security best practices
- Implement idempotency checks
- Add webhook event ID tracking

---

### 7. Seller Payouts (Marketplace)

**Risk:** QPay may not support marketplace/split payments like Stripe Connect.

**Mitigation:**
- Research QPay marketplace/split payment support
- If not supported, implement manual payout process
- Create payout management system
- Notify sellers of payout status

**Current State:**
- Stripe Connect handles automatic payouts
- Platform fee: 10% (hardcoded)

**Diagnostic Step:**
- Confirm QPay marketplace payment support
- Design payout process if manual required
- Implement payout management (if needed)

---

### 8. Frontend SDK Availability

**Risk:** QPay may not have a client-side SDK like Stripe.js.

**Mitigation:**
- Research QPay client-side SDK availability
- If no SDK, implement server-side payment flow
- Use redirect-based payment (like PayPal)
- Or use QR code display (scan to pay)

**Current State:**
- Stripe.js used for client-side payment
- PaymentElement for form rendering

**Diagnostic Step:**
- Review QPay integration options
- Choose integration method (SDK, redirect, QR code)
- Update frontend accordingly

---

### 9. Testing & Sandbox

**Risk:** QPay sandbox/test environment may differ from production.

**Mitigation:**
- Obtain QPay sandbox credentials
- Test all flows in sandbox first
- Document differences between sandbox and production
- Test webhook delivery in sandbox

**Diagnostic Step:**
- Request QPay sandbox access
- Test payment flow in sandbox
- Test webhook delivery in sandbox

---

### 10. Data Migration

**Risk:** Existing Stripe data (seller accounts, payment IDs) needs migration.

**Mitigation:**
- Keep Stripe adapter active during migration
- Migrate sellers gradually (update `providerAccountId`)
- Keep historical orders linked to Stripe
- Add `paymentProvider` field to track provider per order

**Diagnostic Step:**
- Design data migration script
- Test migration on staging data
- Plan gradual seller migration

## Migration Checklist

### Pre-Migration

- [ ] Research QPay API documentation
- [ ] Obtain QPay API credentials (sandbox + production)
- [ ] Set up QPay webhook endpoint
- [ ] Test QPay API calls in sandbox
- [ ] Design QPay adapter interface
- [ ] Create feature flag mechanism

### Implementation

- [ ] Create `packages/libs/payments/` package
- [ ] Implement `PaymentProvider` interface
- [ ] Implement `StripeAdapter` (wrap existing code)
- [ ] Implement `QPayAdapter` (new code)
- [ ] Update `order-service` to use adapter
- [ ] Update `auth-service` to use adapter
- [ ] Update `product-service` to use adapter
- [ ] Update frontend to use QPay SDK/components
- [ ] Add environment variables
- [ ] Add feature flag configuration

### Testing

- [ ] Test QPay payment flow in sandbox
- [ ] Test QPay webhook/callback handling
- [ ] Test seller onboarding flow
- [ ] Test currency conversion (if needed)
- [ ] Test idempotency checks
- [ ] Test error handling
- [ ] Test session expiration
- [ ] Test webhook signature verification

### Deployment

- [ ] Deploy with `PAYMENT_PROVIDER=stripe` (default)
- [ ] Test QPay with small subset of users
- [ ] Monitor errors and performance
- [ ] Gradually increase QPay usage
- [ ] Switch default to `PAYMENT_PROVIDER=qpay`
- [ ] Monitor for issues
- [ ] Keep Stripe adapter as fallback

### Post-Migration

- [ ] Migrate seller accounts to QPay
- [ ] Update database schema (rename fields)
- [ ] Update API response field names
- [ ] Remove Stripe adapter (optional, after full migration)
- [ ] Update documentation

## Open Questions for Human Review

1. **QPay Product Selection:** Which QPay product/service will be used?
   - Invoice API?
   - QR Payment?
   - Other?

2. **Currency Requirements:** Does QPay support USD, or must we convert to MNT?
   - If MNT required, what exchange rate source?
   - Real-time API or fixed rate?
   - Who manages rate updates?

3. **Marketplace Support:** Does QPay support marketplace/split payments like Stripe Connect?
   - Automatic seller payouts?
   - Platform fee handling?
   - Or manual payout process required?

4. **Frontend Integration:** What is the recommended QPay frontend integration method?
   - Client-side SDK (like Stripe.js)?
   - Redirect-based payment?
   - QR code display?
   - Server-side only?

5. **Webhook Format:** What is QPay's webhook/callback format?
   - JSON structure?
   - Signature verification method?
   - Event types?
   - Idempotency guarantees?

6. **Seller Onboarding:** What is QPay's seller/merchant onboarding process?
   - API-based account creation?
   - Manual approval required?
   - Onboarding URL generation?
   - KYC/documentation requirements?

7. **Testing Environment:** Is QPay sandbox/test environment available?
   - How to obtain sandbox credentials?
   - Differences from production?
   - Webhook testing capabilities?

8. **Refund Support:** Does QPay support refunds?
   - API-based refunds?
   - Partial refunds?
   - Refund timeframes?

9. **Payout Schedule:** What is QPay's payout schedule?
   - Daily, weekly, monthly?
   - Minimum payout amount?
   - Payout fees?

10. **Support & Documentation:** What QPay support resources are available?
    - API documentation?
    - Support contact?
    - Integration guides?
    - Code examples?

## Next Steps

1. **Answer open questions** - Gather QPay API documentation and requirements
2. **Design QPay adapter** - Create detailed adapter implementation plan
3. **Create feature flag** - Implement provider selection mechanism
4. **Implement QPay adapter** - Build QPay integration
5. **Test thoroughly** - Test all flows in sandbox
6. **Deploy gradually** - Roll out QPay with feature flag
7. **Monitor & iterate** - Monitor errors and performance

## References

- `STRIPE_INVENTORY.md` - Complete Stripe touchpoints inventory
- `PAYMENT_CONTRACT.md` - Provider-agnostic payment contract
- `docs/payments/stripe-audit.md` - Existing Stripe audit documentation

