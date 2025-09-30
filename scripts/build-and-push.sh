#!/usr/bin/env bash
set -euo pipefail
: "${DOCKERHUB_USERNAME:?Set DOCKERHUB_USERNAME}"
TAG="${TAG:-latest}"
SERVICES=(api-gateway auth-service product-service order-service seller-service admin-service chatting-service logger-service recommendation-service kafka-service user-ui seller-ui admin-ui)
docker login
docker buildx inspect --bootstrap >/dev/null 2>&1 || docker buildx create --use
for S in "${SERVICES[@]}"; do
  [[ -f "apps/$S/Dockerfile" ]] || { echo "skip $S (no Dockerfile)"; continue; }
  pnpm --filter "./apps/$S" run build || true
  docker buildx build --platform linux/amd64,linux/arm64 \
    -f "apps/$S/Dockerfile" \
    -t "$DOCKERHUB_USERNAME/$S:$TAG" \
    -t "$DOCKERHUB_USERNAME/$S:latest" \
    --push .
done
SH
chmod +x scripts/build-and-push-all.sh

DOCKERHUB_USERNAME=$DOCKERHUB_USERNAME TAG=$TAG ./scripts/build-and-push-all.sh
