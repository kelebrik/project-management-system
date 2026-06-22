#!/usr/bin/env sh

PMS_NPM_REGISTRY="${PMS_NPM_REGISTRY:-${NPM_CONFIG_REGISTRY:-${npm_config_registry:-https://nexus.sberdevices.ru/repository/npm}}}"
PMS_NPM_REGISTRY="${PMS_NPM_REGISTRY%/}"
export NPM_CONFIG_REGISTRY="$PMS_NPM_REGISTRY"
export npm_config_registry="$PMS_NPM_REGISTRY"
