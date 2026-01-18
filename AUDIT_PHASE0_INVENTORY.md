# PHASE 0 — INVENTORY / DEPLOY SURFACE MAP

**Date:** 2025-01-27  
**Auditor:** Senior DevOps/SRE + Build Engineer  
**Goal:** Map all services, their configuration, and production deploy surface

---

## Service Inventory Table

| Service | Type | Dockerfile | Entrypoint/CMD | Port | Health Endpoint | Prisma? | Required Env | Healthcheck? | Non-Root? |
|---------|------|-----------|----------------|------|----------------|---------|--------------|--------------|-----------|
| api-gateway | API | `apps/api-gateway/Dockerfile` | CMD | 8080 | `/gateway-health` | ✅ Yes | DATABASE_URL | ✅ Yes (curl) | ✅ Yes |
| auth-service | API | `apps/auth-service/Dockerfile` | entrypoint.sh | 6001 | `/` | ✅ Yes | DATABASE_URL, JWT_SECRET | ✅ Yes (curl) | ✅ Yes |
| product-service | API | `apps/product-service/Dockerfile` | entrypoint.sh | 6002 | `/` | ✅ Yes | DATABASE_URL | ✅ Yes (node) | ✅ Yes |
| order-service | API | `apps/order-service/Dockerfile` | entrypoint.sh | 6003 | `/` | ✅ Yes | DATABASE_URL | ✅ Yes (node) | ✅ Yes |
| seller-service | API | `apps/seller-service/Dockerfile` | entrypoint.sh | 6004 | `/` | ✅ Yes | DATABASE_URL | ✅ Yes (node) | ✅ Yes |
| admin-service | API | `apps/admin-service/Dockerfile` | entrypoint.sh | 6005 | `/` | ✅ Yes | DATABASE_URL | ✅ Yes (node) | ✅ Yes |
| chatting-service | API | `apps/chatting-service/Dockerfile` | CMD | 6006 | `/` | ✅ Yes | None (optional) | ✅ Yes (node) | ✅ Yes |
| kafka-service | Worker | `apps/kafka-service/Dockerfile` | CMD | N/A | N/A | ❌ No | None (optional) | ❌ No | ✅ Yes |
| logger-service | API | `apps/logger-service/Dockerfile` | CMD | 6008 | `/` | ✅ Yes | None (optional) | ✅ Yes (node) | ✅ Yes |
| recommendation-service | API | `apps/recommendation-service/Dockerfile` | entrypoint.sh | 6007 | `/` | ✅ Yes | DATABASE_URL | ✅ Yes (node) | ✅ Yes |
| user-ui | UI | `apps/user-ui/Dockerfile` | ENTRYPOINT | 3000 | `/` | ❌ No | NEXT_PUBLIC_* | ✅ Yes (node) | ✅ Yes |
| seller-ui | UI | `apps/seller-ui/Dockerfile` | ENTRYPOINT | 3001 | `/` | ❌ No | NEXT_PUBLIC_* | ✅ Yes (node) | ✅ Yes |
| admin-ui | UI | `apps/admin-ui/Dockerfile` | ENTRYPOINT | 3002 | `/` | ❌ No | NEXT_PUBLIC_* | ✅ Yes (node) | ✅ Yes |

**Total Services:** 13 (10 backend APIs, 3 UI, 1 worker)

---

## Production Deploy Surface

### Docker Images
- **Build System:** `.github/workflows/docker-build.yml`
- **Image Tag Format:** `${DOCKER_USERNAME}/<service>:latest`
- **Deployment:** `docker-compose.production.yml`
- **Total Images:** 13

### Nginx Upstream Mapping

**File:** `nginx.conf`

| Upstream | Service | Port | Evidence |
|----------|---------|------|----------|
| `api_backend` | `api-gateway` | 8080 | Line 9: `server api-gateway:8080` |
| `user_frontend` | `user-ui` | 3000 | Line 10: `server user-ui:3000` |
| `seller_frontend` | `seller-ui` | 3001 | Line 11: `server seller-ui:3001` |
| `admin_frontend` | `admin-ui` | 3002 | Line 12: `server admin-ui:3002` |
| Direct route | `chatting-service` | 6006 | Line 68: `proxy_pass http://chatting-service:6006` |
| Direct route | `logger-service` | 6008 | Line 69: `proxy_pass http://logger-service:6008/api` |

**Verification:** ✅ All upstreams match docker-compose service names and ports

### Port Mapping

**External (Nginx):**
- HTTP: 80
- HTTPS: 443

**Internal (Services):**
- Backend APIs: 6001-6008
- UI: 3000-3002
- Gateway: 8080
- Kafka: 9092

### Entrypoint Scripts

**Services with entrypoint.sh:** 6
- auth-service
- product-service
- order-service
- seller-service
- admin-service
- recommendation-service

**Services with direct CMD:** 7
- api-gateway
- chatting-service
- kafka-service
- logger-service
- user-ui (ENTRYPOINT)
- seller-ui (ENTRYPOINT)
- admin-ui (ENTRYPOINT)

---

## Verification

✅ **All services mapped**  
✅ **Nginx upstreams match compose service names**  
✅ **Ports consistent across compose and Nginx**  
✅ **All services use non-root users**  
✅ **Healthchecks present for all HTTP services**

---

**Status:** ✅ COMPLETE - Inventory verified and matches production configuration

