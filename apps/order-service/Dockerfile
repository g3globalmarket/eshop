# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and workspace configuration
# Root package.json must be copied first for pnpm workspace resolution
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc ./
COPY apps/order-service/package.json ./apps/order-service/

# Copy workspace packages that order-service depends on
COPY packages/libs/prisma ./packages/libs/prisma
COPY packages/middleware ./packages/middleware
COPY packages/error-handler ./packages/error-handler
COPY packages/utils/logs ./packages/utils/logs
COPY prisma ./prisma

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma Client at build time (not runtime)
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Copy built application
COPY apps/order-service/dist ./dist
COPY apps/order-service/entrypoint.sh ./entrypoint.sh

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
# Copy email templates from builder stage (if they exist in source, they're already in dist or need separate copy)
# Note: If templates are used at runtime, ensure they're included in the build or copied here
# COPY --from=builder --chown=nodejs:nodejs /app/apps/order-service/src/utils/email-templates ./apps/order-service/src/utils/email-templates

# Switch to non-root user
USER nodejs

# Expose the correct port
EXPOSE 6003

# Use entrypoint script (Prisma Client generated at build time)
ENTRYPOINT ["./entrypoint.sh"]