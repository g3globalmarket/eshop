# ---- Build Stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and workspace configuration
# Root package.json must be copied first for pnpm workspace resolution
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY .npmrc ./
COPY apps/kafka-service/package.json ./apps/kafka-service/

# Copy required packages
COPY packages/utils/kafka ./packages/utils/kafka
COPY packages/libs/prisma ./packages/libs/prisma

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --prod --frozen-lockfile

COPY apps/kafka-service/dist ./dist

# ---- Production Stage ----
FROM node:20-alpine

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy files from builder stage with correct ownership
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages

# Switch to non-root user
USER nodejs

EXPOSE 6007

ENV DOCKER_ENV=true
ENV NODE_ENV=production

CMD ["node", "dist/main.js"]