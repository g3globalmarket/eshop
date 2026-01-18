# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and workspace configuration
# Root package.json must be copied first for pnpm workspace resolution
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc ./
COPY apps/admin-service/package.json ./apps/admin-service/

# Copy workspace packages that admin-service depends on
COPY packages/error-handler ./packages/error-handler
COPY packages/libs/prisma ./packages/libs/prisma

# Copy prisma schema
COPY prisma ./prisma

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma Client at build time (not runtime)
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Copy built application
COPY apps/admin-service/dist ./dist
COPY apps/admin-service/entrypoint.sh ./entrypoint.sh

# ---- Production Stage ----
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy files from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/entrypoint.sh ./entrypoint.sh

# Switch to non-root user
USER nodejs

# Expose the correct port
EXPOSE 6005

# Use entrypoint script (Prisma Client generated at build time)
ENTRYPOINT ["./entrypoint.sh"]