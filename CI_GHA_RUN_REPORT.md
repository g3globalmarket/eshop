# CI GitHub Actions Run Report

**Run ID:** 21106459185  
**Run URL:** https://github.com/g3globalmarket/eshop/actions/runs/21106459185  
**Trigger:** workflow_dispatch (force_rebuild=true)  
**Branch:** main  
**Status:** ❌ FAILURE  
**Conclusion:** failure

---

## Summary

The workflow completed with **multiple failures**:
- ✅ **3 services passed:** admin-service, recommendation-service, user-ui, admin-ui
- ❌ **8 services failed:** auth-service, product-service, seller-service, order-service, chatting-service, logger-service, api-gateway, seller-ui
- ❌ **1 service build failed:** kafka-service

---

## Failures by Category

### 1. Backend Services - Smoke Test Failures (Redis Connection Errors)

**Affected Services:**
- auth-service
- chatting-service  
- logger-service
- order-service
- seller-service
- api-gateway

**Error Pattern:**
```
[ioredis] Unhandled error event: AggregateError [ECONNREFUSED]
```

**Root Cause:**
- CI workflow smoke tests don't start Redis containers
- Services that require Redis (auth-service, chatting-service) fail to connect
- The workflow's error filter pattern doesn't match the actual error format: `[ioredis] Unhandled error event: AggregateError [ECONNREFUSED]`
- Current filter: `grep -v -iE "(redis|kafka|ECONNREFUSED|connection.*refused|imagekit|Missing publicKey)"`
- The filter should work, but the error is being detected by the earlier `grep -iE "(\[FATAL\]|uncaughtException|cannot find module|pnpm: not found|command not found)"` pattern

**Evidence:**
```
build-backend (auth-service)	Smoke test built image	2026-01-18T05:11:38.6931962Z [ioredis] Unhandled error event: AggregateError [ECONNREFUSED]: 
build-backend (auth-service)	Smoke test built image	2026-01-18T05:11:38.6932683Z     at internalConnectMultiple (node:net:1122:18)
```

**Service Status:**
- Container starts successfully: ✅
- Service logs show "Auth service is running at http://localhost:6001/api": ✅
- Redis connection errors are logged but don't crash the service: ✅
- CI workflow incorrectly flags these as fatal errors: ❌

---

### 2. Backend Services - ImageKit Initialization Crash

**Affected Services:**
- product-service
- seller-service

**Error Pattern:**
```
Error: Missing publicKey during ImageKit initialization
    at new ImageKit (/app/node_modules/.pnpm/imagekit@3.2.5/node_modules/imagekit/dist/index.js:72:19)
```

**Root Cause:**
- ImageKit is being initialized at module import time (not using lazy initialization)
- The shared `packages/libs/imagekit/index.ts` has lazy initialization, but services may be importing ImageKit directly
- CI workflow passes `IMAGEKIT_PUBLIC_KEY` but the env var name might be wrong: workflow uses `IMAGEKIT_SECRET_KEY` but code expects `IMAGEKIT_PRIVATE_KEY`

**Evidence:**
```
build-backend (product-service)	Smoke test built image	2026-01-18T05:11:37.1054944Z Error: Missing publicKey during ImageKit initialization
build-backend (product-service)	Smoke test built image	2026-01-18T05:11:37.1056249Z     at new ImageKit (/app/node_modules/.pnpm/imagekit@3.2.5/node_modules/imagekit/dist/index.js:72:19)
```

**Service Status:**
- Container crashes on startup: ❌
- ImageKit initialization happens at module import: ❌

---

### 3. Frontend Service - Next.js SSR Error

**Affected Services:**
- seller-ui

**Error Pattern:**
```
ReferenceError: document is not defined
    at <unknown> (.next/server/chunks/176.js:1:82585)
```

**Root Cause:**
- Next.js SSR issue (client-side code running on server)
- Not related to smoke test infrastructure
- Application code issue

**Evidence:**
```
build-frontend (seller-ui)	Smoke test built image	2026-01-18T05:16:29.0353273Z ReferenceError: document is not defined
build-frontend (seller-ui)	Smoke test built image	2026-01-18T05:16:29.0353897Z     at <unknown> (.next/server/chunks/176.js:1:82585)
```

---

### 4. Build Failure

**Affected Services:**
- kafka-service

**Error:** Build step failed (not smoke test)

---

## First Failing Job/Step

**Job:** `build-backend (auth-service)`  
**Step:** `Smoke test built image`  
**Error:** Container logs show errors (Redis connection errors incorrectly flagged as fatal)

---

## Suspected Root Causes

1. **CI Workflow Error Filter Too Strict:**
   - The error filter checks for `uncaughtException` but Redis connection errors are logged as warnings, not exceptions
   - However, the filter should ignore Redis errors but doesn't because the pattern matching is case-sensitive or the error format doesn't match

2. **ImageKit Env Var Name Mismatch:**
   - Workflow uses `IMAGEKIT_SECRET_KEY` but code expects `IMAGEKIT_PRIVATE_KEY`
   - Or services are importing ImageKit directly instead of using the shared lib with lazy initialization

3. **Missing Redis in CI Smoke Tests:**
   - CI workflow doesn't start Redis containers for services that need them
   - Services should handle Redis connection failures gracefully (they do), but CI flags them as errors

---

## Minimal Fix Plan

### Fix 1: Update CI Workflow Error Filter (HIGH PRIORITY)

**File:** `.github/workflows/docker-build.yml`  
**Line:** 299

**Current:**
```bash
FATAL_ERRORS=$(docker logs "$CONTAINER_NAME" 2>&1 | grep -iE "(\[FATAL\]|uncaughtException|cannot find module|pnpm: not found|command not found)" | grep -v -iE "(redis|kafka|ECONNREFUSED|connection.*refused|imagekit|Missing publicKey)" || true)
```

**Fix:**
- The filter should work, but we need to ensure Redis errors are properly excluded
- Add `ioredis` and `AggregateError` to the exclusion pattern
- Also check if the container is actually running before checking logs

### Fix 2: Fix ImageKit Env Var Name (HIGH PRIORITY)

**File:** `.github/workflows/docker-build.yml`  
**Line:** 282

**Current:**
```yaml
-e IMAGEKIT_SECRET_KEY="dummy-secret-key-for-smoke-test"
```

**Fix:**
- Change to `IMAGEKIT_PRIVATE_KEY` (match what code expects)

### Fix 3: Fix Container Name Check (MEDIUM PRIORITY)

**File:** `.github/workflows/docker-build.yml`  
**Line:** 290

**Current:**
```bash
if ! docker ps | grep -q "$CONTAINER_NAME"; then
```

**Fix:**
- Use `docker ps --format "{{.Names}}" | grep -q "^$CONTAINER_NAME$"` for reliable matching (same fix as local smoke script)

---

## Next Steps

1. Apply Fix 1: Update error filter to properly exclude Redis/ioredis errors
2. Apply Fix 2: Fix ImageKit env var name
3. Apply Fix 3: Fix container name check pattern
4. Re-run workflow and verify all services pass

---

## Verification Commands

After fixes:
```bash
# Trigger workflow again
gh workflow run "Build & Deploy" --ref main -f force_rebuild=true

# Monitor
gh run watch <RUN_ID> --exit-status
```

