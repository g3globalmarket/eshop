# LOCAL VERIFICATION CHECKLIST

This document provides step-by-step commands to verify all fixes locally before deploying to production.

## Prerequisites

```bash
# Ensure you're in the project root
cd /Users/user/Desktop/Final\ Project/eshop

# Ensure all dependencies are installed
pnpm install
```

## 1. Nginx Configuration Verification

### Check nginx.conf syntax
```bash
# Test nginx config syntax (requires nginx installed locally)
nginx -t -c $(pwd)/nginx.conf

# Expected output:
# nginx: the configuration file /path/to/nginx.conf syntax is ok
# nginx: configuration file /path/to/nginx.conf test is successful
```

### Verify SSL certificate paths
```bash
# Check that certificate paths are consistent across all server blocks
grep -n "ssl_certificate" nginx.conf

# Expected: All server blocks should reference:
# /etc/letsencrypt/live/nomadnet.shop/fullchain.pem
# /etc/letsencrypt/live/nomadnet.shop/privkey.pem
```

### Verify ACME challenge location
```bash
# Check ACME challenge configuration
grep -A 3 "\.well-known/acme-challenge" nginx.conf

# Expected: All server blocks (HTTP and HTTPS) should have:
# location ^~ /.well-known/acme-challenge/ {
#   root /var/www/certbot;
#   default_type "text/plain";
#   try_files $uri =404;
# }
```

### Verify all required hosts
```bash
# Check that all hosts are configured
grep "server_name" nginx.conf

# Expected hosts:
# - nomadnet.shop www.nomadnet.shop (main user site)
# - sellers.nomadnet.shop (seller portal)
# - admin.nomadnet.shop (admin portal)
# - sandbox.nomadnet.shop (sandbox/testing)
```

### Test HTTP to HTTPS redirect
```bash
# Verify redirect configuration
grep -A 2 "listen 80" nginx.conf

# Expected: HTTP server block should redirect to HTTPS:
# location / { return 301 https://$host$request_uri; }
```

## 2. Docker Compose Configuration Verification

### Verify nginx volume mounts
```bash
# Check docker-compose.override.yml
grep -A 5 "nginx:" docker-compose.override.yml

# Expected volumes:
# - /opt/letsencrypt:/etc/letsencrypt:ro
# - /opt/certbot-www:/var/www/certbot
# - ./nginx.conf:/etc/nginx/nginx.conf:ro
```

### Verify Kafka configuration
```bash
# Check Kafka listeners in production compose file
grep -A 5 "KAFKA_" docker-compose.production.yml | grep -E "(LISTENERS|ADVERTISED)"

# Expected:
# KAFKA_LISTENERS: "PLAINTEXT://0.0.0.0:9092"
# KAFKA_ADVERTISED_LISTENERS: "PLAINTEXT://kafka:9092"
# KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "PLAINTEXT:PLAINTEXT"
```

### Verify kafka-setup bootstrap server
```bash
# Check kafka-setup service
grep -A 10 "kafka-setup:" docker-compose.production.yml | grep "bootstrap-server"

# Expected: All kafka-topics commands should use:
# --bootstrap-server kafka:9092
```

### Verify all services use correct KAFKA_BROKERS
```bash
# Check all service environment variables
grep "KAFKA_BROKERS" docker-compose.production.yml

# Expected: All services should have:
# - KAFKA_BROKERS=kafka:9092
# (NOT kafka:29092)
```

## 3. Kafka Client Configuration Verification

### Check packages/utils/kafka/index.ts
```bash
# Verify default broker address
grep "kafka:" packages/utils/kafka/index.ts

# Expected:
# return [process.env.KAFKA_BROKERS || "kafka:9092"];
# (NOT kafka:29092)
```

## 4. Recommendation Service Middleware Fix Verification

### Verify middleware export
```bash
# Check that isAuthenticated is exported as named export
grep "export.*isAuthenticated" packages/middleware/isAuthenticated.ts

# Expected:
# export const isAuthenticated = async (...)
# export default isAuthenticated;  (for backward compatibility)
```

### Verify all route files use named import
```bash
# Check all route files import correctly
grep -r "import.*isAuthenticated.*from.*@packages/middleware" apps/*/src/routes/

# Expected: All should use named import:
# import { isAuthenticated } from "@packages/middleware/isAuthenticated";
```

### Build recommendation-service and check output
```bash
# Build the service
npx nx build recommendation-service

# Check the built route registration
# The built code should NOT have an extra middleware parameter
node -e "
const fs = require('fs');
const code = fs.readFileSync('dist/apps/recommendation-service/main.js', 'utf8');
const match = code.match(/get\(\"\/get-recommendation-products\".*?\)/s);
if (match) {
  console.log('Route registration:', match[0]);
  // Should be: i.get("/get-recommendation-products", n.getRecommendedProducts)
  // NOT: i.get("/get-recommendation-products", a.default, n.getRecommendedProducts)
}
"
```

## 5. Order Service QPay Verification

### Verify INTERNAL_WEBHOOK_DEBUG flag usage
```bash
# Check that debug logging exists
grep -n "INTERNAL_WEBHOOK_DEBUG" apps/order-service/src/controllers/order.controller.ts

# Expected: Debug logging in both confirmQPayPayment and handleQPayWebhook
```

### Verify SESSION_MISSING response includes required fields
```bash
# Check confirmQPayPayment SESSION_MISSING response
grep -A 10 "SESSION_MISSING" apps/order-service/src/controllers/order.controller.ts | grep -A 5 "confirmQPayPayment"

# Expected response should include:
# - success: true
# - created: false
# - reason: "SESSION_MISSING"
# - sessionId
# - invoiceId
# - handler (if debug enabled)
# - url (if debug enabled)
```

### Verify idempotency check happens BEFORE session check
```bash
# Check that qPayProcessedInvoice lookup happens early
grep -B 5 -A 15 "IDEMPOTENCY CHECK" apps/order-service/src/controllers/order.controller.ts

# Expected: Idempotency check (line ~1031-1067) happens BEFORE session validation
```

### Test idempotency script exists
```bash
# Verify test script exists
ls -la scripts/test-qpay-idempotency.js

# Expected: File should exist
```

## 6. Next.js/Tailwind/PostCSS Configuration Verification

### Verify Next.js config doesn't use withNx wrapper
```bash
# Check user-ui next.config.js
grep "withNx\|@nx/next" apps/user-ui/next.config.js

# Expected: Should NOT contain withNx wrapper
# Comment should explain why: "Do NOT use withNx wrapper as it breaks CSS handling"
```

### Verify PostCSS config
```bash
# Check postcss.config.js
cat apps/user-ui/postcss.config.js

# Expected:
# plugins: {
#   tailwindcss: { config: join(__dirname, 'tailwind.config.js') },
#   autoprefixer: {},
# }
```

### Verify Tailwind config
```bash
# Check tailwind.config.js content paths
grep "content:" apps/user-ui/tailwind.config.js -A 5

# Expected: Should include:
# "./{src,pages,components,app}/**/*.{ts,tsx,js,jsx,html}"
# "./src/**/*.{ts,tsx,js,jsx}"
```

### Verify global.css has Tailwind directives
```bash
# Check global.css
head -n 10 apps/user-ui/src/app/global.css

# Expected:
# @tailwind base;
# @tailwind components;
# @tailwind utilities;
```

### Test local build (without NODE_ENV set)
```bash
# Build user-ui locally (this tests PostCSS/Tailwind processing)
env -u NODE_ENV npx nx build user-ui

# Expected: Should build successfully without CSS parse errors
# Look for output like:
# ✓ Compiled successfully
# (No errors about "Unexpected token" or CSS parsing)
```

### Test local dev server
```bash
# Start dev server (in separate terminal)
env -u NODE_ENV npx nx serve user-ui

# Expected: Should start without errors
# Visit http://localhost:3000 and verify:
# - Tailwind classes are applied
# - No console errors about CSS
# - Page renders correctly with styles
```

## 7. Build All Services

### Build all backend services
```bash
# Build all services to verify no TypeScript errors
npx nx run-many --target=build --projects=api-gateway,auth-service,order-service,product-service,seller-service,admin-service,chatting-service,kafka-service,logger-service,recommendation-service

# Expected: All builds should succeed without errors
```

### Build all frontend services
```bash
# Build all UIs
npx nx run-many --target=build --projects=user-ui,seller-ui,admin-ui

# Expected: All builds should succeed without errors
```

## 8. Docker Build Verification (Local)

### Build and test recommendation-service container
```bash
# Build the Docker image
docker build -t test-recommendation-service:local -f apps/recommendation-service/Dockerfile .

# Run the container
docker run --rm -d --name test-rec-service \
  -e DATABASE_URL="postgresql://user:pass@host.docker.internal:5432/db" \
  -e KAFKA_BROKERS="kafka:9092" \
  test-recommendation-service:local

# Check logs for successful startup
docker logs test-rec-service

# Expected: Should see:
# - "Listening at http://localhost:6007/api"
# - NO errors about middleware or route registration

# Check route registration
docker exec test-rec-service sh -c "wget -qO- http://localhost:6007/api/get-recommendation-products 2>&1"

# Expected: Should return 401 (Unauthorized) - route is registered correctly
# NOT 404 (route not found)

# Cleanup
docker stop test-rec-service
docker rmi test-recommendation-service:local
```

## 9. Entrypoint Script Verification

### Verify recommendation-service entrypoint
```bash
# Check entrypoint.sh
cat apps/recommendation-service/entrypoint.sh

# Expected:
# #!/bin/sh
# npx prisma generate
# exec dumb-init node dist/main.js
```

### Verify order-service entrypoint
```bash
# Check entrypoint.sh
cat apps/order-service/entrypoint.sh

# Expected:
# #!/bin/sh
# npx prisma generate
# exec dumb-init node dist/main.js
```

## 10. Prisma Schema Verification

### Verify QPay-related tables exist
```bash
# Check prisma schema for QPay tables
grep -E "(model qPayProcessedInvoice|model qPayPaymentSession)" prisma/schema.prisma -A 10

# Expected: Both models should exist with required fields:
# - qPayProcessedInvoice: invoiceId (unique), sessionId, status, orderIds
# - qPayPaymentSession: sessionId (unique), invoiceId, status, callbackToken, etc.
```

## Summary Checklist

Before deploying, ensure:

- [ ] Nginx config syntax is valid (`nginx -t`)
- [ ] All SSL certificate paths are correct
- [ ] ACME challenge locations are configured
- [ ] All 5 hosts are configured (nomadnet.shop, www, sellers, admin, sandbox)
- [ ] HTTP to HTTPS redirect works
- [ ] docker-compose.override.yml has correct nginx volume mounts
- [ ] Kafka uses `kafka:9092` everywhere (not `kafka:29092`)
- [ ] packages/utils/kafka/index.ts defaults to `kafka:9092`
- [ ] isAuthenticated middleware uses named export
- [ ] All route files import `{ isAuthenticated }`
- [ ] recommendation-service builds without middleware issues
- [ ] Order service QPay endpoints are correct
- [ ] INTERNAL_WEBHOOK_DEBUG flag works
- [ ] SESSION_MISSING responses include sessionId + invoiceId
- [ ] Idempotency check happens before session check
- [ ] Next.js config doesn't use withNx wrapper
- [ ] PostCSS/Tailwind configs are correct
- [ ] global.css has @tailwind directives
- [ ] user-ui builds successfully without CSS errors
- [ ] All backend services build successfully
- [ ] All frontend services build successfully
- [ ] Entrypoint scripts run `npx prisma generate`
- [ ] Prisma schema has QPay tables

## Next Steps

After all checks pass:
1. Commit all changes
2. Build and push Docker images
3. Follow DEPLOYMENT_CHECKLIST.md for server deployment

