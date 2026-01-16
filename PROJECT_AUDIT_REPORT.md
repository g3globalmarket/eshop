# Full Project Audit Report - NomadNet/eShop

**Date**: 2026-01-16  
**Auditor**: Principal Engineer (via Cursor AI)  
**Scope**: Complete Nx monorepo audit for breakage risks in local dev, CI, Docker builds, and production deployment

---

## A) PROJECT HEALTH REPORT

| Area | Status | Evidence | Command/File |
|------|--------|----------|--------------|
| **Repo Structure** | ✅ OK | 23 Nx projects identified (11 apps + 12 packages) | `npx nx show projects` |
| **Node/pnpm Versions** | ⚠️ WARNING | pnpm 9.12.3 (package.json) vs 8.10.2 (CI/Dockerfiles) | `pnpm -v` → 9.12.3, CI uses 8.10.2 |
| **Nx Workspace Sync** | ✅ FIXED | Synced successfully | `npx nx sync` |
| **Typecheck** | ❌ FAILING | 5 services failing typecheck | See errors below |
| **Build** | ✅ OK | Services build successfully (webpack warnings only) | `npx nx run-many -t build` |
| **CI/CD** | ⚠️ WARNING | CI uses pnpm@8.10.2, doesn't run typecheck/lint | `.github/workflows/docker-build.yml` |
| **Docker Builds** | ⚠️ WARNING | pnpm version inconsistency across Dockerfiles | 9.12.3 (UIs) vs 8.10.2 (services) |
| **Environment Variables** | ⚠️ WARNING | No validation, 134+ `process.env` usages | No `.env.example`, no validation |
| **Error Handling** | ⚠️ WARNING | No unhandledRejection handlers, 4 empty catch blocks | See risks below |
| **Prisma** | ⚠️ WARNING | Missing required field in create operation | `recommendation-service` |
| **Module System** | ⚠️ WARNING | Module/moduleResolution mismatch, router type issues | `env-loader`, `chatting-service`, `seller-service` |

---

## B) BREAKAGE RISKS (Top 20)

### 🔴 CRITICAL (Must Fix Before Deployment)

#### 1. **Typecheck Failures (5 Services)**
- **Risk**: Type errors can cause runtime failures, especially in production
- **Impact**: HIGH - Services may fail at runtime with type-related errors
- **Where Found**:
  - `@packages/env-loader`: module/moduleResolution mismatch
  - `auth-service`: JSX errors in components
  - `chatting-service`: Router type inference issue
  - `recommendation-service`: Missing `lastVisited` in Prisma create
  - `seller-service`: Router type inference issue
- **How to Reproduce**:
  ```bash
  npx nx run-many -t typecheck --all
  ```
- **Minimal Fix**: See fixes section below

#### 2. **pnpm Version Inconsistency**
- **Risk**: Different pnpm versions can cause lockfile conflicts, dependency resolution issues
- **Impact**: HIGH - Build failures, dependency mismatches, production bugs
- **Where Found**:
  - `package.json`: `"packageManager": "pnpm@9.12.3+sha512..."`
  - CI workflow: `npm install -g pnpm@8.10.2` (line 236)
  - Dockerfiles: Mix of `pnpm@9.12.3` (UIs) and `pnpm@8.10.2` (services)
- **How to Reproduce**:
  ```bash
  grep -r "pnpm@" .github/workflows/ apps/*/Dockerfile
  ```
- **Minimal Fix**: Standardize to pnpm@9.12.3 everywhere

#### 3. **Missing UnhandledRejection Handlers**
- **Risk**: Unhandled promise rejections can crash Node.js processes silently
- **Impact**: HIGH - Services can crash without logs, production downtime
- **Where Found**: All `main.ts` files lack global error handlers
- **How to Reproduce**:
  ```bash
  grep -r "unhandledRejection\|uncaughtException" apps/
  # Returns: No matches
  ```
- **Minimal Fix**: Add global handlers to all `main.ts` files

#### 4. **Empty Catch Blocks (4 instances)**
- **Risk**: Errors are silently swallowed, making debugging impossible
- **Impact**: MEDIUM-HIGH - Bugs go undetected, data corruption possible
- **Where Found**:
  - `apps/api-gateway/src/(routes)/qpay.ts:79` - `.catch(() => "Unknown error")`
  - `apps/seller-ui/src/app/(routes)/dashboard/create-product/page.tsx:69` - `.catch(() => { toast.error(...) })`
  - `apps/seller-ui/src/app/(routes)/dashboard/create-event/page.tsx:54` - `.catch(() => { toast.error(...) })`
  - `apps/seller-service/src/controllers/seller.controller.ts:534` - `catch (error) {}`
- **How to Reproduce**:
  ```bash
  grep -r "\.catch\(\(\)\|catch.*\{\s*\}" apps/
  ```
- **Minimal Fix**: Add proper error logging

#### 5. **Prisma Schema Mismatch (recommendation-service)**
- **Risk**: Runtime error when creating userAnalytics without required `lastVisited` field
- **Impact**: HIGH - Service crashes when creating analytics records
- **Where Found**: `apps/recommendation-service/src/controllers/recommendation-controller.ts:89`
- **Schema**: `prisma/schema.prisma:166` - `lastVisited DateTime` (required, no default)
- **How to Reproduce**:
  ```bash
  npx nx typecheck recommendation-service
  # Error: Property 'lastVisited' is missing
  ```
- **Minimal Fix**: Add `lastVisited: now` to create operation

### 🟡 HIGH PRIORITY (Fix Soon)

#### 6. **CI Doesn't Run Typecheck/Lint**
- **Risk**: Type errors and lint issues can reach production
- **Impact**: MEDIUM-HIGH - Production bugs from type errors
- **Where Found**: `.github/workflows/docker-build.yml` - only builds, no typecheck/lint
- **How to Reproduce**: Check CI workflow - no `typecheck` or `lint` steps
- **Minimal Fix**: Add typecheck step before build

#### 7. **Module/ModuleResolution Mismatch (env-loader)**
- **Risk**: TypeScript compilation errors, potential runtime issues
- **Impact**: MEDIUM - Build failures, type errors
- **Where Found**: `packages/libs/env-loader/tsconfig.json:4` - `module: "commonjs"` but base has `moduleResolution: "nodenext"`
- **How to Reproduce**:
  ```bash
  npx nx typecheck @packages/env-loader
  # Error: Option 'module' must be set to 'NodeNext' when option 'moduleResolution' is set to 'NodeNext'
  ```
- **Minimal Fix**: Align module settings with base config

#### 8. **Router Type Inference Issues**
- **Risk**: Type errors, potential runtime issues with Express routing
- **Impact**: MEDIUM - Type safety compromised
- **Where Found**:
  - `apps/chatting-service/src/routes/chat.routes.ts:12`
  - `apps/seller-service/src/routes/seller.routes.ts:20`
- **How to Reproduce**:
  ```bash
  npx nx typecheck chatting-service seller-service
  ```
- **Minimal Fix**: Add explicit type annotation: `const router: Router = express.Router()`

#### 9. **JSX Errors in auth-service**
- **Risk**: TypeScript can't process JSX in backend service
- **Impact**: MEDIUM - Typecheck fails, potential build issues
- **Where Found**: `apps/auth-service` importing from `packages/components/size-selector` (JSX component)
- **How to Reproduce**:
  ```bash
  npx nx typecheck auth-service
  # Error: Cannot use JSX unless the '--jsx' flag is provided
  ```
- **Minimal Fix**: Exclude components from backend service tsconfig or add jsx support

#### 10. **No Environment Variable Validation**
- **Risk**: Services crash at runtime if required env vars are missing
- **Impact**: MEDIUM-HIGH - Production failures, hard to debug
- **Where Found**: 134+ `process.env` usages, no validation
- **How to Reproduce**: Start service without required env vars
- **Minimal Fix**: Add minimal env validation (zod/envalid) or at least document required vars

#### 11. **Dockerfile Build Strategy Inconsistency**
- **Risk**: Different build strategies can cause inconsistent builds
- **Impact**: MEDIUM - Build failures, deployment issues
- **Where Found**:
  - `api-gateway/Dockerfile`: Uses `pnpm deploy` (different strategy)
  - Other services: Copy dist directly
- **How to Reproduce**: Compare Dockerfiles
- **Minimal Fix**: Standardize build strategy or document why different

#### 12. **Missing .env.example**
- **Risk**: Developers don't know required environment variables
- **Impact**: MEDIUM - Development setup failures
- **Where Found**: No `.env.example` file in repo
- **How to Reproduce**: `ls -la .env.example` → not found
- **Minimal Fix**: Create `.env.example` with all required vars (no secrets)

### 🟢 MEDIUM PRIORITY (Monitor)

#### 13. **Webpack Warnings (Express)**
- **Risk**: Potential runtime issues with dynamic requires
- **Impact**: LOW-MEDIUM - Usually harmless but should be addressed
- **Where Found**: Build output shows "Critical dependency: the request of a dependency is an expression"
- **How to Reproduce**: `npx nx build api-gateway`
- **Minimal Fix**: Suppress warnings or upgrade Express (if compatible)

#### 14. **No Test Coverage**
- **Risk**: Regressions not caught before deployment
- **Impact**: MEDIUM - Bugs reach production
- **Where Found**: Most services have no tests
- **How to Reproduce**: `npx nx run-many -t test --all` → few/no tests
- **Minimal Fix**: Add minimal smoke tests for critical paths

#### 15. **Docker Compose Override Complexity**
- **Risk**: Confusion about which compose file is used
- **Impact**: LOW-MEDIUM - Deployment mistakes
- **Where Found**: Multiple compose files (dev, prod, override, nginx-override, pinned, hotfix)
- **How to Reproduce**: `ls docker-compose*.yml`
- **Minimal Fix**: Document which files are used when, consider consolidation

#### 16. **Prisma Generate in Multiple Places**
- **Risk**: Inconsistent Prisma client generation
- **Impact**: LOW-MEDIUM - Runtime errors if client not generated
- **Where Found**: 
  - `package.json` postinstall
  - Dockerfiles (multiple strategies)
  - entrypoint.sh scripts
- **How to Reproduce**: Check all Prisma generate locations
- **Minimal Fix**: Standardize to single source of truth

#### 17. **No Health Check Endpoints for Some Services**
- **Risk**: Can't verify service health in production
- **Impact**: LOW-MEDIUM - Harder to monitor/debug
- **Where Found**: Not all services have `/health` endpoints
- **How to Reproduce**: Check main.ts files
- **Minimal Fix**: Add health endpoints to all services

#### 18. **Kafka Port Hardcoded in Some Places**
- **Risk**: Configuration drift if Kafka port changes
- **Impact**: LOW - Already fixed in most places, but verify
- **Where Found**: Some old references to `kafka:29092` in docs/backups
- **How to Reproduce**: `grep -r "29092" .`
- **Minimal Fix**: Clean up old references (already fixed in code)

#### 19. **No Request Timeout Configuration**
- **Risk**: Hanging requests can exhaust resources
- **Impact**: MEDIUM - Resource exhaustion, service degradation
- **Where Found**: Express services don't set request timeouts
- **How to Reproduce**: Check main.ts files for timeout config
- **Minimal Fix**: Add request timeout middleware

#### 20. **Missing Error Context in Logs**
- **Risk**: Hard to debug production issues
- **Impact**: MEDIUM - Longer MTTR (mean time to repair)
- **Where Found**: Some error logs lack context (request ID, user ID, etc.)
- **How to Reproduce**: Check error logging in controllers
- **Minimal Fix**: Add request ID middleware, include context in errors

---

## C) REQUIRED FIXES (with diffs)

### Fix 1: Standardize pnpm Version

**File**: `.github/workflows/docker-build.yml`
```diff
-          npm install -g pnpm@8.10.2
+          npm install -g pnpm@9.12.3
```

**File**: All Dockerfiles (10 files)
```diff
- RUN corepack enable && corepack prepare pnpm@8.10.2 --activate
+ RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
```

**Files to update**:
- `apps/auth-service/Dockerfile`
- `apps/admin-service/Dockerfile`
- `apps/chatting-service/Dockerfile`
- `apps/kafka-service/Dockerfile`
- `apps/logger-service/Dockerfile`
- `apps/order-service/Dockerfile`
- `apps/product-service/Dockerfile`
- `apps/recommendation-service/Dockerfile`
- `apps/seller-service/Dockerfile`

### Fix 2: Fix env-loader tsconfig

**File**: `packages/libs/env-loader/tsconfig.json`
```diff
  {
    "extends": "../../../tsconfig.base.json",
    "compilerOptions": {
-     "module": "commonjs",
+     "module": "nodenext",
      "outDir": "./dist",
      "declaration": true,
      "esModuleInterop": true
    },
    "include": ["src/**/*"]
  }
```

### Fix 3: Fix recommendation-service Prisma create

**File**: `apps/recommendation-service/src/controllers/recommendation-controller.ts`
```diff
        await prisma.userAnalytics.upsert({
          where: { userId },
          update: { recommendations: recommendedProductIds, lastTrained: now },
          create: {
            userId,
+           lastVisited: now,
            actions: [],
            recommendations: recommendedProductIds,
            lastTrained: now,
          },
        });
```

### Fix 4: Fix router type annotations

**File**: `apps/chatting-service/src/routes/chat.routes.ts`
```diff
  import { isSeller } from "@packages/middleware/authorizeRoles";
  
- const router = express.Router();
+ const router: Router = express.Router();
```

**File**: `apps/seller-service/src/routes/seller.routes.ts`
```diff
  } from "../controllers/seller.controller";
  
- const router = express.Router();
+ const router: Router = express.Router();
```

### Fix 5: Add unhandledRejection handlers

**File**: All `apps/*/src/main.ts` files (10 files)

Add at the top of each main.ts (after imports, before app initialization):

```typescript
// Global error handlers
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // In production, you might want to exit or send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Optionally exit in production to trigger container restart
    // process.exit(1);
  }
});

process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  // Always exit on uncaught exception
  process.exit(1);
});
```

### Fix 6: Fix empty catch blocks

**File**: `apps/api-gateway/src/(routes)/qpay.ts`
```diff
-     const errorText = await response.text().catch(() => "Unknown error");
+     const errorText = await response.text().catch((err) => {
+       console.error('[QPay Gateway] Failed to read error response:', err);
+       return "Unknown error";
+     });
```

**File**: `apps/seller-service/src/controllers/seller.controller.ts`
```diff
-  } catch (error) {}
+  } catch (error) {
+    console.error('[Seller Controller] Error in operation:', error);
+    // Log but don't throw - operation is non-critical
+  }
```

**Files**: `apps/seller-ui/src/app/(routes)/dashboard/create-product/page.tsx` and `create-event/page.tsx`
```diff
-          .catch(() => {
+          .catch((error) => {
+            console.error('Error checking slug:', error);
              toast.error("Error checking slug!");
            })
```

### Fix 7: Exclude components from auth-service tsconfig

**File**: `apps/auth-service/tsconfig.app.json`
```diff
  "include": [
    "src/**/*.ts",
-   "../../packages/**/*.ts"
+   "../../packages/**/*.ts"
  ],
+ "exclude": [
+   "../../packages/components/**/*"
+ ]
```

### Fix 8: Add CI typecheck step

**File**: `.github/workflows/docker-build.yml`

Add before build step:
```yaml
      - name: Typecheck
        run: |
          npm install -g pnpm@9.12.3
          pnpm install
          npx nx run-many -t typecheck --all --skip-nx-cache
```

### Fix 9: Create .env.example

**File**: `.env.example` (new file)
```bash
# Database
DATABASE_URL=mongodb://localhost:27017/eshop

# Redis
REDIS_URL=redis://localhost:6379

# Kafka
KAFKA_BROKERS=kafka:9092

# JWT
ACCESS_TOKEN_SECRET=your-secret-key-here
REFRESH_TOKEN_SECRET=your-refresh-secret-here

# QPay (if used)
QPAY_CLIENT_ID=your-client-id
QPAY_CLIENT_SECRET=your-client-secret
QPAY_INVOICE_CODE=your-invoice-code
QPAY_USD_TO_MNT_RATE=3400
QPAY_WEBHOOK_SECRET=your-webhook-secret

# Email (if used)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASS=your-password

# ImageKit (if used)
IMAGEKIT_PUBLIC_KEY=your-public-key
IMAGEKIT_PRIVATE_KEY=your-private-key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-id

# Stripe (if used)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Node Environment
NODE_ENV=development

# Debug Flags
INTERNAL_WEBHOOK_DEBUG=false
ENV_LOADER_DEBUG=false
```

---

## D) REGRESSION GUARDS

### 1. Add Typecheck to CI
- **What**: Run `npx nx run-many -t typecheck --all` before build
- **Why**: Catch type errors before they reach production
- **Where**: `.github/workflows/docker-build.yml`

### 2. Add Build Verification
- **What**: Verify all services build successfully
- **Why**: Catch build failures early
- **Where**: CI workflow (already partially done)

### 3. Add Route Registration Test (recommendation-service)
- **What**: Test that route is registered without extra middleware
- **Why**: Prevent regression of middleware import issue
- **Where**: Add to `apps/recommendation-service` test suite

### 4. Add Environment Variable Validation
- **What**: Validate required env vars at startup
- **Why**: Fail fast with clear error messages
- **Where**: All `main.ts` files

### 5. Add Health Check Tests
- **What**: Test that all services have working health endpoints
- **Why**: Ensure services are monitorable
- **Where**: E2E test suite or smoke tests

---

## E) VERIFICATION CHECKLIST

### Pre-Fix Verification

```bash
# 1. Check current state
cd "/Users/user/Desktop/Final Project/eshop"
pnpm -v  # Should show 9.12.3
node -v  # Should show v20.x

# 2. Run typecheck (will fail - expected)
npx nx run-many -t typecheck --all
# Expected: 5 services fail

# 3. Check pnpm versions
grep -r "pnpm@" .github/workflows/ apps/*/Dockerfile | sort | uniq
# Expected: Mix of 8.10.2 and 9.12.3

# 4. Check for empty catch blocks
grep -r "\.catch\(\(\)\|catch.*\{\s*\}" apps/ | grep -v "node_modules"
# Expected: 4 matches

# 5. Check for unhandledRejection handlers
grep -r "unhandledRejection\|uncaughtException" apps/*/src/main.ts
# Expected: No matches
```

### Post-Fix Verification

```bash
# 1. Sync Nx workspace
npx nx sync

# 2. Run typecheck (should pass)
npx nx run-many -t typecheck --all
# Expected: All pass

# 3. Build all services
npx nx run-many -t build --all --parallel=3
# Expected: All build successfully

# 4. Verify pnpm versions are consistent
grep -r "pnpm@" .github/workflows/ apps/*/Dockerfile | sort | uniq
# Expected: All show 9.12.3

# 5. Verify error handlers added
grep -r "unhandledRejection" apps/*/src/main.ts
# Expected: 10 matches (one per service)

# 6. Verify empty catch blocks fixed
grep -r "catch.*\{\s*\}" apps/ | grep -v "node_modules" | grep -v "console"
# Expected: No empty catch blocks

# 7. Test recommendation-service route
npx nx build recommendation-service
node -e "
const fs = require('fs');
const code = fs.readFileSync('dist/apps/recommendation-service/main.js', 'utf8');
const match = code.match(/get\(\"\/get-recommendation-products\".*?\)/s);
console.log('Route:', match ? match[0] : 'NOT FOUND');
// Should NOT contain 'a.default' (middleware)
"
# Expected: Route registered correctly

# 8. Verify .env.example exists
ls -la .env.example
# Expected: File exists

# 9. Test Docker builds (sample)
docker build -f apps/order-service/Dockerfile -t test-order-service .
# Expected: Builds successfully

# 10. Run CI locally (if possible)
act -j build-backend  # Requires act tool
# Or push to test branch and verify CI passes
```

---

## F) DEPLOY CHECKLIST

### Before Deployment

- [ ] All fixes applied and committed
- [ ] Typecheck passes: `npx nx run-many -t typecheck --all`
- [ ] All services build: `npx nx run-many -t build --all`
- [ ] pnpm versions standardized (9.12.3 everywhere)
- [ ] .env.example created and documented
- [ ] Error handlers added to all main.ts files
- [ ] Empty catch blocks fixed
- [ ] CI workflow updated with typecheck step
- [ ] Docker images build successfully
- [ ] Local smoke tests pass

### Deployment Steps

1. **Commit all fixes**
   ```bash
   git add .
   git commit -m "fix: address audit findings - typecheck, pnpm versions, error handling"
   git push
   ```

2. **Verify CI passes**
   - Check GitHub Actions workflow
   - Ensure typecheck step passes
   - Ensure all Docker builds succeed

3. **Deploy to production**
   - Follow existing deployment process
   - Monitor logs for error handler messages
   - Verify all services start successfully

4. **Post-deployment verification**
   ```bash
   # On production server
   docker-compose -f docker-compose.production.yml -f docker-compose.override.yml ps
   # All services should be "Up" or "Up (healthy)"
   
   # Check logs for error handlers
   docker-compose logs | grep -i "unhandled\|uncaught"
   # Should see error handlers in logs (if errors occur)
   
   # Test health endpoints
   curl https://nomadnet.shop/gateway-health
   # Should return healthy status
   ```

### Quick Rollback Plan

If issues occur:

1. **Revert commits**
   ```bash
   git revert HEAD
   git push
   ```

2. **Or restore previous images**
   ```bash
   # On server
   docker-compose -f docker-compose.production.yml -f docker-compose.override.yml pull
   docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d
   ```

3. **Monitor and fix**
   - Check logs: `docker-compose logs -f`
   - Identify failing service
   - Apply targeted fix
   - Redeploy

---

## SUMMARY

### Critical Issues Found: 5
1. Typecheck failures (5 services)
2. pnpm version inconsistency
3. Missing unhandledRejection handlers
4. Empty catch blocks
5. Prisma schema mismatch

### High Priority Issues: 6
6. CI doesn't run typecheck
7. Module/moduleResolution mismatch
8. Router type inference issues
9. JSX errors in auth-service
10. No env var validation
11. Dockerfile inconsistencies
12. Missing .env.example

### Files to Modify: ~25
- 10 Dockerfiles (pnpm version)
- 10 main.ts files (error handlers)
- 1 CI workflow (typecheck + pnpm)
- 4 catch blocks (error logging)
- 3 tsconfig/route files (type fixes)
- 1 Prisma create (add lastVisited)
- 1 .env.example (new file)

### Estimated Fix Time: 2-3 hours
- Typecheck fixes: 30 min
- pnpm standardization: 15 min
- Error handlers: 30 min
- Catch blocks: 15 min
- CI updates: 15 min
- Documentation: 30 min
- Testing: 30 min

---

## NEXT STEPS

1. **Review this audit** - Understand all findings
2. **Apply fixes in order** - Start with critical issues
3. **Verify locally** - Run verification checklist
4. **Update CI** - Ensure CI catches regressions
5. **Deploy** - Follow deployment checklist
6. **Monitor** - Watch for any new issues

---

**Status**: Ready for fixes  
**Priority**: Fix critical issues before next deployment  
**Risk Level**: MEDIUM-HIGH (multiple typecheck failures, version inconsistencies)

