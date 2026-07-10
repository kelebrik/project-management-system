# ARG NODE_IMAGE=node:24-bookworm-slim
ARG NODE_IMAGE=docker.sberdevices.ru/skopeo/docker.io/node:24.16.0-bookworm-slim
ARG NPM_VERSION=11.18.0

FROM ${NODE_IMAGE} AS deps
ARG NPM_VERSION
ARG PRISMA_ENGINES_BASE_URL=https://git.sberdevices.ru/api/v4/projects/134759/packages/generic/debian_openssl/3.0.x
ARG PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
ARG CI_JOB_TOKEN
WORKDIR /app

RUN echo 'Acquire::https::Verify-Peer "false";' > /etc/apt/apt.conf.d/99disable-ssl-verify \
  && sed -i 's|http://deb.debian.org/debian-security|https://nexus.sberdevices.ru/repository/debian_bookworm_security|g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's|http://deb.debian.org/debian|https://nexus.sberdevices.ru/repository/debian_bookworm|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && for cert in SberDevices_RCA.crt SberDevices_ICA.crt mincifra_rootca.crt mincifra_subca.crt rootca_ssl_rsa2022.crt subca_ssl_rsa2024.crt; do \
       curl --fail --show-error --location --insecure "https://cdp.sberdevices.ru/pki/${cert}" -o "/usr/local/share/ca-certificates/${cert}"; \
     done \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY scripts/ci-install.sh scripts/ci-npm-env.sh scripts/ci-npm.sh scripts/docker-prisma-engines.sh scripts/

RUN chmod +x scripts/ci-install.sh scripts/ci-npm.sh scripts/docker-prisma-engines.sh \
  && PRISMA_ENGINES_BASE_URL=${PRISMA_ENGINES_BASE_URL} \
     PRISMA_CLI_BINARY_TARGETS=${PRISMA_CLI_BINARY_TARGETS} \
     PRISMA_ENGINES_JOB_TOKEN=${CI_JOB_TOKEN} \
     scripts/docker-prisma-engines.sh bootstrap

ENV PRISMA_CLI_BINARY_TARGETS=${PRISMA_CLI_BINARY_TARGETS}
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV PRISMA_SCHEMA_ENGINE_BINARY=/opt/prisma-engines/schema-engine-debian-openssl-3.0.x
ENV PRISMA_QUERY_ENGINE_LIBRARY=/opt/prisma-engines/libquery_engine-debian-openssl-3.0.x.so.node
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
ENV NPM_CONFIG_REGISTRY=https://nexus.sberdevices.ru/repository/npm
ENV NPM_CONFIG_STRICT_SSL=false

RUN npm install -g --ignore-scripts "npm@${NPM_VERSION}" \
  && npm --version

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN scripts/ci-install.sh
RUN scripts/docker-prisma-engines.sh link-node-modules

FROM deps AS build
COPY . .
RUN PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1 scripts/ci-npm.sh run prisma:generate
RUN scripts/ci-npm.sh run build
RUN scripts/ci-npm.sh prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
ARG NPM_VERSION
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/tmp
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV NPM_CONFIG_REGISTRY=https://nexus.sberdevices.ru/repository/npm
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
ENV PRISMA_SCHEMA_ENGINE_BINARY=/opt/prisma-engines/schema-engine-debian-openssl-3.0.x
ENV PRISMA_QUERY_ENGINE_LIBRARY=/opt/prisma-engines/libquery_engine-debian-openssl-3.0.x.so.node
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

RUN echo 'Acquire::https::Verify-Peer "false";' > /etc/apt/apt.conf.d/99disable-ssl-verify \
  && sed -i 's|http://deb.debian.org/debian-security|https://nexus.sberdevices.ru/repository/debian_bookworm_security|g' /etc/apt/sources.list.d/debian.sources \
  && sed -i 's|http://deb.debian.org/debian|https://nexus.sberdevices.ru/repository/debian_bookworm|g' /etc/apt/sources.list.d/debian.sources \
  && apt update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && for cert in SberDevices_RCA.crt SberDevices_ICA.crt mincifra_rootca.crt mincifra_subca.crt rootca_ssl_rsa2022.crt subca_ssl_rsa2024.crt; do \
       curl --fail --show-error --location --insecure "https://cdp.sberdevices.ru/pki/${cert}" -o "/usr/local/share/ca-certificates/${cert}"; \
     done \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /tmp/.npm \
  && chown -R node:node /app /tmp/.npm

RUN npm install -g --ignore-scripts "npm@${NPM_VERSION}" \
  && npm --version

COPY --from=deps --chown=node:node /opt/prisma-engines /opt/prisma-engines
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node scripts/docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

USER node

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start", "--workspace", "@pms/api"]
