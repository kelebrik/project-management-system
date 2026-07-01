# Sber Kubernetes Deployment

Документ описывает, что нужно передать DevOps для запуска приложения в корпоративном Kubernetes с restricted policies.

## Что уже подготовлено в репозитории

- `Dockerfile` поддерживает подмену базового образа через `--build-arg NODE_IMAGE=...`.
- Runtime контейнер запускается от пользователя `node`, а не от `root`.
- `.gitlab-ci.yml` не использует Docker-in-Docker и не поднимает service containers.
- `deploy/k8s/project-management-system.yaml` использует `Deployment`, dedicated `ServiceAccount`, отключенный `automountServiceAccountToken`, `runAsNonRoot`, `allowPrivilegeEscalation: false`, `capabilities.drop: ALL`, `seccompProfile: RuntimeDefault`.

## Переменные GitLab CI

DevOps должен задать в настройках проекта или группы:

```text
PMS_CI_NODE_IMAGE=<approved-registry>/platform/node-pms-ci:24
PMS_CI_NPM_VERSION=10.8.2
NPM_CONFIG_REGISTRY=<approved-internal-npm-registry>
PMS_CI_NPM_TARBALL_URL=<approved-internal-npm-registry>/npm/-/npm-10.8.2.tgz
PMS_CI_BUILDER_IMAGE=<approved-registry>/platform/kaniko-or-buildkit-rootless:latest
PMS_CONTAINER_IMAGE=<approved-registry>/project-management-system/app:${CI_COMMIT_SHORT_SHA}
CORPORATE_IMAGE_BUILD_COMMAND=<approved build command>
```

В `.gitlab-ci.yml` нет fallback на публичный `node:*`. Pipeline содержит `workflow`-guard и не создает jobs, пока `PMS_CI_NODE_IMAGE` не задан в GitLab CI variables. Это сделано намеренно: Kubernetes executor скачивает job image до checkout репозитория и до запуска любых скриптов, поэтому отсутствие pullable image нельзя исправить shell-логикой внутри проекта.

Теги `node:24-bookworm-slim`, `node:22-bookworm-slim` и `node:22.18.0-bookworm-slim` нельзя использовать как стабильную настройку в Sber CI: в текущем Sber registry proxy они могут отсутствовать, а прямой доступ runner-а к Docker Hub нестабилен или закрыт. DevOps должен загрузить Node image во внутренний allowlisted registry и указать его через `PMS_CI_NODE_IMAGE`.

Не используйте путь вида `$CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX/node:24-bookworm-slim`, пока DevOps не подтвердит, что GitLab Dependency Proxy включен именно для этого проекта/группы и его registry разрешен cluster policy. В текущем Sber Git такой путь может возвращать HTML 404 вместо OCI manifest, и job упадет до запуска скриптов.

DevOps должен один раз собрать/загрузить CI-образ в разрешенный registry и переопределить `PMS_CI_NODE_IMAGE`. Образ должен уже содержать Node.js 24 LTS, npm, openssl, ca-certificates и curl. Pipeline намеренно не делает `apt-get`, потому что root package installation конфликтует с restricted cluster policy.

Установка npm-зависимостей в CI идет через `scripts/ci-install.sh`: скрипт запускает `npm ci --include=dev` через `scripts/ci-npm.sh`, без `--prefer-offline`, отключает audit/fund/progress и один раз повторяет установку после `npm cache clean --force`. `scripts/ci-npm.sh` закрепляет npm на `PMS_CI_NPM_VERSION=10.8.2`, потому что bundled `npm 10.9.8` в `node:22.22.3` падал на runner-е с внутренней ошибкой `Exit handler never called!`. Если tarball `npm-10.8.2.tgz` недоступен из runner-а, wrapper пишет предупреждение и падает обратно на bundled npm из образа. Для стабильного CI DevOps должен задать `PMS_CI_NPM_TARBALL_URL` или `NPM_CONFIG_REGISTRY` на внутренний npm mirror. Иначе следующий шаг `npm ci` тоже может упасть при попытке скачать зависимости с публичного `registry.npmjs.org`.

Пример bootstrap CI-образа:

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*
USER node
```

Его нужно опубликовать в существующий approved registry, например:

```text
PMS_CI_NODE_IMAGE=registry.sberdevices.ru/<approved-namespace>/node-pms-ci:24
```

Не нужно указывать несуществующий образ вида `registry.sberdevices.ru/<project>/ci/node:24-bookworm-slim`: Kubernetes упадет с `manifest unknown` до старта job.

В `.gitlab-ci.yml` используется `image:kubernetes:user: "1000:1000"`. Эта настройка требует GitLab 18.0+ и GitLab Runner 17.11+. Если в Sber Git версия ниже, non-root user нужно задать в `config.toml` GitLab Runner Kubernetes executor.

Пример команды сборки для Kaniko:

```bash
/kaniko/executor \
  --context "$CI_PROJECT_DIR" \
  --dockerfile "$CI_PROJECT_DIR/Dockerfile" \
  --build-arg NODE_IMAGE="$PMS_CI_NODE_IMAGE" \
  --destination "$PMS_CONTAINER_IMAGE"
```

Фактическая команда зависит от принятого в компании builder-а и registry.

## Kubernetes Secret

Перед применением манифеста нужен secret `project-management-system-secrets`:

```text
DATABASE_URL=postgresql://...
SESSION_SECRET=<long-random-secret>
WEB_ORIGIN=https://<app-host>
AUTH_COOKIE_SECURE=true
METRICS_TOKEN=<required-random-token>
JIRA_BASE_URL=<optional-jira-url>
JIRA_EMAIL=<optional-integration-user>
JIRA_API_TOKEN=<optional-token>
```

`DATABASE_URL` должен указывать на существующую PostgreSQL БД. Если переносится текущая production БД, сначала нужен `pg_dump --format=custom`, затем restore на новой БД и только после этого `prisma migrate deploy`.

## Почему появлялись warnings

`Unknown image registry detected`  
Использован образ не из разрешенного registry. Нужно заменить CI images, builder image, application image и GitLab Runner helper image на образы из allowlist.

`Running as root detected`  
Контейнер приложения теперь non-root. Если warning остается по `spec.initContainers[*]`, это почти наверняка GitLab Runner helper/init container. Это правится настройками runner-а, не кодом приложения.

`Privilege escalation detected`  
В app manifest выставлено `allowPrivilegeEscalation: false`. Для CI job/helper containers DevOps должен включить такой же securityContext в GitLab Runner Kubernetes executor.

`automountServiceAccountToken should be FALSE`  
В app manifest токен отключен. Для CI job pods это настраивается в GitLab Runner или namespace policy.

`Bare Pod detected`  
Приложение деплоится через `Deployment`. GitLab Runner Kubernetes executor сам создает job pods напрямую, поэтому policy может требовать исключение для runner namespace или другой approved executor.

## Минимальный deployment flow

1. Собрать image в разрешенный registry.
2. Заменить `image:` в `deploy/k8s/project-management-system.yaml` на этот image.
3. Создать secret `project-management-system-secrets`.
4. Выполнить migration Job и дождаться завершения. Для повторного релиза сначала удалите предыдущий completed Job:

```bash
kubectl delete job project-management-system-migrate --ignore-not-found
kubectl apply -f deploy/k8s/project-management-system-migrate-job.yaml
kubectl wait --for=condition=complete job/project-management-system-migrate --timeout=300s
```

5. Применить манифест приложения:

```bash
kubectl apply -f deploy/k8s/project-management-system.yaml
```

6. Проверить readiness:

```bash
kubectl rollout status deployment/project-management-system
kubectl port-forward svc/project-management-system 3000:80
curl http://localhost:3000/api/ready
```
