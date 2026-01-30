# 1. Install dependencies for seller-ui only
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY .npmrc ./

# Copy seller-ui package.json
COPY apps/seller-ui/package.json ./apps/seller-ui/

# Copy shared packages
COPY packages ./packages

# Copy prisma folder (needed for postinstall prisma generate)
COPY prisma ./prisma

# Install dependencies
RUN pnpm install --filter seller-ui... --frozen-lockfile

# 2. Build the app
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

#copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/seller-ui/node_modules ./apps/seller-ui/node_modules
COPY --from=deps /app/packages ./packages

# Copy only essential workspace configuration files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY nx.json ./
COPY tsconfig.base.json ./

# Copy Prisma schema for client generation
COPY prisma ./prisma

# Copy seller-ui source code
COPY apps/seller-ui ./apps/seller-ui

# Build environment variables
ENV NODE_ENV=production
ENV NX_DAEMON=false
ENV NX_SKIP_NX_CACHE=true
ENV NEXT_TELEMETRY_DISABLED=1

# ADD NEXT.JS ENVIRONMENT VARIABLES (BEFORE BUILD)
ARG NEXT_PUBLIC_SERVER_URI=https://sellers.nomadnet.shop
ENV NEXT_PUBLIC_SERVER_URI=${NEXT_PUBLIC_SERVER_URI}
ENV NEXT_PUBLIC_CHATTING_WEBSOCKET_URI=wss://nomadnet.shop/ws-chatting
ENV NEXT_PUBLIC_USER_UI_LINK=https://nomadnet.shop

# Generate Prisma client before building
RUN pnpm exec prisma generate --schema=prisma/schema.prisma

# Use Next.js build directly instead of Nx
WORKDIR /app/apps/seller-ui
RUN pnpm run build

# 3. Production image
FROM node:20-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

#Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy the standalone output
COPY --from=builder --chown=nextjs:nodejs /app/apps/seller-ui/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/seller-ui/.next/static ./apps/seller-ui/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/seller-ui/public ./apps/seller-ui/public

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3001

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/seller-ui/server.js"]
