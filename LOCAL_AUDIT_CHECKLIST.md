# Local Audit Checklist

**Purpose:** Human-friendly runbook to verify the repository works locally in 30-60 minutes.

---

## Prerequisites (5 minutes)

- [ ] **Node.js v20+ installed**
  ```bash
  node -v  # Should show v20.x.x or higher
  ```

- [ ] **pnpm 9.12.3+ installed**
  ```bash
  pnpm -v  # Should show 9.12.3 or higher
  ```

- [ ] **Docker Desktop installed and running**
  ```bash
  docker --version  # Should show Docker version
  docker ps  # Should not error (daemon running)
  ```

- [ ] **MongoDB accessible**
  - Local MongoDB running, OR
  - MongoDB Atlas connection string ready
  - Test: `mongosh "mongodb://localhost:27017"` (if local)

- [ ] **`.env` file exists in repo root**
  ```bash
  test -f .env && echo "✅ .env exists" || echo "❌ Create .env file"
  ```

---

## Setup (10 minutes)

### 1. Install Dependencies
```bash
pnpm install
```
**Expected:** Dependencies install, Prisma Client generates
**Verify:** No errors, `node_modules/.prisma/client` exists

### 2. Verify Environment Variables
Check `.env` has at minimum:
- `DATABASE_URL` - MongoDB connection string
- `ACCESS_TOKEN_SECRET` - JWT secret (not `JWT_SECRET`)
- `REFRESH_TOKEN_SECRET` - JWT refresh secret
- `KAFKA_BROKERS` - `localhost:9092` (for local) or `kafka:9092` (for Docker)

**⚠️ CRITICAL:** Ensure `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` are set (not `JWT_SECRET`)

### 3. Configure Frontend Environment Variables
**Required for local testing:**
```bash
# Add to .env file (root directory):
NEXT_PUBLIC_SERVER_URI=http://localhost:8080
NEXT_PUBLIC_CHATTING_WEBSOCKET_URI=ws://localhost:6006
NEXT_PUBLIC_SELLER_SERVER_URI=http://localhost:3001
NEXT_PUBLIC_SOCKET_URI=ws://localhost:6008
```

**Verification:**
```bash
node -e "require('dotenv').config(); console.log('NEXT_PUBLIC_SERVER_URI:', process.env.NEXT_PUBLIC_SERVER_URI);"
# Expected: NEXT_PUBLIC_SERVER_URI: http://localhost:8080
```

**Note:** 
- user-ui and admin-ui require `NEXT_PUBLIC_SERVER_URI` (defaults to production if not set)
- seller-ui uses relative paths (empty baseURL)
- **IMPORTANT:** Restart UIs after adding/changing these vars (Next.js reads them at startup in dev mode)
- **Next.js Env Priority:** `.env.local` (in app directory) > root `.env`
- If `apps/user-ui/.env.local` exists, it overrides root `.env` for that app

### 4. Start Infrastructure
```bash
# Check if Kafka is already running
docker ps | grep kafka

# If not running, start Kafka and Zookeeper
pnpm kafka:dev:up

# Verify Kafka is running
docker ps | grep kafka
lsof -ti:9092  # Should show process ID
```
**Expected:** Kafka and Zookeeper containers running
**Verify:** Ports 9092 (Kafka) and 2181 (Zookeeper) are listening
**Note:** Containers may already be running from previous sessions

### 5. Verify MongoDB Connection
```bash
# Test connection (adjust DATABASE_URL as needed)
node -e "require('dotenv').config(); const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient(); prisma.\$connect().then(() => { console.log('✅ MongoDB connected'); process.exit(0); }).catch(e => { console.log('❌', e.message); process.exit(1); });"
```
**Expected:** "✅ MongoDB connected"
**If fails:** Check `DATABASE_URL` in `.env`, ensure MongoDB is running

### 6. Configure Dev-Only OTP Fallback (Optional, for local testing)
**For local testing without SMTP:**
```bash
# Add to .env:
EXPOSE_OTP_IN_DEV=true
NODE_ENV=development  # (defaults to development if not set)
```

**Note:** 
- When `EXPOSE_OTP_IN_DEV=true` and `NODE_ENV=development`, OTP is returned in registration response as `devOtp` field (no email sent)
- This is DEV-ONLY and does not affect production behavior
- Production still requires SMTP configuration for email delivery

**Alternative: Configure SMTP (for production-like testing):**
```bash
# Add to .env:
SMTP_HOST=smtp.gmail.com  # or your SMTP server
SMTP_PORT=587
SMTP_SERVICE=gmail  # or your service
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### 7. Start Backend Services
```bash
# Start all services (in separate terminals or use process manager)
pnpm dev

# OR start individually:
nx serve api-gateway      # Port 8080
nx serve auth-service     # Port 6001
nx serve product-service  # Port 6002
nx serve order-service    # Port 6003
nx serve seller-service   # Port 6004
nx serve admin-service    # Port 6005
nx serve chatting-service # Port 6006
nx serve recommendation-service # Port 6007
nx serve logger-service   # Port 6008
nx serve kafka-service    # Background consumer
```

**Expected:** Each service logs "listening at http://localhost:PORT"
**Verify:** Services bind to expected ports (use `lsof -ti:PORT`)

---

## Build Verification (5 minutes)

### 1. Type Check
```bash
npx nx run-many --target=typecheck --all --parallel=3
```
**Expected:** "Successfully ran target typecheck for 12 projects"
**If fails:** Fix TypeScript errors

### 2. Build All
```bash
npx nx run-many --target=build --all --parallel=3
```
**Expected:** All 15 projects build successfully
**Warnings OK:** Nx lockfile warning is non-blocking
**If fails:** Check error messages, fix build issues

---

## Runtime Verification (15 minutes)

### 1. Start Services
```bash
# Start all services (in separate terminals or use process manager)
pnpm dev

# OR start individually:
nx serve api-gateway      # Port 8080
nx serve auth-service      # Port 6001
nx serve product-service  # Port 6002
nx serve order-service    # Port 6003
nx serve seller-service   # Port 6004
nx serve admin-service    # Port 6005
nx serve chatting-service # Port 6006
nx serve recommendation-service # Port 6007
nx serve logger-service   # Port 6008
nx serve kafka-service   # Background consumer
```

**Expected:** Each service logs "listening at http://localhost:PORT"
**If fails:** Check error messages, verify env vars, check port conflicts

### 8. Start Frontend UIs
```bash
# Start user-ui (port 3000)
pnpm user-ui
# OR
cd apps/user-ui && pnpm dev

# Start seller-ui (port 3001) - in separate terminal
pnpm seller-ui
# OR
cd apps/seller-ui && pnpm dev

# Start admin-ui (port 3002) - in separate terminal
pnpm admin-ui
# OR
cd apps/admin-ui && pnpm dev
```

**Expected:** Each UI logs "ready" and shows local URL
**Verify:** 
- Ports 3000, 3001, 3002 are bound
- Pages load in browser (http://localhost:3000, etc.)
- No blocking console errors

**Note:** Ensure `NEXT_PUBLIC_SERVER_URI=http://localhost:8080` is set for user-ui and admin-ui

### 9. Verify Health Endpoints
```bash
# API Gateway
curl http://localhost:8080/gateway-health
# Expected: {"message":"API Gateway is healthy!","timestamp":"...","environment":"development"}

# Backend Services (direct)
curl http://localhost:6001/          # auth-service: {"message":"Hello API"}
curl http://localhost:6002/          # product-service: {"message":"Product service is running"}
curl http://localhost:6004/          # seller-service: {"message":"Hello Seller API"}
curl http://localhost:6005/          # admin-service: {"message":"Welcome to admin-service!"}
curl http://localhost:6006/          # chatting-service: {"message":"Welcome to chatting-service!"}
curl http://localhost:6007/          # recommendation-service: {"message":"Welcome to recommendation-service!"}
curl http://localhost:6008/          # logger-service: (HTML error page, but service is running)
```
**Expected:** JSON responses or service messages
**If fails:** Service may not be running or has errors

### 10. Verify UI → API Gateway Connectivity (Browser)
**Open user-ui in browser:**
1. Navigate to http://localhost:3000
2. Open DevTools → Network tab
3. Navigate to home/products page (triggers API calls)
4. Verify requests show `localhost:8080` as host (not production domains)
5. Check response status codes (should be 200 for product endpoints)

**Expected:** All API requests go to `http://localhost:8080/*`

### 11. Test WebSocket Connections
```bash
# Test chatting-service WebSocket
node scripts/ws-smoke.mjs chatting 6006
# Expected: ✅ Connected to chatting-service WebSocket

# Test logger-service WebSocket
node scripts/ws-smoke.mjs logger 6008
# Expected: ✅ Connected to logger-service WebSocket
```
**Note:** WebSocket test script created at `scripts/ws-smoke.mjs`

### 3. Start Frontend Apps (Optional)
```bash
# In separate terminals
pnpm user-ui    # Port 3000
pnpm seller-ui  # Port 3001
pnpm admin-ui   # Port 3002
```

**Expected:** Next.js dev servers start, pages load in browser
**If fails:** Check for build errors, port conflicts

---

## Functional Flow Tests (20 minutes)

### 1. User Registration Flow
```bash
# Register user
curl -X POST http://localhost:8080/auth/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test123!"}'

# Expected: Success response or OTP required message
```

### 2. User Login Flow
```bash
# Login
curl -X POST http://localhost:8080/auth/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}' \
  -c cookies.txt

# Expected: Access and refresh tokens in cookies
# Verify: Check cookies.txt file
```

### 3. Product Listing
```bash
# Get products
curl http://localhost:8080/product/api/products

# Expected: JSON array of products (may be empty)
```

### 4. Create Product (Seller)
```bash
# Requires seller authentication token
curl -X POST http://localhost:8080/seller/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SELLER_TOKEN>" \
  -d '{"title":"Test Product","price":100,"stock":10}'

# Expected: Product created response
```

### 5. Order Creation
```bash
# Create order (requires user auth)
curl -X POST http://localhost:8080/order/api/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -d '{"items":[{"productId":"...","quantity":1}],"total":100}'

# Expected: Order created response
```

---

## Quick Smoke Test (5 minutes)

If short on time, run these minimal checks:

1. ✅ **Build succeeds:** `npx nx run-many --target=build --all`
2. ✅ **Type check passes:** `npx nx run-many --target=typecheck --all`
3. ✅ **API Gateway health:** `curl http://localhost:8080/gateway-health`
4. ✅ **Auth service responds:** `curl http://localhost:6001/api`
5. ✅ **MongoDB connects:** Test Prisma connection (see Setup step 4)

---

## Troubleshooting

### "Missing required environment variables"
- Check `.env` file exists in repo root
- Verify variable names match exactly (case-sensitive)
- Ensure `@packages/libs/env-loader` is first import in service main files

### "Cannot connect to Docker daemon"
- Start Docker Desktop
- Verify: `docker ps` works

### "Port already in use"
- Find process: `lsof -ti:8080` (replace with your port)
- Kill process: `kill -9 <PID>`
- Or change port in service code or `PORT` env var

### "MongoDB connection failed"
- Verify MongoDB is running (local) or Atlas URL is correct
- Test connection string: `mongosh "<DATABASE_URL>"`
- Check network/firewall if using Atlas

### "Kafka connection failed"
- Verify Kafka is running: `docker ps | grep kafka`
- Check `KAFKA_BROKERS` env var matches your setup
- For Docker: use `kafka:9092`, for local: use `localhost:9092`

### "Service fails to start"
- Check service logs for error messages
- Verify all required env vars are set
- Check for TypeScript/build errors: `nx build <service>`

---

## Success Criteria

✅ All checks pass if:
1. Dependencies install without errors
2. TypeScript compiles without errors
3. All services build successfully
4. Services start and bind to expected ports
5. Health endpoints return 200 OK
6. At least one functional flow works (register/login or product listing)

---

## Estimated Time

- **Fast path (smoke test):** 15-20 minutes
- **Full verification:** 45-60 minutes
- **With functional tests:** 60-90 minutes
