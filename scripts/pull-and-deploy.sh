#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME=${DOCKER_USERNAME:-"your-dockerhub-username"}

echo -e "${BLUE}🚀 Docker Hub Pull and Deploy Script${NC}"
echo -e "${BLUE}====================================${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found. Please create it first.${NC}"
    exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

echo -e "${BLUE}📦 Pulling images from Docker Hub...${NC}"
echo -e "${BLUE}Docker Hub Username: ${DOCKER_USERNAME}${NC}"
echo ""

# Services to pull
SERVICES=(
    "api-gateway"
    "auth-service"
    "product-service"
    "order-service"
    "seller-service"
    "admin-service"
    "chatting-service"
    "kafka-service"
    "logger-service"
    "recommendation-service"
    "user-ui"
    "seller-ui"
    "admin-ui"
)

# Function to pull a service
pull_service() {
    local service=$1
    local image_name="${DOCKER_USERNAME}/${service}:latest"
    
    echo -e "${YELLOW}📥 Pulling ${service}...${NC}"
    
    if docker pull "$image_name"; then
        echo -e "${GREEN}✅ Pulled ${service} successfully${NC}"
    else
        echo -e "${RED}❌ Failed to pull ${service}${NC}"
        return 1
    fi
}

# Pull all services
failed_services=()
for service in "${SERVICES[@]}"; do
    if ! pull_service "$service"; then
        failed_services+=("$service")
    fi
done

# Check if any services failed to pull
if [ ${#failed_services[@]} -gt 0 ]; then
    echo -e "${RED}❌ Failed to pull services:${NC}"
    for service in "${failed_services[@]}"; do
        echo -e "  • ${service}"
    done
    echo ""
    echo -e "${YELLOW}Please check your Docker Hub username and image names.${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ All images pulled successfully!${NC}"
echo ""

# Stop existing containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose -f docker-compose.production.yml down

# Start services
echo -e "${YELLOW}🚀 Starting services...${NC}"
docker-compose -f docker-compose.production.yml up -d

# Wait for services to start
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 10

# Check service status
echo -e "${BLUE}📊 Service Status:${NC}"
docker-compose -f docker-compose.production.yml ps

echo ""
echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo ""
echo -e "${BLUE}🌐 Your application should be available at:${NC}"
echo -e "  • Main Site: https://nomadnet.shop"
echo -e "  • Seller Dashboard: https://sellers.nomadnet.shop"
echo -e "  • Admin Panel: https://admin.nomadnet.shop"
echo ""
echo -e "${BLUE}🔧 Useful commands:${NC}"
echo -e "  • View logs: docker-compose -f docker-compose.production.yml logs -f"
echo -e "  • Restart: docker-compose -f docker-compose.production.yml restart"
echo -e "  • Stop: docker-compose -f docker-compose.production.yml down"

