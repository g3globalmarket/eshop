# Environment Variables Documentation

All environment variables used in the eshop monorepo: requirements, usage, and formats.

## Quick Reference Table

| Variable | Required | Used By | Example Format (Safe) | Notes |
|----------|----------|---------|----------------------|-------|
| **DATABASE_URL** | ✅ Yes | All services | `mongodb://user:pass@host:27017/db` | MongoDB connection string |
| **REDIS_DATABASE_URI** | ⚠️ Optional* | QPay auth, sessions | `redis://localhost:6379` | Primary Redis connection |
| **REDIS_URL** | ⚠️ Optional* | QPay auth, sessions | `redis://localhost:6379` | Fallback option 1 |
| **REDIS_URI** | ⚠️ Optional* | QPay auth, sessions | `redis://localhost:6379` | Fallback option 2 |
| **REDIS_HOST** | ⚠️ Optional* | QPay auth, sessions | `localhost` | Fallback option 3 (with REDIS_PORT) |
| **REDIS_PORT** | ⚠️ Optional* | QPay auth, sessions | `6379` | Fallback option 3 (with REDIS_HOST) |
| **QPAY_BASE_URL** | ⚠️ Optional | order-service | `https://merchant.qpay.mn` | QPay API base URL |
| **QPAY_USERNAME** | ✅ Yes** | order-service | `merchant_username` | QPay merchant username |
| **QPAY_PASSWORD** | ✅ Yes** | order-service | `merchant_password` | QPay merchant password |
| **QPAY_INVOICE_CODE** | ✅ Yes** | order-service | `INVOICE_CODE_123` | QPay invoice code |
| **QPAY_USD_TO_MNT_RATE** | ⚠️ Optional | order-service | `3400` | USD to MNT conversion rate |
| **QPAY_CALLBACK_PUBLIC_BASE_URL** | ⚠️ Optional | order-service | `https://nomadnet.shop` | Public webhook URL |
| **QPAY_WEBHOOK_SECRET** | ⚠️ Optional | api-gateway | `webhook_secret_here` | Webhook validation secret |
| **IMAGEKIT_PUBLIC_KEY** | ✅ Yes*** | product-service, auth-service | `public_abc123` | ImageKit public key |
| **IMAGEKIT_SECRET_KEY** | ✅ Yes*** | product-service, auth-service | `secret_xyz789` | ImageKit secret key |
| **IMAGEKIT_URL_ENDPOINT** | ⚠️ Optional | product-service, auth-service | `https://ik.imagekit.io/gglobal` | ImageKit URL endpoint |
| **SMTP_HOST** | ✅ Yes*** | auth-service, order-service | `smtp.gmail.com` | SMTP server hostname |
| **SMTP_PORT** | ⚠️ Optional | auth-service, order-service | `587` | SMTP server port |
| **SMTP_SERVICE** | ⚠️ Optional | auth-service, order-service | `gmail` | SMTP service name |
| **SMTP_USER** | ✅ Yes*** | auth-service, order-service | `user@example.com` | SMTP username |
| **SMTP_PASS** | ✅ Yes*** | auth-service, order-service | `smtp_password` | SMTP password |
| **KAFKA_BROKERS** | ✅ Yes | All backend services | `kafka:9092` | Kafka broker addresses |
| **DOCKER_USERNAME** | ✅ Yes | Build scripts, docker-compose | `dockerhub_username` | Docker Hub username |
| **NODE_ENV** | ⚠️ Optional | All services | `production` | Environment mode |
| **SERVICE_URL_MODE** | ⚠️ Optional | api-gateway | `docker` | Service URL resolution |
| **ACCESS_TOKEN_SECRET** | ✅ Yes | auth-service, middleware | `jwt_secret_here` | JWT access token secret |
| **REFRESH_TOKEN_SECRET** | ✅ Yes | auth-service, middleware | `jwt_refresh_secret` | JWT refresh token secret |
| **STRIPE_SECRET_KEY** | ⚠️ Optional | auth-service, order-service, product-service | `sk_test_...` | Stripe secret key |
| **STRIPE_WEBHOOK_SECRET** | ⚠️ Optional | order-service | `whsec_...` | Stripe webhook secret |
| **NEXT_PUBLIC_SERVER_URI** | ✅ Yes | user-ui, seller-ui, admin-ui | `https://nomadnet.shop` | Main API server URL |
| **NEXT_PUBLIC_CHATTING_WEBSOCKET_URI** | ✅ Yes | user-ui, seller-ui | `wss://nomadnet.shop/ws-chatting` | Chat WebSocket URL |
| **NEXT_PUBLIC_SELLER_SERVER_URI** | ✅ Yes | user-ui | `https://sellers.nomadnet.shop` | Seller UI URL |
| **NEXT_PUBLIC_USER_UI_LINK** | ✅ Yes | seller-ui, admin-ui | `https://nomadnet.shop` | User UI link |
| **NEXT_PUBLIC_SOCKET_URI** | ✅ Yes | admin-ui | `wss://nomadnet.shop/ws-loggers` | Logger WebSocket URL |
| **NEXT_PUBLIC_STRIPE_PUBLIC_KEY** | ⚠️ Optional | user-ui | `pk_test_...` | Stripe publishable key |
| **NEXT_PUBLIC_PAYMENT_PROVIDER** | ⚠️ Optional | user-ui | `qpay` | Payment provider selection |

\* Redis has multiple fallback options - at least one must be configured if Redis features are used  
\*\* Required only if QPay payment gateway is used  
\*\*\* Required only if the feature is used (image uploads, email sending)

## Detailed Documentation

### Database

#### DATABASE_URL
- **Required:** Yes
- **Used By:** All services (via Prisma)
- **Format:** `mongodb://[username:password@]host[:port]/database[?options]`
- **Example:** `mongodb://user:pass@localhost:27017/eshop`
- **Notes:** Prisma connection string. Required by all services. Works with MongoDB Atlas or self-hosted.

### Redis

Multiple variable names supported. Checks in order: `REDIS_DATABASE_URI` → `REDIS_URL` → `REDIS_URI` → `REDIS_HOST` + `REDIS_PORT` (defaults: localhost:6379).

#### REDIS_DATABASE_URI (Primary)
- **Required:** Optional (recommended)
- **Used By:** QPay auth, sessions
- **Format:** `redis://[password@]host[:port][/database]`
- **Example:** `redis://localhost:6379`
- **Notes:** QPay token caching and session management

### QPay Payment Gateway

#### QPAY_BASE_URL
- **Required:** Optional (default: `https://merchant.qpay.mn`)
- **Used By:** order-service
- **Format:** URL string
- **Example:** `https://merchant.qpay.mn` (prod) or `https://merchant-sandbox.qpay.mn` (sandbox)
- **Notes:** QPay API base URL

#### QPAY_USERNAME / QPAY_PASSWORD
- **Required:** Yes (if using QPay)
- **Used By:** order-service
- **Format:** String
- **Example:** `merchant_username` / `merchant_password`
- **Notes:** 
  - Username aliases: `QPAY_USERNAME`, `QPAY_USER`, `QPAY_MERCHANT_USERNAME`, `QPAY_CLIENT_ID`
  - Password aliases: `QPAY_PASSWORD`, `QPAY_PASS`, `QPAY_CLIENT_SECRET`
  - QPay API authentication

#### QPAY_INVOICE_CODE
- **Required:** Yes (if using QPay)
- **Used By:** order-service
- **Format:** String
- **Example:** `INVOICE_CODE_123`
- **Notes:** QPay merchant invoice code

#### QPAY_USD_TO_MNT_RATE
- **Required:** Optional (default: `3400`)
- **Used By:** order-service
- **Format:** Number (as string)
- **Example:** `3400`
- **Notes:** USD to MNT conversion rate

#### QPAY_CALLBACK_PUBLIC_BASE_URL
- **Required:** Optional (default: `http://localhost:8080`)
- **Used By:** order-service
- **Format:** URL string
- **Example:** `https://nomadnet.shop`
- **Notes:** Base URL for QPay webhook callbacks

#### QPAY_WEBHOOK_SECRET
- **Required:** Optional
- **Used By:** api-gateway
- **Format:** String
- **Example:** `webhook_secret_here`
- **Notes:** Validates QPay webhook signatures (for `/callback` endpoint)

### ImageKit

#### IMAGEKIT_PUBLIC_KEY / IMAGEKIT_SECRET_KEY
- **Required:** Yes (if using image uploads)
- **Used By:** product-service, auth-service
- **Format:** String
- **Example:** `public_abc123` / `secret_xyz789`
- **Notes:** Required for image uploads. Missing keys cause clear error on upload attempt.

#### IMAGEKIT_URL_ENDPOINT
- **Required:** Optional (default: `https://ik.imagekit.io/gglobal`)
- **Used By:** product-service, auth-service
- **Format:** URL string
- **Example:** `https://ik.imagekit.io/gglobal`
- **Notes:** ImageKit URL endpoint

### SMTP Email

#### SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
- **Required:** Yes (if using email)
- **Used By:** auth-service, order-service
- **Format:** String / Number (as string) / String / String
- **Example:** `smtp.gmail.com` / `587` / `user@example.com` / `smtp_password`
- **Notes:** 
  - Email notifications (registration, order confirmations, etc.)
  - `SMTP_PORT` defaults to `587`
  - `SMTP_SERVICE` optional (e.g., "gmail", "sendgrid")

### Kafka

#### KAFKA_BROKERS
- **Required:** Yes
- **Used By:** All backend services
- **Format:** Comma-separated broker addresses
- **Example:** `kafka:9092` (Docker) or `localhost:9092` (local)
- **Notes:** Event streaming and analytics. Docker uses service name `kafka:9092`. Local dev uses `localhost:9092`.

### Docker & Deployment

#### DOCKER_USERNAME
- **Required:** Yes (for Docker builds)
- **Used By:** Build scripts, docker-compose
- **Format:** String
- **Example:** `dockerhub_username`
- **Notes:** Docker Hub username for image registry

#### NODE_ENV
- **Required:** Optional (default: `development`)
- **Used By:** All services
- **Format:** `development` or `production`
- **Example:** `production`
- **Notes:** Affects logging, CORS, and other behaviors

#### SERVICE_URL_MODE
- **Required:** Optional
- **Used By:** api-gateway
- **Format:** `local`, `docker`, or unset
- **Example:** `docker`
- **Notes:** Controls whether services use `localhost` or Docker service names for inter-service calls

### JWT Authentication

#### ACCESS_TOKEN_SECRET / REFRESH_TOKEN_SECRET
- **Required:** Yes
- **Used By:** auth-service, middleware
- **Format:** String (strong random secret)
- **Example:** `jwt_secret_here` / `jwt_refresh_secret`
- **Notes:** JWT token generation/verification. Use strong random secrets. Different secrets for access vs refresh.

### Stripe Payment Gateway (Optional)

#### STRIPE_SECRET_KEY
- **Required:** Optional (if using Stripe)
- **Used By:** auth-service, order-service, product-service
- **Format:** String (starts with `sk_`)
- **Example:** `[REDACTED]` (test) or `[REDACTED]` (production)
- **Notes:** Stripe secret key for server-side operations

#### STRIPE_WEBHOOK_SECRET
- **Required:** Optional (if using Stripe webhooks)
- **Used By:** order-service
- **Format:** String (starts with `whsec_`)
- **Example:** `[REDACTED]`
- **Notes:** Stripe webhook secret for signature validation

### Next.js Public Variables

`NEXT_PUBLIC_*` variables are exposed to the browser. Don't put secrets here.

#### NEXT_PUBLIC_SERVER_URI
- **Required:** Yes
- **Used By:** user-ui, seller-ui, admin-ui
- **Format:** URL string
- **Example:** `https://nomadnet.shop`
- **Notes:** Main API server URL for frontends

#### NEXT_PUBLIC_CHATTING_WEBSOCKET_URI
- **Required:** Yes
- **Used By:** user-ui, seller-ui
- **Format:** WebSocket URL string
- **Example:** `wss://nomadnet.shop/ws-chatting`
- **Notes:** WebSocket URL for real-time chat

#### NEXT_PUBLIC_SELLER_SERVER_URI
- **Required:** Yes
- **Used By:** user-ui
- **Format:** URL string
- **Example:** `https://sellers.nomadnet.shop`
- **Notes:** Seller dashboard URL (for links in user UI)

#### NEXT_PUBLIC_USER_UI_LINK
- **Required:** Yes
- **Used By:** seller-ui, admin-ui
- **Format:** URL string
- **Example:** `https://nomadnet.shop`
- **Notes:** User UI URL (for links in seller/admin UIs)

#### NEXT_PUBLIC_SOCKET_URI
- **Required:** Yes
- **Used By:** admin-ui
- **Format:** WebSocket URL string
- **Example:** `wss://nomadnet.shop/ws-loggers`
- **Notes:** WebSocket URL for logger service (admin dashboard)

#### NEXT_PUBLIC_STRIPE_PUBLIC_KEY
- **Required:** Optional (if using Stripe)
- **Used By:** user-ui
- **Format:** String (starts with `pk_`)
- **Example:** `[REDACTED]` (test) or `[REDACTED]` (production)
- **Notes:** Stripe publishable key (safe to expose in browser)

#### NEXT_PUBLIC_PAYMENT_PROVIDER
- **Required:** Optional (default: `stripe`)
- **Used By:** user-ui
- **Format:** `stripe` or `qpay`
- **Example:** `qpay`
- **Notes:** Payment provider for checkout

#### EXPOSE_OTP_IN_DEV
- **Required:** Optional (dev only)
- **Used By:** auth-service
- **Format:** `true` or `false`
- **Example:** `true`
- **Notes:** When `NODE_ENV=development` and `EXPOSE_OTP_IN_DEV=true`, OTP is returned in registration response as `devOtp` field (no email sent). DEV-ONLY feature, does not affect production.

### Debug & Development

#### ENV_LOADER_DEBUG
- **Required:** Optional
- **Used By:** env-loader package
- **Format:** `true` or `false`
- **Example:** `true`
- **Notes:** Enable debug logging for env-loader

#### INTERNAL_WEBHOOK_DEBUG
- **Required:** Optional
- **Used By:** order-service
- **Format:** `true` or `false`
- **Example:** `false`
- **Notes:** Enable debug logging for internal webhooks

#### DOCKER_ENV
- **Required:** Optional
- **Used By:** Kafka utils
- **Format:** `true` or `false`
- **Example:** `true`
- **Notes:** Docker environment flag (affects Kafka broker resolution)

## Environment File Setup

### Creating .env File

1. Copy template:
   ```bash
   cp .env.example .env
   ```

2. Fill in required variables with actual values

3. Never commit `.env` (it's in `.gitignore`)

### Environment-Specific Files

Different `.env` files for different environments:
- `.env` - Default (usually dev)
- `.env.local` - Local dev overrides
- `.env.production` - Production (set on server, not in repo)

### Loading Environment Variables

`@packages/libs/env-loader` loads `.env` from repo root. Services must import it first:

```typescript
// Must be FIRST import
import "@packages/libs/env-loader";
```

## Security Best Practices

1. Never commit `.env` files (excluded in `.gitignore`)
2. Use strong secrets (generate random strings for JWT, passwords)
3. Rotate secrets regularly (especially after handoff or security incidents)
4. Use different values per environment (dev, staging, prod)
5. Limit access (only authorized personnel)
6. Consider secret management services (AWS Secrets Manager, HashiCorp Vault, etc.) for production

## Troubleshooting

### Service fails: "Missing required environment variables"
- Check all required vars set in `.env`
- Verify variable names match exactly (case-sensitive)
- Check for typos or extra spaces

### Environment variables not loading
- Ensure `.env` is in repo root
- Check `@packages/libs/env-loader` imported first in service main file
- Enable `ENV_LOADER_DEBUG=true` to see loading logs

### Next.js public variables not working
- Ensure vars start with `NEXT_PUBLIC_` prefix
- Rebuild Next.js app after changing public vars (baked into build)
- Check browser console for undefined values

## Additional Resources

- `.env.example` - Complete template with all variables
- `docs/HANDOFF_CHECKLIST.md` - Handoff documentation
- Service `main.ts` files - Service-specific requirements

