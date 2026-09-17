# Cloud demo population

## Base seed sections

`npm run prisma:seed` always runs `fillProjectSections`
(`apps/api/src/demo/sections.ts`) for every seeded project, plus the migration
created `TEST-001`. It guarantees at least four records in every project menu
section — Jira work (integration settings, four work sections, six synthetic
snapshots), project charter, business requirements, open issues, RAID, change
requests, overview/budget evidence, milestones, artifacts, calendar overrides
and baseline items. Deterministic IDs and upserts make repeated seeding
idempotent, existing rows are never replaced, and the Jira rows are local
database fixtures only: no Jira request is made.

## Additive cloud fixture

The additive fixture fills **every existing project**, including partly populated
projects such as DEMO-005. It creates no business units and no projects.

- Adds 4 phases with one goal and 4 milestones in each phase, 16 corresponding
  milestone-register records, 4 work packages and 36 tasks/deliverables.
- Gives every fixture task baseline, current and forecast date pairs. Current
  dates move both ahead of and behind the baseline; forecasts differ from both.
  A cross-phase dependency chain keeps at least half of the project tasks on the
  calculated critical path in the standard demo dataset.
- Adds 6 RAID items, 8 questions/problems with status history, requirements,
  4 documents, 4 actions, 4 change requests, calendar exceptions and a generated
  report with at least four entries in every overview list.
- Adds 16 synthetic Jira snapshots with local history and development events,
  plus 5 synthetic GitLab commits for each published branch scope. These are
  database fixtures; no Jira or GitLab network requests are made.
- Populates all 10 standard active/retro widgets using the real evaluators.

The POST `/api/admin/demo-data/projects/:projectId` is available only in the
existing public-demo runtime and only to an authenticated system administrator
(or an existing API token with admin.config permission). The anonymous demo user
cannot invoke it. Each call is audited as `project.demo.populate`.

For an explicitly selected demo database, the CLI additionally requires
`SEED_DEMO_DATA=true`:

```
PUBLIC_DEMO_MODE=true SEED_DEMO_DATA=true npm run prisma:seed:complete-demo
```

The regular demo seed calls the fixture only when SEED_DEMO_DATA=true; the helper
also rejects non-demo runtimes. No migrations or production infrastructure
changes are required.

Deterministic IDs prevent duplicates. Existing user-created planning rows and
populated requirement cells remain intact; blank requirement placeholders are
filled in place. Repeated runs repair the fixture-owned schedule, baseline,
forecast, milestones and dependency chain. Calendar dates use the initial
fixture anchor. Synthetic analytics dates are refreshed on subsequent calls,
and canonical Jira versions remain append-only (one version per distinct daily
payload). Refresh through the endpoint/CLI before a later demo: the normal
24-hour GitLab freshness check remains active.

Test with a dedicated migrated PostgreSQL database (no production URL):

```
PUBLIC_DEMO_MODE=true DEMO_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:55439/pms_demo_fixture_test node --import tsx --test tests/integration/demo-completeness.test.ts
```

The test rejects any other host/database name and verifies existing data
preservation, baseline/current/forecast variance, phase checkpoints, critical
path coverage, repeat execution, aged analytics repair and every default widget.
