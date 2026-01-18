#!/bin/bash
set -euo pipefail

# Production Smoke Test - Build and Run Representative Services
# Tests: 1 backend service (auth-service) + 1 UI service (user-ui)
# Verifies: Images build, containers start, processes stay up

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

# Cleanup function
cleanup() {
  echo ""
  echo "🧹 Cleaning up test containers..."
  docker stop test-auth test-ui 2>/dev/null || true
  docker rm test-auth test-ui 2>/dev/null || true
}

# Register cleanup on exit
trap cleanup EXIT

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
# Test Backend Service
# ============================================================================
echo ""
echo -e "${BLUE}🚀 Starting ${BACKEND_SERVICE} container...${NC}"

# Start container with minimal env (safe placeholders)
docker run -d \
  --name test-auth \
  -e NODE_ENV=production \
  -e DATABASE_URL="mongodb://localhost:27017/test" \
  -e JWT_SECRET="test-secret-for-smoke-test-only" \
  -e KAFKA_BROKERS="localhost:9092" \
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
  echo -e "${YELLOW}⚠️  curl not found (healthcheck may fail)${NC}"
fi

# Test health endpoint if available
if docker exec test-auth curl -f http://localhost:${BACKEND_PORT}/ > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Health endpoint responds${NC}"
else
  echo -e "${YELLOW}⚠️  Health endpoint not responding (may be expected)${NC}"
fi

# ============================================================================
# Test UI Service
# ============================================================================
echo ""
echo -e "${BLUE}🚀 Starting ${UI_SERVICE} container...${NC}"

# Start container with minimal env
docker run -d \
  --name test-ui \
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

# Verify process is running
if docker exec test-ui ps aux | grep -q "node.*server.js"; then
  echo -e "${GREEN}✅ Node process is running${NC}"
else
  echo -e "${RED}❌ Node process not found${NC}"
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

