# PHASE 1 — DOCKERFILES (BUILD vs RUNTIME)

**Date:** 2025-01-27  
**Auditor:** Senior DevOps/SRE + Build Engineer  
**Goal:** Verify all Dockerfiles separate build-time from runtime correctly

---

## Audit Results Summary

**Status:** ✅ ALL PASS - All 13 Dockerfiles verified and correct

---

## Detailed Service Audit

### 1. api-gateway
**File:** `apps/api-gateway/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | Line 1: `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | Line 9: `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | Line 12: `pnpm install --frozen-lockfile` |
| Prisma build-time | ✅ PASS | Line 26: `RUN pnpm exec prisma generate --schema=/repo/prisma/schema.prisma` (builder stage) |
| Runtime no pnpm | ✅ PASS | Runtime stage (line 29+) has no pnpm/npm/npx |
| Non-root user | ✅ PASS | Lines 35-36: `addgroup`/`adduser`, Line 48: `USER nodejs` |
| COPY from builder | ✅ PASS | Line 43: `COPY --from=builder --chown=nodejs:nodejs /out/ ./` |
| CMD correct | ✅ PASS | Line 51: `CMD ["node","dist/main.js"]` |
| Runtime deps | ✅ PASS | Line 32: `curl` installed (needed for healthcheck) |

**Notes:** Uses `pnpm deploy` pattern for standalone output. Prisma Client generated in builder stage.

---

### 2. auth-service
**File:** `apps/auth-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All COPY commands use `--from=builder` |
| Entrypoint exists | ✅ PASS | `entrypoint.sh` copied and used |

**Pattern:** Standard multi-stage build with entrypoint script.

---

### 3. product-service
**File:** `apps/product-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| Entrypoint exists | ✅ PASS | `entrypoint.sh` copied |

**Pattern:** Standard multi-stage build with entrypoint script.

---

### 4. order-service
**File:** `apps/order-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| Entrypoint exists | ✅ PASS | `entrypoint.sh` copied |

**Pattern:** Standard multi-stage build with entrypoint script.

---

### 5. seller-service
**File:** `apps/seller-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| Entrypoint exists | ✅ PASS | `entrypoint.sh` copied |

**Pattern:** Standard multi-stage build with entrypoint script.

---

### 6. admin-service
**File:** `apps/admin-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| Entrypoint exists | ✅ PASS | `entrypoint.sh` copied |

**Pattern:** Standard multi-stage build with entrypoint script.

---

### 7. chatting-service
**File:** `apps/chatting-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| CMD correct | ✅ PASS | `CMD ["node", "dist/main.js"]` |

**Pattern:** Direct CMD (no entrypoint script).

---

### 8. kafka-service
**File:** `apps/kafka-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ N/A | No Prisma used |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| CMD correct | ✅ PASS | `CMD ["node", "dist/main.js"]` |

**Pattern:** Worker service, no Prisma.

---

### 9. logger-service
**File:** `apps/logger-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| CMD correct | ✅ PASS | `CMD ["dumb-init", "node", "dist/main.js"]` |

**Pattern:** Direct CMD with dumb-init.

---

### 10. recommendation-service
**File:** `apps/recommendation-service/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS builder` |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --prod --frozen-lockfile` |
| Prisma build-time | ✅ PASS | `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nodejs` |
| COPY from builder | ✅ PASS | All artifacts from builder stage |
| Entrypoint exists | ✅ PASS | `entrypoint.sh` copied |

**Pattern:** Standard multi-stage build with entrypoint script.

---

### 11. user-ui
**File:** `apps/user-ui/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS deps` (multi-stage) |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --filter user-ui... --frozen-lockfile` |
| Prisma build-time | ✅ PASS | Line 63: `RUN pnpm exec prisma generate --schema=prisma/schema.prisma` (builder) |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | Line 78: `adduser -S nextjs -u 1001`, Line 88: `USER nextjs` |
| COPY from builder | ✅ PASS | Lines 81-83: All from builder stage |
| CMD correct | ✅ PASS | Line 98: `CMD ["node", "apps/user-ui/server.js"]` (Next.js standalone) |
| Build uses pnpm | ✅ PASS | Line 67: `RUN pnpm run build` |

**Pattern:** Next.js standalone output with multi-stage build.

---

### 12. seller-ui
**File:** `apps/seller-ui/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS deps` (multi-stage) |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --filter seller-ui... --frozen-lockfile` |
| Prisma build-time | ✅ PASS | Prisma generate in builder stage |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nextjs` |
| COPY from builder | ✅ PASS | All from builder stage |
| CMD correct | ✅ PASS | `CMD ["node", "apps/seller-ui/server.js"]` |
| Build uses pnpm | ✅ PASS | Uses `pnpm run build` |

**Pattern:** Next.js standalone output.

---

### 13. admin-ui
**File:** `apps/admin-ui/Dockerfile`

| Check | Status | Evidence |
|-------|--------|----------|
| Base image | ✅ PASS | `FROM node:20-alpine AS deps` (multi-stage) |
| pnpm pinned | ✅ PASS | `corepack prepare pnpm@9.12.3 --activate` |
| Frozen lockfile | ✅ PASS | `pnpm install --filter admin-ui... --frozen-lockfile` |
| Prisma build-time | ✅ PASS | Prisma generate in builder stage |
| Runtime no pnpm | ✅ PASS | Runtime stage has no pnpm |
| Non-root user | ✅ PASS | `USER nextjs` |
| COPY from builder | ✅ PASS | All from builder stage |
| CMD correct | ✅ PASS | `CMD ["node", "apps/admin-ui/server.js"]` |
| Build uses pnpm | ✅ PASS | Uses `pnpm run build` |

**Pattern:** Next.js standalone output.

---

## Summary

**Total Dockerfiles Audited:** 13  
**Passed:** 13  
**Failed:** 0

**Key Findings:**
- ✅ All use Node 20 Alpine
- ✅ All pin pnpm to 9.12.3 via corepack
- ✅ All use `--frozen-lockfile`
- ✅ All Prisma services generate client at build time
- ✅ All runtime stages are minimal (no build tools)
- ✅ All use non-root users
- ✅ All COPY from builder stage (no host context issues)
- ✅ All CMD/ENTRYPOINT paths match artifacts

**No fixes required** - All Dockerfiles are production-ready.

---

**Status:** ✅ COMPLETE - All Dockerfiles verified and correct

