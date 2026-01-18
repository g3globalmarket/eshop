#!/bin/bash
set -euo pipefail

# Production Smoke Test - Build and Run Representative Services
# Tests: 1 backend service (auth-service) + 1 UI service (user-ui)
# Verifies: Images build, containers start, processes stay up
#
# Dependencies:
# - Redis: Started in smoke-net for auth-service (uses REDIS_DATABASE_URI)
# - MongoDB: Not started (dummy URL used; service starts but DB ops fail gracefully)

echo "🧪 Starting production smoke tests..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_SERVICE="auth-service"
UI_SERVICE="user-ui"
BACKEND_PORT=6001
UI_PORT=3000
WAIT_TIME=10  # seconds to wait for container startup
NETWORK_NAME="smoke-net"
REDIS_CONTAINER="smoke-redis"

# Cleanup function - ALWAYS runs on exit (trap ensures this)
cleanup() {
  echo ""
  echo "🧹 Cleaning up test containers and network..."
  docker stop test-auth test-ui ${REDIS_CONTAINER} 2>/dev/null || true
  docker rm test-auth test-ui ${REDIS_CONTAINER} 2>/dev/null || true
  docker network rm ${NETWORK_NAME} 2>/dev/null || true
}

# Register cleanup on exit (including failures)
trap cleanup EXIT

# Create dedicated network for smoke tests
echo -e "${BLUE}🌐 Creating smoke test network...${NC}"
if docker network create ${NETWORK_NAME} > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Network ${NETWORK_NAME} created${NC}"
else
  # Network might already exist from previous run
  echo -e "${YELLOW}⚠️  Network ${NETWORK_NAME} already exists (reusing)${NC}"
  docker network rm ${NETWORK_NAME} 2>/dev/null || true
  docker network create ${NETWORK_NAME} > /dev/null 2>&1
fi

# ============================================================================
# Build Backend Service
# ============================================================================
echo -e "${BLUE}📦 Building ${BACKEND_SERVICE}...${NC}"
if DOCKER_BUILDKIT=1 docker buildx build \
  --progress=plain \
  --no-cache \
  --load \
  -f "apps/${BACKEND_SERVICE}/Dockerfile" \
  -t "test-${BACKEND_SERVICE}:latest" \
  . > /tmp/build-backend.log 2>&1; then
  echo -e "${GREEN}✅ ${BACKEND_SERVICE} built successfully${NC}"
else
  echo -e "${RED}❌ ${BACKEND_SERVICE} build failed${NC}"
  echo "Build log:"
  tail -50 /tmp/build-backend.log
  exit 1
fi

# ============================================================================
# Build UI Service
# ============================================================================
echo -e "${BLUE}📦 Building ${UI_SERVICE}...${NC}"
if DOCKER_BUILDKIT=1 docker buildx build \
  --progress=plain \
  --no-cache \
  --load \
  -f "apps/${UI_SERVICE}/Dockerfile" \
  -t "test-${UI_SERVICE}:latest" \
  . > /tmp/build-ui.log 2>&1; then
  echo -e "${GREEN}✅ ${UI_SERVICE} built successfully${NC}"
else
  echo -e "${RED}❌ ${UI_SERVICE} build failed${NC}"
  echo "Build log:"
  tail -50 /tmp/build-ui.log
  exit 1
fi

# ============================================================================
# Start Redis (required dependency for auth-service)
# ============================================================================
echo ""
echo -e "${BLUE}🔴 Starting Redis container...${NC}"
docker run -d \
  --name ${REDIS_CONTAINER} \
  --network ${NETWORK_NAME} \
  redis:7-alpine > /dev/null 2>&1

# Wait for Redis to be ready
echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
sleep 2

# Verify Redis is running
if docker ps | grep -q ${REDIS_CONTAINER}; then
  echo -e "${GREEN}✅ Redis container is running${NC}"
else
  echo -e "${RED}❌ Redis container failed to start${NC}"
  docker logs ${REDIS_CONTAINER} 2>&1 | tail -10
  exit 1
fi

# ============================================================================
# Test Backend Service
# ============================================================================
echo ""
echo -e "${BLUE}🚀 Starting ${BACKEND_SERVICE} container...${NC}"

# Start container with minimal env (safe placeholders)
# Pass Redis connection vars: REDIS_DATABASE_URI (primary) + host/port/URL variants for robustness
docker run -d \
  --name test-auth \
  --network ${NETWORK_NAME} \
  -e NODE_ENV=production \
  -e DATABASE_URL="mongodb://localhost:27017/test" \
  -e JWT_SECRET="test-secret-for-smoke-test-only" \
  -e KAFKA_BROKERS="localhost:9092" \
  -e REDIS_DATABASE_URI="redis://${REDIS_CONTAINER}:6379" \
  -e REDIS_HOST="${REDIS_CONTAINER}" \
  -e REDIS_PORT="6379" \
  -e REDIS_URL="redis://${REDIS_CONTAINER}:6379" \
  -p "${BACKEND_PORT}:${BACKEND_PORT}" \
  test-${BACKEND_SERVICE}:latest

# Wait for container to start
echo -e "${YELLOW}⏳ Waiting ${WAIT_TIME}s for container to start...${NC}"
sleep ${WAIT_TIME}

# Check if container is running
if ! docker ps | grep -q test-auth; then
  echo -e "${RED}❌ ${BACKEND_SERVICE} container failed to start${NC}"
  echo "Container logs:"
  docker logs test-auth
  exit 1
fi

echo -e "${GREEN}✅ ${BACKEND_SERVICE} container is running${NC}"

# Check logs for startup success
echo "Container logs (last 20 lines):"
docker logs test-auth --tail 20

# Check logs for fatal errors (strict patterns - only real startup failures)
# Ignore Redis connection errors (ECONNREFUSED) as they may be transient during startup
FATAL_ERRORS=$(docker logs test-auth 2>&1 | grep -iE "(fatal|uncaughtException|cannot find module|pnpm: not found|command not found)" | grep -v -iE "(redis|ECONNREFUSED)" || true)
if [ -n "$FATAL_ERRORS" ]; then
  echo -e "${RED}❌ Container logs show fatal errors${NC}"
  echo "$FATAL_ERRORS"
  exit 1
fi
# Note: Redis connection errors (ECONNREFUSED) are acceptable during startup - service will retry

# Verify process is running
if docker exec test-auth ps aux | grep -q "node dist/main.js"; then
  echo -e "${GREEN}✅ Node process is running${NC}"
else
  echo -e "${RED}❌ Node process not found${NC}"
  exit 1
fi

# Verify curl is available (for healthcheck)
if docker exec test-auth which curl > /dev/null 2>&1; then
  echo -e "${GREEN}✅ curl is available (for healthcheck)${NC}"
else
  echo -e "${YELLOW}⚠️  curl not found (using node-based healthcheck)${NC}"
fi

# Test health endpoint (prefer curl, fallback to node)
if docker exec test-auth curl -f http://localhost:${BACKEND_PORT}/ > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Health endpoint responds (200)${NC}"
elif docker exec test-auth node -e "require('http').get('http://localhost:${BACKEND_PORT}/', r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
  echo -e "${GREEN}✅ Health endpoint responds (200)${NC}"
else
  echo -e "${RED}❌ Health endpoint not responding${NC}"
  docker logs test-auth --tail 30
  exit 1
fi

# ============================================================================
# Test UI Service
# ============================================================================
echo ""
echo -e "${BLUE}🚀 Starting ${UI_SERVICE} container...${NC}"

# Start container with minimal env (UI doesn't need Redis/Kafka for smoke test)
docker run -d \
  --name test-ui \
  --network ${NETWORK_NAME} \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_SERVER_URI="http://localhost:8080" \
  -e NEXT_PUBLIC_CHATTING_WEBSOCKET_URI="ws://localhost:6006" \
  -e NEXT_PUBLIC_SELLER_SERVER_URI="http://localhost:6004" \
  -p "${UI_PORT}:${UI_PORT}" \
  test-${UI_SERVICE}:latest

# Wait for container to start
echo -e "${YELLOW}⏳ Waiting ${WAIT_TIME}s for container to start...${NC}"
sleep ${WAIT_TIME}

# Check if container is running
if ! docker ps | grep -q test-ui; then
  echo -e "${RED}❌ ${UI_SERVICE} container failed to start${NC}"
  echo "Container logs:"
  docker logs test-ui
  exit 1
fi

echo -e "${GREEN}✅ ${UI_SERVICE} container is running${NC}"

# Check logs for startup success
echo "Container logs (last 20 lines):"
docker logs test-ui --tail 20

# Check logs for fatal errors (strict patterns)
if docker logs test-ui 2>&1 | grep -iE "(fatal|uncaughtException|cannot find module|pnpm: not found|command not found)" > /dev/null; then
  echo -e "${RED}❌ Container logs show fatal errors${NC}"
  docker logs test-ui 2>&1 | grep -iE "(fatal|uncaughtException|cannot find module|pnpm: not found|command not found)"
  exit 1
fi

# Verify process is running
if docker exec test-ui ps aux | grep -q "node.*server.js"; then
  echo -e "${GREEN}✅ Node process is running${NC}"
else
  echo -e "${RED}❌ Node process not found${NC}"
  exit 1
fi

# Test HTTP endpoint (prefer curl, fallback to node)
if curl -f -s http://localhost:${UI_PORT}/ > /dev/null 2>&1; then
  echo -e "${GREEN}✅ HTTP endpoint responds (200/301/302)${NC}"
elif docker exec test-ui node -e "require('http').get('http://localhost:${UI_PORT}/', r=>process.exit(r.statusCode===200||r.statusCode===301||r.statusCode===302?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
  echo -e "${GREEN}✅ HTTP endpoint responds (200/301/302)${NC}"
else
  echo -e "${RED}❌ HTTP endpoint not responding${NC}"
  docker logs test-ui --tail 30
  exit 1
fi

# ============================================================================
# Final Summary
# ============================================================================
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ All smoke tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Test Summary:"
echo "  ✅ ${BACKEND_SERVICE} - Built and running"
echo "  ✅ ${UI_SERVICE} - Built and running"
echo ""
echo "Containers will be cleaned up automatically on exit."
echo "To keep containers running, cancel with Ctrl+C before they finish."

