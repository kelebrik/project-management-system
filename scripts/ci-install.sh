#!/usr/bin/env sh
set -eu

CACHE_DIR="${NPM_CONFIG_CACHE:-.npm}"
export NPM_CONFIG_CACHE="$CACHE_DIR"
export npm_config_cache="$CACHE_DIR"
export npm_config_audit=false
export npm_config_fund=false
export npm_config_progress=false
export npm_config_update_notifier=false

mkdir -p "$CACHE_DIR"

install_dependencies() {
  npm ci --include=dev --ignore-scripts --no-audit --no-fund
}

if install_dependencies; then
  exit 0
fi

echo "npm ci failed; cleaning npm cache and retrying once" >&2
npm cache clean --force >/dev/null 2>&1 || true
rm -rf "$CACHE_DIR/_cacache" "$CACHE_DIR/_logs" "$CACHE_DIR/_npx" || true

install_dependencies
