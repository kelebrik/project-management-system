# Docker Deployment

Контейнер приложения содержит backend и собранный web frontend. PostgreSQL можно поднять отдельным контейнером через `docker-compose.yml` или подключить внешнюю корпоративную БД через `DATABASE_URL`.

## Вариант 1. Приложение + PostgreSQL в compose

```bash
docker compose up -d --build
```

Приложение будет доступно на `http://localhost:3000`. При старте контейнер приложения выполняет `prisma migrate deploy`, затем запускает API, который отдает и `/api/*`, и web UI.

## Вариант 2. Только контейнер приложения, БД снаружи

```bash
docker build -t project-management-system:latest .
docker run -d \
  --name project-management-system \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e WEB_ORIGIN='*' \
  -e AUTH_COOKIE_SECURE=false \
  -e DATABASE_URL='postgresql://user:password@db-host:5432/project_management_system?schema=public' \
  project-management-system:latest
```

Для HTTPS за reverse proxy рекомендуется выставить `AUTH_COOKIE_SECURE=true`.

## Переменные окружения

Обязательные:

```text
DATABASE_URL=postgresql://user:password@host:5432/db?schema=public
NODE_ENV=production
PORT=3000
WEB_ORIGIN=*
```

Опциональные:

```text
AUTH_COOKIE_SECURE=true
AUTH_SESSION_DAYS=7
JIRA_BASE_URL=https://jira.company.ru
JIRA_EMAIL=integration-user@company.ru
JIRA_API_TOKEN=<secret>
```

## Проверка

```bash
curl http://localhost:3000/api/health
```

Ожидаемый ответ содержит `ok: true` и `database: "ok"`.
