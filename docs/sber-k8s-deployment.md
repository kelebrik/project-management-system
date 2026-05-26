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
PMS_CI_BUILDER_IMAGE=<approved-registry>/platform/kaniko-or-buildkit-rootless:latest
PMS_CONTAINER_IMAGE=<approved-registry>/project-management-system/app:${CI_COMMIT_SHORT_SHA}
CORPORATE_IMAGE_BUILD_COMMAND=<approved build command>
```

По умолчанию `.gitlab-ci.yml` использует `PMS_CI_NODE_IMAGE=$CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX/node:24-bookworm-slim`. Это работает только если GitLab Dependency Proxy включен и его registry разрешен cluster policy.

Если dependency proxy выключен или registry не разрешен, DevOps должен один раз собрать/загрузить CI-образ в разрешенный registry и переопределить `PMS_CI_NODE_IMAGE`. Образ должен уже содержать Node.js 24, npm, openssl, ca-certificates и curl. Pipeline намеренно не делает `apt-get`, потому что root package installation конфликтует с restricted cluster policy.

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
METRICS_TOKEN=<optional-token>
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
4. Применить манифест:

```bash
kubectl apply -f deploy/k8s/project-management-system.yaml
```

5. Проверить readiness:

```bash
kubectl rollout status deployment/project-management-system
kubectl port-forward svc/project-management-system 3000:80
curl http://localhost:3000/api/ready
```
