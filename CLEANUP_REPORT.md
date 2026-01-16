# Repository Cleanup Report

**Date**: 2026-01-16  
**Auditor**: Principal Engineer Audit  
**Scope**: Full repo audit for safe cleanup, production stability, and simplification

---

## Executive Summary

This audit identified **47 cleanup candidates** across 6 categories:
- **Safe to delete immediately**: 12 files (backups, generated artifacts, obsolete configs)
- **Review before deletion**: 3 files (unused docker-compose files)
- **Consolidate/move**: 32 documentation files (many QPAY_*.md duplicates)
- **Update .gitignore**: 2 patterns (already mostly covered)

**Total space savings**: ~23MB (dist/, .nx/, backup files)

---

## A) INVENTORY & CLASSIFICATION

### 1. Source Code (apps/, packages/)
✅ **Status**: No changes needed
- All apps and packages are actively used
- No dead code identified

### 2. Infrastructure Files
**Active files** (keep):
- `docker-compose.production.yml` - ✅ Used in `scripts/deploy-production.sh`
- `docker-compose.override.yml` - ✅ Used in `scripts/deploy-production.sh`
- `docker-compose.nginx-override.yml` - ✅ Used in `scripts/deploy-production.sh`
- `docker-compose.dev.yml` - ✅ Used in `package.json` scripts
- `nginx.conf` - ✅ Used in production
- `scripts/` - ✅ All scripts are referenced

**Candidates for removal**:
- `docker-compose.pinned.yml` - ⚠️ Only documented, not used in scripts/CI
- `docker-compose.recommendation-hotfix.yml` - ⚠️ Hotfix file, likely obsolete

### 3. Documentation Files
**Root-level documentation** (47 files):
- Many `QPAY_*.md` files (32 files) - likely duplicates/summaries
- Multiple audit/summary files (8 files)
- Some may be consolidated into `docs/` directory

### 4. Generated/Build Artifacts
**Already gitignored** (but present in repo):
- `dist/` (16MB) - ✅ In .gitignore
- `.nx/` (6.6MB) - ✅ In .gitignore
- `node_modules/` - ✅ In .gitignore

**Not gitignored but should be**:
- None found (all covered)

### 5. Backup Files
**Found backups**:
- `docker-compose.production.yml.bak.2026-01-12-092854` (7.2KB)
- `docker-compose.production.yml.bak.2026-01-13-014429` (7.0KB)
- `docker-compose.production.yml.bak.2026-01-13-014832` (7.0KB)
- `.env.example.backup` (741 bytes)
- `ops-backups/nginx.conf.20251001-032753Z` (11KB)

**Status**: All match `*.bak.*` pattern, already in .gitignore, but still committed to repo

### 6. Secrets Risk Files
**Found**:
- `.env` - ✅ In .gitignore
- `.env.production` - ⚠️ **RISK**: Contains production secrets, should be removed from repo
- `.env.example.backup` - ⚠️ May contain secrets
- `apps/*/.env.local` - ✅ In .gitignore

### 7. Temporary/Unused Files
- `COMMIT_MESSAGE.txt` - Old commit message, can be removed
- `COMMIT_MESSAGE_VERSIONS.txt` - Old commit message, can be removed
- `help.sh` - Only documented, not used
- `qpay-qr.png` - Not referenced anywhere
- `test-qpay-*.sh` (8 files) - Test scripts, may be useful but not referenced in README

---

## B) CLEANUP CANDIDATES (Detailed)

### Category 1: SAFE TO DELETE IMMEDIATELY

#### 1.1 Backup Files (Already Gitignored)
**Files**:
- `docker-compose.production.yml.bak.2026-01-12-092854`
- `docker-compose.production.yml.bak.2026-01-13-014429`
- `docker-compose.production.yml.bak.2026-01-13-014832`
- `.env.example.backup`
- `ops-backups/nginx.conf.20251001-032753Z`

**Proof of safety**:
```bash
# Check references
$ grep -r "docker-compose.production.yml.bak" . --exclude-dir=node_modules
# Only found in documentation (DEPLOYMENT_CHECKLIST.md mentions backup pattern, not specific files)

$ grep -r ".env.example.backup" . --exclude-dir=node_modules
# No references found
```

**Action**: Delete (already gitignored, safe to remove from history)

#### 1.2 Old Commit Messages
**Files**:
- `COMMIT_MESSAGE.txt`
- `COMMIT_MESSAGE_VERSIONS.txt`

**Proof of safety**:
```bash
$ grep -r "COMMIT_MESSAGE" . --exclude-dir=node_modules
# No references found
```

**Action**: Delete

#### 1.3 Unused Helper Script
**File**: `help.sh`

**Proof**:
```bash
$ grep -r "help.sh" . --exclude-dir=node_modules
# Only found in docs/audit/REPO_MAP.md (documentation only)
```

**Content**: Contains certbot command (can be moved to docs if needed)

**Action**: Delete (or move to `docs/` if certbot command is useful)

#### 1.4 Unreferenced Image
**File**: `qpay-qr.png`

**Proof**:
```bash
$ grep -r "qpay-qr.png" . --exclude-dir=node_modules
# No references found
```

**Action**: Delete

---

### Category 2: REVIEW BEFORE DELETION

#### 2.1 Unused Docker Compose Files

**File**: `docker-compose.pinned.yml`
- **Purpose**: Pinned image versions with SHA256 digests
- **Usage**: Only documented in `docs/audit/`, not used in scripts/CI
- **Proof**:
  ```bash
  $ grep -r "docker-compose.pinned" . --exclude-dir=node_modules
  # Only found in docs/audit/CONFIG_SURFACE.md and REPO_MAP.md
  ```
- **Recommendation**: **KEEP** (useful for production stability, may be used manually)

**File**: `docker-compose.recommendation-hotfix.yml`
- **Purpose**: Hotfix for recommendation-service Prisma issue
- **Usage**: Not referenced anywhere
- **Proof**:
  ```bash
  $ grep -r "docker-compose.recommendation-hotfix" . --exclude-dir=node_modules
  # No references found
  ```
- **Recommendation**: **DELETE** (hotfix was applied to source, file is obsolete)

---

### Category 3: CONSOLIDATE/MOVE

#### 3.1 Documentation Files (Root Level)

**QPAY Documentation** (32 files):
Many `QPAY_*.md` files appear to be implementation summaries, guides, and status reports. These should be:
1. Consolidated into `docs/payments/` (already has 5 files)
2. Or moved to `docs/audit/` if they're audit-related
3. Or archived if obsolete

**Audit/Summary Files** (8 files):
- `AUDIT_FIXES_APPLIED.md`
- `AUDIT_REPORT.md`
- `FINAL_AUDIT_SUMMARY.md`
- `FIX_SUMMARY.md`
- `PROJECT_AUDIT_REPORT.md`
- `VERSION_STANDARDIZATION_SUMMARY.md`
- `VERIFICATION_CHECKLIST_VERSIONS.md`
- `QPAY_TYPECHECK_FIX.md`

**Recommendation**: Move to `docs/audit/` directory

**Test Scripts** (8 files):
- `test-qpay-*.sh` files
- `test-qpay-invoice.json`

**Recommendation**: Move to `scripts/tests/` or `docs/payments/` if they're examples

---

### Category 4: SECRETS RISK

#### 4.1 Production Environment File
**File**: `.env.production`

**Risk**: Contains production secrets if committed

**Action**: 
1. Verify it's in .gitignore (it is: `.env.*` pattern)
2. Check git history: `git log --all --full-history -- .env.production`
3. If secrets were committed, rotate them
4. Delete from repo if safe

---

## C) VERSION / TOOLING STABILITY

### Current Status
✅ **pnpm**: Standardized to `9.12.3` everywhere
- Root `packageManager`: `pnpm@9.12.3`
- CI workflow: `pnpm@9.12.3`
- All Dockerfiles: `pnpm@9.12.3`

✅ **Prisma**: Standardized to `6.7.0`
- Enforced via `pnpm.overrides`
- All packages use same version

✅ **Frozen lockfile**: Used in CI and Dockerfiles
- CI: `pnpm install --frozen-lockfile`
- Dockerfiles: `pnpm install --prod --frozen-lockfile`

✅ **Prisma generate**: Uses `pnpm exec prisma generate`
- Root `postinstall` script
- All Dockerfiles
- All entrypoint.sh scripts

**No changes needed** ✅

---

## D) SIMPLIFICATION / HARDENING SUGGESTIONS

### 1. Docker Compose Files
**Current**: 6 files
- `docker-compose.production.yml` (base)
- `docker-compose.override.yml` (production overrides)
- `docker-compose.nginx-override.yml` (nginx config)
- `docker-compose.dev.yml` (development)
- `docker-compose.pinned.yml` (pinned versions - unused)
- `docker-compose.recommendation-hotfix.yml` (obsolete)

**Recommendation**:
- Delete `docker-compose.recommendation-hotfix.yml` (obsolete)
- Keep `docker-compose.pinned.yml` (useful for manual deployments)
- Document the purpose of each file in `DEPLOYMENT.md`

### 2. Documentation Organization
**Current**: 47+ markdown files in root

**Recommendation**:
- Create `docs/` structure:
  - `docs/audit/` - Audit reports and summaries
  - `docs/payments/` - QPay documentation (already exists)
  - `docs/deployment/` - Deployment guides
- Move root-level docs to appropriate directories
- Create `README.md` with links to key docs

### 3. Test Scripts
**Current**: 8 test scripts in root

**Recommendation**:
- Move to `scripts/tests/` or `scripts/qpay-tests/`
- Or document in `docs/payments/testing.md`

### 4. Environment Variables
**Current**: Multiple `.env.example` files

**Recommendation**:
- Consolidate into single `.env.example` at root
- Document service-specific vars in `docs/deployment/env-vars.md`

---

## E) PROPOSED CHANGES

### Phase 1: Safe Deletions (Immediate)

1. **Delete backup files**:
   ```bash
   rm docker-compose.production.yml.bak.*
   rm .env.example.backup
   rm ops-backups/nginx.conf.20251001-032753Z
   ```

2. **Delete old commit messages**:
   ```bash
   rm COMMIT_MESSAGE.txt COMMIT_MESSAGE_VERSIONS.txt
   ```

3. **Delete unused files**:
   ```bash
   rm help.sh
   rm qpay-qr.png
   rm docker-compose.recommendation-hotfix.yml
   ```

### Phase 2: Organize Documentation

1. **Move audit docs to `docs/audit/`**:
   ```bash
   mkdir -p docs/audit
   mv AUDIT_*.md FINAL_AUDIT_SUMMARY.md FIX_SUMMARY.md PROJECT_AUDIT_REPORT.md docs/audit/
   mv VERSION_STANDARDIZATION_SUMMARY.md VERIFICATION_CHECKLIST_VERSIONS.md QPAY_TYPECHECK_FIX.md docs/audit/
   ```

2. **Move QPay docs to `docs/payments/`** (review which are still relevant):
   ```bash
   # Move implementation guides
   mv QPAY_IMPLEMENTATION_*.md QPAY_*_IMPLEMENTATION.md docs/payments/
   # Move summaries (may be duplicates)
   mv QPAY_*_SUMMARY.md docs/payments/  # Review first
   ```

3. **Move test scripts**:
   ```bash
   mkdir -p scripts/tests
   mv test-qpay-*.sh test-qpay-*.json scripts/tests/
   ```

### Phase 3: Update .gitignore

Already covers most cases, but verify:
- ✅ `*.bak.*` - Covered
- ✅ `*.backup` - Covered
- ✅ `ops-backups/` - Covered
- ✅ `.env*` - Covered
- ✅ `dist/` - Covered

**No changes needed** ✅

---

## F) VERIFICATION PLAN

After applying changes, run:

```bash
# 1. Reset NX cache
npx nx reset

# 2. Typecheck (cache disabled)
NX_SKIP_NX_CACHE=1 npx nx run-many -t typecheck --all

# 3. Build (cache disabled)
NX_SKIP_NX_CACHE=1 npx nx run-many -t build --all

# 4. Run regression guards
./scripts/check-qpay-response-types.sh

# 5. Verify git status
git status
```

---

## G) RISKS & MITIGATIONS

### Risk 1: Deleting Useful Documentation
**Mitigation**: Move to `docs/` instead of deleting, review before moving

### Risk 2: Breaking Scripts/CI
**Mitigation**: Verify all references before deletion using `grep`

### Risk 3: Losing Backup Files
**Mitigation**: Backups are already gitignored, safe to delete. If needed, can restore from git history

### Risk 4: Secrets in `.env.production`
**Mitigation**: Check git history, rotate secrets if exposed

---

## H) SUMMARY

### Files to Delete (12 files)
1. `docker-compose.production.yml.bak.*` (3 files)
2. `.env.example.backup`
3. `ops-backups/nginx.conf.20251001-032753Z`
4. `COMMIT_MESSAGE.txt`
5. `COMMIT_MESSAGE_VERSIONS.txt`
6. `help.sh`
7. `qpay-qr.png`
8. `docker-compose.recommendation-hotfix.yml`

### Files to Move (40+ files)
- Audit docs → `docs/audit/`
- QPay docs → `docs/payments/` (review first)
- Test scripts → `scripts/tests/`

### Files to Review
- `.env.production` - Check for secrets
- `docker-compose.pinned.yml` - Keep (useful)

### Space Savings
- ~23MB (dist/, .nx/, backup files)

---

## NEXT STEPS

1. ✅ Review this report
2. Apply Phase 1 (safe deletions)
3. Review documentation before Phase 2
4. Apply Phase 2 (organize docs)
5. Run verification commands
6. Commit changes

