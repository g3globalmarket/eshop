# DEPLOYMENT CHECKLIST

This document provides step-by-step instructions for deploying the fixes to production.

## Prerequisites

- [ ] All items in `LOCAL_VERIFICATION_CHECKLIST.md` have been completed
- [ ] All changes have been committed to git
- [ ] Docker Hub credentials are configured
- [ ] SSH access to production server is available
- [ ] Production server has required directories: `/opt/letsencrypt`, `/opt/certbot-www`

## 1. Pre-Deployment Backup

### Backup current production state
```bash
# SSH into production server
ssh user@nomadnet.shop

# Backup current docker-compose files
sudo cp /opt/eshop/docker-compose.production.yml /opt/eshop/docker-compose.production.yml.bak.$(date +%Y%m%d-%H%M%S)
sudo cp /opt/eshop/docker-compose.override.yml /opt/eshop/docker-compose.override.yml.bak.$(date +%Y%m%d-%H%M%S)
sudo cp /opt/eshop/nginx.conf /opt/eshop/nginx.conf.bak.$(date +%Y%m%d-%H%M%S)

# Backup current images list
docker images > /tmp/docker-images-before-$(date +%Y%m%d-%H%M%S).txt

# Exit server
exit
```

## 2. Build and Push Docker Images

### Set Docker Hub username
```bash
# From local machine, in project root
export DOCKER_USERNAME="your-dockerhub-username"
```

### Build and push all services
```bash
# Build and push all backend services
./scripts/build-and-push.sh api-gateway
./scripts/build-and-push.sh auth-service
./scripts/build-and-push.sh order-service
./scripts/build-and-push.sh product-service
./scripts/build-and-push.sh seller-service
./scripts/build-and-push.sh admin-service
./scripts/build-and-push.sh chatting-service
./scripts/build-and-push.sh kafka-service
./scripts/build-and-push.sh logger-service
./scripts/build-and-push.sh recommendation-service

# Build and push all frontend services
./scripts/build-and-push.sh user-ui
./scripts/build-and-push.sh seller-ui
./scripts/build-and-push-admin-ui.sh

# Or use the all-in-one script:
./scripts/build-and-push-all.sh
```

### Verify images are pushed
```bash
# Check Docker Hub for new images
docker search $DOCKER_USERNAME/recommendation-service
docker search $DOCKER_USERNAME/order-service
# etc.
```

## 3. Deploy Configuration Files to Server

### Copy updated files to server
```bash
# From local machine, in project root
scp docker-compose.production.yml user@nomadnet.shop:/opt/eshop/
scp docker-compose.override.yml user@nomadnet.shop:/opt/eshop/
scp nginx.conf user@nomadnet.shop:/opt/eshop/
scp .env user@nomadnet.shop:/opt/eshop/  # If .env changed
```

## 4. Server Preparation

### SSH into server
```bash
ssh user@nomadnet.shop
cd /opt/eshop
```

### Verify required directories exist
```bash
# Check that persistent directories exist
ls -la /opt/letsencrypt
ls -la /opt/certbot-www

# If they don't exist, create them:
sudo mkdir -p /opt/letsencrypt
sudo mkdir -p /opt/certbot-www
sudo chown -R $USER:$USER /opt/letsencrypt /opt/certbot-www
```

### Verify nginx.conf syntax
```bash
# Test nginx config in a temporary container
docker run --rm -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t

# Expected output:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Set Docker Hub username
```bash
# On server
export DOCKER_USERNAME="your-dockerhub-username"
```

## 5. Pull New Images

### Pull all updated images
```bash
# Pull all service images
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml pull

# Expected: Should pull new versions of all services
```

## 6. Graceful Deployment

### Option A: Rolling restart (minimal downtime)

```bash
# Restart services one by one, starting with backend services
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps recommendation-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps order-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps product-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps seller-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps admin-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps auth-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps api-gateway
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps chatting-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps logger-service
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps kafka-service

# Restart frontend services
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps user-ui
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps seller-ui
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps admin-ui

# Finally, restart nginx (brief downtime)
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d --no-deps nginx
```

### Option B: Full restart (brief downtime, cleaner)

```bash
# Stop all services
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml down

# Start all services with new images
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d

# Wait for services to be healthy
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml ps
```

## 7. Post-Deployment Verification

### Check all containers are running
```bash
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml ps

# Expected: All services should be "Up" or "Up (healthy)"
```

### Check Kafka connectivity
```bash
# Check Kafka is accessible on port 9092
docker exec -it eshop-kafka-1 kafka-topics --bootstrap-server kafka:9092 --list

# Expected: Should list topics:
# - user-events
# - logs
# - chat.new_message
```

### Check recommendation-service logs
```bash
# Check for successful startup and correct route registration
docker logs eshop-recommendation-service-1 --tail 50

# Expected:
# - "Listening at http://localhost:6007/api"
# - NO errors about middleware or routes
```

### Test recommendation-service endpoint
```bash
# Test that route is registered (should return 401, not 404)
docker exec -it eshop-recommendation-service-1 wget -qO- http://localhost:6007/api/get-recommendation-products 2>&1

# Expected: 401 Unauthorized (route exists, but no auth token)
# NOT: 404 Not Found
```

### Check order-service logs
```bash
# Check for successful startup
docker logs eshop-order-service-1 --tail 50

# Expected:
# - "Listening at http://localhost:6003/api"
# - NO errors
```

### Check nginx logs
```bash
# Check nginx started successfully
docker logs eshop-nginx-1 --tail 50

# Expected:
# - NO errors about configuration
# - Should see nginx startup messages
```

### Test nginx configuration
```bash
# Test nginx config inside container
docker exec -it eshop-nginx-1 nginx -t

# Expected:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Test SSL certificates
```bash
# Test HTTPS connection
curl -I https://nomadnet.shop

# Expected:
# HTTP/2 200
# (or appropriate response, not SSL error)

# Test certificate details
echo | openssl s_client -connect nomadnet.shop:443 -servername nomadnet.shop 2>/dev/null | openssl x509 -noout -dates

# Expected: Valid certificate dates
```

### Test all hosts
```bash
# Test main site
curl -I https://nomadnet.shop
curl -I https://www.nomadnet.shop

# Test seller portal
curl -I https://sellers.nomadnet.shop

# Test admin portal
curl -I https://admin.nomadnet.shop

# Test sandbox
curl -I https://sandbox.nomadnet.shop

# Expected: All should return 200 or appropriate response (not 502/503)
```

### Test HTTP to HTTPS redirect
```bash
# Test redirect
curl -I http://nomadnet.shop

# Expected:
# HTTP/1.1 301 Moved Permanently
# Location: https://nomadnet.shop/
```

### Test ACME challenge location
```bash
# Test ACME challenge path (should return 404, but not 502)
curl -I http://nomadnet.shop/.well-known/acme-challenge/test

# Expected:
# HTTP/1.1 404 Not Found
# (NOT 502 Bad Gateway - means nginx is serving it correctly)
```

### Test gateway health endpoint
```bash
# Test API gateway health
curl https://nomadnet.shop/gateway-health

# Expected: JSON response with health status
```

### Test QPay webhook with debug enabled
```bash
# Set debug flag (if not already in .env)
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml exec order-service sh -c 'echo "INTERNAL_WEBHOOK_DEBUG=true" >> /app/.env'

# Restart order-service to pick up env var
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml restart order-service

# Check logs for debug output
docker logs eshop-order-service-1 -f

# Send a test webhook (use test-qpay-idempotency.sh or similar)
# Look for "### QPAY_HANDLER_HIT ###" in logs
```

## 8. Monitoring

### Monitor logs for errors
```bash
# Watch all service logs
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml logs -f

# Or watch specific services:
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml logs -f recommendation-service order-service nginx
```

### Check resource usage
```bash
# Check container resource usage
docker stats

# Expected: All containers should be within memory/CPU limits
```

### Check disk space
```bash
# Check available disk space
df -h

# Clean up old images if needed
docker image prune -a --filter "until=24h"
```

## 9. Rollback Plan (If Issues Occur)

### If issues are detected, rollback:

```bash
# Stop current deployment
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml down

# Restore backup files
sudo cp /opt/eshop/docker-compose.production.yml.bak.YYYYMMDD-HHMMSS /opt/eshop/docker-compose.production.yml
sudo cp /opt/eshop/docker-compose.override.yml.bak.YYYYMMDD-HHMMSS /opt/eshop/docker-compose.override.yml
sudo cp /opt/eshop/nginx.conf.bak.YYYYMMDD-HHMMSS /opt/eshop/nginx.conf

# Pull old images (if needed)
# Tag format: $DOCKER_USERNAME/service:previous-tag

# Start with old configuration
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml up -d

# Verify rollback successful
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml ps
curl -I https://nomadnet.shop
```

## 10. Post-Deployment Cleanup

### Clean up old images
```bash
# List all images
docker images

# Remove old/unused images (after verifying deployment is stable)
docker image prune -a

# Remove old backups (keep last 3-5)
ls -lt /opt/eshop/*.bak.* | tail -n +6 | awk '{print $9}' | xargs rm -f
```

### Update documentation
```bash
# Document deployment date and version
echo "Deployed on $(date): Fixed nginx volumes, Kafka config, recommendation-service middleware, QPay idempotency" >> /opt/eshop/DEPLOYMENT_HISTORY.md
```

## Summary Checklist

Deployment steps:

- [ ] Pre-deployment backup completed
- [ ] All Docker images built and pushed
- [ ] Configuration files copied to server
- [ ] Required directories exist (`/opt/letsencrypt`, `/opt/certbot-www`)
- [ ] Nginx config syntax validated
- [ ] New images pulled
- [ ] Services restarted (rolling or full)
- [ ] All containers running and healthy
- [ ] Kafka connectivity verified (kafka:9092)
- [ ] recommendation-service route registered correctly
- [ ] order-service QPay endpoints working
- [ ] Nginx serving all hosts correctly
- [ ] SSL certificates valid
- [ ] HTTP to HTTPS redirect working
- [ ] ACME challenge location accessible
- [ ] Gateway health endpoint responding
- [ ] No errors in logs
- [ ] Resource usage normal
- [ ] Monitoring in place
- [ ] Rollback plan tested (if needed)
- [ ] Old images cleaned up
- [ ] Deployment documented

## Troubleshooting

### Issue: recommendation-service returns 404 for /api/get-recommendation-products

**Cause**: Middleware import issue not fixed, route not registered

**Fix**:
```bash
# Check logs
docker logs eshop-recommendation-service-1

# Verify middleware import in source
grep "import.*isAuthenticated" apps/recommendation-service/src/routes/recommendation.route.ts

# Should be: import { isAuthenticated } from "@packages/middleware/isAuthenticated";
# NOT: import isAuthenticated from "@packages/middleware/isAuthenticated";

# Rebuild and redeploy
```

### Issue: Kafka connection errors (kafka:29092 not found)

**Cause**: Old Kafka configuration still in use

**Fix**:
```bash
# Check environment variables
docker-compose -f docker-compose.production.yml -f docker-compose.override.yml exec api-gateway env | grep KAFKA

# Should show: KAFKA_BROKERS=kafka:9092

# If wrong, update docker-compose.production.yml and restart
```

### Issue: Nginx fails to start (config error)

**Cause**: Syntax error in nginx.conf

**Fix**:
```bash
# Test config
docker run --rm -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf:ro nginx:alpine nginx -t

# Fix errors in nginx.conf
# Redeploy
```

### Issue: SSL certificate errors

**Cause**: Certificate paths incorrect or certificates missing

**Fix**:
```bash
# Check certificate files exist
ls -la /opt/letsencrypt/live/nomadnet.shop/

# Should contain:
# - fullchain.pem
# - privkey.pem

# If missing, run certbot to obtain certificates
# Then restart nginx
```

### Issue: QPay webhook not processing (SESSION_MISSING)

**Cause**: Expected behavior for expired sessions

**Verification**:
```bash
# Check logs with debug enabled
docker logs eshop-order-service-1 | grep "SESSION_MISSING"

# Response should include:
# - sessionId
# - invoiceId
# - reason: "SESSION_MISSING"

# This is correct behavior - session expired or already processed
```

## Support

For issues not covered here:
1. Check service logs: `docker logs <container-name>`
2. Check nginx error logs: `docker logs eshop-nginx-1`
3. Check Kafka logs: `docker logs eshop-kafka-1`
4. Review `LOCAL_VERIFICATION_CHECKLIST.md` for missed steps
5. Consult QPay documentation: `QPAY_*.md` files in project root

