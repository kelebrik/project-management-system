# Project Management System

Corporate project management system with PM web UI, admin back office scope, Jira issue synchronization, open issues list, and executive overview generation for top management.

## Current Scope

- React PM dashboard.
- Express API.
- Prisma/PostgreSQL data model.
- Jira ticket links on tasks.
- Jira issue snapshot endpoint and sync skeleton.
- Open Issues List from Jira/internal sources, with multiple Jira tickets linked to one open issue.
- Open Issue lifecycle editing: status, severity, owner, due date, impact, decision flag, and resolve action.
- Project management core: create project, edit project passport, manage milestones, and feed milestones into Executive Overview.
- WBS/Gantt planning: hierarchy, milestones, dependency links, month scale, today marker, collapse/expand tree, and critical path highlighting.
- Executive Overview deterministic generation, evidence list, versioning, and publish action.
- Render blueprint in `render.yaml`.
- Docker image and `docker-compose.yml` for corporate deployment.
- Detailed technical specification in `docs/TZ.md`.

## Local Development

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

In a second terminal:

```bash
npm run dev:web
```

API: `http://localhost:3000/api/health`  
Web UI: `http://localhost:5173`

## Render Deployment

Use the Blueprint flow and point Render to this repository. The included `render.yaml` creates:

- one Node web service;
- one PostgreSQL database;
- environment variables for `DATABASE_URL`, `NODE_ENV`, `WEB_ORIGIN`, `SEED_DEMO_DATA`;
- manual local-auth and Jira secret variables.

Render service settings if creating manually:

- Runtime: `Node`
- Branch: `main`
- Build command: `npm run render-build`
- Start command: `npm run start`
- Health check path: `/api/health`
- Environment:
  - `NODE_ENV=production`
  - `NPM_CONFIG_PRODUCTION=false`
  - `WEB_ORIGIN=https://<your-render-service>.onrender.com`
  - `SEED_DEMO_DATA=false`
  - `METRICS_TOKEN=<random secret>`
  - `DATABASE_URL=<Render PostgreSQL internal connection string>`
  - `LOCAL_AUTH_EMAIL=<cloud owner email>`
  - `LOCAL_AUTH_BOOTSTRAP_PASSWORD=<one-time cloud owner password>`
  - `JIRA_BASE_URL=<your Jira base URL>`
  - `JIRA_EMAIL=<integration user email>`
  - `JIRA_API_TOKEN=<Jira API token or service account password>`
  - `JIRA_MAX_RESULTS=100`

`LOCAL_AUTH_BOOTSTRAP_PASSWORD` is used only when the matching active user has no
stored password hash. The first successful login stores a salted `scrypt` hash in
PostgreSQL; remove the bootstrap secret from Render after that login.

## Jira Strategy

Jira remains the operational Kanban/Scrum system. This application does not duplicate Jira boards. It stores Jira board links, Jira ticket URLs on tasks, and synchronized issue snapshots for portfolio reporting, open issues, and executive overview evidence. Jira REST API access is configured only through backend container environment variables, not through Admin Back Office.

## Docker Deployment

Corporate container deployment is described in `docs/docker-deployment.md`.

Short local compose command:

```bash
docker compose up -d --build
```

## Production Readiness

- Unit tests: `npm run test:unit`
- Integration API smoke tests: `INTEGRATION_BASE_URL=http://localhost:3000 npm run test:integration`
- E2E read-only UI smoke tests: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`
- Full verification: `npm run typecheck && npm run test && npm run build`
- OpenAPI: `/api/openapi.json`
- Health/readiness: `/api/health`, `/api/ready`
- Metrics: `/api/metrics`
- Backup: `DATABASE_URL=... npm run backup`
- Restore: `DATABASE_URL=... RESTORE_CONFIRM=yes npm run restore -- backups/pms-YYYYMMDDTHHMMSSZ.dump`

Operational details are documented in `docs/production-readiness.md`.
User guide: `docs/user-guide.md`. Admin guide: `docs/admin-guide.md`.
