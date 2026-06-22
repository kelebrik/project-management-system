#!/usr/bin/env sh
set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/ci-prisma-env.sh"

scripts/docker-prisma-engines.sh "$@"
