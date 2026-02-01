#!/usr/bin/env bash
set -euo pipefail

PROJECT="eshop"
FILES=(-f docker-compose.production.yml -f docker-compose.override.yml -f docker-compose.nginx-override.yml)

CRITICAL_SERVICES=("api-gateway" "auth-service")

GATEWAY_HEALTH_URL="http://localhost:8080/gateway-health"
AUTH_HEALTH_URLS=("http://localhost:6001/api" "http://localhost:6001/health" "http://localhost:6001/")

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "Post-deployment verification starting..."
echo "Project: ${PROJECT}"
echo

compose() {
  docker compose -p "$PROJECT" "${FILES[@]}" "$@"
}

get_container_id() {
  local svc="$1"
  compose ps -q "$svc" 2>/dev/null || true
}

get_container_status() {
  local cid="$1"
  docker inspect -f '{{.State.Status}}' "$cid" 2>/dev/null || true
}

get_container_health() {
  local cid="$1"
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$cid" 2>/dev/null || true
}

get_container_network() {
  local cid="$1"
  docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$cid" 2>/dev/null | head -n 1 || true
}

print_service_logs() {
  local svc="$1"
  echo -e "${YELLOW}Last 120 lines of ${svc} logs:${NC}"
  echo "---"
  compose logs --tail=120 "$svc" 2>/dev/null || true
  echo "---"
}

# Probe URL from host first; if port is internal-only, probe from docker network using service DNS.
http_probe() {
  local svc="$1"
  local url="$2"

  # 1) Try from host
  if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
    return 0
  fi

  # 2) Fallback: run curl container on same network, and replace localhost -> service name
  local cid net url_net
  cid="$(get_container_id "$svc")"
  [ -n "$cid" ] || return 1

  net="$(get_container_network "$cid")"
  [ -n "$net" ] || return 1

  url_net="${url/localhost/$svc}"

  docker run --rm --network "$net" curlimages/curl:8.6.0 \
    -fsS --max-time 5 "$url_net" >/dev/null 2>&1
}

check_container() {
  local svc="$1"
  local cid status health

  cid="$(get_container_id "$svc")"
  if [ -z "$cid" ]; then
    echo -e "${RED}[FAIL] ${svc}: container not found${NC}"
    print_service_logs "$svc"
    return 1
  fi

  status="$(get_container_status "$cid")"
  if [ "$status" != "running" ]; then
    echo -e "${RED}[FAIL] ${svc}: not running (status=${status})${NC}"
    print_service_logs "$svc"
    return 1
  fi
  echo -e "${GREEN}[OK] ${svc}: running${NC}"

  health="$(get_container_health "$cid")"
  if [ -n "$health" ] && [ "$health" != "healthy" ]; then
    echo -e "${RED}[FAIL] ${svc}: health=${health} (expected healthy)${NC}"
    print_service_logs "$svc"
    return 1
  fi
  if [ -n "$health" ]; then
    echo -e "${GREEN}[OK] ${svc}: healthy${NC}"
  fi

  return 0
}

check_gateway_http() {
  if http_probe "api-gateway" "$GATEWAY_HEALTH_URL"; then
    echo -e "${GREEN}[OK] api-gateway: HTTP health endpoint responds${NC}"
    return 0
  fi
  echo -e "${RED}[FAIL] api-gateway: HTTP health endpoint failed${NC}"
  return 1
}

check_auth_http() {
  local u
  for u in "${AUTH_HEALTH_URLS[@]}"; do
    if http_probe "auth-service" "$u"; then
      echo -e "${GREEN}[OK] auth-service: HTTP endpoint responds (${u})${NC}"
      return 0
    fi
  done
  echo -e "${RED}[FAIL] auth-service: all health endpoints failed${NC}"
  return 1
}

error_count=0

for svc in "${CRITICAL_SERVICES[@]}"; do
  echo "Checking ${svc}..."
  if ! check_container "$svc"; then
    ((error_count++))
  fi
  echo
done

echo "Checking HTTP endpoints..."
if ! check_gateway_http; then
  ((error_count++))
  print_service_logs "api-gateway"
fi

if ! check_auth_http; then
  ((error_count++))
  print_service_logs "auth-service"
fi

echo
if [ "$error_count" -gt 0 ]; then
  echo -e "${RED}[FAIL] Post-deployment verification failed (${error_count} errors)${NC}"
  exit 1
fi

echo -e "${GREEN}[OK] Post-deployment verification passed${NC}"
exit 0
