# Stripe Touchpoints Inventory

**Date:** 2025-01-05  
**Purpose:** Complete mapping of all Stripe integration points for QPay migration planning  
**Scope:** Backend services, frontend applications, configuration, and infrastructure

## Summary

- **Total Files:** 27 files across 5 services and 2 frontend applications
- **Backend Services:** 3 services (order-service, auth-service, product-service)
- **Frontend Applications:** 2 apps (user-ui, seller-ui)
- **Stripe API Objects Used:** PaymentIntent, Account, AccountLink, Webhook Events, Payouts
- **Environment Variables:** 3 required (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLIC_KEY)

## Backend Services

### Order Service (`apps/order-service/`)

**Purpose:** Payment processing, PaymentIntent creation, webhook handling, order creation

| File | Component | Purpose | Stripe Object Used | Notes |
|------|-----------|---------|-------------------|-------|
| `src/controllers/order.controller.ts` | `createPaymentIntent()` | Creates Stripe PaymentIntent with Connect transfer | `stripe.paymentIntents.create()` | Platform fee: 10%, currency: USD, metadata: sessionId, userId |
| `src/controllers/order.controller.ts` | `createOrder()` | Handles Stripe webhook events | `stripe.webhooks.constructEvent()`, `payment_intent.succeeded` | Signature verification, order creation trigger |
| `src/routes/order.route.ts` | Route registration | `POST /create-payment-intent` | N/A | Protected by `isAuthenticated` middleware |
| `src/main.ts` | Webhook endpoint | `POST /api/create-order` | Raw body parser for signature verification | No authentication (webhook endpoint) |
| `package.json` | Dependencies | Stripe SDK | `stripe@^12.0.0` | API version: `2025-02-24.acacia` |

**Key Features:**
- Payment Intent creation with platform fee (10%) and Connect destination transfer
- Webhook signature verification using `STRIPE_WEBHOOK_SECRET`
- Order creation triggered by `payment_intent.succeeded` webhook
- Redis session management (10-minute TTL)
- Product stock updates, analytics, email notifications

**Stripe API Calls:**
1. `stripe.paymentIntents.create()` - Creates payment intent with:
   - `amount` (in cents)
   - `currency: "usd"`
   - `application_fee_amount` (10% platform fee)
   - `transfer_data.destination` (seller Stripe Connect account)
   - `metadata.sessionId` and `metadata.userId`

2. `stripe.webhooks.constructEvent()` - Verifies webhook signature

### Auth Service (`apps/auth-service/`)

**Purpose:** Stripe Connect account creation and onboarding link generation

| File | Component | Purpose | Stripe Object Used | Notes |
|------|-----------|---------|-------------------|-------|
| `src/controller/auth.controller.ts` | `createStripeConnectLink()` | Creates Express account and account link | `stripe.accounts.create()`, `stripe.accountLinks.create()` | Hardcoded country: "GB", hardcoded return URLs |
| `src/routes/auth.router.ts` | Route registration | `POST /create-stripe-link` | N/A | **⚠️ Missing authentication** |
| `package.json` | Dependencies | Stripe SDK | `stripe@^12.6.0` | API version: `2022-11-15` (different from order-service) |

**Key Features:**
- Stripe Connect Express account creation
- Account link generation for seller onboarding
- Seller `stripeId` storage in database (`sellers.stripeId`)

**Stripe API Calls:**
1. `stripe.accounts.create()` - Creates Express account with:
   - `type: "express"`
   - `email` (from seller)
   - `country: "GB"` (hardcoded)
   - `capabilities.card_payments`, `capabilities.transfers`

2. `stripe.accountLinks.create()` - Generates onboarding link with:
   - `type: "account_onboarding"`
   - `refresh_url`, `return_url` (hardcoded to `http://localhost:3000/success`)

### Product Service (`apps/product-service/`)

**Purpose:** Retrieving seller Stripe account information for dashboard display

| File | Component | Purpose | Stripe Object Used | Notes |
|------|-----------|---------|-------------------|-------|
| `src/controllers/product.controller.ts` | `getStripeAccount()` | Retrieves Stripe account details and payout information | `stripe.accounts.retrieve()`, `stripe.payouts.list()` | Protected by `isAuthenticated`, `isSeller` middleware |
| `src/routes/product.routes.ts` | Route registration | `GET /get-stripe-account` | N/A | Protected by authentication |
| `package.json` | Dependencies | Stripe SDK | `stripe@^12.0.0` | API version: Not explicitly set (uses default) |

**Key Features:**
- Stripe account retrieval
- Payout history listing (last payout)
- Account status display (payouts_enabled, charges_enabled)

**Stripe API Calls:**
1. `stripe.accounts.retrieve()` - Gets account details
2. `stripe.payouts.list()` - Gets payout history (limit: 1)

## Frontend Applications

### User UI (`apps/user-ui/`)

**Purpose:** Client-side payment form and checkout flow

| File | Component | Purpose | Stripe Object Used | Notes |
|------|-----------|---------|-------------------|-------|
| `src/app/(routes)/checkout/page.tsx` | Checkout page | Loads Stripe.js, fetches payment session, creates payment intent | `loadStripe()`, `Elements` | Uses `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` |
| `src/shared/components/checkout/checkoutForm.tsx` | Payment form | Payment form using Stripe PaymentElement | `PaymentElement`, `stripe.confirmPayment()` | Client-side payment confirmation |
| `src/app/(routes)/payment-success/page.tsx` | Success page | Payment success confirmation | N/A | Displays success message, clears cart |
| `package.json` | Dependencies | Stripe.js SDK | `@stripe/react-stripe-js@^3.6.0`, `@stripe/stripe-js@^7.0.0` | Client-side only |

**Key Features:**
- Stripe Elements integration
- Payment form rendering
- Client-side payment confirmation
- Redirect to success page after payment

**Stripe API Calls:**
1. `loadStripe()` - Initializes Stripe.js with public key
2. `stripe.confirmPayment()` - Confirms payment on client side

### Seller UI (`apps/seller-ui/`)

**Purpose:** Seller Stripe account management and onboarding

| File | Component | Purpose | Stripe Object Used | Notes |
|------|-----------|---------|-------------------|-------|
| `src/shared/modules/settings/withdraw-method.tsx` | Account display | Displays connected Stripe account information | N/A | Fetches from `/product/api/get-stripe-account` |
| `src/app/(routes)/signup/page.tsx` | Seller signup | Initiates Stripe Connect onboarding flow | N/A | Calls `/auth/api/create-stripe-link` |
| `src/assets/svgs/stripe-logo.tsx` | Logo component | Stripe logo SVG | N/A | Visual branding |
| `package.json` | Dependencies | Stripe.js SDK | `@stripe/react-stripe-js@^3.6.0`, `@stripe/stripe-js@^7.0.0` | Not actively used (backend APIs only) |

**Key Features:**
- Stripe Connect onboarding initiation
- Account status display
- Dashboard link generation

## Database Schema

### Prisma Schema (`prisma/schema.prisma`)

| Model | Field | Type | Purpose |
|-------|-------|------|---------|
| `sellers` | `stripeId` | `String?` (optional) | Stores Stripe Connect account ID |
| `orders` | `status` | `String` | Order status (e.g., "Paid") |
| `orders` | `total` | `Float` | Order total amount |
| `orders` | `couponCode` | `String?` | Discount coupon code |
| `orders` | `discountAmount` | `Float?` | Discount amount applied |

**Note:** No payment provider ID or payment intent ID stored in orders table. Payment is linked via webhook metadata (`sessionId`).

## Infrastructure & Configuration

### Docker Compose (`docker-compose.production.yml`)

| Location | Variable | Value Type | Notes |
|----------|----------|------------|-------|
| Line 278 | `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | Hardcoded test key | **⚠️ SECURITY RISK:** Hardcoded in compose file |

### Nginx Configuration (`nginx.conf`)

| Route | Proxy Target | Purpose |
|-------|--------------|---------|
| `/order/` | `api-gateway` → `order-service` | Payment endpoints |
| `/auth/` | `api-gateway` → `auth-service` | Stripe Connect endpoints |
| `/product/` | `api-gateway` → `product-service` | Stripe account info endpoints |

### Environment Variables

**Backend:**
- `STRIPE_SECRET_KEY` - Required by order-service, auth-service, product-service
- `STRIPE_WEBHOOK_SECRET` - Required by order-service for webhook verification

**Frontend:**
- `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` - Required by user-ui (hardcoded in docker-compose)

## HTTP Endpoints

### Payment Intent Creation
- **Method:** `POST`
- **Route:** `/order/api/create-payment-intent`
- **Service:** order-service (port 6003)
- **Auth:** Required (`isAuthenticated`)
- **Input:** `{ amount, sellerStripeAccountId, sessionId }`
- **Output:** `{ clientSecret }`

### Payment Webhook
- **Method:** `POST`
- **Route:** `/order/api/create-order`
- **Service:** order-service (port 6003)
- **Auth:** None (webhook endpoint)
- **Headers:** `stripe-signature` (required)
- **Body:** Raw JSON (for signature verification)
- **Event Type:** `payment_intent.succeeded`

### Stripe Connect Account Creation
- **Method:** `POST`
- **Route:** `/auth/api/create-stripe-link`
- **Service:** auth-service (port 6001)
- **Auth:** **⚠️ Missing** (should require authentication)
- **Input:** `{ sellerId }`
- **Output:** `{ url }` (onboarding link)

### Get Stripe Account Information
- **Method:** `GET`
- **Route:** `/product/api/get-stripe-account`
- **Service:** product-service (port 6002)
- **Auth:** Required (`isAuthenticated`, `isSeller`)
- **Output:** Account details, payout status, dashboard URL

### Payment Session Management
- **Method:** `POST`
- **Route:** `/order/api/create-payment-session`
- **Purpose:** Creates Redis session for checkout (not Stripe-specific, but part of payment flow)
- **TTL:** 600 seconds (10 minutes)

- **Method:** `GET`
- **Route:** `/order/api/verifying-payment-session`
- **Purpose:** Validates payment session before checkout

## Payment Flow Summary

1. **Checkout Initiation:**
   - User adds items to cart
   - Frontend calls `POST /order/api/create-payment-session` with cart data
   - Backend creates Redis session (10-minute TTL) and returns `sessionId`

2. **Payment Intent Creation:**
   - Frontend navigates to `/checkout?sessionId=xxx`
   - Frontend calls `POST /order/api/create-payment-intent` with amount, seller account ID, sessionId
   - Backend creates Stripe PaymentIntent with Connect transfer and returns `clientSecret`

3. **Payment Confirmation:**
   - User fills payment form (Stripe Elements)
   - Frontend calls `stripe.confirmPayment()` with `clientSecret`
   - Stripe processes payment and redirects to success page

4. **Webhook Processing:**
   - Stripe sends `payment_intent.succeeded` webhook to `/order/api/create-order`
   - Backend verifies signature, extracts `sessionId` and `userId` from metadata
   - Backend retrieves session from Redis, creates orders in database
   - Backend updates product stock, analytics, sends emails, creates notifications
   - Backend deletes Redis session

## Risks & Issues Identified

### Security
1. **Hardcoded Stripe Public Key** - `docker-compose.production.yml:278` contains test key
2. **Missing Authentication** - `/auth/api/create-stripe-link` endpoint not protected
3. **Client-Side Amount** - Payment amount sent from frontend (should be recalculated from session)

### Reliability
1. **No Idempotency** - PaymentIntent creation lacks idempotency keys
2. **Session Expiration** - Webhook handler returns 200 even if session expired (silent failure)
3. **Single Event Type** - Only handles `payment_intent.succeeded` (no failure/cancellation handling)

### Configuration
1. **API Version Mismatch** - order-service uses `2025-02-24.acacia`, auth-service uses `2022-11-15`
2. **Hardcoded Country** - Stripe Connect accounts created with `country: "GB"` only
3. **Hardcoded URLs** - Account link return URLs hardcoded to `http://localhost:3000/success`

### Missing Features
1. **No Refunds** - No refund endpoints found
2. **No Payment Status Polling** - Relies solely on webhooks (no fallback)
3. **No Payment Intent Retrieval** - Cannot check payment status independently

## Kafka Events

**No Kafka events found** related to payments or orders. Payment flow is synchronous via HTTP endpoints and webhooks only.

## Next Steps for Migration

See `QPAY_MIGRATION_PLAN.md` for migration strategy and `PAYMENT_CONTRACT.md` for provider-agnostic interface design.

