FROM node:20-alpine AS builder
WORKDIR /repo

RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# cache-friendly: manifests first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# full source
COPY . .

# Prisma schema uses env("DATABASE_URL") — set a safe dummy for generate-time
ARG DATABASE_URL="mongodb://127.0.0.1:27017/prisma-generate"
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma Client (root schema) + fail fast
RUN pnpm exec prisma generate --schema=prisma/schema.prisma \
  && test -d node_modules/.prisma/client \
  || (echo "ERROR: Prisma Client not generated in builder stage" && exit 1)

# Build from repo root (Nx target)
RUN pnpm exec nx build api-gateway

# ---- Runtime ----
FROM node:20-alpine AS runner
RUN apk add --no-cache curl libc6-compat

RUN addgroup -g 1001 -S nodejs \
 && adduser -S nodejs -u 1001

WORKDIR /app
ENV NODE_ENV=production
EXPOSE 8080

# Copy dist + full node_modules (must include node_modules/.prisma/client)
COPY --from=builder /repo/apps/api-gateway/dist ./dist
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/prisma ./prisma

# Verify Prisma Client exists in final image
RUN test -d node_modules/.prisma/client \
 && node -e "require('@prisma/client'); console.log('✓ Prisma Client verified in runtime image')" \
 || (echo "ERROR: Prisma Client missing or invalid in final image" && exit 1)

USER nodejs
CMD ["node","dist/main.js"]
