# Version Drift & Production Stability Audit

**Date**: 2026-01-16  
**Auditor**: Principal Engineer  
**Scope**: Complete version standardization for reproducible builds

---

## EXECUTIVE SUMMARY

**Critical Issues Found**: 8  
**High Priority Issues**: 5  
**Medium Priority Issues**: 3  

**Risk Level**: HIGH - Version drift can cause:
- Non-reproducible builds
- Peer dependency conflicts
- Runtime errors in production
- Security vulnerabilities from outdated packages

---

## 1. VERSION DRIFT FINDINGS

### 1.1 pnpm Version Drift ⚠️ CRITICAL

| Location | Current Version | Expected | Status |
|----------|----------------|----------|--------|
| `package.json` (packageManager) | `9.12.3` | `9.12.3` | ✅ Correct |
| `.github/workflows/docker-build.yml:236` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/api-gateway/Dockerfile` | `9.12.3` | `9.12.3` | ✅ Correct |
| `apps/user-ui/Dockerfile` | `9.12.3` | `9.12.3` | ✅ Correct |
| `apps/seller-ui/Dockerfile` | `9.12.3` | `9.12.3` | ✅ Correct |
| `apps/admin-ui/Dockerfile` | `9.12.3` | `9.12.3` | ✅ Correct |
| `apps/auth-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/admin-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/chatting-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/kafka-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/logger-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/order-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/product-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/recommendation-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |
| `apps/seller-service/Dockerfile` | `8.10.2` | `9.12.3` | ❌ Wrong |

**Impact**: Different pnpm versions can resolve dependencies differently, causing lockfile conflicts and non-reproducible builds.

**Fix**: Standardize all to `pnpm@9.12.3` (from root packageManager).

---

### 1.2 Prisma Version Drift ⚠️ CRITICAL

| Location | Current Version | Expected | Status |
|----------|----------------|----------|--------|
| `package.json` | `^6.7.0` | `6.7.0` (exact) | ⚠️ Range |
| `packages/middleware/package.json` | `^6.11.1` | `6.7.0` (exact) | ❌ Wrong |
| `packages/libs/prisma/package.json` | `^6.11.1` | `6.7.0` (exact) | ❌ Wrong |
| `apps/user-ui/package.json` | `^6.11.1` | `6.7.0` (exact) | ❌ Wrong |
| `apps/seller-ui/package.json` | `^6.11.1` | `6.7.0` (exact) | ❌ Wrong |
| All Dockerfiles | `npx prisma@6.19.1` | `pnpm exec prisma` | ❌ Wrong |
| All entrypoint.sh | `npx prisma generate` | `pnpm exec prisma generate` | ❌ Wrong |

**Impact**: 
- Prisma client version mismatch can cause runtime errors
- Hardcoded `6.19.1` in Dockerfiles doesn't match package.json
- Using `npx` instead of `pnpm exec` bypasses workspace resolution

**Fix**: 
- Standardize all to `6.7.0` (exact, no caret)
- Use `pnpm exec prisma generate` everywhere
- Remove hardcoded version from Dockerfiles

---

### 1.3 Next.js Version Drift ⚠️ HIGH

| Location | Current Version | Expected | Status |
|----------|----------------|----------|--------|
| `apps/user-ui/package.json` | `~15.1.4` | `15.1.4` (exact) | ⚠️ Range |
| `apps/seller-ui/package.json` | `~15.1.4` | `15.1.4` (exact) | ⚠️ Range |
| `apps/admin-ui/package.json` | `15.1.8` | `15.1.4` (exact) | ❌ Wrong |

**Impact**: Different Next.js versions can cause:
- Different build outputs
- Incompatible features
- Hard-to-debug production issues

**Fix**: Standardize all to `15.1.4` (exact version, no tilde/caret).

---

### 1.4 TypeScript Version Drift ⚠️ MEDIUM

| Location | Current Version | Expected | Status |
|----------|----------------|----------|--------|
| `package.json` | `~5.7.2` | `5.7.2` (exact) | ⚠️ Range |
| `apps/product-service/package.json` | `^5.7.3` | `5.7.2` (exact) | ❌ Wrong |
| All other packages | `^5.0.0` | `5.7.2` (exact) | ⚠️ Range |

**Impact**: Different TypeScript versions can:
- Produce different type errors
- Generate different JS output
- Cause build inconsistencies

**Fix**: Standardize all to `5.7.2` (exact version).

---

### 1.5 React/React-DOM Versions ✅ OK

| Location | Version | Status |
|----------|---------|--------|
| All packages | `19.0.0` | ✅ Consistent |

**Status**: No drift detected. All packages use exact version `19.0.0`.

---

### 1.6 Node.js Base Image ⚠️ MEDIUM

| Location | Current | Expected | Status |
|----------|---------|----------|--------|
| All Dockerfiles | `node:20-alpine` | `node:20.19.3-alpine` | ⚠️ Unpinned |

**Impact**: Unpinned Node version can cause:
- Different runtime behavior
- Security vulnerabilities from outdated images
- Non-reproducible builds

**Fix**: Pin to specific Node version (e.g., `node:20.19.3-alpine`).

**Note**: Current Node version in use is `v20.19.3` (from `node -v`). Consider pinning to this or latest LTS.

---

### 1.7 SWC Versions ⚠️ LOW

| Location | Current Version | Status |
|----------|----------------|----------|
| `package.json` | `~1.5.7` | ⚠️ Range |

**Impact**: Low - SWC is build-time only, but ranges can cause inconsistencies.

**Fix**: Pin to exact version if issues occur.

---

## 2. FROZEN LOCKFILE USAGE

### Current State

| Location | Frozen Lockfile | Status |
|----------|----------------|--------|
| `apps/api-gateway/Dockerfile:12` | `--no-frozen-lockfile` | ❌ BAD |
| `apps/user-ui/Dockerfile:23` | `--frozen-lockfile` | ✅ GOOD |
| `apps/seller-ui/Dockerfile:23` | `--frozen-lockfile` | ✅ GOOD |
| `apps/admin-ui/Dockerfile:23` | `--frozen-lockfile` | ✅ GOOD |
| `.github/workflows/docker-build.yml:243` | No flag | ❌ BAD |
| All other Dockerfiles | No flag | ❌ BAD |

**Impact**: Without frozen lockfile:
- Dependencies can be updated unexpectedly
- Builds are non-reproducible
- CI and local builds can differ

**Fix**: Use `--frozen-lockfile` everywhere (or `--no-frozen-lockfile` only in development).

---

## 3. PEER DEPENDENCY CONFLICTS

### Potential Conflicts

1. **Prisma Client Version Mismatch**
   - Root: `^6.7.0`
   - Some packages: `^6.11.1`
   - **Risk**: Runtime errors if Prisma client version doesn't match schema

2. **Next.js + eslint-config-next Mismatch**
   - `user-ui`: `next@~15.1.4` + `eslint-config-next@~15.1.4` ✅
   - `seller-ui`: `next@~15.1.4` + `eslint-config-next@~15.1.4` ✅
   - `admin-ui`: `next@15.1.8` + `eslint-config-next@15.1.8` ⚠️ (different version)

3. **TypeScript Version Spread**
   - Root: `~5.7.2`
   - Most packages: `^5.0.0` (can resolve to 5.0.0 - 5.x.x)
   - `product-service`: `^5.7.3` (can resolve to 5.7.3+)
   - **Risk**: Type checking inconsistencies

**Action Required**: Add `pnpm.overrides` to force single versions.

---

## 4. JUNK/RISKY FILES

### Files That Should Not Be in Git

1. **Backup Files** (3 files)
   - `docker-compose.production.yml.bak.2026-01-12-092854`
   - `docker-compose.production.yml.bak.2026-01-13-014429`
   - `docker-compose.production.yml.bak.2026-01-13-014832`
   - **Risk**: Low - just clutter, but should be removed

2. **ops-backups/** Directory
   - `ops-backups/images.lock`
   - `ops-backups/nginx.conf`
   - `ops-backups/nginx.conf.20251001-032753Z`
   - **Risk**: MEDIUM - May contain secrets or production configs
   - **Action**: Review contents, remove if no longer needed, or move to `.gitignore`

3. **No .env files found** ✅
   - `.gitignore` properly excludes `.env*` files
   - No secrets committed

**Recommendation**: 
- Remove backup files (or add to `.gitignore` with pattern `*.bak.*`)
- Review `ops-backups/` and either remove or document why it's needed

---

## 5. PRISMA GENERATE USAGE

### Current State

| Location | Command | Should Be | Status |
|----------|---------|-----------|--------|
| `package.json` postinstall | `prisma generate` | `pnpm exec prisma generate` | ⚠️ Works but not explicit |
| All `entrypoint.sh` | `npx prisma generate` | `pnpm exec prisma generate` | ❌ Wrong |
| Dockerfiles | `npx prisma@6.19.1` | `pnpm exec prisma generate` | ❌ Wrong |

**Impact**: 
- Using `npx` bypasses pnpm workspace resolution
- Hardcoded version `6.19.1` doesn't match package.json
- Can cause Prisma client version mismatches

**Fix**: Use `pnpm exec prisma generate` everywhere.

---

## 6. .npmrc CONFIGURATION

### Current State

**File**: `.npmrc`
```
public-hoist-pattern[]=*prisma*
```

**Missing Configurations**:
- `save-exact=true` - Prevents caret/tilde ranges
- `prefer-frozen-lockfile=true` - Enforces lockfile usage
- `auto-install-peers=true` - Already in CI, should be in root
- `shamefully-hoist=true` - Already in CI, consider for root

**Impact**: Without these, dependencies can drift over time.

---

## 7. RECOMMENDED FIXES

### Priority 1: Critical (Must Fix)

1. ✅ **Standardize pnpm to 9.12.3** everywhere
2. ✅ **Standardize Prisma to 6.7.0** (exact) everywhere
3. ✅ **Use `pnpm exec prisma generate`** instead of `npx`
4. ✅ **Add `--frozen-lockfile`** to all installs (CI + Docker)
5. ✅ **Standardize Next.js to 15.1.4** (exact) across all UIs

### Priority 2: High (Should Fix)

6. ✅ **Add `pnpm.overrides`** to root package.json
7. ✅ **Update .npmrc** with save-exact and prefer-frozen-lockfile
8. ✅ **Standardize TypeScript to 5.7.2** (exact)

### Priority 3: Medium (Nice to Have)

9. ⚠️ **Pin Node.js base image** to specific version
10. ⚠️ **Remove backup files** or add to .gitignore
11. ⚠️ **Review ops-backups/** directory

---

## 8. RISK ASSESSMENT

### High Risk
- **Prisma version mismatch** (6.7.0 vs 6.11.1 vs 6.19.1) - Can cause runtime errors
- **Next.js version mismatch** (15.1.4 vs 15.1.8) - Can cause build inconsistencies
- **No frozen lockfile in CI** - Can cause non-reproducible builds

### Medium Risk
- **pnpm version drift** (8.10.2 vs 9.12.3) - Can cause dependency resolution issues
- **TypeScript version spread** - Can cause type checking inconsistencies
- **Unpinned Node.js base image** - Can cause runtime differences

### Low Risk
- **Backup files in repo** - Just clutter
- **SWC version range** - Build-time only

---

## 9. VERIFICATION COMMANDS

After applying fixes, run:

```bash
# 1. Verify pnpm version consistency
grep -r "pnpm@" .github/workflows/ apps/*/Dockerfile | sort | uniq
# Expected: All show 9.12.3

# 2. Verify Prisma version consistency
grep -r '"prisma":\|"@prisma/client":' **/package.json | grep -v node_modules | sort | uniq
# Expected: All show exact 6.7.0

# 3. Verify Next.js version consistency
grep -r '"next":' apps/*-ui/package.json | sort | uniq
# Expected: All show exact 15.1.4

# 4. Verify frozen lockfile usage
grep -r "pnpm install" .github/workflows/ apps/*/Dockerfile | grep -v frozen
# Expected: All show --frozen-lockfile

# 5. Verify Prisma generate commands
grep -r "prisma generate\|npx prisma" apps/*/Dockerfile apps/*/entrypoint.sh
# Expected: All show "pnpm exec prisma generate"

# 6. Run typecheck
npx nx run-many -t typecheck --all
# Expected: All pass

# 7. Run builds
npx nx run-many -t build --all
# Expected: All build successfully
```

---

## 10. NEXT STEPS

1. **Review this audit** - Understand all findings
2. **Apply fixes** - See `VERSIONS_LOCK.md` for baseline versions
3. **Run verification** - Use commands above
4. **Commit changes** - Single commit with all fixes
5. **Update CI** - Ensure CI uses same versions
6. **Monitor** - Watch for any new version drift

---

**Status**: Ready for fixes  
**Estimated Fix Time**: 30-45 minutes  
**Risk Level**: HIGH (version drift can cause production issues)

