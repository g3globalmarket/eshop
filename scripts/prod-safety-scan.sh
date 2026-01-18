#!/bin/bash
set -euo pipefail

# Production Safety Scan - NomadNet Monorepo
# Scans for common "build succeeds but runtime breaks" patterns

echo "🔍 Production Safety Scan"
echo "========================="
echo ""

ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check 1: Entrypoints using pnpm/npm/npx at runtime
echo "1. Checking entrypoints for runtime pnpm/npm/npx usage..."
PNPM_IN_ENTRYPOINT=$(grep -r "pnpm\|npm\|npx" apps/*/entrypoint.sh 2>/dev/null | grep -v "^#" | grep -v "This ensures" | wc -l | tr -d ' ')
if [ "$PNPM_IN_ENTRYPOINT" -gt 0 ]; then
  echo -e "${RED}❌ Found $PNPM_IN_ENTRYPOINT entrypoint(s) using pnpm/npm/npx at runtime${NC}"
  grep -r "pnpm\|npm\|npx" apps/*/entrypoint.sh 2>/dev/null | grep -v "^#" | grep -v "This ensures"
  ((ERRORS++))
else
  echo -e "${GREEN}✅ No pnpm/npm/npx usage in entrypoints${NC}"
fi
echo ""

# Check 2: Runtime Prisma generation
echo "2. Checking for runtime Prisma generation..."
RUNTIME_PRISMA=$(grep -r "prisma generate\|prisma migrate" apps/*/entrypoint.sh 2>/dev/null | wc -l | tr -d ' ')
if [ "$RUNTIME_PRISMA" -gt 0 ]; then
  echo -e "${RED}❌ Found $RUNTIME_PRISMA entrypoint(s) running Prisma at runtime${NC}"
  grep -r "prisma generate\|prisma migrate" apps/*/entrypoint.sh 2>/dev/null
  ((ERRORS++))
else
  echo -e "${GREEN}✅ No Prisma generation at runtime${NC}"
fi
echo ""

# Check 3: Dockerfiles missing non-root user
echo "3. Checking for Dockerfiles missing non-root user..."
for df in apps/*/Dockerfile; do
  if ! grep -q "USER nodejs\|USER nextjs" "$df"; then
    echo -e "${RED}❌ $(basename $(dirname $df)): Missing non-root user${NC}"
    ((ERRORS++))
  fi
done
if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}✅ All Dockerfiles use non-root users${NC}"
fi
echo ""

# Check 4: Dockerfiles with Node version not pinned
echo "4. Checking Node version pinning..."
UNPINNED_NODE=$(grep "^FROM node:" apps/*/Dockerfile | grep -v "node:20" | wc -l | tr -d ' ')
if [ "$UNPINNED_NODE" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Found $UNPINNED_NODE Dockerfile(s) not using Node 20${NC}"
  grep "^FROM node:" apps/*/Dockerfile | grep -v "node:20"
  ((WARNINGS++))
else
  echo -e "${GREEN}✅ All Dockerfiles use Node 20${NC}"
fi
echo ""

# Check 5: Dockerfiles with pnpm not pinned
echo "5. Checking pnpm version pinning..."
UNPINNED_PNPM=$(grep "corepack prepare pnpm@" apps/*/Dockerfile | grep -v "pnpm@9.12.3" | wc -l | tr -d ' ')
if [ "$UNPINNED_PNPM" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Found $UNPINNED_PNPM Dockerfile(s) not using pnpm@9.12.3${NC}"
  grep "corepack prepare pnpm@" apps/*/Dockerfile | grep -v "pnpm@9.12.3"
  ((WARNINGS++))
else
  echo -e "${GREEN}✅ All Dockerfiles use pnpm@9.12.3${NC}"
fi
echo ""

# Check 6: Missing frozen-lockfile
echo "6. Checking for --frozen-lockfile usage..."
for df in apps/*/Dockerfile; do
  if grep -q "pnpm install" "$df" && ! grep -q "frozen-lockfile" "$df"; then
    echo -e "${YELLOW}⚠️  $(basename $(dirname $df)): Missing --frozen-lockfile${NC}"
    ((WARNINGS++))
  fi
done
if [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✅ All pnpm install commands use --frozen-lockfile${NC}"
fi
echo ""

# Check 7: Deploy scripts missing strict mode
echo "7. Checking deploy scripts for strict mode..."
for script in scripts/deploy-production.sh scripts/pull-and-deploy.sh; do
  if [ -f "$script" ]; then
    if ! grep -q "set -euo pipefail" "$script"; then
      echo -e "${RED}❌ $script: Missing set -euo pipefail${NC}"
      ((ERRORS++))
    else
      echo -e "${GREEN}✅ $script: Has strict mode${NC}"
    fi
  fi
done
echo ""

# Check 8: Healthchecks requiring curl but curl not installed
echo "8. Checking healthcheck dependencies..."
if grep -q "curl.*healthcheck\|healthcheck.*curl" docker-compose.production.yml 2>/dev/null; then
  for svc in api-gateway auth-service; do
    if grep -A 5 "healthcheck:" docker-compose.production.yml | grep -q "curl" && grep -B 5 "healthcheck:" docker-compose.production.yml | grep -q "$svc"; then
      if ! grep -q "curl" "apps/$svc/Dockerfile"; then
        echo -e "${RED}❌ $svc: Healthcheck uses curl but curl not in Dockerfile${NC}"
        ((ERRORS++))
      else
        echo -e "${GREEN}✅ $svc: curl installed for healthcheck${NC}"
      fi
    fi
  done
fi
echo ""

# Check 10: Healthchecks present for HTTP services
echo "10. Checking for missing healthchecks..."
SERVICES_WITH_HEALTHCHECK=$(grep -c "healthcheck:" docker-compose.production.yml 2>/dev/null || echo "0")
HTTP_SERVICES=$(grep -E "product-service|order-service|seller-service|admin-service|chatting-service|logger-service|recommendation-service|user-ui|seller-ui|admin-ui" docker-compose.production.yml | grep -c "image:" || echo "0")
if [ "$SERVICES_WITH_HEALTHCHECK" -lt 10 ]; then
  echo -e "${YELLOW}⚠️  Only $SERVICES_WITH_HEALTHCHECK service(s) have healthchecks (recommended: all HTTP services)${NC}"
  ((WARNINGS++))
else
  echo -e "${GREEN}✅ All HTTP services have healthchecks${NC}"
fi
echo ""

# Check 9: Entrypoint strict mode
echo "9. Checking entrypoint strict mode..."
STRICT_MODE_COUNT=$(grep -c "set -e" apps/*/entrypoint.sh 2>/dev/null || echo "0")
if [ "$STRICT_MODE_COUNT" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No entrypoints found with strict mode${NC}"
  ((WARNINGS++))
else
  echo -e "${GREEN}✅ $STRICT_MODE_COUNT entrypoint(s) use strict mode${NC}"
fi
echo ""

# Check 10: Compose config validation
echo "10. Validating docker-compose.production.yml..."
if docker compose -f docker-compose.production.yml config > /dev/null 2>&1; then
  echo -e "${GREEN}✅ docker-compose.production.yml is valid${NC}"
else
  echo -e "${RED}❌ docker-compose.production.yml has errors${NC}"
  docker compose -f docker-compose.production.yml config
  ((ERRORS++))
fi
echo ""

# Summary
echo "========================="
if [ "$ERRORS" -eq 0 ] && [ "$WARNINGS" -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed!${NC}"
  exit 0
elif [ "$ERRORS" -eq 0 ]; then
  echo -e "${YELLOW}⚠️  $WARNINGS warning(s) found (no critical errors)${NC}"
  exit 0
else
  echo -e "${RED}❌ $ERRORS error(s) and $WARNINGS warning(s) found${NC}"
  exit 1
fi

