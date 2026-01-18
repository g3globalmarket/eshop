# Fix Plan - NomadNet Monorepo Audit

**Created:** 2025-01-27  
**Status:** In Progress

This document outlines the ordered checklist of fixes based on the audit findings.

---

## Priority 1: Critical Issues (Must Fix Before Production)

### ✅ 1.1 Docker Buildx Failures
- **Status:** ✅ **COMPLETED**
- **Issue:** Missing root package.json in Dockerfiles
- **Fix:** Added root package.json + .npmrc to all 13 Dockerfiles
- **Verification:** 
  ```bash
  DOCKER_BUILDKIT=1 docker buildx build --progress=plain --no-cache -f apps/auth-service/Dockerfile -t test-auth-service:latest .
  ```
- **Result:** Build succeeds, pnpm install completes

### ✅ 1.2 CI: Pin Node Version
- **Status:** ✅ **FIXED**
- **Issue:** Node version not pinned in CI workflow
- **Location:** `.github/workflows/docker-build.yml` lines 211-214, 280-283
- **Fix Applied:** Added `actions/setup-node@v4` with `node-version: '20'` to both build-backend and build-frontend jobs
- **Rationale:** Ensures deterministic builds across CI runs
- **Verification:** ✅ Code updated, ready for CI test
- **Risk:** Low (additive change)

### ✅ 1.3 CI: Frontend Builds Missing Dependency Installation
- **Status:** ✅ **FIXED**
- **Issue:** Frontend build job doesn't install dependencies before Docker build
- **Location:** `.github/workflows/docker-build.yml` lines 303-317
- **Fix Applied:** Added "Setup build environment" step with pnpm install, Prisma generate, and nx build
- **Rationale:** Provides faster feedback and ensures build works before Docker step (even though Dockerfiles build inside container)
- **Verification:** ✅ Code updated, ready for CI test
- **Risk:** Low (additive change)

### ✅ 1.4 Create .env.example File
- **Status:** ✅ **FIXED**
- **Issue:** No .env.example file for developers
- **Location:** Root directory
- **Fix Applied:** Created `.env.example` with all required environment variables (no secrets, placeholders only)
- **Rationale:** Helps developers set up local environment, prevents accidental secret commits
- **Verification:** ✅ File exists at root, contains Database, JWT, Redis, QPay, Stripe, Kafka, Next.js vars
- **Risk:** None (new file)

### ✅ 1.5 Add CSP Headers to Nginx
- **Status:** ✅ **FIXED**
- **Issue:** Missing Content-Security-Policy headers
- **Location:** `nginx.conf` lines 47-48, 108-109, 153-154, 198-199
- **Fix Applied:** Added CSP headers to all 4 server blocks with Next.js-compatible policy (includes X-XSS-Protection header as well)
- **Rationale:** Mitigates XSS attacks
- **Verification:** ✅ Code updated, needs nginx reload on server to take effect
- **Risk:** Low (may need adjustment for Next.js if issues arise)

---

## Priority 2: Medium Priority (Should Fix Soon)

### 🟡 2.1 Add Health Checks to Services
- **Status:** 🟡 **RECOMMENDED**
- **Issue:** Only api-gateway has healthcheck in docker-compose
- **Location:** `docker-compose.production.yml`, Dockerfiles
- **Fix:** Add HEALTHCHECK to Dockerfiles or healthcheck to compose for all services
- **Rationale:** Better container orchestration, automatic restart on failure
- **Verification:** `docker ps` shows healthy status
- **Risk:** Low

### 🟡 2.2 Review Rate Limiting on Services
- **Status:** 🟡 **REVIEW NEEDED**
- **Issue:** No rate limiting visible on individual services
- **Location:** Service code (needs code review)
- **Fix:** Either add rate limiting to services or document that gateway is only entry point
- **Rationale:** Prevents DoS if gateway is bypassed
- **Verification:** Code review confirms rate limiting strategy
- **Risk:** Medium (requires code changes)

### 🟡 2.3 Review CORS Configuration
- **Status:** 🟡 **REVIEW NEEDED**
- **Issue:** CORS configuration not audited
- **Location:** API Gateway and services
- **Fix:** Review and document CORS settings
- **Rationale:** Prevents CORS misconfiguration vulnerabilities
- **Verification:** CORS headers correct in responses
- **Risk:** Low (review only)

### 🟡 2.4 Verify Request Validation
- **Status:** 🟡 **REVIEW NEEDED**
- **Issue:** Input validation not verified
- **Location:** Service endpoints
- **Fix:** Review code to ensure all endpoints validate input (zod/class-validator)
- **Rationale:** Prevents injection attacks
- **Verification:** Code review confirms validation
- **Risk:** Low (review only)

---

## Priority 3: Low Priority (Nice to Have)

### 🟡 3.1 Add Build Verification in CI
- **Status:** 🟡 **RECOMMENDED**
- **Issue:** No verification step after Docker build
- **Location:** `.github/workflows/docker-build.yml`
- **Fix:** Add smoke test: `docker run --rm image:tag node --version`
- **Rationale:** Catches broken images before push
- **Verification:** CI shows verification step
- **Risk:** None

### 🟡 3.2 Make EC2 Username Configurable
- **Status:** 🟡 **RECOMMENDED**
- **Issue:** EC2 username hardcoded as "ubuntu"
- **Location:** `.github/workflows/docker-build.yml` line 347
- **Fix:** Use secret `EC2_USERNAME` or make configurable
- **Rationale:** More portable, flexible
- **Verification:** Deployment works with different username
- **Risk:** Low

### 🟡 3.3 Add X-XSS-Protection Header
- **Status:** 🟡 **RECOMMENDED**
- **Issue:** Missing X-XSS-Protection header
- **Location:** `nginx.conf`
- **Fix:** Add `add_header X-XSS-Protection "1; mode=block" always;`
- **Rationale:** Additional XSS protection
- **Verification:** Header present in response
- **Risk:** None

### 🟡 3.4 Add Request Size Limits to Nginx
- **Status:** 🟡 **RECOMMENDED**
- **Issue:** No client_max_body_size configured
- **Location:** `nginx.conf`
- **Fix:** Add `client_max_body_size 10M;` in http block
- **Rationale:** Prevents DoS via large uploads
- **Verification:** Large requests rejected
- **Risk:** Low (may need adjustment based on use case)

### 🟡 3.5 Add Timeout Configuration to Nginx
- **Status:** 🟡 **RECOMMENDED**
- **Issue:** No explicit timeout settings
- **Location:** `nginx.conf`
- **Fix:** Add `proxy_read_timeout 60s; proxy_connect_timeout 10s;`
- **Rationale:** Prevents hanging connections
- **Verification:** Timeouts work as expected
- **Risk:** Low (may need tuning)

---

## Implementation Order

1. ✅ **Docker Buildx Fixes** - COMPLETED
2. ✅ **CI Node Version Pinning** - COMPLETED
3. ✅ **CI Frontend Dependency Installation** - COMPLETED
4. ✅ **Create .env.example** - COMPLETED
5. ✅ **Add CSP Headers** - COMPLETED
6. 🟡 **Health Checks** - RECOMMENDED (only 2/10 services have healthchecks)
7. 🟡 **Security Reviews** (Rate limiting, CORS, Validation) - REVIEW NEEDED
8. 🟡 **Low Priority Items** - OPTIONAL

**All critical fixes completed. Ready for CI validation and staging deployment.**

---

## Verification Commands Summary

### After Each Fix:
1. **CI Workflow:**
   ```bash
   # Trigger workflow and verify it completes
   gh workflow run docker-build.yml
   ```

2. **Docker Build:**
   ```bash
   DOCKER_BUILDKIT=1 docker buildx build --progress=plain --no-cache -f apps/{service}/Dockerfile -t test-{service}:latest .
   ```

3. **Nginx Config:**
   ```bash
   nginx -t -c nginx.conf  # Validate syntax
   curl -I https://nomadnet.shop  # Check headers
   ```

4. **Environment:**
   ```bash
   # Verify .env.example exists and is complete
   cat .env.example
   ```

---

## Notes

- All fixes should be minimal and focused
- No risky refactors
- Each fix should be verified independently
- Document any breaking changes

---

**Last Updated:** 2025-01-27

