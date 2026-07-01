#!/usr/bin/env sh

PMS_NPM_REGISTRY="${PMS_NPM_REGISTRY:-${NPM_CONFIG_REGISTRY:-${npm_config_registry:-https://nexus.sberdevices.ru/repository/npm}}}"
PMS_NPM_REGISTRY="${PMS_NPM_REGISTRY%/}"
export NPM_CONFIG_REGISTRY="$PMS_NPM_REGISTRY"
export npm_config_registry="$PMS_NPM_REGISTRY"

PMS_CI_INSECURE_TLS="${PMS_CI_INSECURE_TLS:-${CI:-0}}"
export PMS_CI_INSECURE_TLS
if [ "$PMS_CI_INSECURE_TLS" = "1" ] || [ "$PMS_CI_INSECURE_TLS" = "true" ]; then
  export NPM_CONFIG_STRICT_SSL=false
  export npm_config_strict_ssl=false
  export NODE_TLS_REJECT_UNAUTHORIZED=0
fi
