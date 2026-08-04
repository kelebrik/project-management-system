#!/usr/bin/env sh
set -eu

echo "Applying database migrations..." >&2
node /app/node_modules/prisma/build/index.js migrate deploy

exec "$@"
