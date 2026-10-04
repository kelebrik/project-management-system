import type { WikiGroup } from "../app/wikiContent";

export const englishPlatformWikiGroup: WikiGroup = {
  "id": "wiki-admin-platform",
  "title": "Administration and platform",
  "description": "Back office, integrations, API, audit, security and operations.",
  "articles": [
    {
      "id": "wiki-admin",
      "title": "Back office: users, roles and modules",
      "summary": "Which administrative settings exist and which guard rules protect the system.",
      "keywords": ["admin panel", "users", "roles", "modules", "project access"],
      "sections": [
        {
          "heading": "Users",
          "points": [
            "The administrator creates users with email, name, role and isActive. This form does not set a password; available sign-in methods depend on the installation settings.",
            "The email is normalized to lower case; a duplicate returns 409.",
            "The last active ADMIN cannot be disabled or demoted."
          ]
        },
        {
          "heading": "Roles and permissions",
          "points": [
            "The managed system roles are ADMIN and EXECUTIVE_VIEWER, which in the interface are called \"System administrator\" and \"User\".",
            "ADMIN receives all permissions and its rights cannot be disabled.",
            "A User sees the projects of all business units and can create projects. Edit rights are determined by access to the specific project.",
            "The administrator of the selected BU sees the Administration section, but only the Project registry and Access tabs. System settings, users, roles and the BU registry are not available to them.",
            "A BU administrator can grant and revoke only EDIT access for regular users and only for projects of the selected BU. They cannot grant, change or remove the ADMIN level.",
            "There are legacy fallback permissions: for example, wbs.update can be satisfied by the old wbs.write."
          ]
        },
        {
          "heading": "Attendance",
          "points": [
            "The Attendance page is available only to the system administrator and shows views for the last 7 days.",
            "System administrators are not counted. BU administrators are counted as regular authenticated visitors.",
            "The chart separates the views of authenticated users from those of guests who are not logged in; below it a visitor list and a visitor - project - page aggregation are available.",
            "Guests are distinguished by a server-side hash of a stable browser identifier. IP addresses, emails and full page URLs are not stored in the analytics.",
            "Visit events are deleted automatically once the configured retention period expires, by default after 30 days.",
            "The visitors and view breakdown tables are sorted by the day of the last view, newest first, then by visitor name, then by time.",
            "PAGE_VISIT_RETENTION_DAYS sets the retention period, at least 7 days."
          ]
        },
        {
          "heading": "Project access",
          "points": [
            "Viewing all projects is already open to every user, so individual access grants regulate the ability to change a project, not its visibility.",
            "Access to projects is granted at the VIEW, EDIT and ADMIN levels.",
            "Grant supports a batch of users and a batch of projects and performs an upsert by projectId/userId.",
            "Access is not granted to inactive or missing users.",
            "The access list is sorted by project.code, then level desc, then user name.",
            "All grant/update/delete actions are written to the audit log."
          ]
        },
        {
          "heading": "Business units and moving projects",
          "points": [
            "The Business units registry is a separate administration tab and is available only to the system administrator.",
            "In the Project registry the system administrator can move a project to another BU. All child projects, including closed ones, are moved with it.",
            "During the move the root project is detached from its previous parent, and the individual access grants for all moved projects are deleted. A confirmation is shown before the operation.",
            "A BU administrator sees a project's BU in the Project registry but cannot perform the move."
          ]
        },
        {
          "heading": "Module management",
          "points": [
            "The list of project modules is stored in the system setting project.modules.",
            "normalizeProjectModules always returns the full list of default modules and takes only enabled from the setting, by known key.",
            "If a module is disabled, it disappears from the project section row.",
            "If all modules are disabled, the firstEnabledProjectView fallback is project-overview."
          ]
        }
      ]
    },
    {
      "id": "wiki-integrations-api",
      "title": "Integrations, API tokens, webhooks and OpenAPI",
      "summary": "How external integrations, tokens, webhook delivery and API documentation are arranged.",
      "keywords": ["integrations", "API token", "webhook", "OpenAPI", "GitLab"],
      "sections": [
        {
          "heading": "Integration settings",
          "points": [
            "The admin panel stores the GitLab settings: whether it is enabled, its address and its token.",
            "Secret settings are returned from the API with an empty value and a hasValue flag, so that the stored token is not disclosed.",
            "When a secret setting is updated, an empty value keeps the old value if one was already there.",
            "Jira credentials are intentionally not part of these settings and are read only from the env of the backend container."
          ]
        },
        {
          "heading": "API tokens",
          "points": [
            "A new token has the format pms_ + random base64url and is shown only in the creation response.",
            "The database stores a SHA-256 hash and the tokenPrefix, not the original token.",
            "Token scopes can be *, namespace.* or a specific permission.",
            "A token can have expiresAt, isActive and rateLimitPerMinute.",
            "When a token is used, lastUsedAt is updated.",
            "The token is sent in the Authorization: Bearer pms_... header.",
            "The Leave schedule cannot be changed with an API token: such requests are refused with 403, the schedule changes only from a user session."
          ]
        },
        {
          "heading": "Webhooks",
          "points": [
            "An endpoint stores name, url, an optional secret, a list of events and isActive.",
            "events can contain * or a specific eventType.",
            "The delivery is created in the database before sending and goes out asynchronously via setTimeout.",
            "If a secret is set, the payload is signed with the header X-PMS-Signature: sha256=<hmac>.",
            "Attempts, timeout and backoff are controlled by WEBHOOK_TIMEOUT_MS, WEBHOOK_MAX_ATTEMPTS and WEBHOOK_RETRY_BASE_MS.",
            "The delivery result stores status, statusCode, responseBody/error and attemptedAt."
          ]
        },
        {
          "heading": "REST API and OpenAPI",
          "points": [
            "The OpenAPI spec is published by the backend application and is covered by an integration test that checks it against the concrete Express routes.",
            "Mutating endpoints must have security responses and must pass the permission/project guards.",
            "The API covers projects, WBS, WBS dependencies, baseline, calendars, business requirements, Jira sync, issues, RAID, artifacts, saved views, search and the admin back office.",
            "All application APIs, including read-only views and global search, require authentication; without signing in only sign-in, the Keycloak status, health and ready, OpenAPI and metrics (in production with METRICS_TOKEN) are available. In the public demo, requests without signing in run as the built-in demo user."
          ]
        }
      ]
    },
    {
      "id": "wiki-security-ops",
      "title": "Authentication, audit and operations",
      "summary": "Sessions, Keycloak/OIDC, the audit trail, health, backup/restore and the deployment pipeline.",
      "keywords": ["auth", "keycloak", "OIDC", "audit", "health", "backup", "restore", "deploy", "prisma"],
      "sections": [
        {
          "heading": "Application session",
          "points": [
            "The session is stored in UserSession as a SHA-256 hash of the cookie token.",
            "The cookie is HttpOnly, SameSite=Lax, with Max-Age from AUTH_SESSION_DAYS. Secure is enabled in production unless AUTH_COOKIE_SECURE is false.",
            "If a session has expired, it is deleted. If the user is disabled, the session is not attached to the request.",
            "Without an active session the interface and all application APIs are unavailable.",
            "The public cloud demo is the exception: under PUBLIC_DEMO_MODE a request without a session is executed on behalf of the built-in demo user. In a corporate installation that mode is off.",
            "DEPLOYMENT_PROFILE sets the installation profile: cloud or corporate. Without a value the strict corporate profile is used; an unknown value stops the start.",
            "PUBLIC_DEMO_MODE cannot be turned on with the corporate profile: the app does not start. With PUBLIC_DEMO_MODE=true Jira is off on any profile.",
            "TRUST_PROXY_HOPS sets the number of proxies in front of the app (2 on Render); the client address used for limits depends on it. An invalid value stops the start; without a value production uses 1.",
            "Password sign-in is limited to 10 attempts a minute per address and 30 a minute per email, after which the answer is 429 with Retry-After; malformed requests do not count as attempts.",
            "On the first Keycloak sign-in a user is created with the User role; if there are no active administrators, the user becomes a System administrator."
          ]
        },
        {
          "heading": "Keycloak/OIDC",
          "points": [
            "Keycloak sign-in is run by the backend with the OIDC authorization code flow (/api/auth/keycloak/login and /callback) using KEYCLOAK_OIDCS_DISCOVERY_ENDPOINT, KEYCLOAK_CLIENT_ID and KEYCLOAK_CLIENT_SECRET, and then creates a regular application session.",
            "Email and password sign-in exists only on the cloud profile (DEPLOYMENT_PROFILE=cloud); on a corporate installation the route is not registered. Passwords are only ever stored as individually salted scrypt hashes; the interface does not set passwords, and there is no environment-variable bootstrap path.",
            "OIDC does not pass the user's password to the application, so the application cannot reach Jira with the user's own login and password.",
            "Access to Jira is implemented through a service account via JIRA_EMAIL/JIRA_API_TOKEN in the container env."
          ]
        },
        {
          "heading": "Audit trail",
          "points": [
            "AuditEvent records actorId/email/name, action, objectType, objectId, projectId, ipAddress, userAgent, beforeValue, afterValue and metadata.",
            "Failures to write the audit record do not break the main request, but are logged to console.error.",
            "The audit covers project create/update/delete/close, target date, ui state, business requirements, users, roles, config import, project access, saved views, api tokens and webhooks.",
            "The audit log shows the latest 100 events (the API returns up to 200) with field changes \"before -> after\"; deleted WBS rows can be restored from the log within 30 days.",
            "The log also records sign-ins (auth.login_failed, auth.keycloak_login), turning an issue into a problem, and every Leave schedule change (leave_schedule.*)."
          ]
        },
        {
          "heading": "Health and backup",
          "points": [
            "System health runs SELECT 1 and shows the database status, databaseLatencyMs, uptimeSeconds, startedAt and NODE_ENV.",
            "Backup status reads BACKUP_DIR or ./backups, looks for .dump files, sorts them by updatedAt and tries to read the .sha256 file next to the latest backup.",
            "Retention is taken from BACKUP_RETENTION_DAYS, by default 14.",
            "The admin config export/import transfers rolePermissions, businessUnitRolePermissions, systemSettings and projectModules, but secret settings are exported without their value. A dictionaryItems array in an older file is ignored on import, as are removed settings and permissions."
          ]
        },
        {
          "heading": "Deployment and CI",
          "points": [
            "Prisma migrations are applied by the startup scripts before the API is launched.",
            "There are operational scripts for backup, restore, restore drill, migration dry-run, security smoke and performance smoke.",
            "CI checks the shared build, Prisma generate, integration tests, OpenAPI coverage, migration safety, the Docker/Kubernetes/operations scripts and the corporate runner restrictions.",
            "The migration safety test forbids dangerous operations such as DELETE FROM without an explicit allow list.",
            "The SCA job checks the Node.js dependencies, which is why the vulnerable xlsx dependency was removed together with the XLSX WBS import."
          ]
        }
      ]
    }
  ]
};
