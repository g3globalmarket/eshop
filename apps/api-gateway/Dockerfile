FROM node:20-alpine AS builder
WORKDIR /repo

# Корень монорепы + pkg сервиса + (если есть) prisma
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api-gateway/package.json apps/api-gateway/package.json
COPY prisma ./prisma

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# 1) Устанавливаем зависимости монорепы (dev тоже — нужен prisma CLI)
RUN pnpm install --no-frozen-lockfile

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
RUN node /repo/node_modules/.bin/prisma generate --schema=/repo/prisma/schema.prisma || \
    npx prisma@6.19.1 generate --schema=/repo/prisma/schema.prisma

# ---- Runtime ----
FROM node:20-alpine AS runner
RUN apk add --no-cache curl
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 8080

# 5) Копируем готовый артефакт
COPY --from=builder /out/ ./
COPY prisma ./prisma
RUN node ./node_modules/.bin/prisma generate --schema=/app/prisma/schema.prisma || npx prisma@6.19.1 generate --schema=/app/prisma/schema.prisma

# 6) Старт
CMD ["node","dist/main.js"]
