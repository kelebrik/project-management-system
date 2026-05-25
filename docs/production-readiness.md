# Production Readiness

Документ фиксирует минимальный промышленный контур: тестирование, контейнеризация, backup/restore, monitoring/logging, OpenAPI и документация.

## Тестирование

### Unit tests

Команда:

```bash
npm run test:unit
```

Покрытие сейчас сфокусировано на расчётном ядре:

- пересчёт уровней и нумерации Структуры;
- поддержка шести предшественников;
- пересчёт сроков по FS/SS/FF/SF;
- lead/lag;
- календарные исключения RU/CN;
- агрегация дат фаз и пакетов работ;
- критический путь и upstream-chain из полей предшественников.

### Integration / contract tests

Базовый набор запускается без поднятого окружения:

```bash
npm run test:integration
```

Он проверяет статические production-контракты:

- OpenAPI покрывает реальные Express routes;
- mutating endpoint задекларированы как защищенные;
- миграции не содержат опасных `DROP TABLE` / `TRUNCATE` / неразрешенных `DELETE FROM`;
- исторические Excel-миграции сохраняют явные приведения типов;
- Dockerfile/docker-compose содержат runtime, readiness, PostgreSQL, backup/restore;
- backup/restore/security/performance smoke scripts синтаксически валидны и содержат обязательные safety checks.

Команда против уже запущенного окружения:

```bash
INTEGRATION_BASE_URL=http://localhost:3000 npm run test:integration
```

Проверяются:

- `/api/health`;
- публичный read-only `/api/projects`;
- публикация `/api/openapi.json`;
- чтение project overview;
- запрет write-запросов без авторизации;
- контракты WBS/overview.

Если задать `INTEGRATION_PROJECT_ID`, дополнительно проверяется чтение Структуры конкретного проекта:

```bash
INTEGRATION_BASE_URL=http://localhost:3000 \
INTEGRATION_PROJECT_ID=<project-id> \
npm run test:integration
```

Если также задать `INTEGRATION_AUTH_COOKIE`, проверяется authenticated baseline endpoint:

```bash
INTEGRATION_BASE_URL=http://localhost:3000 \
INTEGRATION_PROJECT_ID=<project-id> \
INTEGRATION_AUTH_COOKIE='pms_session=...' \
npm run test:integration
```

Jira-контракт покрыт unit-тестом с мокированным Jira API. Live Jira-тесты намеренно не запускаются без корпоративных credentials.

Если `INTEGRATION_BASE_URL` не задан, live-запросы пропускаются, но статические contract/migration/ops проверки продолжают выполняться. Это сделано, чтобы локальный `npm test` не пытался сам менять production/staging БД, но всё равно ловил регрессии промышленного контура.

### E2E tests

Команда:

```bash
E2E_BASE_URL=http://localhost:3000 npm run test:e2e
```

Сценарии Playwright проверяют:

- открытие приложения без авторизации в режиме чтения;
- навигацию по Обзору, Структуре и Гантту;
- доступность страницы закрытых проектов.

Перед первым запуском в новой среде:

```bash
npx playwright install chromium
```

## Docker/docker-compose

Файлы:

- `Dockerfile` - один контейнер приложения: API + собранный Web UI;
- `docker-compose.yml` - приложение + PostgreSQL + ops-профили backup/restore;
- `.gitlab-ci.yml` - CI для GitLab/Sber Git.

Локальный запуск:

```bash
docker compose up -d --build
```

Проверка:

```bash
curl http://localhost:3000/api/ready
```

## Backup/restore

Backup:

```bash
DATABASE_URL='postgresql://user:password@host:5432/project_management_system?schema=public' npm run backup
```

Restore:

```bash
DATABASE_URL='postgresql://user:password@host:5432/project_management_system?schema=public' \
RESTORE_CONFIRM=yes \
npm run restore -- backups/pms-YYYYMMDDTHHMMSSZ.dump
```

Требования к окружению: `pg_dump`, `pg_restore`, `sha256sum` или `shasum`.

Рекомендуемый регламент:

- полный backup каждый день;
- хранение не менее 14 дней;
- еженедельная проверка restore на отдельной БД;
- хранение production backup вне сервера приложения.

Проверка восстановления на отдельной БД:

```bash
DATABASE_URL='postgresql://prod-user:password@prod-host:5432/project_management_system?schema=public' \
RESTORE_DRILL_DATABASE_URL='postgresql://drill-user:password@drill-host:5432/project_management_system_restore?schema=public' \
npm run restore:drill
```

Dry-run миграций перед выкладкой:

```bash
DATABASE_URL='postgresql://user:password@host:5432/project_management_system?schema=public' \
MIGRATION_DRY_RUN_OUTPUT=./migration-dry-run.sql \
npm run migration:dry-run
```

## Monitoring/logging

Endpoints:

- `/api/health` - liveness;
- `/api/ready` - readiness с проверкой PostgreSQL;
- `/api/metrics` - Prometheus metrics.

Метрики:

- `pms_uptime_seconds`;
- `pms_http_requests_total`;
- `pms_http_errors_total`;
- `pms_jira_configured`;
- `pms_http_requests_by_route_total`.

Если задан `METRICS_TOKEN`, endpoint `/api/metrics` требует:

```bash
curl -H 'Authorization: Bearer <token>' http://localhost:3000/api/metrics
```

Логи API пишутся в stdout/stderr в JSON-формате. Для промышленного контура нужно подключить сбор stdout контейнера в корпоративный log collector.

## OpenAPI

OpenAPI документ доступен в runtime:

```bash
curl http://localhost:3000/api/openapi.json
```

Основные группы endpoint:

- Health/Auth;
- Projects;
- WBS/Baseline/Gantt dependencies;
- Open Issues;
- Risks;
- Jira;
- Executive Overview;
- Admin/Audit.
- Search/Saved Views;
- Enterprise Integrations: API tokens, webhook endpoints, webhook deliveries.

## Smoke tests

Security smoke:

```bash
APP_BASE_URL=http://localhost:3000 npm run smoke:security
```

Performance smoke:

```bash
APP_BASE_URL=http://localhost:3000 \
PERF_REQUESTS=20 \
PERF_MAX_AVG_MS=1000 \
npm run smoke:performance
```

Smoke-тесты не заменяют нагрузочное тестирование. Они нужны как быстрый post-deploy контроль доступности, read-only режима, OpenAPI и базовой задержки readiness endpoint.

## Release Checklist

Перед передачей DevOps:

```bash
npm ci
npm run prisma:generate
npm run typecheck
npm run test
npm run build
npm run migration:dry-run
docker build -t project-management-system:release .
```

Перед промышленным запуском:

- задать `DATABASE_URL`;
- задать `AUTH_COOKIE_SECURE=true`, если используется HTTPS;
- задать `METRICS_TOKEN`;
- настроить daily backup;
- проверить restore на тестовой БД;
- настроить healthcheck `/api/ready`;
- подключить сбор JSON-логов;
- настроить Jira через Admin Back Office или переменные окружения.
- выпустить API token для интеграций, если нужен machine-to-machine доступ;
- настроить webhook endpoints для корпоративных потребителей событий;
- выполнить `npm run smoke:security` и `npm run smoke:performance` после деплоя.
