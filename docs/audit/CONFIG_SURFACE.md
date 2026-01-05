# Configuration Surface

## Environment Variables

**⚠️ SECURITY NOTE:** This document lists variable names only. Never commit actual secret values to version control.

### Database Configuration

| Variable | Required By | Purpose | Example Format |
|----------|-------------|---------|----------------|
| `DATABASE_URL` | All services using Prisma | MongoDB connection string | `mongodb://...` |

**Location:** Referenced in `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "mongodb"
  url      = env("DATABASE_URL")
}
```

### Redis Configuration

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `REDIS_HOST` | auth-service, order-service, seller-service, logger-service, chatting-service | Redis server hostname |
| `REDIS_PORT` | auth-service, order-service, seller-service, logger-service, chatting-service | Redis server port |
| `REDIS_PASSWORD` | (if Redis is password-protected) | Redis authentication |

**Packages:** `@eshop/redis` (uses `ioredis`)

### Kafka Configuration

| Variable | Required By | Purpose | Default (Docker) |
|----------|-------------|---------|------------------|
| `KAFKA_BROKERS` | All services using Kafka | Kafka broker addresses | `kafka:29092` (Docker) or `localhost:9092` (local) |

**Services using Kafka:**
- auth-service
- product-service
- order-service
- seller-service
- chatting-service
- logger-service
- recommendation-service
- kafka-service

**Topics (created by `kafka-setup`):**
- `user-events` (3 partitions)
- `logs` (3 partitions)
- `chat.new_message` (3 partitions)

### JWT / Authentication

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `JWT_SECRET` | auth-service, admin-service, middleware | JWT token signing secret |
| `JWT_REFRESH_SECRET` | auth-service | Refresh token signing secret |
| `JWT_EXPIRES_IN` | auth-service | Access token expiration time |
| `JWT_REFRESH_EXPIRES_IN` | auth-service | Refresh token expiration time |

**Packages:** `jsonwebtoken` (^9.0.0)

### Stripe Payment Configuration

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `STRIPE_SECRET_KEY` | auth-service, order-service, product-service, seller-service | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | order-service | Webhook signature verification |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | user-ui, seller-ui | Stripe publishable key (client-side) |

**⚠️ RISK:** Stripe public key hardcoded in `docker-compose.production.yml:278`:
```yaml
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_test_51S7uagGhD1XOLKKfTbEiykIpKeS4HhDYTzRRpYYag6NMcTEPtj6BdTikMJNOznWXTG5OKQvPUEoWxutXhHJGLQ0h0004BL4FqZ
```

**Stripe API Versions:**
- order-service: `2025-02-24.acacia` (from `docs/payments/stripe-audit.md`)
- auth-service: `2022-11-15` (from `docs/payments/stripe-audit.md`)

### ImageKit Configuration

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `IMAGEKIT_PUBLIC_KEY` | product-service, seller-service | ImageKit public API key |
| `IMAGEKIT_PRIVATE_KEY` | product-service, seller-service | ImageKit private API key |
| `IMAGEKIT_URL_ENDPOINT` | product-service, seller-service | ImageKit URL endpoint |

**Package:** `@eshop/imagekit` (wraps `imagekit` SDK)

### SMTP / Email Configuration

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `SMTP_HOST` | auth-service, order-service, seller-service | SMTP server hostname |
| `SMTP_PORT` | auth-service, order-service, seller-service | SMTP server port |
| `SMTP_USER` | auth-service, order-service, seller-service | SMTP username |
| `SMTP_PASSWORD` | auth-service, order-service, seller-service | SMTP password |
| `SMTP_FROM` | auth-service, order-service, seller-service | From email address |

**Package:** `nodemailer` (^6.9.0)

### Frontend Environment Variables

**Next.js Public Variables (prefixed with `NEXT_PUBLIC_`):**

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `NEXT_PUBLIC_SERVER_URI` | user-ui, seller-ui | Backend API base URL |
| `NEXT_PUBLIC_CHATTING_WEBSOCKET_URI` | user-ui, seller-ui | WebSocket URL for chat |
| `NEXT_PUBLIC_SELLER_SERVER_URI` | user-ui | Seller portal URL |
| `NEXT_PUBLIC_USER_UI_LINK` | seller-ui | User-facing UI URL |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | user-ui, seller-ui | Stripe publishable key |

**Production Values (from `docker-compose.production.yml`):**
- `NEXT_PUBLIC_SERVER_URI`: `https://nomadnet.shop`
- `NEXT_PUBLIC_CHATTING_WEBSOCKET_URI`: `wss://nomadnet.shop/ws-chatting`
- `NEXT_PUBLIC_SELLER_SERVER_URI`: `https://sellers.nomadnet.shop`

### Docker Configuration

| Variable | Required By | Purpose |
|----------|-------------|---------|
| `DOCKER_USERNAME` | docker-compose.production.yml | Docker Hub username for image tags |
| `DOCKER_ENV` | kafka-service | Docker environment flag |

### Service Ports (Environment Override)

| Variable | Default | Service |
|----------|---------|---------|
| `PORT` | 8080 | api-gateway |
| `PORT` | 6001 | auth-service |
| `PORT` | 6002 | product-service |
| `PORT` | 6003 | order-service |
| `PORT` | 6004 | seller-service |
| `PORT` | 6005 | admin-service |
| `PORT` | 6006 | chatting-service |
| `PORT` | 6007 | recommendation-service |
| `PORT` | 6008 | logger-service |

### Node Environment

| Variable | Required By | Values |
|----------|-------------|--------|
| `NODE_ENV` | All services | `development`, `production` |

## Configuration Files

### Docker Compose Files

- `docker-compose.dev.yml` - Kafka infrastructure only
- `docker-compose.production.yml` - Full production stack
- `docker-compose.override.yml` - Local overrides (healthchecks, volumes)
- `docker-compose.nginx-override.yml` - Nginx-specific overrides
- `docker-compose.pinned.yml` - Pinned image versions

**All services reference:** `.env` file via `env_file: - .env`

### Nginx Configuration

**File:** `nginx.conf`

**Domains:**
- `nomadnet.shop` / `www.nomadnet.shop` - User UI
- `sellers.nomadnet.shop` - Seller UI
- `admin.nomadnet.shop` - Admin UI
- `sandbox.nomadnet.shop` - Sandbox/testing

**SSL:** Let's Encrypt certificates at `/etc/letsencrypt/live/nomadnet.shop/`

### Prisma Configuration

**File:** `prisma/schema.prisma`

**Database:** MongoDB (via Prisma)

**Client Generation:**
```bash
npx prisma generate
```

## Secrets Management Risk Assessment

### ⚠️ HIGH RISK: Hardcoded Secrets

**File:** `docker-compose.production.yml:278`
- **Issue:** Stripe public key hardcoded in Docker Compose file
- **Risk:** Public key exposure (lower risk than secret key, but still a concern)
- **Action:** Move to `.env` file

### ⚠️ MEDIUM RISK: Missing .env.example

**Issue:** No `.env.example` template found in repository
- **Risk:** Developers may not know required variables
- **Action:** Create `.env.example` with variable names (no values)

### ⚠️ MEDIUM RISK: .env File Location

**Issue:** `.env` file referenced but not in `.gitignore` (assumed, not verified)
- **Risk:** Secrets may be committed to version control
- **Action:** Verify `.gitignore` excludes `.env` files

## Recommended Next Steps

1. **Audit `.gitignore`** - Ensure `.env*` files are excluded
2. **Create `.env.example`** - Template with variable names only
3. **Move hardcoded values** - Extract Stripe key from `docker-compose.production.yml` to `.env`
4. **Document defaults** - Add default values where applicable
5. **Secrets rotation** - Verify all secrets can be rotated without code changes

