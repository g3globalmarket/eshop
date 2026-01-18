# PHASE 2 — ENTRYPOINT RUNTIME SAFETY

**Date:** 2025-01-27  
**Auditor:** Senior DevOps/SRE + Build Engineer  
**Goal:** Verify all entrypoint scripts are runtime-safe (no build tools)

---

## Audit Results Summary

**Status:** ✅ ALL PASS - All 6 entrypoint scripts verified and safe

---

## Entrypoint Scripts Found

**Total Entrypoints:** 6
- `apps/auth-service/entrypoint.sh`
- `apps/product-service/entrypoint.sh`
- `apps/order-service/entrypoint.sh`
- `apps/seller-service/entrypoint.sh`
- `apps/admin-service/entrypoint.sh`
- `apps/recommendation-service/entrypoint.sh`

**Services with Direct CMD:** 7
- api-gateway, chatting-service, kafka-service, logger-service, user-ui, seller-ui, admin-ui

---

## Detailed Entrypoint Audit

### 1. auth-service/entrypoint.sh

**File:** `apps/auth-service/entrypoint.sh`

```bash
#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js
```

| Check | Status | Evidence |
|-------|--------|----------|
| No pnpm/npm/npx | ✅ PASS | No runtime pnpm usage (only in comments) |
| No prisma generate | ✅ PASS | Comment confirms build-time generation |
| Uses exec | ✅ PASS | Line 5: `exec dumb-init node dist/main.js` |
| Strict mode | ✅ PASS | Line 2: `set -e` |
| Correct artifact path | ✅ PASS | `dist/main.js` matches Dockerfile CMD |

**Status:** ✅ SAFE

---

### 2. product-service/entrypoint.sh

**File:** `apps/product-service/entrypoint.sh`

```bash
#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js
```

| Check | Status | Evidence |
|-------|--------|----------|
| No pnpm/npm/npx | ✅ PASS | No runtime pnpm usage |
| No prisma generate | ✅ PASS | Comment confirms build-time generation |
| Uses exec | ✅ PASS | `exec dumb-init node dist/main.js` |
| Strict mode | ✅ PASS | `set -e` |
| Correct artifact path | ✅ PASS | `dist/main.js` matches Dockerfile |

**Status:** ✅ SAFE

---

### 3. order-service/entrypoint.sh

**File:** `apps/order-service/entrypoint.sh`

```bash
#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js
```

| Check | Status | Evidence |
|-------|--------|----------|
| No pnpm/npm/npx | ✅ PASS | No runtime pnpm usage |
| No prisma generate | ✅ PASS | Comment confirms build-time generation |
| Uses exec | ✅ PASS | `exec dumb-init node dist/main.js` |
| Strict mode | ✅ PASS | `set -e` |
| Correct artifact path | ✅ PASS | `dist/main.js` matches Dockerfile |

**Status:** ✅ SAFE

---

### 4. seller-service/entrypoint.sh

**File:** `apps/seller-service/entrypoint.sh`

```bash
#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js
```

| Check | Status | Evidence |
|-------|--------|----------|
| No pnpm/npm/npx | ✅ PASS | No runtime pnpm usage |
| No prisma generate | ✅ PASS | Comment confirms build-time generation |
| Uses exec | ✅ PASS | `exec dumb-init node dist/main.js` |
| Strict mode | ✅ PASS | `set -e` |
| Correct artifact path | ✅ PASS | `dist/main.js` matches Dockerfile |

**Status:** ✅ SAFE

---

### 5. admin-service/entrypoint.sh

**File:** `apps/admin-service/entrypoint.sh`

```bash
#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js
```

| Check | Status | Evidence |
|-------|--------|----------|
| No pnpm/npm/npx | ✅ PASS | No runtime pnpm usage |
| No prisma generate | ✅ PASS | Comment confirms build-time generation |
| Uses exec | ✅ PASS | `exec dumb-init node dist/main.js` |
| Strict mode | ✅ PASS | `set -e` |
| Correct artifact path | ✅ PASS | `dist/main.js` matches Dockerfile |

**Status:** ✅ SAFE

---

### 6. recommendation-service/entrypoint.sh

**File:** `apps/recommendation-service/entrypoint.sh`

```bash
#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js
```

| Check | Status | Evidence |
|-------|--------|----------|
| No pnpm/npm/npx | ✅ PASS | No runtime pnpm usage |
| No prisma generate | ✅ PASS | Comment confirms build-time generation |
| Uses exec | ✅ PASS | `exec dumb-init node dist/main.js` |
| Strict mode | ✅ PASS | `set -e` |
| Correct artifact path | ✅ PASS | `dist/main.js` matches Dockerfile |

**Status:** ✅ SAFE

---

## Services with Direct CMD (No Entrypoint Script)

### api-gateway
**Dockerfile:** `apps/api-gateway/Dockerfile`
- **CMD:** `CMD ["node","dist/main.js"]`
- **Status:** ✅ SAFE (no entrypoint script needed)

### chatting-service
**Dockerfile:** `apps/chatting-service/Dockerfile`
- **ENTRYPOINT:** `ENTRYPOINT ["dumb-init", "--"]`
- **CMD:** `CMD ["node", "dist/main.js"]`
- **Status:** ✅ SAFE (dumb-init in ENTRYPOINT, node in CMD)

### kafka-service
**Dockerfile:** `apps/kafka-service/Dockerfile`
- **CMD:** `CMD ["node", "dist/main.js"]`
- **Status:** ✅ SAFE

### logger-service
**Dockerfile:** `apps/logger-service/Dockerfile`
- **CMD:** `CMD ["dumb-init", "node", "dist/main.js"]`
- **Status:** ✅ SAFE

### user-ui, seller-ui, admin-ui
**Dockerfiles:** `apps/*-ui/Dockerfile`
- **ENTRYPOINT:** `ENTRYPOINT ["dumb-init", "--"]`
- **CMD:** `CMD ["node", "apps/<ui>/server.js"]`
- **Status:** ✅ SAFE (Next.js standalone pattern)

---

## Verification Commands

```bash
# Check for runtime pnpm/npm/npx usage
grep -r "pnpm\|npm\|npx" apps/*/entrypoint.sh | grep -v "^#" | grep -v "This ensures"
# Expected: No output (only comments mention pnpm)

# Check for runtime Prisma generation
grep -r "prisma generate\|prisma migrate" apps/*/entrypoint.sh
# Expected: No output

# Verify exec pattern
grep -r "exec.*node" apps/*/entrypoint.sh
# Expected: All entrypoints use exec
```

**Results:**
- ✅ No runtime pnpm/npm/npx usage found
- ✅ No runtime Prisma generation found
- ✅ All entrypoints use exec pattern

---

## Summary

**Total Entrypoints Audited:** 6  
**Passed:** 6  
**Failed:** 0

**Key Findings:**
- ✅ No entrypoint uses pnpm/npm/npx at runtime
- ✅ No entrypoint runs prisma generate
- ✅ All entrypoints use `exec` for proper PID 1 handling
- ✅ All use `set -e` for strict mode (safe for busybox sh)
- ✅ All artifact paths match Dockerfile CMD/ENTRYPOINT

**Note on Strict Mode:**
- All entrypoints use `set -e` (not `set -eu` or `set -euo pipefail`)
- This is safe and sufficient for busybox `/bin/sh`
- `pipefail` is not supported in busybox sh, so `set -e` is the correct choice

**No fixes required** - All entrypoints are production-ready.

---

**Status:** ✅ COMPLETE - All entrypoints verified and safe

