#!/usr/bin/env bash
set -euo pipefail

# Setup script for Docker Hub deployment
echo "🐳 Docker Hub Setup for Admin UI"
echo "================================"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Get Docker Hub username
if [[ -z "${DOCKERHUB_USERNAME:-}" ]]; then
    echo "📝 Please enter your Docker Hub username:"
    read -r DOCKERHUB_USERNAME
    export DOCKERHUB_USERNAME
fi

# Get tag (optional)
if [[ -z "${TAG:-}" ]]; then
    echo "📝 Enter tag (default: latest):"
    read -r TAG
    export TAG=${TAG:-latest}
fi

echo ""
echo "🔧 Configuration:"
echo "   Username: $DOCKERHUB_USERNAME"
echo "   Tag: $TAG"
echo ""

# Confirm before proceeding
echo "🚀 Ready to build and push admin-ui to Docker Hub?"
echo "   Image will be: $DOCKERHUB_USERNAME/admin-ui:$TAG"
echo ""
read -p "Continue? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🏗️  Building and pushing admin-ui..."
    ./scripts/build-and-push-admin-ui.sh
else
    echo "❌ Cancelled."
    exit 1
fi

