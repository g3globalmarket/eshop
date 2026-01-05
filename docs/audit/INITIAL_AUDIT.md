# Initial Repository Audit

**Date:** 2025-01-XX  
**Auditor:** Lead Engineer  
**Scope:** Fact-based engineering map, configuration surface, and risk assessment  
**Methodology:** Static code analysis, configuration file review, dependency analysis

## Executive Summary

This is an e-commerce monorepo built with **Nx + pnpm workspace**, containing:
- **10 backend microservices** (Express.js + TypeScript)
- **3 frontend applications** (Next.js 15 + React 19)
- **MongoDB** database (Prisma ORM)
- **Kafka** message broker
- **Redis** caching
- **Stripe** payment processing
- **ImageKit** image storage
- **Docker** containerization with **Nginx** reverse proxy

**Architecture:** Microservices with API Gateway pattern, event-driven via Kafka, containerized deployment.

## Key Findings

### 1. Hardcoded Stripe Public Key in Docker Compose ⚠️ SECURITY

**Severity:** Medium  
**Category:** Security  
**File:** `docker-compose.production.yml:278`

**Evidence:**
```yaml
NEXT_PUBLIC_STRIPE_PUBLIC_KEY=pk_test_51S7uagGhD1XOLKKfTbEiykIpKeS4HhDYTzRRpYYag6NMcTEPtj6BdTikMJNOznWXTG5OKQvPUEoWxutXhHJGLQ0h0004BL4FqZ
```

**Why it matters:**
- Public keys are less sensitive than secret keys, but should still be externalized
- Hardcoded values make environment-specific configuration difficult
- Violates 12-factor app principles

**Next diagnostic step:**
- Check if `.env` file exists and contains this variable
- Verify `.gitignore` excludes `.env` files
- Search repository for other hardcoded secrets

**Safest fix:**
- Move to `.env` file
- Reference via `env_file` in docker-compose (already configured)
- Add to `.env.example` template

---

### 2. Missing Environment Variable Template ⚠️ DX

**Severity:** Medium  
**Category:** Developer Experience  
**Files:** No `.env.example` found

**Evidence:**
- `docker-compose.production.yml` references `.env` file
- No `.env.example` template in repository
- `CONFIG_SURFACE.md` documents required variables, but no template exists

**Why it matters:**
- New developers don't know which variables are required
- Onboarding friction increases
- Risk of missing critical configuration

**Next diagnostic step:**
- Check if `.env.example` exists but is gitignored
- Review onboarding documentation
- Check if variables are documented elsewhere

**Safest fix:**
- Create `.env.example` with all variable names (no values)
- Add comments explaining each variable's purpose
- Reference in README.md

---

### 3. Inconsistent Stripe API Versions ⚠️ RELIABILITY

**Severity:** Medium  
**Category:** Reliability  
**Files:** 
- `apps/order-service/src/controllers/order.controller.ts` (API version `2025-02-24.acacia`)
- `apps/auth-service/src/controller/auth.controller.ts` (API version `2022-11-15`)

**Evidence:** From `docs/payments/stripe-audit.md:288-300`

**Why it matters:**
- Different API versions may have incompatible behavior
- Stripe API versioning affects webhook signatures and API responses
- Risk of subtle bugs when services interact

**Next diagnostic step:**
- Review Stripe SDK initialization in both services
- Check if version differences are intentional
- Verify webhook compatibility

**Safest fix:**
- Standardize on one Stripe API version across all services
- Document version choice and rationale
- Add version to shared configuration

---

### 4. Port Conflict Risk: recommendation-service and kafka-service ⚠️ RELIABILITY

**Severity:** Low-Medium  
**Category:** Reliability  
**Files:**
- `apps/recommendation-service/src/main.ts:17` (default port 6007)
- `scripts/local-production.sh:21` (kafka-service port 6007)

**Evidence:**
- `recommendation-service` defaults to port `6007`
- `local-production.sh` assigns `kafka-service` to port `6007`
- `docker-compose.production.yml` doesn't expose kafka-service port

**Why it matters:**
- Port conflicts prevent services from starting
- Inconsistent port assignments cause confusion
- Production may work (no port exposure), but local dev fails

**Next diagnostic step:**
- Verify actual port usage in production
- Check if kafka-service is meant to be internal-only
- Review port assignments in all services

**Safest fix:**
- Assign unique ports to all services
- Document port assignments in `RUNBOOK.md`
- Add port validation in startup scripts

---

### 5. Missing Test Coverage ⚠️ RELIABILITY

**Severity:** Medium  
**Category:** Reliability  
**Files:** Only `auth-service` has E2E tests (`apps/auth-service-e2e/`)

**Evidence:**
- `jest.config.ts` exists at root
- `auth-service` has unit tests (`jest.config.ts`)
- `auth-service-e2e` has E2E test setup
- No test directories found for other services

**Why it matters:**
- Low test coverage increases risk of regressions
- Critical services (order-service, payment flows) lack E2E tests
- No integration tests for service interactions

**Next diagnostic step:**
- Run `npx nx run-many --target=test --all` to see actual test coverage
- Check if tests exist but aren't discovered by Nx
- Review CI/CD pipeline for test execution

**Safest fix:**
- Add unit tests for critical paths (order-service, payment flows)
- Add integration tests for service-to-service communication
- Document test strategy and coverage goals

---

### 6. Large Request Body Limits ⚠️ PERFORMANCE

**Severity:** Low  
**Category:** Performance  
**Files:**
- `apps/api-gateway/src/main.ts:37` (50mb limit)
- `apps/product-service/src/main.ts:7` (50mb limit)
- `apps/seller-service/src/main.ts:19` (100mb limit)
- `apps/recommendation-service/src/main.ts:6` (100mb limit)

**Evidence:**
```typescript
app.use(express.json({ limit: "50mb" })); // api-gateway
app.use(express.json({ limit: "100mb" })); // seller-service, recommendation-service
```

**Why it matters:**
- Large limits increase memory usage and DoS attack surface
- Inconsistent limits across services cause confusion
- No rate limiting on large uploads

**Next diagnostic step:**
- Review actual use cases for large payloads
- Check if file uploads use multipart/form-data instead
- Measure actual payload sizes in production

**Safest fix:**
- Standardize on reasonable limit (e.g., 10mb for JSON, separate endpoint for file uploads)
- Add request size monitoring
- Document payload size expectations

---

### 7. Nginx Configuration Duplication ⚠️ DX

**Severity:** Low  
**Category:** Developer Experience  
**File:** `nginx.conf`

**Evidence:**
- Lines 91-95 and 106-110: Duplicate hardening rules
- Lines 176-179 and 190-194: Duplicate hardening rules
- Multiple `if` statements for same checks

**Why it matters:**
- Duplication increases maintenance burden
- Risk of inconsistent updates
- Harder to understand configuration

**Next diagnostic step:**
- Review nginx configuration for other duplications
- Check if duplication is intentional (per-server-block)
- Verify nginx syntax validation

**Safest fix:**
- Extract common rules to `map` or `include` directives
- Use nginx configuration linter
- Document nginx structure

---

### 8. Missing Health Checks for Some Services ⚠️ RELIABILITY

**Severity:** Medium  
**Category:** Reliability  
**File:** `docker-compose.production.yml`

**Evidence:**
- `api-gateway` has healthcheck: `/gateway-health`
- `auth-service` has healthcheck: `http://localhost:6001/`
- `product-service`, `order-service`, `seller-service`, `admin-service`, `chatting-service`, `logger-service`, `recommendation-service` have no healthchecks

**Why it matters:**
- Docker can't detect unhealthy containers
- No automatic restart on failure
- Load balancer may route to dead services

**Next diagnostic step:**
- Check if services expose health endpoints but healthchecks aren't configured
- Review service startup times
- Verify health endpoint availability

**Safest fix:**
- Add health endpoints to all services
- Configure healthchecks in docker-compose
- Set appropriate `start_period` and `interval` values

---

### 9. Kafka Topic Hardcoding ⚠️ RELIABILITY

**Severity:** Low  
**Category:** Reliability  
**File:** `docker-compose.dev.yml:60-62` and `docker-compose.production.yml:75-77`

**Evidence:**
```bash
kafka-topics --create --topic user-events --bootstrap-server kafka:29092 --replication-factor 1 --partitions 3
kafka-topics --create --topic logs --bootstrap-server kafka:29092 --replication-factor 1 --partitions 3
kafka-topics --create --topic chat.new_message --bootstrap-server kafka:29092 --replication-factor 1 --partitions 3
```

**Why it matters:**
- Hardcoded topics in docker-compose make environment-specific configuration difficult
- Replication factor of 1 is risky for production (no redundancy)
- Topic names scattered across codebase

**Next diagnostic step:**
- Search codebase for topic name references
- Review Kafka consumer/producer configurations
- Check if topics are created idempotently

**Safest fix:**
- Extract topic names to environment variables
- Document topic naming convention
- Consider replication factor > 1 for production

---

### 10. README.md is Placeholder ⚠️ DX

**Severity:** Low  
**Category:** Developer Experience  
**File:** `README.md`

**Evidence:**
```markdown
Hello world
```

**Why it matters:**
- No project overview or setup instructions
- New developers have no starting point
- Missing architecture documentation

**Next diagnostic step:**
- Check if documentation exists elsewhere
- Review onboarding process
- Check if README is intentionally minimal

**Safest fix:**
- Add project description
- Link to `docs/audit/RUNBOOK.md` for setup
- Add architecture diagram or link
- Include quick start guide

---

## Open Questions for Human Review

1. **Secrets Management:** Is there a secrets management system (e.g., AWS Secrets Manager, HashiCorp Vault) in use, or are secrets managed via `.env` files only?

2. **Database Migrations:** How are Prisma migrations managed in production? Is there a migration strategy documented?

3. **Monitoring & Observability:** What monitoring/observability tools are in use? (Prometheus, Grafana, APM, etc.)

4. **CI/CD Pipeline:** What does the GitHub Actions workflow (`nx.json` references `.github/workflows/ci.yml`) do? Is it configured?

5. **Production Deployment:** What is the actual production deployment process? (`scripts/deploy-production.sh` exists but process unclear)

6. **Error Tracking:** Is there an error tracking service (Sentry, Rollbar, etc.) integrated?

7. **Log Aggregation:** How are logs aggregated and stored? (`logger-service` exists but storage unclear)

8. **Backup Strategy:** What is the MongoDB backup strategy?

9. **Disaster Recovery:** What is the disaster recovery plan?

10. **Performance Testing:** Are there performance/load tests? What are the performance SLAs?

11. **Security Scanning:** Are there automated security scans (dependencies, containers, code)?

12. **Documentation:** Where is API documentation hosted? (Swagger endpoints exist but external docs unclear)

13. **Staging Environment:** Is there a staging environment? How does it differ from production?

14. **Feature Flags:** Are feature flags used? If so, what system?

15. **Rate Limiting:** Is rate limiting configured at the infrastructure level (beyond API Gateway)?

---

## Summary Statistics

- **Total Applications:** 13 (10 backend, 3 frontend)
- **Total Packages:** 7 shared packages
- **Docker Services:** 13 application services + 3 infrastructure (nginx, kafka, zookeeper)
- **Kafka Topics:** 3 (user-events, logs, chat.new_message)
- **Database Models:** 15+ (users, sellers, shops, products, orders, etc.)
- **Test Suites:** 2 (auth-service unit, auth-service-e2e)

---

## Next Steps (Recommended Priority)

1. **Immediate (Security):**
   - Move Stripe key from docker-compose to `.env`
   - Verify `.gitignore` excludes `.env` files
   - Audit for other hardcoded secrets

2. **Short-term (Reliability):**
   - Add health checks to all services
   - Standardize Stripe API versions
   - Fix port conflicts

3. **Medium-term (DX):**
   - Create `.env.example` template
   - Update README.md with project overview
   - Document deployment process

4. **Long-term (Reliability):**
   - Add test coverage for critical services
   - Standardize request body limits
   - Refactor nginx configuration

---

## Files Created

This audit created the following documentation files:
- `docs/audit/REPO_MAP.md` - Repository structure and technology stack
- `docs/audit/RUNBOOK.md` - How to run, build, and test
- `docs/audit/CONFIG_SURFACE.md` - Environment variables and configuration
- `docs/audit/INITIAL_AUDIT.md` - This file (summary + risks + questions)

