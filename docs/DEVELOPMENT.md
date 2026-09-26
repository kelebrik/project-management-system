# Development and deployment

Technical notes moved here from the main README.

## Deployment profiles

`DEPLOYMENT_PROFILE` decides how people sign in:

- `cloud` enables password sign-in; with `PUBLIC_DEMO_MODE=true` it also lets anyone in as the demo user.
- `corporate` (the default when the variable is empty) turns both off and leaves Keycloak as the only way in, so Keycloak must be configured.

## Local Development

`.env.example` uses the `corporate` profile. To run locally with demo data and without Keycloak, switch it to the cloud demo profile:

```bash
npm install
cp .env.example .env
# in .env: DEPLOYMENT_PROFILE="cloud" and PUBLIC_DEMO_MODE="true"
npm run prisma:generate
npm run prisma:migrate
SEED_DEMO_DATA=true npm run prisma:seed   # the demo seed refuses to run outside the cloud demo profile
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
- environment variables for `DATABASE_URL`, `NODE_ENV`, `DEPLOYMENT_PROFILE`, `PUBLIC_DEMO_MODE`, `TRUST_PROXY_HOPS`, `WEB_ORIGIN`, `SEED_DEMO_DATA`;
- Jira secret variables to fill in manually.

Render service settings if creating manually:

- Runtime: `Node`
- Branch: `main`
- Build command: `npm run render-build`
- Start command: `npm run start`
- Health check path: `/api/health`
- Environment:
  - `NODE_ENV=production`
  - `NPM_CONFIG_PRODUCTION=false`
  - `DEPLOYMENT_PROFILE=cloud` (without it the strict corporate profile applies and only Keycloak can sign people in)
  - `PUBLIC_DEMO_MODE=true` for a public demo, otherwise leave it unset
  - `TRUST_PROXY_HOPS=2` behind Cloudflare and the Render proxy
  - `WEB_ORIGIN=https://<your-render-service>.onrender.com`
  - `SEED_DEMO_DATA=false`
  - `METRICS_TOKEN=<random secret>`
  - `DATABASE_URL=<Render PostgreSQL internal connection string>`
  - `JIRA_BASE_URL=<your Jira base URL>`
  - `JIRA_EMAIL=<integration user email>`
  - `JIRA_API_TOKEN=<Jira API token or service account password>`
  - `JIRA_MAX_RESULTS=100`

Password sign-in checks the salted `scrypt` hash stored in PostgreSQL. There is no
bootstrap secret: the first administrator of a fresh installation has to be created
directly in the database, or through Keycloak where it is configured.

## Jira Strategy

Jira remains the operational Kanban/Scrum system. This application does not duplicate Jira boards. It stores Jira board links, Jira ticket URLs on tasks, and synchronized issue snapshots for portfolio reporting, open issues, and executive overview evidence. Jira REST API access is configured only through backend container environment variables, not through Admin Back Office.

## Docker Deployment

Container deployment is described in `docs/docker-deployment.md`.

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
