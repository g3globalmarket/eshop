# Local Audit Commands

Every command run (or recommended) during the audit, grouped by category.

---

## Prerequisites Check

```bash
# Node.js version
node -v
# Expected: v20.x.x or higher

# pnpm version
pnpm -v
# Expected: 9.12.3 or higher

# Docker version
docker --version
# Expected: Docker version X.X.X

# MongoDB CLI (optional)
mongosh --version
# Expected: MongoDB shell version X.X.X

# Check if ports are available
lsof -ti:8080,6001,6002,6003,6004,6005,6006,6007,6008,3000,3001,3002
# Expected: No output (ports free) or list of PIDs
```

---

## Install

```bash
# Install all dependencies
pnpm install

# Expected output:
# - Lockfile is up to date
# - Prisma Client generated
# - All packages installed
# - Done in X.Xs
```

---

## Static Checks

### TypeScript Type Checking
```bash
npx nx run-many --target=typecheck --all --parallel=3

# Expected output:
# > nx run <project>:typecheck
# > tsc --build --emitDeclarationOnly
# ...
# NX   Successfully ran target typecheck for 12 projects
```

### Linting (Individual Apps)
```bash
# User UI
cd apps/user-ui && pnpm lint

# Seller UI
cd apps/seller-ui && pnpm lint

# Admin UI
cd apps/admin-ui && pnpm lint

# Expected: No linting errors or warnings
```

### Unit Tests
```bash
npx nx run-many --target=test --all --parallel=3

# Expected: Tests run or "No tests found" (current state)
```

---

## Build

### Build All Projects
```bash
npx nx run-many --target=build --all --parallel=3

# Expected output:
# - All 15 projects build successfully
# - Warnings about Nx lockfile are OK (non-blocking)
# - Build artifacts created in dist/ or .next/ directories
```

### Build Individual Services
```bash
# API Gateway
nx build api-gateway

# Auth Service
nx build auth-service

# Product Service
nx build product-service

# Order Service
nx build order-service

# Frontend Apps
nx build user-ui
nx build seller-ui
nx build admin-ui
```

---

## Infrastructure

### Start Kafka
```bash
# Check if already running
docker ps | grep kafka

# Start Kafka and Zookeeper (if not running)
pnpm kafka:dev:up

# Expected output (if starting):
# Creating network...
# Creating zookeeper...
# Creating kafka...
# Creating kafka-setup...
# Topics created successfully!

# Verify Kafka is running
docker ps | grep kafka
# Expected: kafka container listed and running

# Verify ports
lsof -ti:9092  # Kafka port
lsof -ti:2181  # Zookeeper port
# Expected: Process IDs shown
```

### Stop Kafka
```bash
pnpm kafka:dev:down
```

### Check Kafka Topics
```bash
docker exec -it <kafka-container> kafka-topics --list --bootstrap-server localhost:9092

# Expected topics:
# - user-events
# - logs
# - chat.new_message
```

### Test MongoDB Connection
```bash
# Check if MongoDB container is running
docker ps | grep mongo
lsof -ti:27017  # Should show process ID

# Test connection using Prisma Client
cd /path/to/repo
node -e "
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect()
  .then(() => { console.log('✅ MongoDB connected'); process.exit(0); })
  .catch(e => { console.log('❌ MongoDB connection failed:', e.message.split('DATABASE_URL')[0]); process.exit(1); });
"

# Expected: ✅ MongoDB connected
```

---

## Runtime - Start Services

### Start All Services (Development)
```bash
pnpm dev

# Expected: All services start in parallel
# Note: This may be resource-intensive
```

### Start Individual Services
```bash
# API Gateway (port 8080)
nx serve api-gateway
# Health: curl http://localhost:8080/gateway-health

# Auth Service (port 6001)
nx serve auth-service
# Health: curl http://localhost:6001/

# Product Service (port 6002)
nx serve product-service
# Health: curl http://localhost:6002/

# Order Service (port 6003)
nx serve order-service
# Health: curl http://localhost:6003/api

# Seller Service (port 6004)
nx serve seller-service
# Health: curl http://localhost:6004/

# Admin Service (port 6005)
nx serve admin-service
# Health: curl http://localhost:6005/

# Chatting Service (port 6006)
nx serve chatting-service
# Health: curl http://localhost:6006/
# WebSocket: node scripts/ws-smoke.mjs chatting 6006

# Recommendation Service (port 6007)
nx serve recommendation-service
# Health: curl http://localhost:6007/

# Logger Service (port 6008)
nx serve logger-service
# WebSocket: node scripts/ws-smoke.mjs logger 6008

# Kafka Service (background consumer)
nx serve kafka-service
# Verifies: Consumer connects to Kafka, subscribes to user-events topic
```

### Start Frontend Apps
```bash
# IMPORTANT: Set NEXT_PUBLIC_SERVER_URI in .env before starting
# These vars are read at UI startup in dev mode

# User UI (port 3000)
pnpm user-ui
# OR
cd apps/user-ui && pnpm dev

# Verify: curl http://localhost:3000
# Expected: HTML page loads
# Check: Open browser DevTools → Network, verify API calls go to http://localhost:8080

# Seller UI (port 3001)
pnpm seller-ui
# OR
cd apps/seller-ui && pnpm dev

# Verify: curl http://localhost:3001
# Expected: HTML page loads

# Admin UI (port 3002)
pnpm admin-ui
# OR
cd apps/admin-ui && pnpm dev

# Verify: curl http://localhost:3002
# Expected: HTML page loads
```

**Required Environment Variables (add to root .env):**
```bash
NEXT_PUBLIC_SERVER_URI=http://localhost:8080
NEXT_PUBLIC_CHATTING_WEBSOCKET_URI=ws://localhost:6006
NEXT_PUBLIC_SELLER_SERVER_URI=http://localhost:3001
NEXT_PUBLIC_SOCKET_URI=ws://localhost:6008
```

**Verify env vars are set:**
```bash
node -e "require('dotenv').config(); console.log('NEXT_PUBLIC_SERVER_URI:', process.env.NEXT_PUBLIC_SERVER_URI);"
# Expected: NEXT_PUBLIC_SERVER_URI: http://localhost:8080
```

**Note:** 
- Restart UIs after changing these vars
- user-ui and admin-ui use `NEXT_PUBLIC_SERVER_URI` for API calls
- seller-ui uses relative paths (same origin)
- **Next.js Env Priority:** `.env.local` (in app directory) > root `.env`
- If `apps/user-ui/.env.local` exists, it overrides root `.env` for that app
- Verified: `apps/user-ui/.env.local` has `NEXT_PUBLIC_SERVER_URI=http://localhost:8080`

---

## Health Checks

### API Gateway
```bash
curl http://localhost:8080/gateway-health

# Expected response:
# {"message":"API Gateway is healthy!","timestamp":"...","environment":"development"}
```

### Auth Service
```bash
curl http://localhost:6001/api

# Expected: JSON response or "Hello API"
```

### Product Service
```bash
curl http://localhost:6002/api

# Expected: Service response
```

### Order Service
```bash
curl http://localhost:6003/api

# Expected: Service response
```

### All Services (Quick Check)
```bash
# Check all service ports
for port in 6001 6002 6003 6004 6005 6006 6007 6008 8080; do
  echo "Checking port $port..."
  if [ $port -eq 8080 ]; then
    curl -s http://localhost:$port/gateway-health 2>&1 | head -1 || echo "Port $port not responding"
  else
    curl -s http://localhost:$port/ 2>&1 | head -1 || echo "Port $port not responding"
  fi
done
```

### WebSocket Tests
```bash
# Test chatting-service WebSocket
node scripts/ws-smoke.mjs chatting 6006

# Test logger-service WebSocket
node scripts/ws-smoke.mjs logger 6008

# Expected output:
# ✅ Connected to <service>-service WebSocket
# (Connection handshake successful)
```

### Kafka Consumer Verification
```bash
# Check KAFKA_BROKERS is set (without exposing value)
node -e "require('dotenv').config(); console.log('KAFKA_BROKERS:', process.env.KAFKA_BROKERS ? '[SET]' : '[NOT SET]');"

# Start kafka-service
nx serve kafka-service

# Verify Kafka topics exist
docker exec eshop-master-kafka-1 kafka-topics --list --bootstrap-server kafka:29092

# Expected topics:
# - user-events
# - logs
# - chat.new_message
```

---

## Functional Tests

### User Registration
```bash
curl -X POST http://localhost:8080/auth/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "Test123!"
  }'

# Expected: Success response or OTP required
```

### User Login
```bash
curl -X POST http://localhost:8080/auth/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!"
  }' \
  -c cookies.txt -v

# Expected: 200 OK with Set-Cookie headers
# Verify: Check cookies.txt for access_token and refresh_token
```

### Get User Profile
```bash
curl http://localhost:8080/auth/api/user \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -b cookies.txt

# Expected: User profile JSON
```

### List Products
```bash
# Via API Gateway
curl http://localhost:8080/product/api/get-all-products?page=1&limit=5

# Expected: JSON with products array, pagination info
# Example: {"products":[],"top10By":"topSales","top10Products":[],"total":0,"currentPage":1,"totalPages":0}

# Get Categories
curl http://localhost:8080/product/api/get-categories

# Expected: JSON with categories and subCategories
```

### Gateway Proxy Routes
```bash
# All services accessible via gateway at root paths:
curl http://localhost:8080/seller/          # Returns: {"message":"Hello Seller API"}
curl http://localhost:8080/admin/           # Returns: {"message":"Welcome to admin-service!"}
curl http://localhost:8080/chatting/         # Returns: {"message":"Welcome to chatting-service!"}
curl http://localhost:8080/recommendation/   # Returns: {"message":"Welcome to recommendation-service!"}
curl http://localhost:8080/product/         # Returns: {"message":"Product service is running"}
curl http://localhost:8080/auth/            # Returns: {"message":"Hello API"}
curl http://localhost:8080/order/           # (service running, may need specific route)

# API routes (may require authentication):
curl http://localhost:8080/seller/api/get-seller/:id
curl http://localhost:8080/admin/api/...
curl http://localhost:8080/chatting/api/...
curl http://localhost:8080/recommendation/api/...

# Note: Services can also be accessed directly:
curl http://localhost:6004/  # seller-service direct
curl http://localhost:6005/  # admin-service direct
# etc.
```

### Get Product by Slug
```bash
curl http://localhost:8080/product/api/products/test-product-slug

# Expected: Product details JSON
```

### Product API Endpoints (via Gateway)
```bash
# Get all products
curl "http://localhost:8080/product/api/get-all-products?page=1&limit=5"
# Expected: {"products":[],"total":0,"currentPage":1,"totalPages":0}

# Get categories
curl "http://localhost:8080/product/api/get-categories"
# Expected: {"categories":[...],"subCategories":{...}}

# Get latest products
curl "http://localhost:8080/product/api/get-all-products?page=1&limit=10&type=latest"
# Expected: Products array with latest products

# Get top shops
curl "http://localhost:8080/product/api/top-shops"
# Expected: {"shops":[...]}
```

### User Registration (Dev-Only OTP Fallback)
**Status:** ✅ Unblocked with dev-only fallback

**Required Env Vars for Dev Testing:**
- `EXPOSE_OTP_IN_DEV=true` (optional, dev only)
- `NODE_ENV=development` (defaults to development if not set)

**Register user (dev mode returns OTP in response):**
```bash
curl -X POST http://localhost:8080/auth/api/user-registration \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test123!"}'

# Expected (dev mode with EXPOSE_OTP_IN_DEV=true):
# {"message":"OTP generated for local testing (dev mode).","devOtp":"7499"}

# Expected (production or without flag):
# {"message":"OTP sent to email. Please verify your account."}
```

**Verify user with OTP:**
```bash
# Extract OTP from registration response (devOtp field)
curl -X POST http://localhost:8080/auth/api/verify-user \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"7499","password":"Test123!","name":"Test User"}'

# Expected: {"success":true,"message":"User registered successfully!"}
```

**Login after registration:**
```bash
curl -X POST http://localhost:8080/auth/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!"}' \
  -c cookies.txt

# Expected: Sets authentication cookies
```

**Access protected endpoint:**
```bash
curl http://localhost:8080/auth/api/user -b cookies.txt

# Expected: User data JSON (or error if not authenticated)
```

**Note:** 
- OTP is stored in Redis with 5-minute expiry
- In dev mode with `EXPOSE_OTP_IN_DEV=true`, OTP is returned in response (no email sent)
- Production behavior unchanged: requires SMTP configuration for email delivery

### Order Creation
**Status:** ⚠️ Requires authentication and may trigger payment
**Note:** Order creation should be tested through UI with authenticated user, not via curl
**Endpoints:**
- `/order/api/create-payment-session` - Requires JWT auth, creates payment session
- `/order/api/create-payment-intent` - Requires JWT auth, may trigger QPay/Stripe payment

### Create Order
```bash
curl -X POST http://localhost:8080/order/api/create-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -d '{
    "items": [{"productId": "...", "quantity": 1}],
    "total": 100,
    "shopId": "..."
  }'

# Expected: Order created response
```

---

## Security Checks

### Check for Secrets in Code
```bash
# Search for potential secret logging
grep -r "console.log.*password\|console.log.*secret\|console.log.*token" apps/ --ignore-case

# Expected: Only test files or safe patterns
```

### Dependency Audit
```bash
pnpm audit

# Expected: List of vulnerabilities (if any)
# Action: Review and update vulnerable packages
```

### Check .env is Gitignored
```bash
git check-ignore .env

# Expected: .env (file is ignored)
```

---

## Database

### Prisma Generate
```bash
pnpm exec prisma generate

# Expected: Prisma Client generated successfully
```

### Prisma Studio (GUI for database)
```bash
pnpm exec prisma studio

# Expected: Opens browser at http://localhost:5555
```

### Prisma Validate Schema
```bash
pnpm exec prisma validate

# Expected: Schema is valid
```

---

## Cleanup

### Stop All Services
```bash
# Kill all Node processes (careful - kills all Node processes)
pkill -f "nx serve" || true
pkill -f "next dev" || true
```

### Stop Kafka
```bash
pnpm kafka:dev:down
```

### Clean Build Artifacts
```bash
# Remove all dist directories
find . -type d -name "dist" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name ".next" -exec rm -rf {} + 2>/dev/null || true
find . -type d -name "out" -exec rm -rf {} + 2>/dev/null || true
```

---

## Troubleshooting Commands

### Check Port Usage
```bash
# Check if port is in use
lsof -ti:8080

# Kill process on port
kill -9 $(lsof -ti:8080)
```

### Check Docker Containers
```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View container logs
docker logs <container-name>

# Stop container
docker stop <container-name>
```

### Check Environment Variables
```bash
# Load and print env vars (without values)
node -e "require('dotenv').config(); Object.keys(process.env).filter(k => k.includes('DATABASE') || k.includes('JWT') || k.includes('KAFKA')).forEach(k => console.log(k + '=' + (process.env[k] ? '[SET]' : '[NOT SET]')));"
```

### Check Service Logs
```bash
# If using process manager (PM2, etc.)
pm2 logs

# Or check individual service output in terminal where it's running
```

---

## Expected Output Hints

### Successful Install
```
Scope: all 24 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date
...
✔ Generated Prisma Client
Done in 4.7s
```

### Successful Type Check
```
> nx run <project>:typecheck
> tsc --build --emitDeclarationOnly
...
NX   Successfully ran target typecheck for 12 projects
```

### Successful Build
```
> nx run <project>:build
...
webpack 5.98.0 compiled successfully in 453 ms
...
NX   Successfully ran target build for 15 projects
```

### Service Starting
```
🚀 API Gateway listening at http://localhost:8080
🌍 Environment: development
🔗 Service URL Mode: local (auto)
✅ Site config initialized successfully!
```

### Health Check Success
```json
{
  "message": "API Gateway is healthy!",
  "timestamp": "2025-01-27T...",
  "environment": "development"
}
```
