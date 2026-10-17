# Database schema

`schema.prisma` defines the client generator and database connection. Models and
enums live in `models/`, grouped by responsibility:

| File | Responsibility |
| --- | --- |
| `access.prisma` | Users, sessions, business units, permissions and API tokens |
| `projects.prisma` | Projects, milestones, overviews and schedule history |
| `wbs.prisma` | Structure, dependencies, baselines, commands and change journal |
| `registers.prisma` | Issues, RAID, change requests, decisions and lessons |
| `jira-analytics.prisma` | Jira settings, aggregate definitions and work sections |
| `jira-history.prisma` | Local Jira snapshots, versions, history and sync runs |
| `integrations.prisma` | GitLab snapshots and outgoing application webhooks |
| `resources.prisma` | People, leave, allocations, RACI and work check-ins |
| `artifacts.prisma` | Artifacts, files and business requirements |
| `automation.prisma` | Rules, firings, proposals and notifications |
| `views.prisma` | Saved views, personal layouts and dashboard pages |
| `system.prisma` | Dictionaries, settings, audit, visits and AI usage |

The whole `prisma/` directory is the schema, as configured in `prisma.config.ts`.
Use the existing npm commands (`npm run prisma:generate`, `npm run prisma:migrate`,
`npm run prisma:deploy`). When passing a schema explicitly, use `--schema prisma`,
not `--schema prisma/schema.prisma`, which loads only the generator and connection.
Migration files remain in `prisma/migrations/`.

This layout uses [Prisma's multi-file schema support](https://www.prisma.io/docs/orm/v6/prisma-schema/overview/location#multi-file-prisma-schema).
Keep each source file within the 1000-line limit checked by `npm run test:integration`.
