# Version Standardization Verification Checklist

**Date**: 2026-01-16  
**Purpose**: Verify all version standardization fixes are applied correctly

---

## PRE-VERIFICATION

```bash
# Ensure you're in project root
cd "/Users/user/Desktop/Final Project/eshop"

# Ensure dependencies are up to date
pnpm install
```

---

## 1. VERIFY PNPM VERSIONS

### Check CI Workflow
```bash
grep "pnpm@" .github/workflows/docker-build.yml
# Expected: corepack prepare pnpm@9.12.3 --activate
```

### Check All Dockerfiles
```bash
grep "pnpm@" apps/*/Dockerfile | sort | uniq
# Expected: All show pnpm@9.12.3
```

### Check Root package.json
```bash
grep "packageManager" package.json
# Expected: "pnpm@9.12.3+sha512..."
```

**Status**: ✅ All should show 9.12.3

---

## 2. VERIFY PRISMA VERSIONS

### Check Root package.json
```bash
grep -E '"prisma":|"@prisma/client":' package.json
# Expected: Both show "6.7.0" (exact, no caret)
```

### Check All package.json Files
```bash
grep -r '"prisma":\|"@prisma/client":' apps/*/package.json packages/*/package.json | grep -v node_modules | sort | uniq
# Expected: All show "6.7.0" or will be overridden by pnpm.overrides
```

### Check pnpm.overrides
```bash
grep -A 10 '"pnpm":' package.json
# Expected: Contains "prisma": "6.7.0" and "@prisma/client": "6.7.0"
```

### Check Prisma Generate Commands
```bash
# Check entrypoint scripts
grep "prisma generate" apps/*/entrypoint.sh
# Expected: All show "pnpm exec prisma generate"

# Check Dockerfiles
grep "prisma generate\|npx prisma" apps/*/Dockerfile | grep -v "pnpm exec"
# Expected: No matches (all should use pnpm exec)
```

**Status**: ✅ All should use 6.7.0 and pnpm exec

---

## 3. VERIFY NEXT.JS VERSIONS

### Check All UI package.json Files
```bash
grep '"next":' apps/*-ui/package.json
# Expected:
# apps/admin-ui/package.json: "next": "15.1.4"
# apps/seller-ui/package.json: "next": "15.1.4"
# apps/user-ui/package.json: "next": "15.1.4"
```

### Check eslint-config-next Versions
```bash
grep '"eslint-config-next":' apps/*-ui/package.json
# Expected: All show "15.1.4"
```

### Check pnpm.overrides
```bash
grep -A 10 '"pnpm":' package.json | grep "next"
# Expected: "next": "15.1.4"
```

**Status**: ✅ All should show 15.1.4

---

## 4. VERIFY TYPESCRIPT VERSIONS

### Check Root package.json
```bash
grep '"typescript":' package.json
# Expected: "typescript": "5.7.2" (exact, no tilde)
```

### Check pnpm.overrides
```bash
grep -A 10 '"pnpm":' package.json | grep "typescript"
# Expected: "typescript": "5.7.2"
```

**Status**: ✅ Root should show 5.7.2, overrides enforce everywhere

---

## 5. VERIFY FROZEN LOCKFILE

### Check CI Workflow
```bash
grep "pnpm install" .github/workflows/docker-build.yml
# Expected: pnpm install --frozen-lockfile
```

### Check All Dockerfiles
```bash
grep "pnpm install" apps/*/Dockerfile | grep -v "frozen-lockfile"
# Expected: No matches (all should have --frozen-lockfile)
```

### Count Install Commands
```bash
# Total install commands
grep -r "pnpm install" apps/*/Dockerfile .github/workflows/ 2>/dev/null | wc -l
# Expected: 14

# Commands with frozen-lockfile
grep -r "frozen-lockfile" apps/*/Dockerfile .github/workflows/ 2>/dev/null | wc -l
# Expected: 14 (all should have it)
```

**Status**: ✅ All install commands should use --frozen-lockfile

---

## 6. VERIFY .npmrc CONFIGURATION

### Check .npmrc File
```bash
cat .npmrc
# Expected to contain:
# public-hoist-pattern[]=*prisma*
# save-exact=true
# prefer-frozen-lockfile=true
# auto-install-peers=true
# shamefully-hoist=true
```

**Status**: ✅ All settings should be present

---

## 7. VERIFY pnpm.overrides

### Check Root package.json
```bash
grep -A 15 '"pnpm":' package.json
# Expected to contain:
# "pnpm": {
#   "overrides": {
#     "prisma": "6.7.0",
#     "@prisma/client": "6.7.0",
#     "next": "15.1.4",
#     "eslint-config-next": "15.1.4",
#     "react": "19.0.0",
#     "react-dom": "19.0.0",
#     "typescript": "5.7.2",
#     "@swc/core": "1.5.7"
#   }
# }
```

**Status**: ✅ All overrides should be present

---

## 8. VERIFY .gitignore

### Check .gitignore
```bash
grep -E "bak|backup|ops-backups" .gitignore
# Expected:
# *.bak.*
# *.backup
# ops-backups/
```

**Status**: ✅ Backup patterns should be present

---

## 9. RUN TYPE CHECK

```bash
npx nx run-many -t typecheck --all
# Expected: Should pass (or only show pre-existing errors unrelated to version changes)
```

**Note**: Some pre-existing type errors may remain (e.g., qpay.client.ts). These are unrelated to version standardization.

**Status**: ⚠️ May have pre-existing errors, but should not have new errors from version changes

---

## 10. RUN BUILDS

```bash
# Build all services
npx nx run-many -t build --all --parallel=3

# Expected: All builds should succeed
# May show webpack warnings (harmless)
```

**Status**: ✅ All builds should succeed

---

## 11. VERIFY LOCKFILE

### Check if lockfile needs update
```bash
# After pnpm install, check if lockfile changed
git status pnpm-lock.yaml
# Expected: May show changes if versions were updated
```

**Note**: If lockfile changed, commit it. This is expected when standardizing versions.

---

## 12. TEST DOCKER BUILD (Optional)

### Build a sample service
```bash
# Test order-service build
docker build -f apps/order-service/Dockerfile -t test-order-service:local .

# Expected: Should build successfully
# Should use pnpm@9.12.3
# Should use --frozen-lockfile
# Should use pnpm exec prisma generate
```

**Status**: ✅ Docker build should succeed

---

## SUMMARY CHECKLIST

Before committing, verify:

- [ ] All pnpm versions are 9.12.3 (CI + all Dockerfiles)
- [ ] All Prisma versions are 6.7.0 (or overridden)
- [ ] All Next.js versions are 15.1.4 (or overridden)
- [ ] All TypeScript versions are 5.7.2 (or overridden)
- [ ] All pnpm install commands use --frozen-lockfile
- [ ] All Prisma generate commands use pnpm exec
- [ ] .npmrc has save-exact and prefer-frozen-lockfile
- [ ] package.json has pnpm.overrides
- [ ] .gitignore excludes backup files
- [ ] Typecheck passes (or only shows pre-existing errors)
- [ ] Builds succeed
- [ ] Lockfile is updated (if needed)

---

## COMMON ISSUES

### Issue: Lockfile conflicts
**Solution**: Run `pnpm install` to update lockfile, then commit it.

### Issue: Typecheck fails with new errors
**Solution**: Check if errors are related to version changes. Most should be pre-existing.

### Issue: Docker build fails with frozen lockfile
**Solution**: Ensure pnpm-lock.yaml is committed and up to date.

### Issue: Prisma generate fails in Docker
**Solution**: Ensure pnpm is installed and prisma is in dependencies.

---

**Status**: Ready for verification  
**Estimated Time**: 10-15 minutes

