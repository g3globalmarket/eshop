# Payment Contract - Provider-Agnostic Interface

**Date:** 2025-01-05  
**Purpose:** Define the payment contract that must be preserved when migrating from Stripe to QPay  
**Scope:** API endpoints, data structures, status lifecycle, and database schema

## Overview

This document defines the **provider-agnostic payment contract** that the application expects. This contract must be preserved when migrating from Stripe to QPay (or any other payment provider).

## Core Principles

1. **Frontend contracts unchanged** - UI components should not need modification
2. **Database schema preserved** - Order and seller models remain the same
3. **Status lifecycle consistent** - Payment statuses map to same order states
4. **Webhook/callback pattern** - Asynchronous payment confirmation via webhooks

## API Endpoints Contract

### 1. Create Payment Intent

**Endpoint:** `POST /order/api/create-payment-intent`

**Request:**
```typescript
{
  amount: number;              // Total amount in dollars (e.g., 99.99)
  sellerStripeAccountId: string; // Provider account ID (e.g., Stripe Connect account ID)
  sessionId: string;           // Payment session ID from Redis
}
```

**Response:**
```typescript
{
  clientSecret: string;        // Provider-specific secret for client-side confirmation
}
```

**Contract Requirements:**
- Must accept amount in dollars (will be converted to provider's smallest unit internally)
- Must accept seller account ID (provider-agnostic field name)
- Must return a `clientSecret` (or equivalent) for client-side payment confirmation
- Must store `sessionId` and `userId` in metadata for webhook correlation

**Current Stripe Implementation:**
- Creates PaymentIntent with Connect transfer
- Platform fee: 10% (hardcoded)
- Currency: USD (hardcoded)
- Metadata: `sessionId`, `userId`

**QPay Equivalent:**
- Create invoice/QR code
- Return invoice ID or QR code data
- Store session metadata for callback correlation

---

### 2. Payment Webhook/Callback

**Endpoint:** `POST /order/api/create-order`

**Request Headers:**
```typescript
{
  "stripe-signature": string;  // Provider-specific signature header
  "content-type": "application/json"
}
```

**Request Body:** Raw JSON (for signature verification)

**Expected Event Structure:**
```typescript
{
  type: "payment_intent.succeeded",  // Provider-specific event type
  data: {
    object: {
      id: string;                    // Payment ID
      amount: number;                // Amount in provider's smallest unit
      currency: string;              // Currency code (e.g., "usd")
      metadata: {
        sessionId: string;          // Required: Links to Redis session
        userId: string;             // Required: User who made payment
      },
      status: string;                // Payment status (e.g., "succeeded")
    }
  }
}
```

**Response:**
```typescript
{
  received: true;  // Always return 200 OK
}
```

**Contract Requirements:**
- Must verify webhook signature using provider secret
- Must extract `sessionId` and `userId` from metadata
- Must handle raw body for signature verification
- Must return 200 OK even if session expired (to prevent retries)
- Must create orders in database when payment succeeds
- Must delete Redis session after order creation

**Current Stripe Implementation:**
- Verifies signature using `STRIPE_WEBHOOK_SECRET`
- Handles `payment_intent.succeeded` event
- Creates orders grouped by shop
- Updates product stock, analytics, sends emails, creates notifications

**QPay Equivalent:**
- Verify callback signature using QPay secret
- Handle payment success callback
- Extract session metadata from callback payload
- Same order creation logic

---

### 3. Create Payment Session

**Endpoint:** `POST /order/api/create-payment-session`

**Request:**
```typescript
{
  cart: Array<{
    id: string;
    quantity: number;
    sale_price: number;
    shopId: string;
    selectedOptions?: object;
  }>;
  selectedAddressId?: string;
  coupon?: {
    code: string;
    discountAmount: number;
    discountPercent?: number;
    discountedProductId?: string;
  };
}
```

**Response:**
```typescript
{
  sessionId: string;  // UUID for Redis session key
}
```

**Contract Requirements:**
- Must create Redis session with 10-minute TTL
- Must store cart, sellers, totalAmount, shippingAddressId, coupon
- Must deduplicate sessions for same user + cart
- Must return sessionId for checkout flow

**Note:** This endpoint is provider-agnostic and does not need changes.

---

### 4. Verify Payment Session

**Endpoint:** `GET /order/api/verifying-payment-session?sessionId=xxx`

**Response:**
```typescript
{
  success: true;
  session: {
    userId: string;
    cart: Array<...>;
    sellers: Array<{
      shopId: string;
      sellerId: string;
      stripeAccountOd: string;  // Provider account ID (field name may change)
    }>;
    totalAmount: number;
    shippingAddressId?: string;
    coupon?: object;
  };
}
```

**Contract Requirements:**
- Must return session data if exists and not expired
- Must return 404 if session not found or expired

**Note:** Field name `stripeAccountOd` should be renamed to `providerAccountId` for provider-agnostic naming.

---

### 5. Create Seller Onboarding Link

**Endpoint:** `POST /auth/api/create-stripe-link`

**Request:**
```typescript
{
  sellerId: string;
}
```

**Response:**
```typescript
{
  url: string;  // Onboarding URL (provider-specific)
}
```

**Contract Requirements:**
- Must create seller account with provider
- Must generate onboarding URL
- Must store provider account ID in `sellers.providerAccountId` (currently `stripeId`)
- Must return URL for redirect

**Current Stripe Implementation:**
- Creates Stripe Connect Express account
- Generates account link
- Stores account ID in `sellers.stripeId`

**QPay Equivalent:**
- Create QPay merchant account
- Generate onboarding URL
- Store QPay merchant ID in `sellers.providerAccountId`

---

### 6. Get Seller Account Information

**Endpoint:** `GET /product/api/get-stripe-account`

**Response:**
```typescript
{
  success: true;
  stripeAccount: {  // Should be renamed to `providerAccount`
    id: string;
    email: string;
    business_name: string;
    country: string;
    payouts_enabled: boolean;
    charges_enabled: boolean;
    last_payout: string | null;
    dashboard_url: string;
  };
}
```

**Contract Requirements:**
- Must return account status (payouts enabled, charges enabled)
- Must return account details (email, business name, country)
- Must return last payout date (if available)
- Must return dashboard URL (provider-specific)

**Note:** Response field name `stripeAccount` should be renamed to `providerAccount` for provider-agnostic naming.

## Database Schema Contract

### Orders Table

**Required Fields:**
- `id` - Order ID (ObjectId)
- `userId` - User who placed order
- `shopId` - Shop that received order
- `total` - Order total amount (Float)
- `status` - Order status (String, e.g., "Paid")
- `deliveryStatus` - Delivery status (String, default: "Ordered")
- `shippingAddressId` - Shipping address reference
- `couponCode` - Discount coupon code (optional)
- `discountAmount` - Discount amount applied (optional)
- `createdAt` - Order creation timestamp
- `updatedAt` - Order update timestamp

**Missing Fields (Recommended for Migration):**
- `paymentProvider` - Provider name (e.g., "stripe", "qpay")
- `paymentId` - Provider payment ID (for refunds/status checks)
- `paymentIntentId` - Provider payment intent/invoice ID
- `paymentStatus` - Payment status (e.g., "succeeded", "pending", "failed")

### Sellers Table

**Current Field:**
- `stripeId` - Stripe Connect account ID (String, optional)

**Recommended Change:**
- Rename to `providerAccountId` - Provider account ID (String, optional)
- Add `paymentProvider` - Provider name (String, optional, e.g., "stripe", "qpay")

## Status Lifecycle

### Payment Status Flow

```
Pending → Processing → Succeeded/Failed
```

**Current Implementation:**
- PaymentIntent created → Status: "pending"
- Webhook received → Status: "succeeded"
- Order created → Order status: "Paid"

**Contract Requirements:**
- Must support at least: "pending", "succeeded", "failed"
- Must map "succeeded" to order status "Paid"
- Must handle "failed" gracefully (no order creation)

### Order Status Flow

```
Paid → Ordered → Packed → Shipped → Out for Delivery → Delivered
```

**Contract Requirements:**
- Order status starts at "Paid" after successful payment
- Delivery status starts at "Ordered" (default)
- Delivery status transitions are independent of payment provider

## Redis Session Contract

**Key Format:** `payment-session:{sessionId}`

**Value Structure:**
```typescript
{
  userId: string;
  cart: Array<{
    id: string;
    quantity: number;
    sale_price: number;
    shopId: string;
    selectedOptions?: object;
  }>;
  sellers: Array<{
    shopId: string;
    sellerId: string;
    stripeAccountOd: string;  // Should be `providerAccountId`
  }>;
  totalAmount: number;
  shippingAddressId?: string;
  coupon?: {
    code: string;
    discountAmount: number;
    discountPercent?: number;
    discountedProductId?: string;
  };
}
```

**TTL:** 600 seconds (10 minutes)

**Contract Requirements:**
- Must store session data for webhook correlation
- Must expire after 10 minutes
- Must be deleted after successful order creation
- Must handle expired sessions gracefully (return 200 OK in webhook)

## Metadata Contract

**Payment Intent/Invoice Metadata:**
```typescript
{
  sessionId: string;  // Required: Links to Redis session
  userId: string;     // Required: User who made payment
}
```

**Contract Requirements:**
- Must include `sessionId` for webhook correlation
- Must include `userId` for order creation
- Must be stored with payment intent/invoice
- Must be extractable from webhook/callback payload

## Error Handling Contract

### Webhook Errors

**Signature Verification Failure:**
- Return `400 Bad Request` with error message
- Do not process payment

**Session Expired:**
- Return `200 OK` with message "No session found, skipping order creation"
- Log warning
- Do not retry (prevent infinite webhook retries)

**Payment Failed:**
- Return `200 OK` (acknowledge webhook)
- Log error
- Do not create order

### Client Errors

**Payment Intent Creation Failure:**
- Return error response (4xx/5xx)
- Frontend displays error message
- User can retry

**Payment Confirmation Failure:**
- Stripe/QPay returns error
- Frontend displays error message
- User can retry

## Platform Fee Contract

**Current Implementation:**
- Platform fee: 10% (hardcoded)
- Calculated as: `Math.floor(customerAmount * 0.1)`
- Applied via `application_fee_amount` (Stripe Connect)

**Contract Requirements:**
- Must support platform fee calculation
- Must transfer remaining amount to seller account
- Fee percentage should be configurable (currently hardcoded)

**QPay Equivalent:**
- Calculate platform fee (10%)
- Create invoice with seller as recipient
- Transfer fee to platform account separately (if QPay supports)

## Currency Contract

**Current Implementation:**
- Currency: USD (hardcoded)
- Amount: Dollars (converted to cents for Stripe)

**Contract Requirements:**
- Must support USD (current requirement)
- Must convert dollars to provider's smallest unit (cents, mongo, etc.)
- Currency should be configurable (currently hardcoded)

**QPay Equivalent:**
- QPay likely uses MNT (Mongolian Tugrik)
- Must convert USD to MNT at current exchange rate
- Must handle currency conversion in payment intent creation

## Frontend Contract

### Checkout Page

**Current Flow:**
1. Load Stripe.js with public key
2. Fetch payment session
3. Create payment intent
4. Render Stripe Elements
5. Confirm payment
6. Redirect to success page

**Contract Requirements:**
- Must load provider SDK (Stripe.js or QPay SDK)
- Must fetch payment session (unchanged)
- Must create payment intent (endpoint unchanged)
- Must render payment form (provider-specific UI)
- Must confirm payment (provider-specific method)
- Must redirect to success page (unchanged)

**QPay Changes:**
- Replace Stripe.js with QPay SDK
- Replace Stripe Elements with QPay payment form/QR code
- Replace `stripe.confirmPayment()` with QPay confirmation method

### Success Page

**Current Flow:**
- Displays success message
- Clears cart
- Shows session ID

**Contract Requirements:**
- Must display success message (unchanged)
- Must clear cart (unchanged)
- Session ID display optional (for debugging)

**QPay Changes:**
- No changes required (provider-agnostic)

## Migration Checklist

### Required Changes

1. **Environment Variables:**
   - Add `PAYMENT_PROVIDER=stripe|qpay`
   - Add `QPAY_SECRET_KEY`
   - Add `QPAY_WEBHOOK_SECRET`
   - Add `NEXT_PUBLIC_QPAY_PUBLIC_KEY` (if QPay has client-side SDK)

2. **Database Schema:**
   - Rename `sellers.stripeId` → `sellers.providerAccountId`
   - Add `orders.paymentProvider` (optional, for tracking)
   - Add `orders.paymentId` (optional, for refunds)

3. **API Response Fields:**
   - Rename `stripeAccount` → `providerAccount` in `/product/api/get-stripe-account`
   - Rename `stripeAccountOd` → `providerAccountId` in payment session

4. **Code Changes:**
   - Create payment provider adapter interface
   - Implement QPay adapter
   - Replace Stripe SDK calls with adapter calls
   - Update frontend to use QPay SDK

### Preserved Contracts

1. **API Endpoints** - All endpoints remain unchanged
2. **Request/Response Formats** - All formats remain the same
3. **Status Lifecycle** - Order status flow unchanged
4. **Redis Session** - Session structure unchanged (field names may change)
5. **Webhook Pattern** - Webhook endpoint and processing unchanged

## Testing Requirements

### Contract Tests

1. **Payment Intent Creation:**
   - Verify `clientSecret` (or equivalent) returned
   - Verify metadata stored correctly
   - Verify amount conversion correct

2. **Webhook Processing:**
   - Verify signature verification works
   - Verify session correlation works
   - Verify order creation works
   - Verify session deletion works

3. **Session Management:**
   - Verify session creation works
   - Verify session expiration works
   - Verify session deduplication works

4. **Seller Onboarding:**
   - Verify account creation works
   - Verify onboarding URL generated
   - Verify account ID stored in database

## Open Questions

1. **QPay Product:** Which QPay product/service will be used? (Invoice API, QR Payment, etc.)
2. **Currency:** Does QPay support USD, or must we convert to MNT?
3. **Exchange Rate:** How will USD → MNT conversion be handled? (Real-time API, fixed rate, manual updates)
4. **Seller Payouts:** Does QPay support marketplace/split payments like Stripe Connect?
5. **Webhook Format:** What is QPay's webhook/callback format and signature method?

See `QPAY_MIGRATION_PLAN.md` for detailed migration strategy.

