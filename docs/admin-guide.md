# Административная документация

## Доступ

Admin Back Office доступен только пользователям с ролью `Администратор`.

Первичная настройка выполняется через bootstrap-экран, если в системе еще нет активного администратора с паролем.

## Разделы Admin Back Office

### Пользователи

Назначение:

- создание пользователей;
- смена ролей;
- активация/деактивация;
- смена пароля.

Роли:

- Администратор;
- Руководитель проекта;
- Участник команды;
- Руководитель.

### Роли и права

Права сгруппированы по write-действиям:

- `project.write`;
- `wbs.write`;
- `issue.write`;
- `raid.write`;
- `overview.publish`;
- `admin.integrations`;
- `admin.manage`.

GET/HEAD/OPTIONS доступны без авторизации в режиме чтения. Все write-запросы требуют входа.

### Справочники

Справочники используются для управляемых списков и будущего расширения без изменения кода.

Через страницу можно переключать справочник, редактировать записи и поддерживать единые значения для статусов, типов проектов, типов рисков, RAG-формул и workflow согласований.

### Jira

Доступ backend к Jira задается только переменными окружения контейнера:

- `JIRA_BASE_URL`;
- `JIRA_EMAIL`;
- `JIRA_USERNAME` optional, Jira Server login if it differs from email;
- `JIRA_API_TOKEN`;
- `JIRA_MAX_RESULTS` optional, default `100`, maximum `500`.

Backend ходит в Jira от сервисного аккаунта из этих переменных.
Пользовательский Keycloak/OIDC токен для Jira REST API не используется.
В Admin Back Office Jira credentials не хранятся и не редактируются.

На уровне проекта хранится:

- base URL;
- board URL;
- Jira project key;
- JQL для снимка задач;
- JQL для открытых вопросов.

### Интеграции

Раздел `Администрирование -> Интеграции` используется для корпоративных подключений:

- выпуск API tokens для machine-to-machine доступа;
- настройка webhook endpoints;
- просмотр статуса доставок webhook;
- хранение настроек GitLab, GitHub, Azure DevOps и BI export.

API token показывается один раз после создания. В базе хранится только hash.

### Реестр проектов

Администратор может:

- редактировать код и имя проекта;
- закрывать проект;
- удалять проект.

Закрытый проект становится доступным только для чтения для всех ролей, включая администратора.

### Журнал аудита

Журнал фиксирует:

- вход/выход;
- bootstrap администратора;
- изменения пользователей и прав;
- изменения проектов;
- операции со Структурой;
- фиксацию baseline;
- генерацию/публикацию обзоров.

## Backup/restore

Backup:

```bash
DATABASE_URL=... npm run backup
```

Restore:

```bash
DATABASE_URL=... RESTORE_CONFIRM=yes npm run restore -- backups/pms-YYYYMMDDTHHMMSSZ.dump
```

Перед restore промышленной БД нужно остановить приложение или перевести его в maintenance mode.

## Monitoring

DevOps должен подключить:

- `/api/ready` как readiness probe;
- `/api/health` как liveness probe;
- `/api/metrics` в Prometheus;
- stdout/stderr контейнера в корпоративный сборщик логов.

В `NODE_ENV=production` endpoint метрик требует `METRICS_TOKEN`.
