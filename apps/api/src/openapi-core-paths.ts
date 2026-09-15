import {
  apiSecuredOperation,
  createOperation,
  deleteOperation,
  issueIdParam,
  itemIdParam,
  pathParam,
  projectIdParam,
  securedOperation,
} from "./openapi-helpers.js";

export const openApiCorePaths = {
    "/api/page-visits": {
      post: {
        tags: ["Analytics"],
        summary: "Record a best-effort page view",
        security: [{ sessionCookie: [] }, {}],
        responses: {
          "204": { description: "Recorded or intentionally ignored" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/admin/page-visits": {
      get: securedOperation(["Admin", "Analytics"], "Page visit analytics for system administrators"),
    },
    "/api/business-units": {
      get: {
        tags: ["Projects"],
        summary: "List business units available in the current user context",
        responses: {
          "200": { description: "Available business units" },
        },
      },
    },
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness check",
        responses: {
          "200": { description: "API and database are available" },
          "503": { description: "Database is unavailable" },
        },
      },
    },
    "/api/ready": {
      get: {
        tags: ["Health"],
        summary: "Readiness check for orchestrators",
        responses: {
          "200": { description: "Application is ready to serve traffic" },
          "503": { description: "Application is not ready" },
        },
      },
    },
    "/api/metrics": {
      get: {
        tags: ["Health"],
        summary: "Prometheus metrics",
        responses: {
          "200": { description: "Prometheus text exposition" },
          "401": { description: "METRICS_TOKEN is configured and token is invalid" },
          "503": { description: "Production metrics token is not configured" },
        },
      },
    },
    "/api/auth/keycloak/status": {
      get: {
        tags: ["Auth"],
        summary: "Check whether Keycloak authentication is configured",
        responses: {
          "200": { description: "Keycloak configuration status" },
        },
      },
    },
    "/api/auth/keycloak/login": {
      get: {
        tags: ["Auth"],
        summary: "Start Keycloak authorization code flow",
        responses: {
          "302": { description: "Redirect to Keycloak" },
          "503": { description: "Keycloak is not configured" },
        },
      },
    },
    "/api/auth/keycloak/callback": {
      get: {
        tags: ["Auth"],
        summary: "Complete Keycloak authorization code flow",
        responses: {
          "302": { description: "Session created and browser redirected to the application" },
          "400": { description: "Invalid callback parameters or state" },
        },
      },
    },
    "/api/auth/me": {
      get: securedOperation(["Auth"], "Current authenticated user"),
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Create a session with email and password",
        security: [],
        responses: {
          "200": { description: "Authenticated session" },
          "400": { description: "Invalid credentials payload" },
          "401": { description: "Invalid email or password" },
        },
      },
    },
    "/api/auth/logout": {
      post: securedOperation(["Auth"], "Destroy current session"),
    },
    "/api/search": {
      get: {
        tags: ["Search"],
        summary: "Global search across projects, structure, issues, risks, artifacts and overviews",
        parameters: [
          {
            name: "q",
            in: "query",
            required: true,
            schema: { type: "string", minLength: 2 },
          },
          {
            name: "projectId",
            in: "query",
            required: false,
            schema: { type: "string" },
          },
          {
            name: "types",
            in: "query",
            required: false,
            schema: {
              type: "string",
              description:
                "Comma-separated: project,wbs,issue,decision,risk,artifact,overview",
            },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          "200": { description: "Search results" },
          "400": { description: "Validation error" },
        },
      },
    },
    "/api/saved-views": {
      get: apiSecuredOperation(
        ["SavedViews"],
        "List saved user/shared views for Structure, Gantt and Risks",
      ),
      post: apiSecuredOperation(["SavedViews"], "Create saved view"),
    },
    "/api/saved-views/{viewId}": {
      patch: apiSecuredOperation(["SavedViews"], "Update saved view", [
        pathParam("viewId"),
      ]),
      delete: deleteOperation(["SavedViews"], "Delete saved view", [
        pathParam("viewId"),
      ]),
    },
    "/api/saved-views/{viewId}/use": {
      post: apiSecuredOperation(["SavedViews"], "Mark saved view as used", [
        pathParam("viewId"),
      ]),
    },
    "/api/openapi.json": {
      get: {
        tags: ["Health"],
        summary: "OpenAPI document",
        responses: {
          "200": { description: "OpenAPI 3.1 JSON document" },
        },
      },
    },
    "/api/projects": {
      get: {
        tags: ["Projects"],
        summary: "List projects",
        security: [{ sessionCookie: [] }, { bearerApiToken: [] }],
        responses: {
          "200": {
            description: "Project list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Project" },
                },
              },
            },
          },
          "401": { description: "Authentication required" },
        },
      },
      post: {
        tags: ["Projects"],
        summary: "Create project",
        security: [{ sessionCookie: [] }],
        responses: {
          "201": { description: "Project created" },
          "401": { description: "Authentication required" },
          "403": { description: "Permission denied" },
        },
      },
    },
    "/api/projects/structure-copy-options": {
      get: securedOperation(
        ["Projects"],
        "List active projects and current Structure phases available for copying",
      ),
    },
    "/api/projects/portfolio-roadmap": {
      get: securedOperation(
        ["Projects"],
        "List active projects with the complete WBS hierarchy for the portfolio roadmap",
      ),
    },
    "/api/projects/{projectId}": {
      patch: securedOperation(
        ["Projects"],
        "Update project passport, schedule, status and UI state",
        [projectIdParam],
        "Project updated",
      ),
      delete: deleteOperation(["Projects"], "Delete project with project data cascade", [
        projectIdParam,
      ]),
    },
    "/api/projects/{projectId}/close": {
      post: securedOperation(
        ["Projects", "Admin"],
        "Close project and make it read-only for all roles",
        [projectIdParam],
        "Project closed",
      ),
    },
    "/api/projects/{projectId}/target-date": {
      patch: securedOperation(
        ["Projects"],
        "Update approved project target date with change history",
        [projectIdParam],
        "Project target date updated",
      ),
    },
    "/api/projects/{projectId}/overview": {
      get: {
        tags: ["Projects", "ExecutiveOverview"],
        summary: "Project overview source data for UI",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  itemIds: {
                    type: "array",
                    minItems: 1,
                    maxItems: 500,
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Project details, WBS, issues, risks, critical path" },
          "404": { description: "Project not found" },
        },
      },
    },
    "/api/projects/{projectId}/calendar-overrides": {
      put: securedOperation(
        ["Projects"],
        "Create or update RU/CN project calendar override",
        [projectIdParam],
        "Calendar override saved",
      ),
      delete: deleteOperation(["Projects"], "Delete RU/CN project calendar override", [
        projectIdParam,
      ]),
    },
    "/api/projects/{projectId}/artifact-table": {
      get: securedOperation(["Projects"], "Read dated artifact table", [projectIdParam]),
      put: { ...securedOperation(["Projects"], "Save artifact table with optimistic revision", [projectIdParam]), responses: { "200": { description: "Saved table and revision" }, "400": { description: "Invalid table or foreign attachment" }, "409": { description: "Revision conflict; current table returned" }, "413": { description: "Table exceeds 4 MiB" } } },
    },
    "/api/projects/{projectId}/artifact-table/files": {
      post: { ...securedOperation(["Projects"], "Upload artifact file (3 MiB/file, 30 MiB/project)", [projectIdParam]), requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary" } } } } } }, responses: { "201": { description: "File ID and name" }, "400": { description: "Invalid file" }, "413": { description: "File or project storage limit exceeded" } } },
    },
    "/api/projects/{projectId}/artifact-table/files/{fileId}": {
      get: { ...securedOperation(["Projects"], "Download artifact file", [projectIdParam, pathParam("fileId")]), responses: { "200": { description: "Attachment download", content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } } }, "404": { description: "File not found in this project" } } },
      delete: deleteOperation(["Projects"], "Delete an unreferenced artifact file", [projectIdParam, pathParam("fileId")]),
    },
    "/api/projects/{projectId}/artifacts": {
      post: createOperation(["Projects"], "Create project artifact", [projectIdParam]),
    },
    "/api/project-artifacts/{artifactId}": {
      patch: securedOperation(["Projects"], "Update project artifact", [
        pathParam("artifactId"),
      ]),
      delete: deleteOperation(["Projects"], "Delete project artifact", [
        pathParam("artifactId"),
      ]),
    },
    "/api/projects/{projectId}/artifacts/reorder": {
      post: securedOperation(
        ["Projects"],
        "Persist project artifact row order",
        [projectIdParam],
        "Artifacts reordered",
      ),
    },
    "/api/projects/{projectId}/wbs-items": {
      post: {
        tags: ["WBS"],
        summary: "Create WBS item",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "WBS item created" },
          "423": { description: "Project is closed and read-only" },
        },
      },
      delete: {
        ...securedOperation(
          ["WBS"],
          "Delete selected WBS items",
          [projectIdParam],
          "WBS snapshot after bulk delete",
        ),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  itemIds: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                  },
                },
                required: ["itemIds"],
              },
            },
          },
        },
      },
    },
    "/api/projects/{projectId}/wbs-items/insert-after": {
      post: createOperation(
        ["WBS"],
        "Insert a WBS row after the selected row and renumber structure",
        [projectIdParam],
        "WBS snapshot after insert",
      ),
    },
    "/api/projects/{projectId}/wbs-items/bulk": {
      patch: {
        ...securedOperation(
          ["WBS"],
          "Update multiple WBS items and recalculate the structure once",
          [projectIdParam],
          "WBS snapshot after bulk update",
        ),
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    minItems: 1,
                    maxItems: 500,
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        patch: { type: "object", additionalProperties: true },
                      },
                      required: ["id", "patch"],
                    },
                  },
                  renumber: { type: "boolean", default: false },
                },
                required: ["items"],
              },
            },
          },
        },
      },
    },
    "/api/projects/{projectId}/wbs-snapshot/restore": {
      post: securedOperation(
        ["WBS"],
        "Restore WBS items and dependencies from undo/redo snapshot",
        [projectIdParam],
        "WBS snapshot restored",
      ),
    },
    "/api/projects/{projectId}/wbs-items/renumber": {
      post: securedOperation(
        ["WBS"],
        "Renumber WBS hierarchy after level or order changes",
        [projectIdParam],
        "WBS snapshot renumbered",
      ),
    },
    "/api/projects/{projectId}/wbs-items/reorder": {
      post: securedOperation(
        ["WBS"],
        "Persist drag-and-drop WBS row order",
        [projectIdParam],
        "WBS snapshot reordered",
      ),
    },
    "/api/wbs-items/{itemId}": {
      patch: {
        tags: ["WBS"],
        summary: "Update WBS item",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "itemId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "WBS item updated" },
          "423": { description: "Project is closed and read-only" },
        },
      },
      delete: {
        tags: ["WBS"],
        summary: "Delete WBS item",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "itemId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "204": { description: "WBS item deleted" },
        },
      },
    },
    "/api/wbs-dependencies/{dependencyId}": {
      patch: securedOperation(
        ["WBS"],
        "Move or update a Gantt dependency and sync predecessor fields",
        [pathParam("dependencyId")],
        "WBS snapshot after dependency update",
      ),
      delete: deleteOperation(["WBS"], "Delete Gantt dependency and sync predecessor fields", [
        pathParam("dependencyId"),
      ]),
    },
    "/api/projects/{projectId}/wbs-baseline": {
      post: {
        tags: ["Baseline"],
        summary: "Freeze current WBS as active baseline",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Baseline created or selected rows updated" },
        },
      },
    },
    "/api/projects/{projectId}/wbs-dependencies": {
      post: {
        tags: ["WBS"],
        summary: "Create Gantt dependency and sync WBS predecessor fields",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Dependency created" },
        },
      },
    },
    "/api/projects/{projectId}/jira-integration": {
      put: securedOperation(
        ["Jira"],
        "Create or update project Jira integration settings",
        [projectIdParam],
        "Jira integration saved",
      ),
    },
    "/api/projects/{projectId}/jira-work-sections": {
      put: securedOperation(
        ["Jira"],
        "Create or update project Jira work filter sections",
        [projectIdParam],
        "Jira work sections saved",
      ),
    },
    "/api/projects/{projectId}/open-issues": {
      get: {
        tags: ["OpenIssues"],
        summary: "List project open issues",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Open issue list" },
        },
      },
      post: {
        tags: ["OpenIssues"],
        summary: "Create open issue",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Open issue created" },
        },
      },
    },
    "/api/open-issues/{issueId}": {
      patch: securedOperation(["OpenIssues"], "Update open issue or close it", [issueIdParam]),
    },
    "/api/open-issues/{issueId}/convert-to-problem": {
      post: {
        tags: ["OpenIssues", "Risks"],
        summary: "Convert open issue to RAID problem",
        security: [{ sessionCookie: [] }],
        parameters: [issueIdParam],
        responses: {
          "201": { description: "Open issue converted to problem" },
          "401": { description: "Authentication required" },
          "403": { description: "Permission denied" },
          "404": { description: "Resource not found" },
          "409": { description: "Closed issue cannot be converted" },
          "423": { description: "Project is closed and read-only" },
        },
      },
    },
    "/api/open-issues/{issueId}/jira-links": {
      post: createOperation(["OpenIssues", "Jira"], "Attach Jira ticket to open issue", [
        issueIdParam,
      ]),
    },
    "/api/open-issues/{issueId}/thread-links": {
      post: createOperation(["OpenIssues"], "Attach thread link to open issue", [
        issueIdParam,
      ]),
    },
    "/api/open-issues/{issueId}/status-updates": {
      post: createOperation(
        ["OpenIssues"],
        "Add status update to open issue with the current server date",
        [issueIdParam],
        "Status update created",
      ),
    },
    "/api/open-issues/{issueId}/jira-links/{linkId}": {
      patch: securedOperation(["OpenIssues", "Jira"], "Update Jira ticket key for open issue", [
        issueIdParam,
        pathParam("linkId"),
      ]),
      delete: deleteOperation(["OpenIssues", "Jira"], "Remove Jira ticket from open issue", [
        issueIdParam,
        pathParam("linkId"),
      ]),
    },
    "/api/open-issues/{issueId}/thread-links/{linkId}": {
      patch: securedOperation(["OpenIssues"], "Update open issue thread link", [
        issueIdParam,
        pathParam("linkId"),
      ]),
      delete: deleteOperation(["OpenIssues"], "Remove open issue thread link", [
        issueIdParam,
        pathParam("linkId"),
      ]),
    },
    "/api/tasks/{taskId}/jira-link": {
      patch: securedOperation(["Jira"], "Update Jira link for task snapshot", [
        pathParam("taskId"),
      ]),
    },
    "/api/projects/{projectId}/raid-items": {
      post: {
        tags: ["Risks"],
        summary: "Create risk, problem or assumption",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Risk/problem/assumption created" },
        },
      },
    },
    "/api/raid-items/{itemId}": {
      patch: securedOperation(["Risks"], "Update risk, problem or assumption", [itemIdParam]),
      delete: deleteOperation(["Risks"], "Delete risk, problem or assumption", [itemIdParam]),
    },
    "/api/raid-items/{itemId}/status-updates": {
      post: createOperation(["Risks"], "Append dated status update to risk/problem record", [
        itemIdParam,
      ]),
    },
    "/api/projects/{projectId}/change-requests": {
      post: createOperation(["Projects"], "Create project change request", [projectIdParam]),
    },
    "/api/change-requests/{requestId}": {
      patch: securedOperation(["Projects"], "Update project change request", [
        pathParam("requestId"),
      ]),
      delete: deleteOperation(["Projects"], "Delete project change request", [
        pathParam("requestId"),
      ]),
    },
    "/api/projects/{projectId}/milestones": {
      post: createOperation(["Projects"], "Create manual project milestone", [projectIdParam]),
    },
    "/api/milestones/{milestoneId}": {
      patch: securedOperation(["Projects"], "Update manual project milestone", [
        pathParam("milestoneId"),
      ]),
    },
} as const;
