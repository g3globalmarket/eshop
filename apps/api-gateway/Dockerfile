FROM node:20-alpine AS builder
WORKDIR /repo

# Корень монорепы + pkg сервиса + (если есть) prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY prisma ./prisma

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# 1) Устанавливаем зависимости монорепы (dev тоже — нужен prisma CLI)
RUN pnpm install --frozen-lockfile

# 2) Копируем весь репозиторий и билдим сервис
COPY . .
WORKDIR /repo/apps/api-gateway
RUN pnpm build

# 3) Готовим самодостаточную папку (без pnpm-симлинков)
WORKDIR /repo
RUN pnpm deploy --filter "./apps/api-gateway" /out

# 4) Генерим Prisma-клиент ВНУТРИ /out (где свои node_modules)
WORKDIR /out
# используем prisma из корня, указываем явный путь к схеме
RUN pnpm exec prisma generate --schema=/repo/prisma/schema.prisma

# ---- Runtime ----
FROM node:20-alpine AS runner

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app
ENV NODE_ENV=production
EXPOSE 8080

# 5) Копируем готовый артефакт (Prisma Client уже сгенерирован в builder stage)
COPY --from=builder --chown=nodejs:nodejs /out/ ./
COPY --chown=nodejs:nodejs prisma ./prisma
# Prisma Client is already generated in builder stage (line 26), no need to regenerate at runtime

# Switch to non-root user
USER nodejs

# 6) Старт
CMD ["node","dist/main.js"]
