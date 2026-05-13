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
- Executive Overview deterministic generation, evidence list, versioning, and publish action.
- Render blueprint in `render.yaml`.
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
- manual Jira secret variables.

Render service settings if creating manually:

- Runtime: `Node`
- Branch: `main`
- Build command: `npm run render-build`
- Start command: `npm run start`
- Health check path: `/api/health`
- Environment:
  - `NODE_ENV=production`
  - `NPM_CONFIG_PRODUCTION=false`
  - `WEB_ORIGIN=*`
  - `SEED_DEMO_DATA=true`
  - `DATABASE_URL=<Render PostgreSQL internal connection string>`
  - `JIRA_BASE_URL=<your Jira base URL>`
  - `JIRA_EMAIL=<integration user email>`
  - `JIRA_API_TOKEN=<Jira API token>`

## Jira Strategy

Jira remains the operational Kanban/Scrum system. This application does not duplicate Jira boards. It stores Jira board links, Jira ticket URLs on tasks, and synchronized issue snapshots for portfolio reporting, open issues, and executive overview evidence.
