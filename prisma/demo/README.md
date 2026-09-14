# Cloud demo population

The additive fixture fills **every existing project**, including partly populated
projects such as DEMO-005. It creates no business units and no projects.

- Adds 4 phases, 4 goals, 12 WBS milestones and 12 corresponding milestone-register
  records, 4 work packages, 20 tasks/deliverables and dependencies.
- Adds 6 RAID items, 8 questions/problems with status history, requirements,
  documents, actions, change requests, calendar exceptions and a generated report.
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

Deterministic IDs prevent duplicates. Existing planning rows and populated
requirement cells remain intact; blank requirement placeholders are filled in
place. Calendar dates use the initial fixture anchor. Synthetic analytics dates
are refreshed on subsequent calls, and canonical Jira versions remain append-only
(one version per distinct daily payload). Refresh through the endpoint/CLI before
a later demo: the normal 24-hour GitLab freshness check remains active.

Test with a dedicated migrated PostgreSQL database (no production URL):

```
PUBLIC_DEMO_MODE=true DEMO_TEST_DATABASE_URL=postgresql://USER@127.0.0.1:55439/pms_demo_fixture_test node --import tsx --test tests/integration/demo-completeness.test.ts
```

The test rejects any other host/database name, verifies existing data preservation,
repeat execution, aged analytics repair, counts and all default widget results.
