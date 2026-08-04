#!/usr/bin/env sh
set -eu

. "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/ci-npm-env.sh"

VERSION="${PMS_CI_NPM_VERSION:-11.18.0}"
CACHE_DIR="${NPM_CONFIG_CACHE:-.npm}"
NPM_HOME="${PMS_CI_NPM_HOME:-$CACHE_DIR/npm-cli-$VERSION}"
NPM_CLI="$NPM_HOME/package/bin/npm-cli.js"

download() {
  url="$1"
  output="$2"
  insecure_tls="${PMS_CI_INSECURE_TLS:-0}"

  if command -v curl >/dev/null 2>&1; then
    if [ "$insecure_tls" = "1" ] || [ "$insecure_tls" = "true" ]; then
      curl -k -fsSL "$url" -o "$output"
    else
      curl -fsSL "$url" -o "$output"
    fi
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    if [ "$insecure_tls" = "1" ] || [ "$insecure_tls" = "true" ]; then
      wget --no-check-certificate -qO "$output" "$url"
    else
      wget -qO "$output" "$url"
    fi
    return
  fi

  node - "$url" "$output" <<'NODE'
const fs = require("node:fs");
const https = require("node:https");

const [url, output] = process.argv.slice(2);
const file = fs.createWriteStream(output);
const insecureTls = process.env.PMS_CI_INSECURE_TLS === "1" || process.env.PMS_CI_INSECURE_TLS === "true";
const agent = insecureTls ? new https.Agent({ rejectUnauthorized: false }) : undefined;

https.get(url, { agent }, (response) => {
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

bundled_npm_has_fixed_sigstore() {
  node <<'NODE'
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function atLeast(version, minimum) {
  const actual = version.split(".").map(Number);
  const required = minimum.split(".").map(Number);

  for (let index = 0; index < required.length; index += 1) {
    if ((actual[index] ?? 0) > required[index]) return true;
    if ((actual[index] ?? 0) < required[index]) return false;
  }

  return true;
}

try {
  const root = execFileSync("npm", ["root", "-g"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  const packageJson = path.join(root, "npm", "node_modules", "sigstore", "package.json");
  const { version } = JSON.parse(fs.readFileSync(packageJson, "utf8"));

  if (atLeast(version, "4.1.1")) {
    process.exit(0);
  }

  console.error(`Bundled npm contains sigstore ${version}; required >=4.1.1.`);
  process.exit(1);
} catch (error) {
  console.error(`Could not verify bundled npm sigstore version: ${error.message}`);
  process.exit(1);
}
NODE
}

if [ ! -f "$NPM_CLI" ]; then
  REGISTRY="$PMS_NPM_REGISTRY"
  TARBALL_URL="${PMS_CI_NPM_TARBALL_URL:-$REGISTRY/npm/-/npm-$VERSION.tgz}"
  TARBALL="$CACHE_DIR/npm-$VERSION.tgz"

  mkdir -p "$CACHE_DIR" "$NPM_HOME"
  echo "Bootstrapping npm $VERSION from $TARBALL_URL" >&2
  if download "$TARBALL_URL" "$TARBALL" && tar -xzf "$TARBALL" -C "$NPM_HOME"; then
    :
  else
    rm -rf "$NPM_HOME" "$TARBALL"
    if command -v npm >/dev/null 2>&1 && bundled_npm_has_fixed_sigstore; then
      echo "Could not bootstrap npm $VERSION; falling back to bundled npm $(npm --version) with fixed sigstore." >&2
      echo "Set PMS_CI_NPM_TARBALL_URL or PMS_NPM_REGISTRY to an internal mirror for deterministic CI." >&2
      exec npm "$@"
    fi
    echo "Could not bootstrap npm $VERSION and bundled npm does not include sigstore >=4.1.1." >&2
    exit 1
  fi
fi

exec node "$NPM_CLI" "$@"
