#!/usr/bin/env sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 BASELINE_DIR POST_DIR" >&2
  exit 2
fi

BASELINE_DIR="$1"
POST_DIR="$2"
[ -d "$BASELINE_DIR" ] || { echo "Baseline directory does not exist: $BASELINE_DIR" >&2; exit 1; }
[ ! -e "$POST_DIR" ] || { echo "Post directory already exists: $POST_DIR" >&2; exit 1; }

"$SCRIPT_DIR/db-integrity-capture.sh" post "$POST_DIR"
node "$SCRIPT_DIR/db-integrity-compare.mjs" "$BASELINE_DIR" "$POST_DIR"

