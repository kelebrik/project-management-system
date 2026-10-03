import type { WikiGroup } from "./wikiContent";

export const platformWikiGroup: WikiGroup = {
  id: "wiki-admin-platform",
  title: "Администрирование и платформа",
  description: "Back Office, интеграции, API, аудит, безопасность и эксплуатация.",
  articles: [
    {
      id: "wiki-admin",
      title: "Back Office: пользователи, роли, справочники и модули",
      summary:
        "Какие административные настройки есть и какие guard-правила защищают систему.",
      keywords: ["админка", "пользователи", "роли", "справочники", "модули", "project access"],
      sections: [
        {
          heading: "Пользователи",
          points: [
            "Администратор создает пользователей с email, name, role и isActive. Эта форма не задает пароль; доступные способы входа зависят от настроек установки.",
            "Email нормализуется в lower-case, дубликат возвращает 409.",
            "Нельзя отключить или понизить последнего активного ADMIN.",
          ],
        },
        {
          heading: "Роли и permissions",
          points: [
            "Управляемые системные роли: ADMIN и EXECUTIVE_VIEWER, которые в интерфейсе называются «Администратор системы» и «Пользователь».",
            "ADMIN получает все permissions и его права нельзя отключить.",
            "Пользователь видит проекты всех бизнес-юнитов и может создавать проекты. Права изменения определяются доступом к конкретному проекту.",
            "Администратор выбранного БЮ видит раздел Администрирование, но только вкладки Реестр проектов и Доступы. Системные настройки, пользователи, роли, справочники и реестр БЮ ему недоступны.",
            "Администратор БЮ может выдавать и снимать только EDIT-доступ обычным пользователям и только для проектов выбранного БЮ. Он не может выдавать, менять или удалять уровень ADMIN.",
            "Есть legacy fallback permissions: например wbs.update может пройти по старому wbs.write.",
          ],
        },
        {
          heading: "Посещаемость",
          points: [
            "Страница Посещаемость доступна только администратору системы и показывает просмотры за последние 7 дней.",
            "Системные администраторы не учитываются. Администраторы БЮ считаются обычными авторизованными посетителями.",
            "График разделяет просмотры авторизованных пользователей и незалогиненных гостей; ниже доступны список посетителей и агрегация посетитель - проект - страница.",
            "Гости различаются по серверному хэшу стабильного идентификатора браузера. IP, email и полный URL страницы в аналитике не сохраняются.",
            "События посещений автоматически удаляются по истечении настроенного срока хранения, по умолчанию через 30 дней.",
            "Таблицы посетителей и разбивки просмотров сортируются по дню последнего просмотра от новых к старым, затем по имени посетителя, затем по времени.",
            "Срок хранения задает PAGE_VISIT_RETENTION_DAYS, не меньше 7 дней.",
          ],
        },
        {
          heading: "Project access",
          points: [
            "Просмотр всех проектов уже открыт всем пользователям, поэтому индивидуальные доступы регулируют возможность изменения, а не видимость проекта.",
            "Доступ к проектам выдается уровнями VIEW, EDIT и ADMIN.",
            "Grant поддерживает пачку пользователей и пачку проектов и делает upsert по projectId/userId.",
            "Неактивным или отсутствующим пользователям доступ не выдается.",
            "Список доступов сортируется по project.code, уровню desc и имени пользователя.",
            "Все grant/update/delete действия пишутся в audit.",
          ],
        },
        {
          heading: "Бизнес-юниты и перенос проектов",
          points: [
            "Реестр Бизнес-юниты является отдельной вкладкой администрирования и доступен только администратору системы.",
            "В Реестре проектов администратор системы может перенести проект в другой БЮ. Вместе с ним переносятся все дочерние проекты, включая закрытые.",
            "При переносе корневой проект отвязывается от прежнего родителя, а индивидуальные доступы ко всем переносимым проектам удаляются. Перед операцией показывается подтверждение.",
            "Администратор БЮ видит БЮ проекта в Реестре проектов, но не может выполнить перенос.",
          ],
        },
        {
          heading: "Справочники и шаблоны",
          points: [
            "Справочники seed-ятся дефолтными project_status, project_type, risk_type, wbs_type, wbs_status, issue_severity, raid_type и raid_status.",
            "Удаление справочника в UI фактически деактивирует запись isActive=false, а не удаляет ее физически.",
            "WBS templates лежат в system setting wbs.templates JSON и описывают стартовые наборы фаз/работ.",
          ],
        },
        {
          heading: "Управление модулями",
          points: [
            "Список проектных модулей хранится в system setting project.modules.",
            "normalizeProjectModules всегда возвращает полный список default modules, а из настройки берет только enabled по known key.",
            "Если модуль выключен, он исчезает из строки разделов проекта.",
            "Если все модули выключены, firstEnabledProjectView fallback - project-overview.",
          ],
        },
      ],
    },
    {
      id: "wiki-integrations-api",
      title: "Интеграции, API tokens, webhooks и OpenAPI",
      summary:
        "Как устроены внешние интеграции, токены, доставка webhook и документирование API.",
      keywords: ["интеграции", "API token", "webhook", "OpenAPI", "GitLab", "GitHub", "BI"],
      sections: [
        {
          heading: "Интеграционные настройки",
          points: [
            "В админке хранятся настройки GitLab, GitHub, Azure DevOps и BI export URL.",
            "Secret-настройки в API возвращаются с пустым value и флагом hasValue, чтобы не раскрывать сохраненный токен.",
            "При обновлении secret-setting пустое value сохраняет старое значение, если оно уже было.",
            "Jira credentials намеренно не входят в эти настройки и читаются только из env backend-контейнера.",
          ],
        },
        {
          heading: "API tokens",
          points: [
            "Новый токен имеет формат pms_ + random base64url и показывается только в ответе создания.",
            "В базе хранится SHA-256 hash и tokenPrefix, а не исходный токен.",
            "Token scopes могут быть *, namespace.* или конкретным permission.",
            "Токен может иметь expiresAt, isActive и rateLimitPerMinute.",
            "При использовании токена обновляется lastUsedAt.",
            "Токен передается заголовком Authorization: Bearer pms_...",
            "Изменять График отпусков API-токеном нельзя: такие запросы отклоняются с 403, график меняется только из сессии пользователя.",
          ],
        },
        {
          heading: "Webhooks",
          points: [
            "Endpoint хранит name, url, optional secret, список events и isActive.",
            "events может содержать * или конкретный eventType.",
            "Delivery создается в базе до отправки и уходит асинхронно через setTimeout.",
            "Если secret задан, payload подписывается заголовком X-PMS-Signature: sha256=<hmac>.",
            "Попытки, timeout и backoff управляются WEBHOOK_TIMEOUT_MS, WEBHOOK_MAX_ATTEMPTS и WEBHOOK_RETRY_BASE_MS.",
            "Результат delivery хранит status, statusCode, responseBody/error и attemptedAt.",
          ],
        },
        {
          heading: "REST API и OpenAPI",
          points: [
            "OpenAPI публикуется backend-приложением и покрывается integration-тестом на соответствие concrete Express routes.",
            "Мутирующие endpoints должны иметь security responses и проходить permission/project guards.",
            "API покрывает проекты, WBS, WBS dependencies, baseline, calendars, business requirements, Jira sync, issues, RAID, artifacts, saved views, search и admin back office.",
            "Все прикладные API, включая read-only представления и global search, требуют аутентификацию; без входа доступны только вход, статус Keycloak, health и ready, OpenAPI и метрики (в production - по METRICS_TOKEN). В публичной демонстрации запросы без входа выполняются от встроенного демо-пользователя.",
          ],
        },
      ],
    },
    {
      id: "wiki-security-ops",
      title: "Аутентификация, аудит и эксплуатация",
      summary:
        "Сессии, Keycloak/OIDC, audit trail, health, backup/restore и deployment-контур.",
      keywords: ["auth", "keycloak", "OIDC", "audit", "health", "backup", "restore", "deploy", "prisma"],
      sections: [
        {
          heading: "Сессия приложения",
          points: [
            "Сессия хранится в UserSession как SHA-256 hash cookie-токена.",
            "Cookie HttpOnly, SameSite=Lax, Max-Age по AUTH_SESSION_DAYS. Secure включается в production, если AUTH_COOKIE_SECURE не false.",
            "Если сессия истекла, она удаляется. Если пользователь отключен, сессия не прикрепляется к request.",
            "Без активной сессии интерфейс и все прикладные API недоступны.",
            "Исключение - публичное облачное демо: в режиме PUBLIC_DEMO_MODE запрос без сессии выполняется от встроенного демо-пользователя. В корпоративной установке этот режим выключен.",
            "Профиль установки задает DEPLOYMENT_PROFILE: cloud или corporate. Без значения используется строгий corporate, неизвестное значение останавливает запуск.",
            "На профиле corporate включить PUBLIC_DEMO_MODE нельзя: приложение не стартует. При PUBLIC_DEMO_MODE=true Jira выключена на любом профиле.",
            "TRUST_PROXY_HOPS задает число прокси перед приложением (на Render 2), от него зависит определение адреса клиента для лимитов. Некорректное значение останавливает запуск, без значения в production используется 1.",
            "Вход по паролю ограничен: 10 попыток в минуту с адреса и 30 в минуту на email, дальше ответ 429 с Retry-After; некорректные запросы попытками не считаются.",
            "При первом входе через Keycloak пользователь создается с ролью Пользователь; если активных администраторов нет, он получает роль Администратор системы.",
          ],
        },
        {
          heading: "Keycloak/OIDC",
          points: [
            "Вход через Keycloak выполняет backend по OIDC authorization code flow (/api/auth/keycloak/login и /callback) с KEYCLOAK_OIDCS_DISCOVERY_ENDPOINT, KEYCLOAK_CLIENT_ID и KEYCLOAK_CLIENT_SECRET, затем создает обычную сессию приложения.",
            "Вход по email и паролю есть только на облачном профиле (DEPLOYMENT_PROFILE=cloud); в корпоративной установке маршрут не регистрируется. Пароль хранится только как хеш scrypt с индивидуальной солью; в интерфейсе пароль не задается, механизма первичного входа через переменные окружения нет.",
            "OIDC не передает пароль пользователя приложению, поэтому приложение не может ходить в Jira с логином и паролем пользователя.",
            "Доступ к Jira реализован сервисным аккаунтом через JIRA_EMAIL/JIRA_API_TOKEN в env контейнера.",
          ],
        },
        {
          heading: "Audit trail",
          points: [
            "AuditEvent пишет actorId/email/name, action, objectType, objectId, projectId, ipAddress, userAgent, beforeValue, afterValue и metadata.",
            "Ошибки записи audit не валят основной запрос, но логируются в console.error.",
            "Audit покрывает project create/update/delete/close, target date, ui state, business requirements, users, roles, dictionaries, config import, project access, saved views, api tokens и webhooks.",
            "Журнал аудита показывает последние 100 событий (API отдает до 200) с изменениями полей «было -> стало»; удаленные строки Структуры можно восстановить из журнала в течение 30 дней.",
            "Журнал также фиксирует входы (auth.login_failed, auth.keycloak_login), перевод вопроса в проблему и все изменения Графика отпусков (leave_schedule.*).",
          ],
        },
        {
          heading: "Health и backup",
          points: [
            "System health выполняет SELECT 1, показывает database status, databaseLatencyMs, uptimeSeconds, startedAt и NODE_ENV.",
            "Backup status читает BACKUP_DIR или ./backups, ищет .dump файлы, сортирует по updatedAt и пытается прочитать .sha256 рядом с последним backup.",
            "Retention берется из BACKUP_RETENTION_DAYS, по умолчанию 14.",
            "Admin config export/import переносит rolePermissions, businessUnitRolePermissions, dictionaryItems, systemSettings и projectModules, но secret settings экспортируются без value.",
          ],
        },
        {
          heading: "Deployment и CI",
          points: [
            "Prisma migrations применяются startup-скриптами перед запуском API.",
            "Есть операционные скрипты backup, restore, restore drill, migration dry-run, security smoke и performance smoke.",
            "CI проверяет shared build, Prisma generate, integration tests, OpenAPI coverage, migration safety, Docker/Kubernetes/operations scripts и корпоративные runner restrictions.",
            "Migration safety test запрещает опасные операции вроде DELETE FROM без явного allow-list.",
            "SCA job проверяет Node.js зависимости, поэтому уязвимая xlsx-зависимость была удалена вместе с XLSX WBS import.",
          ],
        },
      ],
    },
  ],
};
