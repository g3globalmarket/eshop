#!/bin/sh
set -e
pnpm exec prisma generate
exec dumb-init node dist/main.js 