# Jira analytics: stage A1 implementation contract

Status: approved input for implementation after stage 0.1 review.

Stage A1 introduces immutable, attachment-free Jira issue versions. It does not yet
introduce the governed BI constructor. Jira remains strictly read-only; all Jira HTTP
requests must continue to pass through the guard in `apps/api/src/jira.ts`.

## Decisions

- The primary database has one global 5 GiB allocation for Jira history. WBS, other
  application data, and backup copies are outside this number. Project forecasts are
  additive.
- History is retained indefinitely. There is no automatic pruning or silent loss of
  older versions. At 95% usage, new scope onboarding is blocked while existing syncs
  continue and an operator expands storage. A per-scope estimate always includes actual
  or forecast storage already allocated to every other enabled scope.
- A full snapshot includes all Jira business fields accessible to the integration,
  complete changelog, comments, worklogs, and remote development links. Attachment
  binaries and structured attachment metadata are excluded.
- Stage A1 records only payloads actually observed from Jira as `OBSERVED`. It does not
  manufacture past full snapshots from changelog. A future reconstruction, if added,
  must be marked `RECONSTRUCTED` and never presented as an observation.
- The existing mutable `JiraIssueSnapshot` remains the current-state projection used by
  existing dashboards. It is updated in the same transaction as an immutable version
  and must be rebuildable from the latest observed version. It is not a second history
  source.
- BI queries use typed columns and normalized event tables. The archival JSONB payload
  is not directly queryable by the stage A1/A2 user-facing constructor.

## Immutable version

The new version record must contain at least:

- `projectId`, stable Jira issue ID, issue key, and a current-projection relation;
- `observedAt`, Jira `updated`, `schemaVersion`, and provenance;
- SHA-256 `contentHash`, sanitized JSONB payload, and actual payload byte size;
- hydration completeness for changelog, comments, worklogs, and remote links;
- typed fields needed by the first governed aggregates: summary, issue type, status and
  status category, priority, resolution and resolution date, created/updated timestamps,
  assignee, reporter, parent/epic, labels, and sprint IDs.

Required indexes cover project plus Jira update cursor, issue plus observation time,
common status/priority/resolution filters, and labels. The idempotency constraint is
unique `(projectId, jiraIssueId, contentHash)`.

## Canonical payload and hash

Schema version 1 uses one sanitized content document with `issue`, flattened
`changelog`, `comments`, `worklogs`, and `remoteLinks` collections. Import metadata such
as observation time, sync run ID, request timing, cursor, and pagination envelopes is
stored outside the content document and is not hashed.

Canonicalization rules are fixed for schema version 1:

1. Sanitize and validate the complete hydrated document before hashing.
2. Normalize valid known Jira timestamps to UTC ISO 8601 with millisecond precision. The
   accepted grammar is `YYYY-MM-DD` or
   `YYYY-MM-DDTHH:mm:ss[.1-9 digits](Z|+HH:mm|-HH:mm|+HHmm|-HHmm)`. A datetime without an
   explicit zone is invalid; no host-local timezone is ever used. These rules apply to
   issue created/updated/resolution dates, changelog creation time, comment
   creation/update time, and worklog creation/update/start time. Date-only values stay
   `YYYY-MM-DD`. An invalid non-null timestamp is preserved as its exact source string,
   adds a structured validation warning, and does not block the scope cursor.
3. Sort changelog entries by `(created, id)` and their items by
   `(fieldId, field, from, to)`. Sort comments and worklogs by stable ID. Sort remote
   links by stable ID and their stored source URL. Sort set-valued labels
   lexicographically and components, versions, and fixVersions by stable ID then name.
   Sort both flattened `sprints` and Jira Server `customfield_10004` sprint strings by
   parsed numeric ID then name. When tuple fields are absent or equal, compare the full
   canonical element so input/pagination order cannot decide the hash. Preserve order
   for all other arrays because it may carry Jira field semantics.
4. Omit `undefined`; retain `null`, empty strings, empty arrays, and empty objects.
5. Every tuple comparator is locale-independent. Missing, `null`, and present values
   sort in that order. Decimal-only IDs, including changelog `from` and `to`, compare as
   arbitrary-precision integers, with their raw strings as a tie-breaker; other strings
   compare by Unicode scalar value. No implementation may use `localeCompare` for
   canonical ordering.
6. Serialize with RFC 8785 JSON Canonicalization Scheme and hash the exact UTF-8 bytes
   with SHA-256. RFC 8785 object keys use UTF-16 code-unit ordering; this is deliberately
   different from the Unicode-scalar comparator for domain arrays in rule 5. JSONB stores
   the semantically equivalent sanitized document; it is not claimed to preserve
   canonical byte order. The hash over regenerated canonical bytes is authoritative.

The executable reference is `apps/api/src/services/jira-version-canonical.ts`. The
committed vector under `docs/fixtures/jira-version-hash-v1.*` fixes input,
normalized canonical output, and the expected SHA-256 digest, not merely repeated output
from the implementation under test. Golden tests must additionally prove that key
ordering, pagination order, process restart, and repeated cold runs produce that digest,
while one business-field change produces a different hash. A schema-rule change requires
a new `schemaVersion`; hashes from two schema versions are never interchangeable.
The digest is calculated over the single canonical JSON value without the text file's
final line-feed character.

The canonicalizer rejects a document that still contains attachment structures. The
exported hash helper therefore cannot hash a document that retains forbidden attachment
metadata after the sanitizer/audit boundary in rule 1.

Jira `updated` is part of the content document. Therefore an A -> B -> A business-value
reversion still has a later Jira timestamp and creates a distinct observed version. It
must not be moved to unhashed import metadata.

## Attachment exclusion

Attachment exclusion is defense in depth:

1. No attachment endpoint is allowed or called. Search and issue requests explicitly
   exclude Jira's attachment field.
2. A recursive sanitizer removes case-insensitive `attachment`/`attachments` properties,
   structured attachment objects, attachment changelog items, and ADF `media`,
   `mediaGroup`, `mediaSingle`, and `mediaInline` nodes from descriptions and comments.
   It also removes transient Jira transport fields such as entity `self` links, `expand`,
   avatar/icon URLs, thumbnails, and collection pagination envelopes.
3. A separate recursive audit runs after sanitization. If a forbidden structural key,
   attachment REST object, or attachment changelog item remains, the import fails closed:
   neither the immutable version nor the mutable projection is written.
4. Fixtures cover search results, issue details, changelog, comments, worklogs, and
   remote links, including nested and mixed-case attachment keys.

Text in a description or comment may mention an attachment filename or link. It remains
business text; no attachment binary or attachment metadata endpoint is stored.

## Synchronization and concurrency

- Import is incremental by the Jira `updated` cursor plus stable issue ID, with a bounded
  overlap window, deterministic ordering, bounded pages, retry, and periodic full scope
  reconciliation.
- Hydration must be complete before a version can be committed. A partial or rejected
  observation is durably placed in a per-issue retry queue with reason, attempt count,
  exponential backoff, and next retry time; it is not stored as a full version.
- A batch cursor may advance after either a complete issue transaction or a committed
  retry-queue entry for every issue in the batch. This prevents one permanently malformed
  issue from stalling the scope. Periodic reconciliation and the retry worker keep trying
  quarantined issues, and the administrator view exposes their age and last error.
- A database-backed job lease prevents duplicate workers, but correctness must not depend
  on that lease. Each issue transaction takes a PostgreSQL advisory transaction lock.
- The transaction inserts the immutable version with conflict handling on the idempotency
  constraint, updates the current projection only when the incoming Jira ordering key is
  not older, and inserts deduplicated normalized events.
- The batch cursor advances only after every issue in the batch has a committed version
  transaction or a durable retry-queue entry. A retry after a crash may read the same Jira
  window but cannot create a duplicate version.

The mandatory race test starts worker A, commits a version, simulates a crash before
cursor advancement, then lets worker B replay the same window. Exactly one version must
exist, the current projection must point to it, and the cursor must advance only once the
replayed batch completes. A second test runs concurrent workers after lease expiry and
asserts the same result.

Run the PostgreSQL race gate before merging any change to history persistence or locking:

```sh
export JIRA_HISTORY_TEST_DATABASE_URL='postgresql://.../pms_history_test?schema=public'
npm run test:history:postgres
```

The target must be a disposable database whose name contains `test`. The command fails
when the variable is absent, applies committed migrations, and runs the real Prisma and
PostgreSQL path, including the advisory transaction lock. The ordinary integration suite
may skip this test when no database is configured; that skipped result does not satisfy
the A1 pre-merge gate. Corporate CI prohibits service pods, so the gate uses a separately
provisioned test database rather than starting PostgreSQL inside a runner pod.

## Access and observability

Stage A1 exposes no raw snapshot API. Payload access is limited to the application service
database role and audited system-administrator diagnostics. Aggregate APIs must not log
or return raw descriptions, comments, worklogs, or user payloads.

The administrator view must show actual version count, ticket count, stored bytes,
average/P95 version bytes, last successful cursor, failed batches, and hydration
completeness. Budget levels are 70/85/95%, based on the global primary-database Jira
history allocation. The system never resolves a warning by deleting history.

## Acceptance criteria

- A repeat sync with unchanged Jira content creates zero versions.
- One Jira business-field change creates exactly one `OBSERVED` version.
- Retry and concurrent-sync tests prove idempotency and stale-write protection.
- Attachment fixtures and the post-sanitization audit prove fail-closed exclusion.
- The reference canonicalizer converts the committed input fixture byte-for-byte into
  the committed canonical output and digest; all hash golden fixtures remain stable
  across repeated and cold test runs.
- Existing dashboards retain their current behavior and can rebuild their projection
  from immutable versions.
- Migration and rollback are tested on a copy of production-shaped data.
- Actual storage reporting demonstrates whether 400 tickets times 100 versions stays
  within the 5 GiB global allocation.
- Read-only guard tests prove that A1 adds no Jira business-data write path.

Only after these criteria pass does stage A2 add governed aggregate definitions and the
admin constructor over typed fields and normalized events.
