# Project Instructions

## Jira Is Strictly Read-Only

- Jira is an external read-only data source. Never create, update, transition, or
  delete Jira issues, comments, worklogs, links, attachments, fields, or Jira
  configuration.
- A Jira "sync" always means reading from Jira and writing the resulting snapshot
  to this application's own database. Local application writes are allowed; Jira
  business-data writes are not.
- All Jira HTTP calls must go through the read-only guard in
  `apps/api/src/jira.ts`. Do not call Jira with `fetch` or another HTTP client
  outside that guard.
- The guard must support Jira base URLs both with and without a context path and
  must force manual redirect handling so an allowed request cannot be redirected
  to an unvalidated endpoint.
- `POST` is allowed only for Jira JQL search and authentication endpoints because
  those operations do not change Jira business data. Never add `PUT`, `PATCH`, or
  `DELETE` Jira requests.
- Jira credentials must have read-only permissions. The application guard is
  defense in depth, not a substitute for Jira-side access control.
- If a requested feature requires writing to Jira, stop and ask the user instead
  of implementing or attempting the write.
