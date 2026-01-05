# Repository Map

## Top-Level Directory Structure

### `/apps` - Application Services
Contains 13 applications (10 backend services, 3 frontend UIs):

**Backend Services:**
- `api-gateway` - Express.js API gateway/router (port 8080)
- `auth-service` - Authentication & authorization service (port 6001)
- `product-service` - Product catalog management (port 6002)
- `order-service` - Order processing & payments (port 6003)
- `seller-service` - Seller/shop management (port 6004)
- `admin-service` - Admin operations (port 6005)
- `chatting-service` - WebSocket chat service (port 6006)
- `kafka-service` - Kafka consumer/producer utilities (port 6007)
- `logger-service` - Log aggregation via WebSocket (port 6008)
- `recommendation-service` - ML-based product recommendations (port 6007)

**Frontend Applications:**
- `user-ui` - Next.js customer-facing UI (port 3000)
- `seller-ui` - Next.js seller dashboard (port 3001)
- `admin-ui` - Next.js admin dashboard (port 3002)

**E2E Tests:**
- `auth-service-e2e` - End-to-end tests for auth-service

### `/packages` - Shared Libraries
Monorepo workspace packages (pnpm):

**Components (`packages/components`):**
- React component library: `color-selector`, `custom-properties`, `custom-specifications`, `input`, `rich-text-editor`, `size-selector`

**Libraries (`packages/libs`):**
- `prisma` - Prisma client wrapper
- `redis` - Redis client wrapper (`ioredis`)
- `imagekit` - ImageKit SDK wrapper

**Middleware (`packages/middleware`):**
- `isAuthenticated` - JWT authentication middleware
- `authorizeRoles` - Role-based authorization middleware

**Utilities (`packages/utils`):**
- `kafka` - Kafka client utilities (`kafkajs`)
- `logs` - Logging utilities

**Error Handling (`packages/error-handler`):**
- Centralized error middleware for Express services

### `/prisma` - Database Schema
- `schema.prisma` - MongoDB schema definition (Prisma ORM)
- Models: users, sellers, shops, products, orders, images, analytics, chat, notifications

### `/scripts` - Operations Scripts
- `build-and-push-*.sh` - Docker image build & push scripts
- `deploy-production.sh` - Production deployment script
- `local-production.sh` - Local Docker production environment
- `pull-and-deploy.sh` - Pull & deploy workflow
- `setup-dockerhub.sh` - Docker Hub configuration
- `ec2-user-data.sh` - EC2 instance initialization
- `help.sh` - Helper utilities

### `/docs` - Documentation
- `payments/stripe-audit.md` - Stripe integration audit

### `/ops-backups` - Configuration Backups
- `nginx.conf` backups with timestamps
- `images.lock` - Docker image version lock file

### Root Configuration Files
- `package.json` - Root workspace package.json (pnpm)
- `pnpm-workspace.yaml` - pnpm workspace configuration
- `nx.json` - Nx monorepo configuration
- `tsconfig.base.json` - Base TypeScript configuration
- `jest.config.ts` - Jest test configuration
- `docker-compose.*.yml` - Docker Compose configurations:
  - `docker-compose.dev.yml` - Development (Kafka only)
  - `docker-compose.production.yml` - Full production stack
  - `docker-compose.override.yml` - Local overrides
  - `docker-compose.nginx-override.yml` - Nginx-specific overrides
  - `docker-compose.pinned.yml` - Pinned versions
- `nginx.conf` - Nginx reverse proxy configuration

## Infrastructure Components

### Docker Services (from `docker-compose.production.yml`)
- `nginx` - Reverse proxy/load balancer (ports 80, 443)
- `zookeeper` - Kafka coordination (port 2181)
- `kafka` - Message broker (port 9092)
- `kafka-setup` - One-time Kafka topic initialization

### External Dependencies (from package.json analysis)
- **Database:** MongoDB (via Prisma)
- **Cache:** Redis (`ioredis`)
- **Message Queue:** Kafka (`kafkajs`)
- **Payment:** Stripe SDK
- **Image Storage:** ImageKit SDK
- **Email:** Nodemailer
- **ML:** TensorFlow.js (recommendation-service)

## Technology Stack Summary

### Backend Services
- **Runtime:** Node.js
- **Language:** TypeScript
- **Framework:** Express.js
- **ORM:** Prisma (MongoDB)
- **Build Tool:** Nx + Webpack
- **Testing:** Jest (unit), Jest E2E (auth-service-e2e)

### Frontend Applications
- **Framework:** Next.js 15.x
- **Language:** TypeScript
- **UI:** React 19, Tailwind CSS
- **State Management:** Zustand, Jotai
- **Data Fetching:** TanStack Query (React Query)
- **Forms:** React Hook Form
- **Charts:** ApexCharts, Recharts

### DevOps
- **Containerization:** Docker
- **Orchestration:** Docker Compose
- **Reverse Proxy:** Nginx
- **CI/CD:** GitHub Actions (referenced in nx.json)
- **Package Manager:** pnpm 9.12.3

