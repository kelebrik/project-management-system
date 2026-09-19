# Docker Deployment

Контейнер приложения содержит backend и собранный web frontend. PostgreSQL можно поднять отдельным контейнером через `docker-compose.yml` или подключить внешнюю БД через `DATABASE_URL`.

## Вариант 1. Приложение + PostgreSQL в compose

```bash
docker compose up -d --build
```

Приложение будет доступно на `http://localhost:3000`. Перед запуском API
entrypoint контейнера автоматически выполняет `prisma migrate deploy`.

## Вариант 2. Только контейнер приложения, БД снаружи

```bash
docker build -t project-management-system:latest .
docker run --rm \
  -e DATABASE_URL='postgresql://user:password@db-host:5432/project_management_system?schema=public' \
  project-management-system:latest \
  node /app/node_modules/prisma/build/index.js migrate deploy
docker run -d \
  --name project-management-system \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e WEB_ORIGIN='https://pms.company.ru' \
  -e AUTH_COOKIE_SECURE=true \
  -e METRICS_TOKEN='<random secret>' \
  -e DATABASE_URL='postgresql://user:password@db-host:5432/project_management_system?schema=public' \
  project-management-system:latest
```

Для HTTPS за reverse proxy рекомендуется выставить `AUTH_COOKIE_SECURE=true`.

При необходимости базовый Node.js image можно заменить через build argument:

```bash
docker build \
  --build-arg NODE_IMAGE=node:24-bookworm-slim \
  -t ghcr.io/<owner>/project-management-system:latest \
  .
```

Универсальные Kubernetes-манифесты лежат в `deploy/k8s`. Перед применением
замените `image: project-management-system:latest` на адрес образа в вашем
registry и создайте secret `project-management-system-secrets`.

## Kubernetes

Соберите и опубликуйте образ в доступном вашему кластеру registry, затем укажите
этот адрес в обоих файлах из `deploy/k8s`.

Создайте secret с обязательными настройками:

```bash
kubectl create secret generic project-management-system-secrets \
  --from-literal=DATABASE_URL='postgresql://user:password@host:5432/db?schema=public' \
  --from-literal=WEB_ORIGIN='https://pms.example.com' \
  --from-literal=AUTH_COOKIE_SECURE='true' \
  --from-literal=METRICS_TOKEN='<random-secret>'
```

Для первого запуска примените основной manifest. Контейнер выполнит
`prisma migrate deploy` через entrypoint перед стартом API:

```bash
kubectl apply -f deploy/k8s/project-management-system.yaml
kubectl rollout status deployment/project-management-system
```

Для обновлений можно заранее выполнить миграции отдельным Job, а затем обновить
Deployment. ServiceAccount из основного manifest к этому моменту уже должен
существовать:

```bash
kubectl delete job project-management-system-migrate --ignore-not-found
kubectl apply -f deploy/k8s/project-management-system-migrate-job.yaml
kubectl wait --for=condition=complete job/project-management-system-migrate --timeout=300s
kubectl apply -f deploy/k8s/project-management-system.yaml
```

Финальный runtime-образ не содержит глобальный npm. Миграции и API запускаются
напрямую через Node.js; npm используется только на стадиях установки и сборки.

## Переменные окружения

Обязательные:

```text
DATABASE_URL=postgresql://user:password@host:5432/db?schema=public
NODE_ENV=production
PORT=3000
WEB_ORIGIN=https://pms.company.ru
METRICS_TOKEN=<random secret>
```

Опциональные:

```text
AUTH_COOKIE_SECURE=true
AUTH_SESSION_DAYS=7
JIRA_BASE_URL=https://jira.company.ru
JIRA_EMAIL=integration-user@company.ru
JIRA_API_TOKEN=<api-token-or-service-password>
JIRA_MAX_RESULTS=100
WEBHOOK_TIMEOUT_MS=5000
WEBHOOK_MAX_ATTEMPTS=3
WEBHOOK_RETRY_BASE_MS=500
```

Jira-синхронизация выполняется backend-контейнером от сервисного аккаунта
из `JIRA_EMAIL` и `JIRA_API_TOKEN`. Для Jira Server backend также пробует
логин из части `JIRA_EMAIL` до `@`. Keycloak/OIDC-токен пользователя не
передается в Jira и не используется для REST API. Jira credentials не хранятся
и не редактируются через Admin Back Office.

## Проверка

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/ready
```

Ожидаемый ответ содержит `ok: true` и `database: "ok"`.

## Backup/restore в Docker Compose

Разовый backup:

```bash
docker compose --profile ops run --rm backup
```

Файлы складываются в локальный каталог `./backups` и дополнительно получают `.sha256`.
Для checksum используется `sha256sum`, а на macOS поддержан fallback на `shasum -a 256`.

Restore из backup-файла:

```bash
RESTORE_CONFIRM=yes \
RESTORE_FILE=/backups/pms-YYYYMMDDTHHMMSSZ.dump \
docker compose --profile ops run --rm restore
```

Для промышленного контура безопаснее запускать `scripts/restore-db.sh` из отдельного ops-контейнера или jump-host с установленным `pg_restore`, чтобы не смешивать восстановление с работающим приложением.

## Monitoring

- `/api/health` - liveness для балансировщика.
- `/api/ready` - readiness для Kubernetes/Compose healthcheck, проверяет доступность PostgreSQL.
- `/api/metrics` - Prometheus text exposition. В `NODE_ENV=production` требует `METRICS_TOKEN`; доступ только с `Authorization: Bearer <token>` или `?token=<token>`.
- API пишет структурированные JSON-логи в stdout/stderr. В контейнерной среде их должен забирать штатный log collector.
