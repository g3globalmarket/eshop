# Production Smoke Tests - NomadNet Monorepo

**Date:** 2025-01-27  
**Purpose:** Verify Docker images build and run correctly before deployment

---

## Quick Start

### Run All Smoke Tests

```bash
bash scripts/smoke-run-images.sh
```

This will:
1. Build `auth-service` (backend) and `user-ui` (frontend) images
2. Start containers with minimal environment
3. Verify containers stay up and processes are running
4. Clean up automatically

**Expected Duration:** ~5-10 minutes (depending on build cache)

---

## Manual Testing (Step by Step)

### 1. Build Backend Service

```bash
DOCKER_BUILDKIT=1 docker buildx build \
  --progress=plain \
  --no-cache \
  --load \
  -f apps/auth-service/Dockerfile \
  -t test-auth-service:latest \
  .
```

**Expected Output:**
- Build completes without errors
- No "pnpm: not found" errors
- Image tagged as `test-auth-service:latest`

**Verification:**
```bash
docker images | grep test-auth-service
# Expected: test-auth-service:latest present
```

### 2. Run Backend Service

```bash
docker run --rm -d \
  --name test-auth \
  -e NODE_ENV=production \
  -e DATABASE_URL="mongodb://localhost:27017/test" \
  -e JWT_SECRET="test-secret-for-smoke-test-only" \
  -e KAFKA_BROKERS="localhost:9092" \
  -p 6001:6001 \
  test-auth-service:latest
```

**Check Container Status:**
```bash
docker ps | grep test-auth
# Expected: Container running, status "Up"
```

**Check Logs:**
```bash
docker logs test-auth
# Expected: "Auth service is running at http://localhost:6001/api"
# Expected: No "pnpm: not found" or "command not found" errors
```

**Verify Process:**
```bash
docker exec test-auth ps aux | grep node
# Expected: node process running dist/main.js
```

**Verify curl (for healthcheck):**
```bash
docker exec test-auth which curl
# Expected: /usr/bin/curl
```

**Test Health Endpoint:**
```bash
docker exec test-auth curl -f http://localhost:6001/
# Expected: {"message":"Hello API"} or similar
```

**Cleanup:**
```bash
docker stop test-auth
```

### 3. Build Frontend Service

```bash
DOCKER_BUILDKIT=1 docker buildx build \
  --progress=plain \
  --no-cache \
  --load \
  -f apps/user-ui/Dockerfile \
  -t test-user-ui:latest \
  .
```

**Expected Output:**
- Build completes without errors
- Next.js standalone output created
- Image tagged as `test-user-ui:latest`

**Verification:**
```bash
docker images | grep test-user-ui
# Expected: test-user-ui:latest present
```

### 4. Run Frontend Service

```bash
docker run --rm -d \
  --name test-ui \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_SERVER_URI="http://localhost:8080" \
  -e NEXT_PUBLIC_CHATTING_WEBSOCKET_URI="ws://localhost:6006" \
  -e NEXT_PUBLIC_SELLER_SERVER_URI="http://localhost:6004" \
  -p 3000:3000 \
  test-user-ui:latest
```

**Check Container Status:**
```bash
docker ps | grep test-ui
# Expected: Container running, status "Up"
```

**Check Logs:**
```bash
docker logs test-ui
# Expected: Next.js server starting
# Expected: No errors about missing files or binaries
```

**Verify Process:**
```bash
docker exec test-ui ps aux | grep node
# Expected: node process running apps/user-ui/server.js
```

**Test HTTP Response:**
```bash
curl -I http://localhost:3000
# Expected: HTTP 200 or 301/302 redirect
```

**Cleanup:**
```bash
docker stop test-ui
```

---

## Success Criteria

### Backend Service (auth-service)

✅ **Build succeeds** without errors  
✅ **Container starts** and stays running  
✅ **Process running** (`node dist/main.js`)  
✅ **No missing binaries** (no "command not found" errors)  
✅ **Logs show** "listening" or "running" message  
✅ **curl available** (for healthcheck)  
✅ **Health endpoint** responds (if available)

### Frontend Service (user-ui)

✅ **Build succeeds** without errors  
✅ **Container starts** and stays running  
✅ **Process running** (`node apps/user-ui/server.js`)  
✅ **No missing binaries** (no "command not found" errors)  
✅ **Logs show** Next.js server starting  
✅ **HTTP response** on port 3000

---

## Troubleshooting

### Build Fails with "pnpm: not found"

**Cause:** Builder stage missing pnpm setup  
**Fix:** Verify Dockerfile has `corepack enable && corepack prepare pnpm@9.12.3 --activate`

### Container Exits Immediately

**Check logs:**
```bash
docker logs <container-name>
```

**Common causes:**
- Missing required env vars (DATABASE_URL, JWT_SECRET)
- Prisma Client not generated (should be in builder stage)
- Wrong entrypoint path

### "curl: not found" in Healthcheck

**Cause:** Runtime image missing curl  
**Fix:** Add `RUN apk add --no-cache curl` to runtime stage

### Process Not Found

**Check:**
```bash
docker exec <container> ps aux
docker exec <container> ls -la /app/dist
```

**Common causes:**
- dist/ folder not copied correctly
- Wrong CMD/ENTRYPOINT path
- Entrypoint script failing

---

## CI Integration (Optional)

### GitHub Actions Job

Add to `.github/workflows/docker-build.yml`:

```yaml
smoke-test:
  needs: [build-backend, build-frontend]
  runs-on: ubuntu-latest
  if: always() && (needs.build-backend.result == 'success' || needs.build-frontend.result == 'success')
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Run smoke tests
      run: |
        chmod +x scripts/smoke-run-images.sh
        bash scripts/smoke-run-images.sh
```

**Note:** This adds ~5-10 minutes to CI. Consider running only on main branch or as a separate workflow.

---

## Test Other Services

To test a different service, modify the script or run manually:

**Backend:**
```bash
# Replace auth-service with your service
DOCKER_BUILDKIT=1 docker buildx build --load \
  -f apps/<service>/Dockerfile \
  -t test-<service>:latest \
  .

docker run --rm -d \
  --name test-<service> \
  -e NODE_ENV=production \
  -e DATABASE_URL="mongodb://localhost:27017/test" \
  -p <port>:<port> \
  test-<service>:latest
```

**Frontend:**
```bash
# Replace user-ui with your service
DOCKER_BUILDKIT=1 docker buildx build --load \
  -f apps/<service>/Dockerfile \
  -t test-<service>:latest \
  .

docker run --rm -d \
  --name test-<service> \
  -e NODE_ENV=production \
  -e NEXT_PUBLIC_SERVER_URI="http://localhost:8080" \
  -p <port>:<port> \
  test-<service>:latest
```

---

## Expected Test Duration

- **Backend build:** 2-5 minutes (first time, faster with cache)
- **Frontend build:** 3-8 minutes (Next.js build is slower)
- **Container startup:** 5-10 seconds per container
- **Total:** ~5-15 minutes depending on cache

---

## Notes

- Smoke tests use minimal environment variables (safe placeholders)
- Containers are automatically cleaned up on script exit
- Tests don't require actual database/Kafka connections
- For full integration testing, use docker-compose with all services

---

**Last Updated:** 2025-01-27

