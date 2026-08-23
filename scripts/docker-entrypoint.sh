#!/usr/bin/env sh
set -eu

case "${PMS_RUN_DATABASE_MIGRATIONS:-false}" in
  true)
    echo "Applying database migrations..." >&2
    node /app/node_modules/prisma/build/index.js migrate deploy
    ;;
  false)
    ;;
  *)
    echo "PMS_RUN_DATABASE_MIGRATIONS must be true or false" >&2
    exit 64
    ;;
esac

exec "$@"
