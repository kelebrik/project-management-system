import {
  createOperation,
  deleteOperation,
  jiraAggregateErrorResponses,
  jiraSemanticQueryRequestBody,
  pathParam,
  projectIdParam,
  securedOperation,
} from "./openapi-helpers.js";

export const openApiJiraPaths = {
    "/api/projects/{projectId}/jira/analytics-facets": {
      get: {
        ...securedOperation(["Jira"], "Read compact Jira analytics coverage and filter facets", [projectIdParam]),
        responses: {
          "200": {
            description: "Compact project-scoped Jira analytics facets",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JiraAnalyticsFacets" } } },
          },
          ...jiraAggregateErrorResponses,
        },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates": {
      get: {
        ...securedOperation(["Jira"], "List published semantic aggregates and dashboard v5", [projectIdParam]),
        responses: {
          "200": { description: "Semantic aggregate catalog and dashboard v5" },
          ...jiraAggregateErrorResponses,
        },
      },
      post: {
        ...createOperation(["Jira"], "Create a semantic aggregate draft as system administrator", [projectIdParam]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              key: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
              definition: { $ref: "#/components/schemas/JiraSemanticAggregateDefinition" },
            },
            required: ["key", "definition"],
          } } },
        },
        responses: {
          "201": { description: "Semantic aggregate draft created" },
          ...jiraAggregateErrorResponses,
        },
      },
    },
    "/api/projects/{projectId}/jira/semantic-dashboard": {
      patch: {
        ...securedOperation(["Jira"], "Save dashboard v5 widgets as system administrator", [projectIdParam]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              config: { $ref: "#/components/schemas/JiraSemanticDashboard" },
              expectedConfigHash: { type: "string", pattern: "^[0-9a-f]{64}$" },
            },
            required: ["config", "expectedConfigHash"],
          } } },
        },
        responses: {
          "200": { description: "Dashboard v5 saved" },
          ...jiraAggregateErrorResponses,
        },
      },
    },
    "/api/projects/{projectId}/jira/goal-labels": {
      patch: {
        ...securedOperation(["Jira"], "Configure local WBS goal to Jira label mappings as system administrator", [projectIdParam]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              goals: {
                type: "array",
                maxItems: 500,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    goalId: { type: "string" },
                    labels: { type: "array", maxItems: 20, items: { type: "string" } },
                  },
                  required: ["goalId", "labels"],
                },
              },
            },
            required: ["goals"],
          } } },
        },
        responses: { "200": { description: "Goal label mappings saved locally" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/bootstrap": {
      post: {
        ...createOperation(["Jira"], "Create the system semantic aggregates as system administrator", [projectIdParam]),
        responses: { "204": { description: "System semantic aggregates are present" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/bootstrap-missing": {
      post: {
        ...createOperation(["Jira"], "Create only missing system semantic aggregates as system administrator", [projectIdParam]),
        responses: { "204": { description: "Missing system semantic aggregates are present; dashboard is unchanged" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/{aggregateId}": {
      patch: {
        ...securedOperation(["Jira"], "Save a new semantic aggregate draft revision", [projectIdParam, pathParam("aggregateId")]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              definition: { $ref: "#/components/schemas/JiraSemanticAggregateDefinition" },
              expectedVersion: { type: "integer", minimum: 1 },
            },
            required: ["definition", "expectedVersion"],
          } } },
        },
        responses: { "200": { description: "Draft revision saved" }, ...jiraAggregateErrorResponses },
      },
      delete: {
        ...deleteOperation(["Jira"], "Archive a custom semantic aggregate", [projectIdParam, pathParam("aggregateId")]),
        parameters: [projectIdParam, pathParam("aggregateId"), { name: "expectedVersion", in: "query", required: true, schema: { type: "integer", minimum: 1 } }],
        responses: { "204": { description: "Semantic aggregate archived" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/{aggregateId}/publish": {
      post: {
        ...securedOperation(["Jira"], "Publish a validated semantic aggregate revision", [projectIdParam, pathParam("aggregateId")]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false,
            properties: { expectedVersion: { type: "integer", minimum: 1 } },
            required: ["expectedVersion"],
          } } },
        },
        responses: { "200": { description: "Semantic aggregate revision published" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/{aggregateId}/sync-gitlab": {
      post: {
        ...securedOperation(["Jira"], "Synchronize a configured GitLab branch using read-only APIs", [projectIdParam, pathParam("aggregateId")]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false,
            properties: { aggregateVersion: { type: "integer", minimum: 1 } },
            required: ["aggregateVersion"],
          } } },
        },
        responses: { "200": { description: "GitLab branch commits persisted locally" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/preview": {
      post: {
        ...securedOperation(["Jira"], "Preview real rows for a semantic aggregate draft", [projectIdParam]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false,
            properties: {
              definition: { $ref: "#/components/schemas/JiraSemanticAggregateDefinition" },
              asOf: { type: ["string", "null"], format: "date-time" },
            },
            required: ["definition"],
          } } },
        },
        responses: { "200": { description: "Semantic aggregate draft preview" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/query-batch": {
      post: {
        ...securedOperation(["Jira"], "Execute visible widgets in a bounded shared data-lake pass", [projectIdParam]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              queries: {
                type: "array",
                minItems: 1,
                maxItems: 100,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    widgetId: { type: "string", minLength: 1, maxLength: 200 },
                    aggregateId: { type: "string", minLength: 1, maxLength: 200 },
                    query: { $ref: "#/components/schemas/JiraSemanticQuery" },
                  },
                  required: ["widgetId", "aggregateId", "query"],
                },
              },
            },
            required: ["queries"],
          } } },
        },
        responses: { "200": { description: "Results for every requested widget" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/{aggregateId}/query": {
      post: {
        ...securedOperation(["Jira"], "Execute widget query against one pinned aggregate revision", [projectIdParam, pathParam("aggregateId")]),
        requestBody: jiraSemanticQueryRequestBody,
        responses: { "200": { description: "Widget query result" }, ...jiraAggregateErrorResponses },
      },
    },
    "/api/projects/{projectId}/jira/semantic-aggregates/{aggregateId}/query.csv": {
      post: {
        ...securedOperation(["Jira"], "Export widget query against one pinned aggregate revision", [projectIdParam, pathParam("aggregateId")]),
        requestBody: jiraSemanticQueryRequestBody,
        responses: {
          "200": { description: "Bounded CSV export", content: { "text/csv": { schema: { type: "string", format: "binary" } } } },
          ...jiraAggregateErrorResponses,
        },
      },
    },
    "/api/projects/{projectId}/jira/current-refresh": {
      post: {
        ...securedOperation(
          ["Jira"],
          "Return freshness and queue a TTL-limited read-only Jira current projection refresh when stale",
          [projectIdParam],
        ),
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", additionalProperties: false },
            },
          },
        },
        responses: {
          "200": { description: "Current projection is fresh or cannot be refreshed" },
          "202": { description: "Current projection refresh is queued or running" },
          "401": { description: "Authentication required" },
          "404": { description: "Project not found or not accessible" },
        },
      },
    },
    "/api/projects/{projectId}/jira/capacity-sample": {
      post: {
        tags: ["Jira"],
        summary: "Measure Jira history capacity using a redacted read-only sample (system admin only)",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["scopeType", "scopeValue"],
                properties: {
                  scopeType: { type: "string", enum: ["LABEL", "EPIC"] },
                  scopeValue: { type: "string", minLength: 1, maxLength: 2000 },
                  sampleSize: { type: "integer", minimum: 10, maximum: 100, default: 20 },
                  storageBudgetGiB: { type: "number", exclusiveMinimum: 0, default: 5 },
                  allocatedHistoryGiB: { type: "number", minimum: 0, default: 0 },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Redacted capacity and security report (schema version 2)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reportVersion", "scope", "security", "projections", "assumptions", "capacityGate"],
                  properties: {
                    reportVersion: { type: "integer", enum: [2] },
                    scope: {
                      type: "object",
                      required: ["type", "value", "tickets", "requestedSample", "observedSample"],
                      properties: {
                        type: { type: "string", enum: ["LABEL", "EPIC"] },
                        value: { type: "string" },
                        tickets: { type: "integer" },
                        requestedSample: { type: "integer" },
                        observedSample: { type: "integer" },
                      },
                    },
                    security: {
                      type: "object",
                      required: ["status", "jiraWrites", "databaseWrites", "issueContentInReport", "attachmentsExcluded", "attachmentFieldExclusionHonored", "attachmentReferencesStripped", "allowedMethodsObserved"],
                      properties: {
                        status: { type: "string", enum: ["PASS", "BLOCKED"] },
                        jiraWrites: { type: "boolean", enum: [false] },
                        databaseWrites: { type: "boolean", enum: [false] },
                        issueContentInReport: { type: "boolean", enum: [false] },
                        attachmentsExcluded: { type: "boolean" },
                        attachmentFieldExclusionHonored: { type: "boolean" },
                        attachmentReferencesStripped: { type: "integer", minimum: 0 },
                        allowedMethodsObserved: { type: "boolean" },
                      },
                    },
                    projections: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["versionsPerTicket", "rawJsonGiB", "estimatedDatabaseGiB", "estimatedGzipArchiveGiB", "threeDatabaseCopiesGiB"],
                        properties: {
                          versionsPerTicket: { type: "integer", enum: [10, 50, 100] },
                          rawJsonGiB: { type: "number" },
                          estimatedDatabaseGiB: { type: "number" },
                          estimatedGzipArchiveGiB: { type: "number" },
                          threeDatabaseCopiesGiB: { type: "number" },
                        },
                      },
                    },
                    assumptions: {
                      type: "object",
                      required: ["projectionUses", "databaseOverheadMultiplier", "referenceDatabaseCopies", "capacityGateVersionsPerTicket", "storageBudgetGiB", "allocatedHistoryGiB"],
                      properties: {
                        projectionUses: { type: "string", enum: ["SAMPLE_P95"] },
                        databaseOverheadMultiplier: { type: "number" },
                        referenceDatabaseCopies: { type: "integer" },
                        capacityGateVersionsPerTicket: { type: "integer", enum: [100] },
                        storageBudgetGiB: { type: "number" },
                        allocatedHistoryGiB: { type: "number" },
                      },
                    },
                    capacityGate: {
                      type: "object",
                      required: ["status", "level", "versionsPerTicket", "projectedTotalDatabaseGiB", "allocatedHistoryGiB", "storageBudgetGiB", "utilizationPercent", "thresholdsPercent", "reasons", "warnings"],
                      properties: {
                        status: { type: "string", enum: ["PASS", "REVIEW_REQUIRED"] },
                        level: { type: "string", enum: ["NORMAL", "WARNING", "HIGH", "CRITICAL", "EXCEEDED"] },
                        versionsPerTicket: { type: "integer", enum: [100] },
                        estimatedDatabaseGiB: { type: "number" },
                        projectedTotalDatabaseGiB: { type: "number" },
                        allocatedHistoryGiB: { type: "number" },
                        storageBudgetGiB: { type: "number" },
                        utilizationPercent: { type: "number" },
                        thresholdsPercent: {
                          type: "object",
                          required: ["warning", "high", "critical"],
                          properties: {
                            warning: { type: "number", enum: [70] },
                            high: { type: "number", enum: [85] },
                            critical: { type: "number", enum: [95] },
                          },
                        },
                        reasons: { type: "array", items: { type: "string" } },
                        warnings: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error" },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator required" },
          "404": { description: "Project not found" },
          "502": { description: "Jira sampling failed" },
        },
      },
    },
    "/api/projects/{projectId}/jira/history-status": {
      get: {
        tags: ["Jira", "Admin"],
        summary: "Read attachment-free Jira history storage and retry diagnostics",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam],
        responses: {
          "200": {
            description: "Stage A1 diagnostics without raw Jira payloads",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["reportVersion", "generatedAt", "storage", "global", "project", "retry", "cursor", "labelChanges"],
                  properties: {
                    reportVersion: { type: "integer", enum: [1] },
                    generatedAt: { type: "string", format: "date-time" },
                    storage: {
                      type: "object",
                      required: ["budgetBytes", "databaseBytes", "utilizationPercent", "level", "newScopeBlocked"],
                      properties: {
                        budgetBytes: { type: "integer" },
                        databaseBytes: { type: "integer" },
                        utilizationPercent: { type: "number" },
                        level: { type: "string", enum: ["NORMAL", "WARNING", "HIGH", "CRITICAL", "EXCEEDED"] },
                        newScopeBlocked: { type: "boolean" },
                      },
                    },
                    global: { $ref: "#/components/schemas/JiraHistoryAggregate" },
                    project: { $ref: "#/components/schemas/JiraHistoryAggregate" },
                    labelChanges: {
                      type: "object",
                      required: ["global", "project"],
                      properties: {
                        global: { type: "integer", minimum: 0 },
                        project: { type: "integer", minimum: 0 },
                      },
                    },
                    retry: {
                      type: "object",
                      required: ["pending", "failedBatches", "oldestFailureAt", "nextRetryAt", "items"],
                      properties: {
                        pending: { type: "integer" },
                        failedBatches: { type: "integer" },
                        oldestFailureAt: { type: ["string", "null"], format: "date-time" },
                        nextRetryAt: { type: ["string", "null"], format: "date-time" },
                        items: {
                          type: "array",
                          maxItems: 20,
                          items: {
                            type: "object",
                            required: ["issueKey", "reasonCode", "attempts", "firstFailedAt", "lastFailedAt", "nextRetryAt", "lastError"],
                            properties: {
                              issueKey: { type: "string" },
                              reasonCode: { type: "string" },
                              attempts: { type: "integer" },
                              firstFailedAt: { type: "string", format: "date-time" },
                              lastFailedAt: { type: "string", format: "date-time" },
                              nextRetryAt: { type: "string", format: "date-time" },
                              lastError: { type: "string", maxLength: 240 },
                            },
                          },
                        },
                      },
                    },
                    cursor: {
                      type: "object",
                      required: ["updatedAt", "jiraIssueId", "lastFullReconciledAt", "fullCursorIssueKey", "fullStartedAt"],
                      properties: {
                        updatedAt: { type: ["string", "null"], format: "date-time" },
                        jiraIssueId: { type: ["string", "null"] },
                        lastFullReconciledAt: { type: ["string", "null"], format: "date-time" },
                        fullCursorIssueKey: { type: ["string", "null"] },
                        fullStartedAt: { type: ["string", "null"], format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator required" },
          "404": { description: "Project not found" },
        },
      },
    },
    "/api/projects/{projectId}/jira/data": {
      delete: {
        tags: ["Jira", "Admin"],
        summary: "Delete imported Jira ticket data for one project",
        description: "Deletes only project-scoped Jira snapshots, immutable versions, derived events, memberships, and retry records. Jira scope and dashboard definitions are preserved.",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam],
        responses: {
          "200": {
            description: "Project Jira data cleared",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "projectId",
                    "ticketsDeleted",
                    "versionsDeleted",
                    "statusTransitionsDeleted",
                    "labelChangesDeleted",
                    "developmentActivitiesDeleted",
                    "membershipsDeleted",
                    "retriesDeleted",
                  ],
                  properties: {
                    projectId: { type: "string" },
                    ticketsDeleted: { type: "integer", minimum: 0 },
                    versionsDeleted: { type: "integer", minimum: 0 },
                    statusTransitionsDeleted: { type: "integer", minimum: 0 },
                    labelChangesDeleted: { type: "integer", minimum: 0 },
                    developmentActivitiesDeleted: { type: "integer", minimum: 0 },
                    membershipsDeleted: { type: "integer", minimum: 0 },
                    retriesDeleted: { type: "integer", minimum: 0 },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator role required" },
          "404": { description: "Project not found" },
          "409": { description: "Jira synchronization is active for this project" },
          "423": { description: "Closed project is read-only" },
        },
      },
    },
    "/api/projects/{projectId}/jira/history/rebuild-projections": {
      post: {
        tags: ["Jira", "Admin"],
        summary: "Rebuild current Jira projections from immutable observed versions",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam],
        responses: {
          "200": {
            description: "Current Jira projections rebuilt without contacting Jira",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["rebuilt", "skippedUnversioned"],
                  properties: {
                    rebuilt: { type: "integer" },
                    skippedUnversioned: { type: "integer" },
                  },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator required" },
          "404": { description: "Project not found" },
          "409": { description: "Jira synchronization or projection rebuild already running" },
        },
      },
    },
    "/api/projects/{projectId}/jira/sync": {
      post: {
        tags: ["Jira"],
        summary: "Synchronize Jira projections and immutable attachment-free history",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      scopeType: { const: "LABEL" },
                      scopeValue: { type: "string", minLength: 1, maxLength: 2000, pattern: "^[^\\s,\"'\\\\]+(?:\\s*,\\s*[^\\s,\"'\\\\]+)*$" },
                      baseUrl: { type: "string", enum: ["https://tasks.dev.sberdevices.ru", "https://tasks.sberdevices.ru"] },
                    },
                    required: ["scopeType", "scopeValue"],
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      scopeType: { const: "EPIC" },
                      scopeValue: { type: "string", minLength: 3, maxLength: 100, pattern: "^[A-Za-z][A-Za-z0-9_]*-[0-9]+$" },
                      baseUrl: { type: "string", enum: ["https://tasks.dev.sberdevices.ru", "https://tasks.sberdevices.ru"] },
                    },
                    required: ["scopeType", "scopeValue"],
                  },
                ],
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Durable Jira synchronization queued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["runId", "status", "statusUrl", "pollAfterMs"],
                  properties: {
                    runId: { type: "string" },
                    status: { type: "string", enum: ["QUEUED"] },
                    statusUrl: { type: "string" },
                    pollAfterMs: { type: "integer", minimum: 3000 },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid Jira scope or sync parameters" },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator role required to change Jira scope" },
          "404": { description: "Project not found" },
          "409": { description: "Jira synchronization already running" },
          "423": { description: "Closed project is read-only" },
          "502": { description: "Jira request failed" },
        },
      },
    },
    "/api/projects/{projectId}/jira/sync-runs/active": {
      get: {
        tags: ["Jira"],
        summary: "Get the active durable Jira synchronization run",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam],
        responses: {
          "200": { description: "Active run or null" },
          "401": { description: "Authentication required" },
          "403": { description: "Project write access required" },
          "404": { description: "Project not found" },
        },
      },
    },
    "/api/projects/{projectId}/jira/sync-runs/{runId}": {
      get: {
        tags: ["Jira"],
        summary: "Poll a durable Jira synchronization run",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam, pathParam("runId")],
        responses: {
          "200": { description: "Run status, bounded progress, metrics and terminal result" },
          "401": { description: "Authentication required" },
          "403": { description: "Project write access required" },
          "404": { description: "Run not found in this project" },
        },
      },
    },
    "/api/projects/{projectId}/jira/backfill": {
      post: {
        tags: ["Jira", "Admin"],
        summary: "Queue a full attachment-free Jira history backfill",
        security: [{ sessionCookie: [] }],
        parameters: [projectIdParam],
        responses: {
          "202": { description: "Backfill queued" },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator required" },
          "409": { description: "History disabled, capacity limit, or another Jira run is active" },
          "423": { description: "Closed project is read-only" },
        },
      },
    },
    "/api/projects/{projectId}/jira/backfill/completeness": {
      get: {
        tags: ["Jira", "Admin"],
        summary: "Get aggregate and bounded paged Jira history completeness",
        security: [{ sessionCookie: [] }],
        parameters: [
          projectIdParam,
          { name: "section", in: "query", schema: { type: "string", enum: ["tickets", "missing"] } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0 } },
          { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: {
          "200": { description: "Completeness aggregate and one bounded ticket page" },
          "401": { description: "Authentication required" },
          "403": { description: "System administrator required" },
          "413": { description: "Requested page exceeds the 10000-row window" },
        },
      },
    },
} as const;
