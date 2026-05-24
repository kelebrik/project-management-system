# Enterprise Integrations

Раздел закрывает корпоративные интеграции вокруг системы управления проектами.

## API tokens

Admin Back Office позволяет выпускать `pms_*` токены. Токен хранится в базе только в виде SHA-256 hash, открытое значение показывается один раз при создании.

Использование:

```bash
curl -H "Authorization: Bearer pms_..." https://pms.example.com/api/projects
```

Для токена можно задать:

- наименование;
- права доступа;
- срок действия;
- лимит запросов в минуту.

## Webhook API

Webhook endpoint создается в Admin Back Office. Система отправляет JSON-события `POST`-запросом.

Заголовки:

- `X-PMS-Event` - тип события;
- `X-PMS-Delivery` - идентификатор доставки;
- `X-PMS-Signature` - HMAC SHA-256, если задан secret.

Поддерживаются события:

- `project.created`, `project.updated`, `project.closed`, `project.deleted`;
- `wbs.item.created`, `wbs.item.updated`;
- `wbs.dependency.updated`, `wbs.dependency.deleted`;
- `issue.created`, `issue.updated`, `issue.jira_link.updated`, `issue.jira_link.deleted`;
- `risk.created`, `risk.updated`, `risk.status_updated`, `risk.deleted`;
- `change_request.created`, `change_request.updated`, `change_request.deleted`;
- `artifact.created`, `artifact.updated`, `artifact.deleted`.

Для подписки на все события можно указать `*`.

## GitLab / GitHub / Azure DevOps

В Admin Back Office хранится конфигурация:

- GitLab: enabled, base URL, token;
- GitHub: enabled, API base URL, token;
- Azure DevOps: enabled, organization URL, token.

На текущем этапе это системные настройки и безопасное хранение secret-полей. Следующий слой интеграций должен подключить конкретные adapters: import merge requests, releases, commits, pipeline status.

## BI export

BI integration содержит URL публикации/экспорта. Рекомендуемый режим:

- выгрузка обезличенных витрин через API token;
- webhook `overview.published` для инкрементального обновления;
- отдельные read-only credentials для BI.
