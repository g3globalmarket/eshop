# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and workspace configuration
# Root package.json must be copied first for pnpm workspace resolution
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc ./
COPY apps/api-gateway/package.json ./apps/api-gateway/

# Copy workspace packages that api-gateway depends on
COPY packages/libs/env-loader ./packages/libs/env-loader
COPY prisma ./prisma

# Install pnpm and dependencies
# Note: We install all deps (not --prod) because we need to build the app
# prisma CLI is in root dependencies, so it's available
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --frozen-lockfile

# Generate Prisma Client at build time (before building the app)
# This ensures the generated client is available in node_modules
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Verify Prisma Client was generated
RUN ls -la node_modules/.prisma/client || (echo "ERROR: Prisma Client not generated" && exit 1)

# Copy source code and build the application
COPY . .
WORKDIR /app/apps/api-gateway
RUN pnpm build

# ---- Production Stage ----
FROM node:20-alpine AS runner

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app
ENV NODE_ENV=production
EXPOSE 8080

# Copy files from builder stage
# IMPORTANT: Copy node_modules BEFORE dist to ensure Prisma Client is available
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/api-gateway/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Verify Prisma Client exists in the final image
RUN ls -la node_modules/.prisma/client || (echo "ERROR: Prisma Client missing in final image" && exit 1)

# Switch to non-root user
USER nodejs

# Start the application
CMD ["node","dist/main.js"]
