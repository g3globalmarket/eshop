# CI Failure Report - Local Reproduction & Fixes

**Date:** 2026-01-18  
**Reproduced By:** Senior DevOps/SRE Engineer  
**Goal:** Reproduce CI/CD pipeline locally and fix failures

---

## PHASE 0 — Baseline Environment

### Environment Check Results

```bash
Node version: v20.19.3 ✅ (CI uses: 20)
pnpm version: 9.12.3 ✅ (CI uses: 9.12.3 via corepack)
Nx version: v20.8.3 ✅
Git status: 4 modified files (expected from previous fixes)
```

### CI Configuration Analysis

**File:** `.github/workflows/docker-build.yml`

- **Node version:** `node-version: '20'` (line 214)
- **pnpm version:** `corepack prepare pnpm@9.12.3 --activate` (line 242)
- **Build process:** Uses `docker buildx build` with `--push` for registry
- **Smoke tests:** Run after image build (lines 266-309)
  - Backend services: Test with minimal env vars (DATABASE_URL, JWT_SECRET, KAFKA_BROKERS, IMAGEKIT_*)
  - Frontend services: Test with NEXT_PUBLIC_* vars
- **Error filtering:** Ignores transient Redis/Kafka/ImageKit warnings (line 299)

---

## PHASE 1 — Local Reproduction

### Commands Run

1. **Safety Scan:**
   ```bash
   bash scripts/prod-safety-scan.sh
   ```

2. **Smoke Test:**
   ```bash
   bash scripts/smoke-run-images.sh
   ```

---

## PHASE 2 — Failures Identified

### Failure 1: Safety Scan Script Exits Early

**Type:** Script logic failure (false positive due to command substitution)

**Error:**
```
scripts/prod-safety-scan.sh: line 23: [: 0
0: integer expression expected
```

**Root Cause:**
- `grep` commands in command substitution return exit code 1 when no matches found
- `wc -l` outputs count with newline: `"0\n"`
- `tr -d ' '` removes spaces but not newlines
- Result: `"0\n"` used in `[ "$VAR" -gt 0 ]` causes "integer expression expected" error
- With `set -euo pipefail`, script exits on this error

**Evidence:**
- File: `scripts/prod-safety-scan.sh` (lines 22, 34, 59, 71, 138)
- Command: `grep ... | wc -l | tr -d ' '` (missing newline handling and error fallback)

**Impact:** Script fails before completing all checks, preventing full safety audit

---

### Failure 2: Smoke Test Redis Readiness Check Fails

**Type:** Script logic failure (unreliable container name matching)

**Error:**
```
❌ Redis container failed to start
```

**Root Cause:**
- Redis container actually starts successfully (logs show "Ready to accept connections")
- `docker ps | grep -q ${REDIS_CONTAINER}` fails to match container name
- Default `docker ps` output format may not reliably show container names in grep context
- Same issue affects `test-auth` and `test-ui` container checks

**Evidence:**
- File: `scripts/smoke-run-images.sh` (lines 114, 154, 226)
- Command: `docker ps | grep -q container-name` (unreliable)
- Manual test: `docker ps --format "{{.Names}}" | grep -q "^container-name$"` works reliably

**Impact:** Smoke tests fail even when containers start successfully

---

## PHASE 3 — Fixes Applied

### Fix 1: Safety Scan Script - Handle Empty Grep Results

**Files Changed:**
- `scripts/prod-safety-scan.sh`

**Changes:**
1. **Line 22:** Added `|| echo "0"` and `tr -d ' \n'` to handle empty grep results
   ```bash
   # Before:
   PNPM_IN_ENTRYPOINT=$(grep -r "pnpm\|npm\|npx" apps/*/entrypoint.sh 2>/dev/null | grep -v "^#" | grep -v "This ensures" | wc -l | tr -d ' ')
   
   # After:
   PNPM_IN_ENTRYPOINT=$(grep -r "pnpm\|npm\|npx" apps/*/entrypoint.sh 2>/dev/null | grep -v "^#" | grep -v "This ensures" | wc -l | tr -d ' \n' || echo "0")
   if [ "${PNPM_IN_ENTRYPOINT:-0}" -gt 0 ]; then
   ```

2. **Line 34:** Same fix for Prisma check
3. **Line 59:** Same fix for Node version check
4. **Line 71:** Same fix for pnpm version check
5. **Line 138:** Changed from `grep -c` to `grep -l | wc -l` for entrypoint strict mode check

**Rationale:**
- `|| echo "0"` provides fallback when grep finds no matches (exit code 1)
- `tr -d ' \n'` removes both spaces and newlines from `wc -l` output
- `${VAR:-0}` provides default value if variable is unset
- Prevents script from exiting early with `set -euo pipefail`

---

### Fix 2: Smoke Test - Reliable Container Name Matching

**Files Changed:**
- `scripts/smoke-run-images.sh`

**Changes:**
1. **Line 114:** Changed Redis container check
   ```bash
   # Before:
   if docker ps | grep -q ${REDIS_CONTAINER}; then
   
   # After:
   if docker ps --format "{{.Names}}" | grep -q "^${REDIS_CONTAINER}$"; then
   ```

2. **Line 154:** Same fix for backend container check (`test-auth`)
3. **Line 226:** Same fix for UI container check (`test-ui`)

**Rationale:**
- `docker ps --format "{{.Names}}"` outputs only container names (one per line)
- `grep -q "^container-name$"` matches exact container name (anchored start/end)
- More reliable than parsing default `docker ps` table output
- Prevents false negatives when containers are actually running

---

## PHASE 4 — Verification

### Verification Commands

1. **Safety Scan:**
   ```bash
   bash scripts/prod-safety-scan.sh
   ```
   **Result:** ✅ Exit code 0, all checks pass

2. **Smoke Test:**
   ```bash
   bash scripts/smoke-run-images.sh
   ```
   **Result:** ✅ Exit code 0, all tests pass
   - Redis container starts and readiness check passes
   - auth-service container starts and health endpoint responds
   - user-ui container starts and HTTP endpoint responds

3. **Production Safety Checks:**
   - ✅ No runtime pnpm/npm/npx usage in entrypoints
   - ✅ No runtime Prisma generation
   - ✅ All Dockerfiles use non-root users
   - ✅ All Dockerfiles pin Node 20 and pnpm 9.12.3
   - ✅ All use `--frozen-lockfile`
   - ✅ Deploy scripts use strict mode
   - ✅ All HTTP services have healthchecks
   - ✅ Compose config valid

---

## Summary

### Root Causes

1. **Safety Scan:** Command substitution with `grep | wc -l` doesn't handle empty results gracefully when using `set -euo pipefail`
2. **Smoke Test:** Default `docker ps` output format unreliable for container name matching via grep

### Fixes Applied

1. **Safety Scan:** Added `|| echo "0"` fallback and `tr -d ' \n'` to handle empty grep results, plus `${VAR:-0}` default values
2. **Smoke Test:** Changed to `docker ps --format "{{.Names}}"` with anchored grep for reliable container name matching

### Files Modified

1. `scripts/prod-safety-scan.sh` (lines 22, 34, 59, 71, 138)
2. `scripts/smoke-run-images.sh` (lines 114, 154, 226)

### Production Safety

- ✅ No production behavior changed
- ✅ All fixes are script-level improvements (no runtime code changes)
- ✅ Fixes prevent false positives, not false negatives
- ✅ All existing safety checks remain intact

---

## Verification Results

**Safety Scan:** ✅ PASS (exit code 0)  
**Smoke Test:** ✅ PASS (exit code 0)  
**Production Readiness:** ✅ VERIFIED

**Status:** Ready for CI — all local tests pass, fixes are minimal and production-safe.

