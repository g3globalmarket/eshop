#!/usr/bin/env bash
set -euo pipefail

# Script to build and push admin-ui to Docker Hub
# Usage: DOCKERHUB_USERNAME=yourusername ./scripts/build-and-push-admin-ui.sh

: "${DOCKERHUB_USERNAME:?Set DOCKERHUB_USERNAME}"
TAG="${TAG:-latest}"
SERVICE="admin-ui"

echo "🚀 Building and pushing $SERVICE to Docker Hub..."
echo "📦 Docker Hub Username: $DOCKERHUB_USERNAME"
echo "🏷️  Tag: $TAG"

# Login to Docker Hub
echo "🔐 Logging into Docker Hub..."
docker login

# Ensure buildx is available
echo "🔧 Setting up Docker Buildx..."
docker buildx inspect --bootstrap >/dev/null 2>&1 || docker buildx create --use

# Check if Dockerfile exists
if [[ ! -f "apps/$SERVICE/Dockerfile" ]]; then
  echo "❌ Error: Dockerfile not found at apps/$SERVICE/Dockerfile"
  exit 1
fi

# Build the application first (optional, as Dockerfile handles this)
echo "📦 Building application..."
pnpm --filter "./apps/$SERVICE" run build || echo "⚠️  Build step skipped (handled in Dockerfile)"

# Build and push the Docker image
echo "🐳 Building Docker image for $SERVICE..."
docker buildx build --platform linux/amd64,linux/arm64 \
  -f "apps/$SERVICE/Dockerfile" \
  -t "$DOCKERHUB_USERNAME/$SERVICE:$TAG" \
  -t "$DOCKERHUB_USERNAME/$SERVICE:latest" \
  --push .

echo "✅ Successfully built and pushed $SERVICE to Docker Hub!"
echo "🔗 Image: $DOCKERHUB_USERNAME/$SERVICE:$TAG"
echo "🔗 Image: $DOCKERHUB_USERNAME/$SERVICE:latest"

