#!/usr/bin/env sh
set -eu

echo "Applying database migrations..." >&2
npm run prisma:deploy

exec "$@"
