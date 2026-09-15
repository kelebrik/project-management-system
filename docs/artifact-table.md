# Artifact table

The Artifacts page uses the Business requirements grid styles, with a typed date column instead of a row number. A new empty project starts with four columns (Date, Artifact, Details, Links) and one row. Column headings are editable; the date column cannot be removed. New rows are inserted directly below the header. HTTP/HTTPS links are rendered below the editable cell text.

## Persistence and compatibility

`ProjectArtifactTable` stores columns, rows and an optimistic revision in PostgreSQL. Save sends the revision; conflicting saves return 409 and preserve the user's unsaved input. Reload requires confirmation before discarding local edits. Existing `ProjectArtifact` records are projected read-only until the first explicit Save; the original records are retained. After saving, the new table is authoritative for the page, global search and the overview's artifact register gate. Free text is not treated as approved/baselined evidence.

## Attachments

Project-scoped multipart endpoints store binaries in `ProjectArtifactFile`. Limits: 3 MiB per file and 30 MiB per project. Quota changes and table saves share a project advisory transaction lock. Table saves atomically delete previously referenced files that no longer appear in the committed table. Unreferenced staged uploads older than 24 hours are cleaned during subsequent uploads. Downloads use attachment disposition, octet-stream and nosniff. Existing project read/write permissions apply; Jira is not involved.

The table JSON request limit is 4 MiB. Maximum: 50 columns, 1,000 rows, 20 attachments per cell. File metadata is returned separately from binary downloads. Custom titles and cell contents are user data; default titles and UI controls support RU/EN.

## Validation

Run the real HTTP/PostgreSQL test against an isolated database:

```sh
ARTIFACT_TEST_DATABASE_URL='postgresql://localhost/pms_artifacts_test' npm run test:artifacts:postgres
```

The runner applies migrations and checks uploads/downloads, UTF-8 filenames, permissions, project isolation, quotas, dates, concurrent saves, global search and attachment cleanup. Browser coverage is in `tests/e2e/artifact-table.spec.ts`.

Verified during implementation: PostgreSQL 18 migration and HTTP test, 2 browser tests, 422 API unit tests, 179 web unit tests, 29 migration/OpenAPI checks, workspace build. The repository's existing source-size check still reports two unchanged oversized files: `resourceModels.ts` and `i18n/messages/projects.ts`.
