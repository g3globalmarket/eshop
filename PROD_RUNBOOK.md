# Production Deployment Runbook - NomadNet Monorepo

**Last Updated:** 2025-01-27  
**Purpose:** Step-by-step guide for safe production deployments

---

## Pre-Deploy Checks

### 1. Verify Environment Variables

**Required for all services:**
- `DATABASE_URL` - MongoDB connection string
- `NODE_ENV=production` - Set in compose
- `KAFKA_BROKERS=kafka:9092` - Set in compose

**Service-specific:**
- `auth-service`: `JWT_SECRET` (required)
- `order-service`: QPay vars (optional, service degrades gracefully)
- UI services: `NEXT_PUBLIC_*` vars (set in compose)

**Check:**
```bash
# Verify .env file exists and has required vars
cat .env | grep -E "DATABASE_URL|JWT_SECRET" | grep -v "^#"
```

### 2. Verify Docker Images Exist

**Check registry for latest images:**
```bash
export DOCKER_USERNAME="your-dockerhub-username"

# List services
SERVICES=(
  "api-gateway" "auth-service" "product-service" "order-service"
  "seller-service" "admin-service" "chatting-service" "kafka-service"
  "logger-service" "recommendation-service" "user-ui" "seller-ui" "admin-ui"
)

# Check each image
for service in "${SERVICES[@]}"; do
  echo "Checking ${DOCKER_USERNAME}/${service}:latest"
  docker manifest inspect "${DOCKER_USERNAME}/${service}:latest" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ ${service} exists"
  else
    echo "❌ ${service} NOT FOUND"
  fi
done
```

### 3. Validate Docker Compose Config

**Check compose file syntax:**
```bash
docker compose -f docker-compose.production.yml config > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Compose config is valid"
else
  echo "❌ Compose config has errors"
  exit 1
fi
```

### 4. Check Server Resources

**Verify disk space:**
```bash
df -h / | tail -1 | awk '{print "Disk usage: " $5}'
```

**Verify Docker is running:**
```bash
docker info > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Docker is running"
else
  echo "❌ Docker is not running"
  exit 1
fi
```

---

## Deploy Steps

### Option 1: Full Stack Deploy (All Services)

```bash
# 1. Pull latest images
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  pull

# 2. Deploy with health checks
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  up -d

# 3. Wait for services to be healthy
echo "Waiting for services to start..."
sleep 30

# 4. Verify deployment
docker compose -f docker-compose.production.yml ps
```

### Option 2: Selective Deploy (Changed Services Only)

**Use deploy script:**
```bash
export DOCKER_USERNAME="your-dockerhub-username"
export CHANGED_BACKEND='["auth-service","product-service"]'  # JSON array
export CHANGED_FRONTEND='["user-ui"]'  # JSON array

bash scripts/deploy-production.sh
```

**Manual selective deploy:**
```bash
# Deploy specific services
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  up -d --no-deps --force-recreate \
  api-gateway auth-service user-ui
```

### Option 3: Pull and Deploy (From Registry)

**Use pull-and-deploy script:**
```bash
export DOCKER_USERNAME="your-dockerhub-username"
bash scripts/pull-and-deploy.sh
```

---

## Post-Deploy Checks

### 1. Container Status

**Check all containers are running:**
```bash
docker compose -f docker-compose.production.yml ps

# Expected: All services show "Up" status
```

**Check container health:**
```bash
# Services with healthchecks
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "health|unhealthy"

# If any show "unhealthy", investigate:
docker logs <container-name> --tail 50
```

### 2. Health Endpoints

**Test API Gateway:**
```bash
curl -f https://nomadnet.shop/gateway-health
# Expected: {"message":"API Gateway is healthy!","timestamp":"...","environment":"production"}
```

**Test Auth Service:**
```bash
curl -f https://nomadnet.shop/api/auth/health  # If endpoint exists
# Or test root:
curl -f http://localhost:6001/  # From server
```

**Test UI Services:**
```bash
curl -I https://nomadnet.shop
# Expected: HTTP 200 or 301/302

curl -I https://sellers.nomadnet.shop
curl -I https://admin.nomadnet.shop
```

### 3. Service Logs

**Check critical services:**
```bash
# API Gateway
docker logs eshop-api-gateway-1 --tail 50

# Auth Service
docker logs eshop-auth-service-1 --tail 50

# Nginx
docker logs eshop-nginx-1 --tail 50
```

**Check for errors:**
```bash
docker compose -f docker-compose.production.yml logs | grep -i error | tail -20
```

### 4. Database Connectivity

**Verify services can connect to MongoDB:**
```bash
# Check service logs for connection errors
docker logs eshop-auth-service-1 | grep -i "database\|mongodb\|connection"
```

### 5. Kafka Connectivity

**Verify Kafka is healthy:**
```bash
docker logs eshop-kafka-1 --tail 20
docker logs eshop-kafka-service-1 --tail 20
```

---

## Rollback Steps

### Quick Rollback (Last Known Good Images)

**If you have previous image tags:**
```bash
# 1. Stop current services
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  down

# 2. Update compose to use previous tag (or edit image tags)
# Edit docker-compose.production.yml to use specific tag:
# image: ${DOCKER_USERNAME}/auth-service:v1.2.3

# 3. Pull and deploy previous version
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  pull

docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  up -d
```

### Selective Rollback (Single Service)

**Rollback one service:**
```bash
# 1. Stop specific service
docker compose -f docker-compose.production.yml stop auth-service

# 2. Pull previous version
docker pull ${DOCKER_USERNAME}/auth-service:v1.2.3

# 3. Tag as latest (or update compose)
docker tag ${DOCKER_USERNAME}/auth-service:v1.2.3 \
  ${DOCKER_USERNAME}/auth-service:latest

# 4. Restart service
docker compose -f docker-compose.production.yml up -d auth-service
```

### Emergency Rollback (Full Stack)

**If entire stack needs rollback:**
```bash
# 1. Stop all services
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  down

# 2. Restore from backup (if you have compose file backup)
cp docker-compose.production.yml.backup docker-compose.production.yml

# 3. Deploy previous version
docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  pull

docker compose -f docker-compose.production.yml \
  -f docker-compose.override.yml \
  -f docker-compose.nginx-override.yml \
  up -d
```

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker logs <container-name> --tail 100
```

**Common causes:**
- Missing environment variables (check `.env` file)
- Port conflicts (check `docker ps` for port usage)
- Image not found (verify image exists in registry)

### Container Exits Immediately

**Check exit code:**
```bash
docker inspect <container-name> | grep -A 5 "State"
```

**Common causes:**
- Missing required env vars (DATABASE_URL, JWT_SECRET)
- Prisma Client not generated (should be at build time)
- Entrypoint script failing

**Debug:**
```bash
# Run container interactively
docker run --rm -it \
  -e NODE_ENV=production \
  -e DATABASE_URL="mongodb://localhost:27017/test" \
  ${DOCKER_USERNAME}/auth-service:latest sh

# Inside container, check:
ls -la /app/dist
cat /app/entrypoint.sh
```

### Healthcheck Failing

**Check healthcheck command:**
```bash
docker exec <container-name> curl -f http://localhost:<port>/
```

**If curl not found:**
- Verify runtime image has curl installed
- Or change healthcheck to use node-based probe

### Database Connection Errors

**Check DATABASE_URL:**
```bash
echo $DATABASE_URL  # Should not be empty
```

**Test connection:**
```bash
# From server, test MongoDB connection
mongosh "$DATABASE_URL" --eval "db.adminCommand('ping')"
```

### Nginx Not Routing

**Check Nginx config:**
```bash
docker exec eshop-nginx-1 nginx -t
```

**Check Nginx logs:**
```bash
docker logs eshop-nginx-1 --tail 50
```

**Verify upstreams:**
```bash
# Check if services are reachable from Nginx
docker exec eshop-nginx-1 ping -c 1 api-gateway
docker exec eshop-nginx-1 ping -c 1 user-ui
```

---

## Monitoring Commands

### Service Status
```bash
# All services
docker compose -f docker-compose.production.yml ps

# Specific service
docker ps | grep <service-name>
```

### Resource Usage
```bash
# Container stats
docker stats --no-stream

# Disk usage
docker system df
```

### Logs
```bash
# All services
docker compose -f docker-compose.production.yml logs -f

# Specific service
docker logs <container-name> -f --tail 100
```

### Health Checks
```bash
# API Gateway
curl -f https://nomadnet.shop/gateway-health

# From server (internal)
curl -f http://localhost:6001/  # auth-service
curl -f http://localhost:8080/gateway-health  # api-gateway
```

---

## Maintenance

### Update Images
```bash
# Pull latest
docker compose -f docker-compose.production.yml pull

# Restart services
docker compose -f docker-compose.production.yml up -d
```

### Clean Up
```bash
# Remove unused images
docker image prune -a

# Remove unused volumes
docker volume prune

# Full cleanup (careful!)
docker system prune -a --volumes
```

### Backup
```bash
# Backup compose files
cp docker-compose.production.yml docker-compose.production.yml.backup
cp .env .env.backup

# Export running config
docker compose -f docker-compose.production.yml config > docker-compose.exported.yml
```

---

## Emergency Contacts

- **DevOps Lead:** [Contact Info]
- **On-Call Engineer:** [Contact Info]
- **Database Admin:** [Contact Info]

---

**Last Updated:** 2025-01-27

