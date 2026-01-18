# Full Production Audit - NomadNet Monorepo

**Date:** 2025-01-27  
**Auditor:** Principal DevOps/SRE + Backend Build Engineer  
**Scope:** Complete production readiness audit - prevent "build succeeds, runtime breaks" issues

---

## PHASE 0 — REPOSITORY INVENTORY & SERVICE MAP

### Service Inventory Table

| Service Name | Type | Dockerfile | Entrypoint | Port | Health Endpoint | Prisma | Redis | Kafka |
|--------------|------|-----------|------------|------|----------------|--------|-------|-------|
| api-gateway | Backend (Express) | `apps/api-gateway/Dockerfile` | None (CMD) | 8080 | `/gateway-health` | ✅ Yes | ❌ No | ✅ Yes |
| auth-service | Backend (Express) | `apps/auth-service/Dockerfile` | `entrypoint.sh` | 6001 | `/` | ✅ Yes | ✅ Yes | ✅ Yes |
| product-service | Backend (Express) | `apps/product-service/Dockerfile` | `entrypoint.sh` | 6002 | `/` | ✅ Yes | ❌ No | ✅ Yes |
| order-service | Backend (Express) | `apps/order-service/Dockerfile` | `entrypoint.sh` | 6003 | `/` | ✅ Yes | ❌ No | ✅ Yes |
| seller-service | Backend (Express) | `apps/seller-service/Dockerfile` | `entrypoint.sh` | 6004 | `/` | ✅ Yes | ✅ Yes | ✅ Yes |
| admin-service | Backend (Express) | `apps/admin-service/Dockerfile` | `entrypoint.sh` | 6005 | `/` | ✅ Yes | ❌ No | ✅ Yes |
| chatting-service | Backend (Express) | `apps/chatting-service/Dockerfile` | None (CMD) | 6006 | `/` | ✅ Yes | ❌ No | ✅ Yes |
| kafka-service | Backend (Express) | `apps/kafka-service/Dockerfile` | None (CMD) | N/A | N/A | ❌ No | ❌ No | ✅ Yes |
| logger-service | Backend (Express) | `apps/logger-service/Dockerfile` | None (CMD) | 6008 | `/` | ✅ Yes | ❌ No | ✅ Yes |
| recommendation-service | Backend (Express) | `apps/recommendation-service/Dockerfile` | `entrypoint.sh` | 6007 | `/` | ✅ Yes | ❌ No | ✅ Yes |
| user-ui | Frontend (Next.js) | `apps/user-ui/Dockerfile` | None (ENTRYPOINT) | 3000 | `/` | ❌ No | ❌ No | ❌ No |
| seller-ui | Frontend (Next.js) | `apps/seller-ui/Dockerfile` | None (ENTRYPOINT) | 3001 | `/` | ❌ No | ❌ No | ❌ No |
| admin-ui | Frontend (Next.js) | `apps/admin-ui/Dockerfile` | None (ENTRYPOINT) | 3002 | `/` | ❌ No | ❌ No | ❌ No |

### Production Deploy Surface

**Images Built & Pushed:**
- All 13 services listed above
- Tag format: `${DOCKER_USERNAME}/<service>:latest`
- Built via GitHub Actions: `.github/workflows/docker-build.yml`

**Images Pulled & Run:**
- `docker-compose.production.yml` references all 13 services
- All use `env_file: - .env` for secrets
- All set `NODE_ENV=production` and `KAFKA_BROKERS=kafka:9092`

**Ports Exposed & Proxied:**
- Nginx (port 80/443) → proxies to:
  - `api-gateway:8080` → `/api/*`
  - `user-ui:3000` → `/`
  - `seller-ui:3001` → `/` (sellers.nomadnet.shop)
  - `admin-ui:3002` → `/` (admin.nomadnet.shop)
- Backend services expose internal ports (6001-6008) but not externally

---

## PHASE 1 — DOCKERFILES: BUILD vs RUNTIME CORRECTNESS

### Dockerfile Audit Table

| Service | Workspace Correct | Reproducible | Runtime Correct | Prisma Build-Time | Healthcheck Deps | Status |
|---------|------------------|--------------|----------------|-------------------|------------------|--------|
| api-gateway | ✅ | ✅ | ✅ | ✅ | ✅ (curl) | ✅ PASS |
| auth-service | ✅ | ✅ | ✅ | ✅ | ✅ (curl) | ✅ PASS |
| product-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| order-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| seller-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| admin-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| chatting-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| kafka-service | ✅ | ✅ | ✅ | N/A | ❌ (no healthcheck) | ✅ PASS |
| logger-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| recommendation-service | ✅ | ✅ | ✅ | ✅ | ❌ (no healthcheck) | ✅ PASS |
| user-ui | ✅ | ✅ | ✅ | N/A | ❌ (no healthcheck) | ✅ PASS |
| seller-ui | ✅ | ✅ | ✅ | N/A | ❌ (no healthcheck) | ✅ PASS |
| admin-ui | ✅ | ✅ | ✅ | N/A | ❌ (no healthcheck) | ✅ PASS |

### Detailed Findings

#### ✅ api-gateway
- **Workspace:** ✅ Root package.json + lock + workspace.yaml copied correctly
- **Reproducibility:** ✅ Node 20-alpine, pnpm@9.12.3 pinned, --frozen-lockfile
- **Runtime:** ✅ node, curl, dumb-init (via CMD), non-root user
- **Prisma:** ✅ Generated in builder stage (line 26)
- **Healthcheck:** ✅ curl available (line 30: `RUN apk add --no-cache curl`)
- **CMD:** ✅ `CMD ["node","dist/main.js"]` matches artifact

#### ✅ auth-service
- **Workspace:** ✅ Root package.json + lock + workspace.yaml copied correctly
- **Reproducibility:** ✅ Node 20-alpine, pnpm@9.12.3 pinned, --frozen-lockfile
- **Runtime:** ✅ node, dumb-init, curl (line 37), non-root user
- **Prisma:** ✅ Generated in builder stage (line 27)
- **Healthcheck:** ✅ curl available (compose uses curl for healthcheck)
- **Entrypoint:** ✅ `entrypoint.sh` → `exec dumb-init node dist/main.js`

#### ⚠️ product-service, order-service, seller-service, admin-service, recommendation-service
- **Workspace:** ✅ All correct
- **Reproducibility:** ✅ All correct
- **Runtime:** ✅ All correct
- **Prisma:** ✅ All generated at build time
- **Healthcheck:** ⚠️ No healthcheck in compose (not critical, but recommended)
- **Entrypoint:** ✅ All use `entrypoint.sh` → `exec dumb-init node dist/main.js`

#### ✅ chatting-service, logger-service, kafka-service
- **Workspace:** ✅ All correct
- **Reproducibility:** ✅ All correct
- **Runtime:** ✅ All correct
- **Prisma:** ✅ Generated at build time (chatting, logger), N/A (kafka)
- **CMD:** ✅ All use `CMD ["node", "dist/main.js"]` or `CMD ["dumb-init", "node", "dist/main.js"]`

#### ✅ user-ui, seller-ui, admin-ui
- **Workspace:** ✅ All correct
- **Reproducibility:** ✅ All correct
- **Runtime:** ✅ All correct
- **Next.js Standalone:** ✅ All use `.next/standalone` output
- **CMD:** ✅ All use `CMD ["node", "apps/<ui>/server.js"]` matching standalone path
- **Static Assets:** ✅ `.next/static` and `public/` copied correctly

---

## PHASE 2 — ENTRYPOINT SCRIPTS: RUNTIME SAFETY

### Entrypoint Safety Report

| Service | No pnpm/npm/npx | Strict Mode | Exec Pattern | No Build Tasks | Env Validation | Status |
|---------|----------------|-------------|--------------|----------------|----------------|--------|
| auth-service | ✅ | ⚠️ (set -e only) | ✅ | ✅ | ✅ (in main.ts) | ✅ PASS |
| product-service | ✅ | ⚠️ (set -e only) | ✅ | ✅ | ✅ (in main.ts) | ✅ PASS |
| order-service | ✅ | ⚠️ (set -e only) | ✅ | ✅ | ✅ (in main.ts) | ✅ PASS |
| seller-service | ✅ | ⚠️ (set -e only) | ✅ | ✅ | ✅ (in main.ts) | ✅ PASS |
| admin-service | ✅ | ⚠️ (set -e only) | ✅ | ✅ | ✅ (in main.ts) | ✅ PASS |
| recommendation-service | ✅ | ⚠️ (set -e only) | ✅ | ✅ | ✅ (in main.ts) | ✅ PASS |

### Detailed Findings

**All entrypoint scripts:**
- ✅ No pnpm/npm/npx usage (verified in previous audit)
- ✅ Use `exec dumb-init node dist/main.js` pattern
- ✅ No Prisma generation at runtime
- ⚠️ Use `set -e` only (not `set -euo pipefail`)

**Recommendation:** Upgrade to `set -euo pipefail` for stricter error handling:
```bash
#!/bin/sh
set -euo pipefail  # Exit on error, undefined vars, pipe failures
# Prisma Client is generated at build time, not runtime
exec dumb-init node dist/main.js
```

**Status:** 🟡 RECOMMENDED (low priority, but improves safety)

---

## PHASE 3 — APPLICATION STARTUP SAFETY

### Env Var Matrix

| Service | Required Env Vars | Validation | Health Endpoint | Status |
|---------|------------------|------------|----------------|--------|
| api-gateway | DATABASE_URL | ✅ (main.ts) | `/gateway-health` | ✅ PASS |
| auth-service | DATABASE_URL, JWT_SECRET | ✅ (main.ts) | `/` | ✅ PASS |
| product-service | DATABASE_URL | ✅ (main.ts) | `/` | ✅ PASS |
| order-service | DATABASE_URL | ✅ (main.ts) | `/` | ✅ PASS |
| seller-service | DATABASE_URL | ✅ (main.ts) | `/` | ✅ PASS |
| admin-service | DATABASE_URL | ✅ (main.ts) | `/` | ✅ PASS |
| chatting-service | None (optional) | N/A | `/` | ✅ PASS |
| kafka-service | None (optional) | N/A | N/A | ✅ PASS |
| logger-service | None (optional) | N/A | `/` | ✅ PASS |
| recommendation-service | DATABASE_URL | ✅ (main.ts) | `/` | ✅ PASS |
| user-ui | NEXT_PUBLIC_* vars | ✅ (build-time) | `/` | ✅ PASS |
| seller-ui | NEXT_PUBLIC_* vars | ✅ (build-time) | `/` | ✅ PASS |
| admin-ui | NEXT_PUBLIC_* vars | ✅ (build-time) | `/` | ✅ PASS |

### Detailed Findings

**Backend Services:**
- ✅ All Prisma-using services validate DATABASE_URL at startup
- ✅ auth-service validates JWT_SECRET
- ✅ All services log service name, environment, and port
- ✅ Health endpoints exist (root `/` or `/gateway-health`)

**Frontend Services:**
- ✅ NEXT_PUBLIC_* vars set in compose
- ✅ Base API URLs match Nginx routes (verified in nginx.conf)

---

## PHASE 4 — CI/CD PIPELINE AUDIT

### CI Audit Results

**File:** `.github/workflows/docker-build.yml`

#### ✅ Node Version Pinning
- **Location:** Lines 211-214, 280-283
- **Status:** ✅ PASS
- **Evidence:** `setup-node@v4` with `node-version: '20'`

#### ✅ pnpm Pinning
- **Location:** Lines 241-242, 310-311
- **Status:** ✅ PASS
- **Evidence:** `corepack prepare pnpm@9.12.3 --activate` matches `package.json` packageManager

#### ✅ Build Correctness
- **Location:** Lines 248, 251
- **Status:** ✅ PASS
- **Evidence:** 
  - `pnpm exec prisma generate` run at build time (line 248)
  - `npx nx build ${{ matrix.service }}` builds before Docker

#### ✅ Docker Buildx
- **Location:** Lines 254-270
- **Status:** ✅ PASS
- **Evidence:**
  - Uses `docker/build-push-action@v5`
  - `push: true` pushes to registry
  - Tags: `${{ env.DOCKER_USERNAME }}/${{ matrix.service }}:latest`
  - Uses registry cache (cache-from/cache-to)

#### ⚠️ Post-Build Smoke Test
- **Status:** 🟡 MISSING
- **Impact:** No automated verification that images start correctly
- **Recommendation:** Add smoke test step after build (see Phase 6)

---

## PHASE 5 — SERVER DEPLOYMENT AUDIT

### docker-compose.production.yml Audit

**Status:** ✅ MOSTLY CORRECT

**Findings:**
- ✅ All services use `env_file: - .env`
- ✅ All set `NODE_ENV=production` and `KAFKA_BROKERS`
- ✅ Healthchecks present for api-gateway and auth-service
- ⚠️ Healthchecks missing for other services (not critical, but recommended)
- ✅ Restart policies: `unless-stopped`
- ✅ Resource limits set (memory, CPU)
- ✅ Depends_on with health conditions for Kafka

**Recommendation:** Add healthchecks to all services:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:<port>/"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Deploy Scripts Audit

**Files:**
- `scripts/deploy-production.sh`
- `scripts/pull-and-deploy.sh`

**Status:** ⚠️ NEEDS IMPROVEMENT

**Findings:**
- `deploy-production.sh`: Uses `set -e` only (line 2) - should use `set -euo pipefail`
- `pull-and-deploy.sh`: No `set -e` at all (line 1) - should use `set -euo pipefail`
- Both scripts: No compose config validation before deploy
- `deploy-production.sh`: ✅ Has health check wait logic (good)
- `pull-and-deploy.sh`: ⚠️ Uses deprecated `docker-compose` instead of `docker compose`

**Recommendations:**
1. Add `set -euo pipefail` to both scripts
2. Add compose config validation: `docker compose config > /dev/null`
3. Update `pull-and-deploy.sh` to use `docker compose` (not `docker-compose`)
4. Add rollback instructions to scripts

### Nginx Audit

**File:** `nginx.conf`

**Status:** ✅ CORRECT

**Findings:**
- ✅ Proxy routes configured for all UIs and API
- ✅ WebSocket support for chatting (lines 108-112, 153-157, 198-202)
- ✅ CSP configured (Next.js-compatible with unsafe-eval/unsafe-inline)
- ✅ Security headers: HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- ✅ client_max_body_size: 50m (line 7)
- ✅ Timeouts configured

---

## PHASE 6 — AUTOMATED SMOKE TEST HARNESS

### Smoke Test Status

**File:** `scripts/smoke-run-images.sh`

**Status:** ✅ EXISTS (created in previous audit)

**Features:**
- ✅ Builds auth-service and user-ui
- ✅ Runs with minimal env
- ✅ Probes health endpoints
- ✅ Uses `set -euo pipefail`
- ✅ Cleans up on exit (trap)
- ✅ Clear pass/fail output

**Verification:**
```bash
bash scripts/smoke-run-images.sh
# Expected: Both containers build and start successfully
```

---

## PHASE 7 — FINAL SUMMARY

### Critical Issues: 0
All critical issues have been fixed in previous audits.

### High Priority Issues: 2

1. **Missing Healthchecks** (HIGH)
   - **Impact:** Cannot detect unhealthy containers automatically
   - **Location:** `docker-compose.production.yml` - Only 3 services have healthchecks (nginx, api-gateway, auth-service)
   - **Fix:** Add healthchecks to remaining services (product, order, seller, admin, chatting, logger, recommendation, UIs)
   - **Status:** 🟡 RECOMMENDED
   - **Note:** Services without healthchecks: product-service, order-service, seller-service, admin-service, chatting-service, logger-service, recommendation-service, user-ui, seller-ui, admin-ui

2. **Deploy Script Error Handling** (HIGH)
   - **Impact:** Scripts may continue on errors, leading to partial deployments
   - **Location:** `scripts/deploy-production.sh` line 2, `scripts/pull-and-deploy.sh` line 1
   - **Evidence:** `deploy-production.sh` uses `set -e` only, `pull-and-deploy.sh` has no `set -e`
   - **Fix:** Use `set -euo pipefail` for strict error handling
   - **Status:** 🟡 RECOMMENDED

### Medium Priority Issues: 3

1. **Entrypoint Strict Mode** (MEDIUM)
   - **Impact:** Less strict error handling
   - **Location:** All `apps/*/entrypoint.sh` files
   - **Evidence:** All use `set -e` only, not `set -euo pipefail`
   - **Fix:** Upgrade to `set -euo pipefail` (or `set -eu` if pipefail not available in busybox sh)
   - **Status:** 🟡 RECOMMENDED

2. **CI Smoke Test** (MEDIUM)
   - **Impact:** No automated verification of built images
   - **Location:** `.github/workflows/docker-build.yml`
   - **Fix:** Add smoke test step after build jobs
   - **Status:** 🟡 RECOMMENDED

3. **.npmrc Safety** (MEDIUM - VERIFIED SAFE)
   - **Location:** All Dockerfiles copy `.npmrc`
   - **Evidence:** `.npmrc` contains only config (no tokens): `public-hoist-pattern[]=*prisma*`, `save-exact=true`, etc.
   - **Status:** ✅ SAFE (no secrets, just pnpm config)

### Low Priority Issues: 0

---

## Verification Commands

### Build Verification
```bash
# Build one backend service
DOCKER_BUILDKIT=1 docker buildx build --load \
  -f apps/auth-service/Dockerfile -t test-auth:latest .

# Build one UI service
DOCKER_BUILDKIT=1 docker buildx build --load \
  -f apps/user-ui/Dockerfile -t test-ui:latest .
```

### Runtime Verification
```bash
# Test backend
docker run --rm -d --name test-auth \
  -e NODE_ENV=production \
  -e DATABASE_URL="mongodb://localhost:27017/test" \
  -e JWT_SECRET="test" \
  -p 6001:6001 test-auth:latest

docker logs test-auth
docker exec test-auth curl -f http://localhost:6001/
docker stop test-auth
```

### Smoke Test
```bash
bash scripts/smoke-run-images.sh
```

---

**Report Generated:** 2025-01-27  
**All Critical Issues:** FIXED  
**Production Ready:** YES (with recommended improvements)

