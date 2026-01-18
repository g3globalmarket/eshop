#!/bin/sh
set -e
# Prisma Client is generated at build time, not runtime
# This ensures pnpm is not required in the runtime image
exec dumb-init node dist/main.js 