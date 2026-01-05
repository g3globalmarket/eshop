# Runbook - How to Run, Build, and Test

## Prerequisites

- Node.js (version inferred from `@types/node: ~18.16.9`)
- pnpm 9.12.3+ (specified in `package.json`)
- Docker & Docker Compose
- MongoDB instance (connection string via `DATABASE_URL`)

## Development Commands

### Start Development Environment

**Start all services (Nx):**
```bash
cd /Users/user/Desktop/Final\ Project/eshop
pnpm dev
```
Runs: `npx nx run-many --target=serve --all --maxParallel=10`

**Start specific UI:**
```bash
pnpm user-ui      # Port 3000
pnpm seller-ui     # Port 3001
pnpm admin-ui      # Port 3002
```

**Start Kafka infrastructure (dev):**
```bash
pnpm kafka:dev:up
# Or production Kafka:
pnpm kafka:up
```

### Build Commands

**Build all services:**
```bash
pnpm build
```
Runs: `npx nx run-many --target=build --all --parallel=3`

**Build specific service:**
```bash
npx nx build <service-name>
# Example:
npx nx build auth-service
```

### Production Commands

**Start production (all services):**
```bash
pnpm start:prod
```
Runs backend services + UI services in parallel.

**Start UI services individually (production):**
```bash
pnpm user-ui:prod    # Port 3000
pnpm seller-ui:prod  # Port 3001
pnpm admin-ui:prod   # Port 3002
```

## Docker Commands

### Local Production Environment

**Build, test, and run all services:**
```bash
pnpm docker:prod
# Or directly:
bash scripts/local-production.sh
```

**Build only (no run):**
```bash
pnpm docker:build
# Or:
bash scripts/local-production.sh --build-only
```

**Run existing images only:**
```bash
pnpm docker:run
# Or:
bash scripts/local-production.sh --run-only
```

**Stop all containers:**
```bash
pnpm docker:stop
# Or:
bash scripts/local-production.sh --stop
```

**Clean containers and images:**
```bash
pnpm docker:clean
# Or:
bash scripts/local-production.sh --clean
```

**View logs:**
```bash
pnpm docker:logs <service-name>
# Or:
bash scripts/local-production.sh --logs <service-name>
```

### Docker Compose

**Start development Kafka:**
```bash
docker compose -f docker-compose.dev.yml up -d
```

**Start full production stack:**
```bash
docker compose -f docker-compose.production.yml up -d
```

**Stop services:**
```bash
docker compose -f docker-compose.production.yml down
```

## Testing

### Unit Tests

**Run all tests:**
```bash
npx nx run-many --target=test --all
```

**Run tests for specific service:**
```bash
npx nx test <service-name>
# Example:
npx nx test auth-service
```

### E2E Tests

**Run auth-service E2E tests:**
```bash
npx nx test auth-service-e2e
```

**Note:** E2E tests require:
- Global setup: `apps/auth-service-e2e/src/support/global-setup.ts`
- Global teardown: `apps/auth-service-e2e/src/support/global-teardown.ts`
- Test setup: `apps/auth-service-e2e/src/support/test-setup.ts`

## Service Ports Reference

### Backend Services
- `api-gateway`: 8080
- `auth-service`: 6001
- `product-service`: 6002
- `order-service`: 6003
- `seller-service`: 6004
- `admin-service`: 6005
- `chatting-service`: 6006
- `logger-service`: 6008
- `recommendation-service`: 6007

### Frontend Applications
- `user-ui`: 3000
- `seller-ui`: 3001
- `admin-ui`: 3002

### Infrastructure
- `nginx`: 80 (HTTP), 443 (HTTPS)
- `kafka`: 9092
- `zookeeper`: 2181

## Entry Points

### Backend Services
All backend services use `src/main.ts` as entry point:
- `apps/api-gateway/src/main.ts`
- `apps/auth-service/src/main.ts`
- `apps/product-service/src/main.ts`
- `apps/order-service/src/main.ts`
- `apps/seller-service/src/main.ts`
- `apps/admin-service/src/main.ts`
- `apps/chatting-service/src/main.ts`
- `apps/logger-service/src/main.ts`
- `apps/recommendation-service/src/main.ts`
- `apps/kafka-service/src/main.ts`

### Frontend Applications
Next.js apps use standard Next.js entry points:
- `apps/user-ui/` - `next.config.js` (implicit)
- `apps/seller-ui/` - `next.config.js` (implicit)
- `apps/admin-ui/` - `next.config.js` (implicit)

## Environment Setup

**Required:** `.env` file in root directory (referenced by `docker-compose.production.yml`)

See `CONFIG_SURFACE.md` for required environment variables.

## Build Artifacts

- Backend services: `dist/main.js` (Webpack output)
- Frontend apps: `.next/` directory (Next.js build output)
- Docker images: `<service-name>:latest` (tagged locally)

## Troubleshooting

**Port conflicts:**
- Check if ports are already in use: `lsof -i :<port>`
- Modify port in service's `src/main.ts` or `package.json`

**Docker network issues:**
- Ensure `eshop-network` exists: `docker network ls | grep eshop-network`
- Create if missing: `docker network create eshop-network`

**Kafka topics not created:**
- Check `kafka-setup` container logs: `docker logs kafka-setup`
- Topics should be: `user-events`, `logs`, `chat.new_message`

