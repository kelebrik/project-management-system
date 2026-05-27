#!/usr/bin/env sh
set -eu

VERSION="${PMS_CI_NPM_VERSION:-10.8.2}"
CACHE_DIR="${NPM_CONFIG_CACHE:-.npm}"
NPM_HOME="${PMS_CI_NPM_HOME:-$CACHE_DIR/npm-cli-$VERSION}"
NPM_CLI="$NPM_HOME/package/bin/npm-cli.js"

download() {
  url="$1"
  output="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$output"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -qO "$output" "$url"
    return
  fi

  node - "$url" "$output" <<'NODE'
const fs = require("node:fs");
const { get } = require("node:https");

const [url, output] = process.argv.slice(2);
const file = fs.createWriteStream(output);

get(url, (response) => {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    file.close();
    fs.rmSync(output, { force: true });
    console.error(`Failed to download ${url}: HTTP ${response.statusCode}`);
    process.exit(1);
  }

  response.pipe(file);
  file.on("finish", () => file.close());
}).on("error", (error) => {
  file.close();
  fs.rmSync(output, { force: true });
  console.error(error.message);
  process.exit(1);
});
NODE
}

if [ ! -f "$NPM_CLI" ]; then
  REGISTRY="${NPM_CONFIG_REGISTRY:-${npm_config_registry:-https://registry.npmjs.org}}"
  REGISTRY="${REGISTRY%/}"
  TARBALL_URL="${PMS_CI_NPM_TARBALL_URL:-$REGISTRY/npm/-/npm-$VERSION.tgz}"
  TARBALL="$CACHE_DIR/npm-$VERSION.tgz"

  mkdir -p "$CACHE_DIR" "$NPM_HOME"
  echo "Bootstrapping npm $VERSION from $TARBALL_URL" >&2
  download "$TARBALL_URL" "$TARBALL"
  tar -xzf "$TARBALL" -C "$NPM_HOME"
fi

exec node "$NPM_CLI" "$@"
