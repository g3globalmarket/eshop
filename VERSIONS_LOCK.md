# Version Lock - Baseline Versions

**Date**: 2026-01-16  
**Purpose**: Single source of truth for all package versions across the monorepo

---

## BASELINE VERSIONS

These versions are chosen based on:
1. Current working versions in production
2. Compatibility across all packages
3. Security and stability considerations

### Core Tools

| Package | Version | Rationale |
|---------|---------|-----------|
| **pnpm** | `9.12.3` | Already in root packageManager, latest stable |
| **Node.js** | `20.19.3` (or `20-alpine` pinned) | Current LTS, matches local environment |
| **TypeScript** | `5.7.2` | Matches root package.json, latest stable 5.x |

### Database & ORM

| Package | Version | Rationale |
|---------|---------|-----------|
| **prisma** | `6.7.0` | Exact version from root, avoid breaking changes |
| **@prisma/client** | `6.7.0` | Must match prisma version exactly |

### Frontend Framework

| Package | Version | Rationale |
|---------|---------|-----------|
| **next** | `15.1.4` | Most common version (user-ui, seller-ui), stable |
| **react** | `19.0.0` | Already consistent across all packages |
| **react-dom** | `19.0.0` | Already consistent across all packages |
| **eslint-config-next** | `15.1.4` | Must match next version |

### Build Tools

| Package | Version | Rationale |
|---------|---------|-----------|
| **@swc/core** | `1.5.7` | Matches root package.json |
| **@swc/cli** | `0.3.12` | Matches root package.json |
| **@swc-node/register** | `1.9.1` | Matches root package.json |
| **@swc/helpers** | `0.5.11` | Matches root package.json |
| **@swc/jest** | `0.2.36` | Matches root package.json |

---

## ENFORCEMENT STRATEGY

### 1. Root package.json
- Set exact versions (no caret/tilde) for critical packages
- Add `pnpm.overrides` to force versions across all workspaces

### 2. .npmrc
- `save-exact=true` - Prevents adding ranges
- `prefer-frozen-lockfile=true` - Enforces lockfile usage

### 3. CI/CD
- Use `pnpm@9.12.3` (from packageManager)
- Always use `--frozen-lockfile`

### 4. Dockerfiles
- Use `pnpm@9.12.3` everywhere
- Use `--frozen-lockfile` for installs
- Use `pnpm exec prisma generate` (not npx)

### 5. Entrypoint Scripts
- Use `pnpm exec prisma generate` (not npx)

---

## VERSION OVERRIDES

Add to root `package.json`:

```json
{
  "pnpm": {
    "overrides": {
      "prisma": "6.7.0",
      "@prisma/client": "6.7.0",
      "next": "15.1.4",
      "eslint-config-next": "15.1.4",
      "react": "19.0.0",
      "react-dom": "19.0.0",
      "typescript": "5.7.2",
      "@swc/core": "1.5.7"
    }
  }
}
```

This ensures that even if a package specifies a range, pnpm will use the exact version specified here.

---

## WHERE VERSIONS ARE ENFORCED

### pnpm Version
- ✅ Root `package.json` (packageManager field)
- ✅ All Dockerfiles (corepack prepare)
- ✅ CI workflow (.github/workflows/docker-build.yml)

### Prisma Versions
- ✅ Root `package.json` (dependencies)
- ✅ All service package.json files (via overrides)
- ✅ All Dockerfiles (via pnpm exec, no hardcoded version)

### Next.js Versions
- ✅ All UI package.json files (apps/user-ui, apps/seller-ui, apps/admin-ui)
- ✅ Enforced via pnpm.overrides

### TypeScript Versions
- ✅ Root `package.json` (devDependencies)
- ✅ All package.json files (via overrides)

---

## MIGRATION NOTES

### Before
- Prisma: Mix of 6.7.0, 6.11.1, 6.19.1
- Next.js: 15.1.4, 15.1.8
- pnpm: 8.10.2, 9.12.3
- TypeScript: 5.0.0, 5.7.2, 5.7.3

### After
- Prisma: 6.7.0 (exact, everywhere)
- Next.js: 15.1.4 (exact, everywhere)
- pnpm: 9.12.3 (exact, everywhere)
- TypeScript: 5.7.2 (exact, everywhere)

---

## VERIFICATION

After applying fixes, verify:

```bash
# Check pnpm version
pnpm -v
# Expected: 9.12.3

# Check Prisma versions
pnpm list prisma @prisma/client --depth=0
# Expected: All show 6.7.0

# Check Next.js versions
pnpm list next --depth=0 --filter "./apps/*-ui"
# Expected: All show 15.1.4

# Check TypeScript versions
pnpm list typescript --depth=0
# Expected: All show 5.7.2
```

---

**Status**: Baseline established  
**Next**: Apply fixes to enforce these versions

