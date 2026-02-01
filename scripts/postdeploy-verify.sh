#!/bin/bash
# Post-deployment verification script
# Checks critical containers and health endpoints to fail fast on broken deploys
# Exit code: 0 if all checks pass, 1 if any check fails

set -euo pipefail

PROJECT="eshop"
FILES=(
  "-f" "docker-compose.production.yml"
  "-f" "docker-compose.override.yml"
  "-f" "docker-compose.nginx-override.yml"
)

# Critical services to verify (minimum required for site to function)
CRITICAL_SERVICES=(
  "api-gateway"
  "auth-service"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

error_count=0

echo "🔍 Post-deployment verification starting..."
echo "   Project: ${PROJECT}"
echo ""

# Helper: get container ID for a service
get_container_id() {
  local svc="$1"
  docker compose -p "$PROJECT" "${FILES[@]}" ps -q "$svc" 2>/dev/null || echo ""
}

# Helper: check if container is running
check_container_running() {
  local svc="$1"
  local cid
  cid=$(get_container_id "$svc")
  
  if [ -z "$cid" ]; then
    echo -e "${RED}❌ ${svc}: Container not found${NC}"
    return 1
  fi
  
  local status
  status=$(docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || echo "unknown")
  
  if [ "$status" != "running" ]; then
    echo -e "${RED}❌ ${svc}: Container status is '${status}' (expected 'running')${NC}"
    return 1
  fi
  
  echo -e "${GREEN}✅ ${svc}: Container is running${NC}"
  return 0
}

# Helper: check container health status (if healthcheck exists)
check_container_health() {
  local svc="$1"
  local cid
  cid=$(get_container_id "$svc")
  
  if [ -z "$cid" ]; then
    return 1
  fi
  
  local health
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || echo "")
  
  # If no healthcheck defined, health will be empty - that's OK
  if [ -z "$health" ]; then
    return 0
  fi
  
  if [ "$health" != "healthy" ]; then
    echo -e "${RED}❌ ${svc}: Health status is '${health}' (expected 'healthy')${NC}"
    return 1
  fi
  
  echo -e "${GREEN}✅ ${svc}: Health status is 'healthy'${NC}"
  return 0
}

# Helper: check HTTP health endpoint
check_health_endpoint() {
  local svc="$1"
  
  case "$svc" in
    "api-gateway")
      if curl -fsS --max-time 5 http://localhost:8080/gateway-health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ${svc}: http://localhost:8080/gateway-health responds${NC}"
        return 0
      else
        echo -e "${RED}❌ ${svc}: http://localhost:8080/gateway-health failed${NC}"
        return 1
      fi
      ;;
    "auth-service")
      # Try endpoints in order: /api, /health, /
      if curl -fsS --max-time 5 http://localhost:6001/api >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ${svc}: http://localhost:6001/api responds${NC}"
        return 0
      elif curl -fsS --max-time 5 http://localhost:6001/health >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ${svc}: http://localhost:6001/health responds${NC}"
        return 0
      elif curl -fsS --max-time 5 http://localhost:6001/ >/dev/null 2>&1; then
        echo -e "${GREEN}✅ ${svc}: http://localhost:6001/ responds${NC}"
        return 0
      else
        echo -e "${RED}❌ ${svc}: All health endpoints failed (tried /api, /health, /)${NC}"
        return 1
      fi
      ;;
    *)
      # No endpoint check defined for this service
      return 0
      ;;
  esac
}

# Helper: print service logs on failure
print_service_logs() {
  local svc="$1"
  echo ""
  echo -e "${YELLOW}📋 Last 120 lines of ${svc} logs:${NC}"
  echo "---"
  docker compose -p "$PROJECT" "${FILES[@]}" logs --tail=120 "$svc" 2>/dev/null || true
  echo "---"
}

# Main verification loop
for svc in "${CRITICAL_SERVICES[@]}"; do
  echo "Checking ${svc}..."
  
  # a) Ensure container exists
  local cid
  cid=$(get_container_id "$svc")
  if [ -z "$cid" ]; then
    echo -e "${RED}❌ ${svc}: Container not found${NC}"
    ((error_count++))
    print_service_logs "$svc"
    continue
  fi
  
  # b) Ensure container status is "running"
  if ! check_container_running "$svc"; then
    ((error_count++))
    print_service_logs "$svc"
    continue
  fi
  
  # c) If healthcheck exists, require "healthy"
  if ! check_container_health "$svc"; then
    ((error_count++))
    print_service_logs "$svc"
    continue
  fi
  
  # HTTP checks (local on EC2)
  if ! check_health_endpoint "$svc"; then
    ((error_count++))
    print_service_logs "$svc"
    continue
  fi
  
  echo ""
done

# Final verdict
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $error_count -eq 0 ]; then
  echo -e "${GREEN}✅ All critical services are healthy!${NC}"
  exit 0
else
  echo -e "${RED}❌ Post-deployment verification FAILED${NC}"
  echo -e "${RED}   ${error_count} critical service(s) failed checks${NC}"
  exit 1
fi
