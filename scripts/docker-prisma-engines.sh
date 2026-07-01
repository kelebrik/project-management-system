#!/usr/bin/env sh
set -eu

TARGET="${PRISMA_CLI_BINARY_TARGETS:-debian-openssl-3.0.x}"
ENGINES_DIR="${PRISMA_ENGINES_DIR:-/opt/prisma-engines}"
BASE_URL="${PRISMA_ENGINES_BASE_URL:-}"
JOB_TOKEN="${PRISMA_ENGINES_JOB_TOKEN:-${CI_JOB_TOKEN:-}}"
LOCAL_DIR="${PRISMA_ENGINES_LOCAL_DIR:-docker/prisma-engines/${TARGET}}"
INSECURE_TLS="${PMS_CI_INSECURE_TLS:-0}"

SCHEMA_ENGINE="${ENGINES_DIR}/schema-engine-${TARGET}"
QUERY_ENGINE="${ENGINES_DIR}/libquery_engine-${TARGET}.so.node"

auth_mode() {
  if [ -z "$JOB_TOKEN" ]; then
    echo "none"
    return
  fi

  case "$JOB_TOKEN" in
    glpat-*|glptt-*)
      echo "PRIVATE-TOKEN"
      ;;
    *)
      echo "JOB-TOKEN"
      ;;
  esac
}

download() {
  download_url="$1"
  download_output="$2"
  mode="$(auth_mode)"

  echo "Requesting: ${download_url}" >&2
  if [ "$mode" = "none" ]; then
    echo "Auth: token is not set" >&2
  else
    echo "Auth: ${mode} is set (${#JOB_TOKEN} chars)" >&2
  fi

  if command -v curl >/dev/null 2>&1; then
    curl_tls_args=""
    if [ "$INSECURE_TLS" = "1" ] || [ "$INSECURE_TLS" = "true" ]; then
      curl_tls_args="-k"
    fi
    if [ "$mode" = "none" ]; then
      http_code="$(curl $curl_tls_args -sS -w '%{http_code}' "$download_url" -o "$download_output" || true)"
    else
      http_code="$(curl $curl_tls_args -sS -w '%{http_code}' --header "${mode}: ${JOB_TOKEN}" "$download_url" -o "$download_output" || true)"
    fi
    echo "Response: HTTP ${http_code} for ${download_url}" >&2
    if [ "$http_code" != "200" ]; then
      echo "Failed to download ${download_url}" >&2
      exit 22
    fi
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget_tls_args=""
    if [ "$INSECURE_TLS" = "1" ] || [ "$INSECURE_TLS" = "true" ]; then
      wget_tls_args="--no-check-certificate"
    fi
    if [ "$mode" = "none" ]; then
      wget $wget_tls_args -S -O "$download_output" "$download_url" 2>&2 || {
        echo "Failed to download ${download_url}" >&2
        exit 22
      }
    else
      wget $wget_tls_args -S -O "$download_output" --header="${mode}: ${JOB_TOKEN}" "$download_url" 2>&2 || {
        echo "Failed to download ${download_url}" >&2
        exit 22
      }
    fi
    return
  fi

  if command -v node >/dev/null 2>&1; then
    if ! PRISMA_ENGINES_JOB_TOKEN="$JOB_TOKEN" PRISMA_ENGINES_AUTH_MODE="$(auth_mode)" node - "$download_url" "$download_output" <<'NODE'
const fs = require("node:fs");
const https = require("node:https");

const [downloadUrl, outputPath] = process.argv.slice(2);
const token = process.env.PRISMA_ENGINES_JOB_TOKEN || process.env.CI_JOB_TOKEN || "";
const mode = process.env.PRISMA_ENGINES_AUTH_MODE || "JOB-TOKEN";
const headers = token && mode !== "none" ? { [mode]: token } : {};
const insecureTls = process.env.PMS_CI_INSECURE_TLS === "1" || process.env.PMS_CI_INSECURE_TLS === "true";
const agent = insecureTls ? new https.Agent({ rejectUnauthorized: false }) : undefined;

https.get(downloadUrl, { headers, agent }, (response) => {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    console.error(`Response: HTTP ${response.statusCode} for ${downloadUrl}`);
    process.exit(22);
  }

  const file = fs.createWriteStream(outputPath);
  response.pipe(file);
  file.on("finish", () => file.close());
  file.on("error", (error) => {
    console.error(error.message);
    process.exit(22);
  });
}).on("error", (error) => {
  console.error(error.message);
  process.exit(22);
});
NODE
    then
      echo "Failed to download ${download_url}" >&2
      exit 22
    fi
    echo "Response: HTTP 200 for ${download_url}" >&2
    return
  fi

  echo "curl, wget, or node is required to download Prisma engines" >&2
  exit 1
}

copy_engine() {
  source_path="$1"
  destination_path="$2"

  if [ ! -f "$source_path" ]; then
    return 1
  fi

  cp "$source_path" "$destination_path"
  return 0
}

install_from_archive() {
  archive_path="$1"
  destination_path="$2"

  if [ ! -f "$archive_path" ]; then
    return 1
  fi

  case "$archive_path" in
    *.gz)
      gunzip -c "$archive_path" >"$destination_path"
      ;;
    *)
      cp "$archive_path" "$destination_path"
      ;;
  esac

  return 0
}

install_from_local_dir() {
  dir="$1"

  if [ ! -d "$dir" ]; then
    return 1
  fi

  if install_from_archive "$dir/schema-engine.gz" "$SCHEMA_ENGINE" \
    || copy_engine "$dir/schema-engine" "$SCHEMA_ENGINE" \
    || copy_engine "$dir/schema-engine-${TARGET}" "$SCHEMA_ENGINE"; then
    :
  else
    return 1
  fi

  if install_from_archive "$dir/libquery_engine.so.node.gz" "$QUERY_ENGINE" \
    || copy_engine "$dir/libquery_engine.so.node" "$QUERY_ENGINE" \
    || copy_engine "$dir/libquery_engine-${TARGET}.so.node" "$QUERY_ENGINE"; then
    :
  else
    return 1
  fi

  return 0
}

install_from_base_url() {
  url="$1"
  url="${url%/}"

  download "$url/schema-engine.gz" "${SCHEMA_ENGINE}.gz"
  gunzip -c "${SCHEMA_ENGINE}.gz" >"$SCHEMA_ENGINE"
  rm -f "${SCHEMA_ENGINE}.gz"

  download "$url/libquery_engine.so.node.gz" "${QUERY_ENGINE}.gz"
  gunzip -c "${QUERY_ENGINE}.gz" >"$QUERY_ENGINE"
  rm -f "${QUERY_ENGINE}.gz"
}

ensure_engines_present() {
  if [ -s "$SCHEMA_ENGINE" ] && [ -s "$QUERY_ENGINE" ]; then
    return 0
  fi

  mkdir -p "$ENGINES_DIR"

  if install_from_local_dir "$LOCAL_DIR"; then
    echo "Using Prisma engines from ${LOCAL_DIR}" >&2
  elif [ -n "$BASE_URL" ]; then
    echo "Downloading Prisma engines from base URL: ${BASE_URL}" >&2
    echo "Target: ${TARGET}" >&2
    echo "Will request:" >&2
    echo "  ${BASE_URL%/}/schema-engine.gz" >&2
    echo "  ${BASE_URL%/}/libquery_engine.so.node.gz" >&2
    install_from_base_url "$BASE_URL"
  else
    echo "Prisma engines are unavailable in the isolated build environment." >&2
    echo "Provide one of:" >&2
    echo "  - PRISMA_ENGINES_BASE_URL (GitLab Generic Package path with schema-engine.gz and libquery_engine.so.node.gz)" >&2
    echo "  - docker/prisma-engines/${TARGET}/ in the build context" >&2
    echo "For private GitLab packages, pass CI_JOB_TOKEN (CI) or a GitLab personal access token (local Docker build)." >&2
    exit 1
  fi

  chmod +x "$SCHEMA_ENGINE"

  if [ ! -s "$SCHEMA_ENGINE" ] || [ ! -s "$QUERY_ENGINE" ]; then
    echo "Prisma engine files in ${ENGINES_DIR} are missing or empty" >&2
    exit 1
  fi

  echo "Prisma engines ready in ${ENGINES_DIR} for target ${TARGET}" >&2
}

link_into_node_modules() {
  node_modules_dir="${PRISMA_NODE_MODULES_DIR:-node_modules/@prisma/engines}"
  prisma_cli_dir="${PRISMA_CLI_PACKAGE_DIR:-node_modules/prisma}"

  mkdir -p "$node_modules_dir"
  cp "$SCHEMA_ENGINE" "${node_modules_dir}/schema-engine-${TARGET}"
  cp "$QUERY_ENGINE" "${node_modules_dir}/libquery_engine-${TARGET}.so.node"
  echo "Linked Prisma engines into ${node_modules_dir}" >&2

  if [ -d "$prisma_cli_dir" ]; then
    cp "$SCHEMA_ENGINE" "${prisma_cli_dir}/schema-engine-${TARGET}"
    cp "$QUERY_ENGINE" "${prisma_cli_dir}/libquery_engine-${TARGET}.so.node"
    echo "Linked Prisma engines into ${prisma_cli_dir}" >&2
  fi
}

case "${1:-bootstrap}" in
  bootstrap)
    ensure_engines_present
    ;;
  link-node-modules)
    ensure_engines_present
    link_into_node_modules
    ;;
  *)
    echo "Usage: $0 [bootstrap|link-node-modules]" >&2
    exit 1
    ;;
esac
