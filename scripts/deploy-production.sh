#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures

echo "🚀 Starting production deployment..."

# Validate compose config before deploying
echo "🔍 Validating docker-compose configuration..."
if ! docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  config > /dev/null 2>&1; then
  echo "❌ docker-compose configuration has errors!"
  docker compose \
    -f docker-compose.production.yml \
    -f docker-compose.override.yml \
    -f docker-compose.nginx-override.yml \
    config
  exit 1
fi
echo "✅ Compose config is valid"

# --------------------------------------------------------------------
# 1) Pull latest images for changed services (если матрица не пуста)
# --------------------------------------------------------------------
if [ -n "$CHANGED_BACKEND" ] && [ "$CHANGED_BACKEND" != "[]" ]; then
  echo "Pulling backend service images..."
  for service in $(echo "$CHANGED_BACKEND" | jq -r '.[]'); do
    echo "Pulling ${DOCKER_USERNAME}/${service}:latest"
    docker pull "${DOCKER_USERNAME}/${service}:latest"
  done
fi

if [ -n "$CHANGED_FRONTEND" ] && [ "$CHANGED_FRONTEND" != "[]" ]; then
  echo "Pulling frontend service images..."
  for service in $(echo "$CHANGED_FRONTEND" | jq -r '.[]'); do
    echo "Pulling ${DOCKER_USERNAME}/${service}:latest"
    docker pull "${DOCKER_USERNAME}/${service}:latest"
  done
fi

# --------------------------------------------------------------------
# 2) Deploy (без pinned-файла). Если сервисы не перечислены — катим весь стек
# --------------------------------------------------------------------
echo "Deploying services..."

SERVICES=()

if [ -n "$CHANGED_BACKEND" ] && [ "$CHANGED_BACKEND" != "[]" ]; then
  while IFS= read -r svc; do
    SERVICES+=("$svc")
  done < <(echo "$CHANGED_BACKEND" | jq -r '.[]')
fi

if [ -n "$CHANGED_FRONTEND" ] && [ "$CHANGED_FRONTEND" != "[]" ]; then
  while IFS= read -r svc; do
    SERVICES+=("$svc")
  done < <(echo "$CHANGED_FRONTEND" | jq -r '.[]')
fi

if [ ${#SERVICES[@]} -eq 0 ]; then
  echo "No explicit changes detected — deploying entire stack with --pull always"
  docker compose \
    -f docker-compose.production.yml \
    -f docker-compose.override.yml \
    -f docker-compose.nginx-override.yml \
    up -d --pull always
else
  echo "Deploying only changed services: ${SERVICES[*]}"
  docker compose \
    -f docker-compose.production.yml \
    -f docker-compose.override.yml \
    -f docker-compose.nginx-override.yml \
    up -d --no-deps --force-recreate --pull always "${SERVICES[@]}"
fi

# --------------------------------------------------------------------
# 3) Wait for services to be healthy (динамические проверки)
# --------------------------------------------------------------------
echo "Waiting for services to be healthy..."

check_containers() {
  local nginx_status
  local gateway_status
  nginx_status=$(docker ps --filter "name=eshop-nginx-1" --format "{{.Status}}" | grep -c "Up" || echo "0")
  gateway_status=$(docker ps --filter "name=eshop-api-gateway-1" --format "{{.Status}}" | grep -c "Up" || echo "0")

  if [ "$nginx_status" = "1" ] && [ "$gateway_status" = "1" ]; then
    return 0
  else
    return 1
  fi
}

check_health_endpoint() {
  curl -f -k -s --max-time 5 https://nomadnet.shop/gateway-health > /dev/null 2>&1
  return $?
}

echo "⏳ Waiting for containers to start..."
CONTAINER_TIMEOUT=300  # 5 minutes
CONTAINER_ELAPSED=0

while ! check_containers && [ $CONTAINER_ELAPSED -lt $CONTAINER_TIMEOUT ]; do
  echo "   Containers starting... (${CONTAINER_ELAPSED}s elapsed)"
  sleep 10
  CONTAINER_ELAPSED=$((CONTAINER_ELAPSED + 10))
done

if ! check_containers; then
  echo "❌ Containers failed to start within ${CONTAINER_TIMEOUT} seconds!"
  echo "Container status:"
  docker ps | grep eshop || true
  exit 1
fi

echo "✅ Containers are running!"

echo "⏳ Waiting for health endpoint to respond..."
HEALTH_TIMEOUT=180  # 3 minutes
HEALTH_ELAPSED=0

while ! check_health_endpoint && [ $HEALTH_ELAPSED -lt $HEALTH_TIMEOUT ]; do
  echo "   Health check pending... (${HEALTH_ELAPSED}s elapsed)"
  sleep 15
  HEALTH_ELAPSED=$((HEALTH_ELAPSED + 15))
done

if ! check_health_endpoint; then
  echo "⚠️  Health endpoint not ready within ${HEALTH_TIMEOUT} seconds, but continuing with verification..."
else
  echo "✅ Health endpoint is responding!"
fi

# --------------------------------------------------------------------
# 4) Verification
# --------------------------------------------------------------------
echo "Verifying deployment..."

HTTPS_OK=false
if curl -f -k https://nomadnet.shop/gateway-health > /dev/null 2>&1; then
  echo "✅ HTTPS endpoint working!"
  HTTPS_OK=true
else
  echo "⚠️  HTTPS endpoint failed, trying alternatives..."
fi

if [ "$HTTPS_OK" = false ]; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://nomadnet.shop/ || echo "000")
  if [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "308" ]; then
    echo "✅ HTTP redirect working (to HTTPS)!"
    HTTPS_OK=true
  else
    echo "❌ HTTP status: $HTTP_STATUS (expected 301/308)"
  fi
fi

if [ "$HTTPS_OK" = false ]; then
  echo "Checking container health..."
  if docker ps | grep -q "eshop-nginx-1.*Up"; then
    echo "✅ Nginx container is running!"
    if docker ps | grep -q "eshop-api-gateway-1.*Up"; then
      echo "✅ API Gateway container is running!"
      echo "⚠️  Services are running but may need time to initialize"
      HTTPS_OK=true
    else
      echo "❌ API Gateway container not running!"
    fi
  else
    echo "❌ Nginx container not running!"
  fi
fi

# --------------------------------------------------------------------
# 5) Final verdict
# --------------------------------------------------------------------
if [ "$HTTPS_OK" = true ]; then
  echo
  echo "🎉 Deployment successful!"
  echo "🌐 Site: https://nomadnet.shop"
  echo "🔧 API Health: https://nomadnet.shop/gateway-health"
  echo "👥 Sellers: https://sellers.nomadnet.shop"
  echo "⚙️  Admin: https://admin.nomadnet.shop"
else
  echo
  echo "❌ Deployment verification failed!"
  echo "🔍 Debug commands:"
  echo "  docker ps | grep eshop"
  echo "  docker logs eshop-nginx-1 --tail 20"
  echo "  docker logs eshop-api-gateway-1 --tail 20"
  echo "  curl -v https://nomadnet.shop/gateway-health"
  exit 1
fi

# --------------------------------------------------------------------
# 6) Post-deploy verification (fail-fast on critical service failures)
# --------------------------------------------------------------------
echo ""
echo "🔍 Running post-deploy verification..."

# Use repo script if available, otherwise fall back to system script
if [ -f "./scripts/postdeploy-verify.sh" ]; then
  chmod +x ./scripts/postdeploy-verify.sh
  ./scripts/postdeploy-verify.sh nomadnet.shop
elif [ -f "/usr/local/bin/eshop-postdeploy-check.sh" ]; then
  bash /usr/local/bin/eshop-postdeploy-check.sh nomadnet.shop
else
  echo "⚠️  Post-deploy verification script not found (scripts/postdeploy-verify.sh or /usr/local/bin/eshop-postdeploy-check.sh)"
  echo "   Skipping detailed verification..."
fi
