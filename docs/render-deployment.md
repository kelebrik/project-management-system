# Render Deployment Settings

Recommended path: use Render Blueprint with `render.yaml`.

## Blueprint

1. Push this repository to GitHub.
2. In Render, choose **New > Blueprint**.
3. Connect `kelebrik/project-management-system`.
4. Confirm the web service and PostgreSQL database from `render.yaml`.
5. Add Jira secrets after creation if needed.

## Manual Web Service Settings

- Service type: Web Service
- Runtime: Node
- Repository: `https://github.com/kelebrik/project-management-system`
- Branch: `main`
- Root directory: empty
- Build command: `npm run render-build`
- Start command: `npm run start`
- Health check path: `/api/health`
- Auto deploy: enabled

## Environment Variables

Required:

```text
NODE_ENV=production
NPM_CONFIG_PRODUCTION=false
WEB_ORIGIN=*
SEED_DEMO_DATA=true
DATABASE_URL=<Render PostgreSQL internal connection string>
```

Optional for Jira sync:

```text
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=jira-integration-user@company.com
JIRA_API_TOKEN=<secret>
```

## Database

Create a Render PostgreSQL database and use its internal connection string as `DATABASE_URL`.

The build command runs:

```bash
npm ci
npm run prisma:generate
npm run build
npm run prisma:deploy
```

If `SEED_DEMO_DATA=true`, the build also runs `npm run prisma:seed`. The seed is idempotent and creates the sample ERP project used by the first demo. Set it to `false` when real data entry starts.
