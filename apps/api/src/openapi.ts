const pathParam = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
});

const securedOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
  successDescription = "Operation completed",
) => ({
  tags,
  summary,
  security: [{ sessionCookie: [] }],
  ...(parameters.length > 0 ? { parameters } : {}),
  responses: {
    "200": { description: successDescription },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission denied" },
    "404": { description: "Resource not found" },
    "423": { description: "Project is closed and read-only" },
  },
});

const apiSecuredOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
  successDescription = "Operation completed",
) => ({
  ...securedOperation(tags, summary, parameters, successDescription),
  security: [{ sessionCookie: [] }, { bearerApiToken: [] }],
});

const createOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
  successDescription = "Created",
) => ({
  ...securedOperation(tags, summary, parameters, successDescription),
  responses: {
    "201": { description: successDescription },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission denied" },
    "404": { description: "Resource not found" },
    "423": { description: "Project is closed and read-only" },
  },
});

const deleteOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
) => ({
  ...securedOperation(tags, summary, parameters, "Deleted"),
  responses: {
    "204": { description: "Deleted" },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission denied" },
    "404": { description: "Resource not found" },
    "423": { description: "Project is closed and read-only" },
  },
});

const projectIdParam = pathParam("projectId");
const itemIdParam = pathParam("itemId");
const issueIdParam = pathParam("issueId");

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Project Management System API",
    version: "0.1.0",
    description:
      "REST API для портфеля проектов, Структуры, Гантта, открытых вопросов, рисков, базового плана и административного контура.",
  },
  servers: [
    {
      url: "/",
      description: "Текущий хост приложения",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Projects" },
    { name: "WBS" },
    { name: "Baseline" },
    { name: "OpenIssues" },
    { name: "Risks" },
    { name: "Jira" },
    { name: "ExecutiveOverview" },
    { name: "Search" },
    { name: "SavedViews" },
    { name: "Integrations" },
    { name: "Admin" },
    { name: "Audit" },
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: "apiKey",
        in: "cookie",
        name: "pms_session",
      },
      bearerApiToken: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "pms_* API token",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
      Project: {
        type: "object",
        properties: {
          id: { type: "string" },
          code: { type: "string" },
          name: { type: "string" },
          status: { type: "string", enum: ["DRAFT", "ACTIVE", "ON_HOLD", "CLOSED"] },
          rag: { type: "string", enum: ["GREEN", "AMBER", "RED"] },
          projectManager: { type: "string" },
          startDate: { type: "string", format: "date-time" },
          initialTargetDate: { type: ["string", "null"], format: "date-time" },
          targetDate: { type: "string", format: "date-time" },
          progress: { type: "integer", minimum: 0, maximum: 100 },
          scheduleVariance: { type: "integer" },
        },
        required: ["id", "code", "name", "status"],
      },
      WbsItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          code: { type: "string" },
          title: { type: "string" },
          type: {
            type: "string",
            enum: ["PHASE", "WORK_PACKAGE", "DELIVERABLE", "MILESTONE", "GOAL", "TASK"],
          },
          status: {
            type: "string",
            enum: ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED", "DONE", "CANCELLED"],
          },
          owner: { type: "string" },
          startDate: { type: ["string", "null"], format: "date-time" },
          dueDate: { type: ["string", "null"], format: "date-time" },
          predecessor1: { type: ["string", "null"] },
          predecessor2: { type: ["string", "null"] },
          predecessor3: { type: ["string", "null"] },
          predecessor4: { type: ["string", "null"] },
          predecessor5: { type: ["string", "null"] },
          predecessor6: { type: ["string", "null"] },
          calendarCode: { type: "string", enum: ["RU", "CN", "RU_CN"] },
          effortPercent: { type: "integer", minimum: 0, maximum: 100 },
          jiraTicketKey: { type: ["string", "null"] },
          jiraTicketUrl: { type: ["string", "null"], format: "uri" },
          mattermostUrl: { type: ["string", "null"], format: "uri" },
          comment: { type: ["string", "null"] },
        },
        required: ["id", "projectId", "code", "title", "type", "status"],
      },
      WbsDependency: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          predecessorId: { type: "string" },
          successorId: { type: "string" },
          type: { type: "string", enum: ["FS", "SS", "FF", "SF"] },
          lagDays: { type: "integer" },
        },
        required: ["id", "projectId", "predecessorId", "successorId", "type"],
      },
      OpenIssue: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          title: { type: "string" },
          severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
          status: { type: "string" },
          owner: { type: "string" },
          dueDate: { type: ["string", "null"], format: "date-time" },
          jiraTicketKey: { type: ["string", "null"] },
          jiraTicketUrl: { type: ["string", "null"], format: "uri" },
          decisionRequired: { type: "boolean" },
          statusUpdates: {
            type: "array",
            items: { $ref: "#/components/schemas/IssueStatusUpdate" },
          },
        },
        required: ["id", "projectId", "title", "severity", "status"],
      },
      IssueStatusUpdate: {
        type: "object",
        properties: {
          id: { type: "string" },
          issueId: { type: "string" },
          statusAt: { type: "string", format: "date-time" },
          text: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
        required: ["id", "issueId", "statusAt", "text"],
      },
      RaidItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          type: { type: "string", enum: ["RISK", "ASSUMPTION", "DEPENDENCY"] },
          title: { type: "string" },
          owner: { type: "string" },
          status: {
            type: "string",
            enum: ["OPEN", "IN_PROGRESS", "MITIGATED", "VALIDATED", "BREACHED", "CLOSED"],
          },
          riskScore: { type: "integer" },
          jiraTicketKey: { type: ["string", "null"] },
          jiraTicketUrl: { type: ["string", "null"], format: "uri" },
        },
        required: ["id", "projectId", "type", "title", "status"],
      },
    },
  },
  paths: {
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
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login and create session cookie",
        responses: {
          "200": { description: "Authenticated" },
          "401": { description: "Invalid credentials" },
        },
      },
    },
    "/api/auth/setup-status": {
      get: {
        tags: ["Auth"],
        summary: "Check whether the first administrator has to be bootstrapped",
        responses: {
          "200": { description: "Bootstrap status" },
        },
      },
    },
    "/api/auth/bootstrap": {
      post: {
        tags: ["Auth"],
        summary: "Create the first administrator account",
        responses: {
          "201": { description: "Administrator created and authenticated" },
          "400": { description: "Validation error or bootstrap is disabled" },
        },
      },
    },
    "/api/auth/me": {
      get: securedOperation(["Auth"], "Current authenticated user"),
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
        summary: "List projects. Available without authentication in read-only mode.",
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
    "/api/open-issues/{issueId}/status-updates": {
      post: createOperation(
        ["OpenIssues"],
        "Add dated status update to open issue",
        [issueIdParam],
        "Status update created",
      ),
    },
    "/api/open-issues/{issueId}/jira-links/{linkId}": {
      delete: deleteOperation(["OpenIssues", "Jira"], "Remove Jira ticket from open issue", [
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
    "/api/projects/{projectId}/jira/sync": {
      post: {
        tags: ["Jira"],
        summary: "Synchronize configured Jira work section filters into snapshots",
        security: [{ sessionCookie: [] }],
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
                  baseUrl: {
                    type: "string",
                    enum: [
                      "https://tasks.dev.sberdevices.ru",
                      "https://tasks.sberdevices.ru",
                    ],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Jira snapshots synchronized",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    synced: { type: "number" },
                    configuredSections: { type: "number" },
                    totalSections: { type: "number" },
                    jiraUsers: {
                      type: "array",
                      items: { type: "string" },
                    },
                    sections: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          sortOrder: { type: "number" },
                          issues: { type: "number" },
                          jiraUser: { type: ["string", "null"] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "404": { description: "Project not found" },
          "502": { description: "Jira request failed" },
        },
      },
    },
    "/api/executive-overviews/{overviewId}/status": {
      post: securedOperation(
        ["ExecutiveOverview"],
        "Move executive overview through review or approval workflow",
        [pathParam("overviewId")],
        "Executive overview status updated",
      ),
    },
    "/api/executive-overviews/{overviewId}/publish": {
      post: securedOperation(
        ["ExecutiveOverview"],
        "Publish approved executive overview version",
        [pathParam("overviewId")],
        "Executive overview published",
      ),
    },
    "/api/executive-overviews/{overviewId}/export.json": {
      get: securedOperation(
        ["ExecutiveOverview"],
        "Export executive overview version as JSON",
        [pathParam("overviewId")],
        "JSON export",
      ),
    },
    "/api/executive-overviews/{overviewId}/export.html": {
      get: securedOperation(
        ["ExecutiveOverview"],
        "Export executive overview version as standalone HTML",
        [pathParam("overviewId")],
        "HTML export",
      ),
    },
    "/api/projects/{projectId}/executive-overviews/generate": {
      post: {
        tags: ["ExecutiveOverview"],
        summary: "Generate executive overview version",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Overview version generated" },
        },
      },
    },
    "/api/project-modules": {
      get: {
        tags: ["Admin"],
        summary: "Visible project module configuration",
        responses: {
          "200": { description: "Project module visibility settings" },
        },
      },
    },
    "/api/users": {
      get: securedOperation(["Admin"], "List users for administration"),
      post: createOperation(["Admin"], "Create user"),
    },
    "/api/users/{userId}": {
      patch: securedOperation(["Admin"], "Update user profile, role or active flag", [
        pathParam("userId"),
      ]),
    },
    "/api/users/{userId}/password": {
      post: securedOperation(["Admin"], "Change user password and revoke sessions", [
        pathParam("userId"),
      ]),
    },
    "/api/audit-events": {
      get: {
        tags: ["Audit"],
        summary: "Audit log for administrators",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Audit events" },
          "403": { description: "Admin role required" },
        },
      },
    },
    "/api/admin/system-health": {
      get: securedOperation(["Admin"], "System health for Admin Back Office"),
    },
    "/api/admin/integrations": {
      get: apiSecuredOperation(
        ["Admin", "Integrations"],
        "API tokens, webhooks and enterprise integration settings",
      ),
    },
    "/api/admin/api-tokens": {
      post: apiSecuredOperation(["Admin", "Integrations"], "Create API token"),
    },
    "/api/admin/api-tokens/{tokenId}": {
      patch: apiSecuredOperation(["Admin", "Integrations"], "Update API token", [
        pathParam("tokenId"),
      ]),
      delete: deleteOperation(["Admin", "Integrations"], "Disable API token", [
        pathParam("tokenId"),
      ]),
    },
    "/api/admin/webhooks": {
      post: apiSecuredOperation(["Admin", "Integrations"], "Create webhook endpoint"),
    },
    "/api/admin/webhooks/{endpointId}": {
      patch: apiSecuredOperation(["Admin", "Integrations"], "Update webhook endpoint", [
        pathParam("endpointId"),
      ]),
      delete: deleteOperation(["Admin", "Integrations"], "Disable webhook endpoint", [
        pathParam("endpointId"),
      ]),
    },
    "/api/admin/webhooks/{endpointId}/test": {
      post: apiSecuredOperation(["Admin", "Integrations"], "Send test webhook event", [
        pathParam("endpointId"),
      ]),
    },
    "/api/admin/backup-status": {
      get: securedOperation(["Admin"], "Backup and restore status for Admin Back Office"),
    },
    "/api/admin/config/export": {
      get: securedOperation(["Admin"], "Export admin configuration"),
    },
    "/api/admin/config/import": {
      post: securedOperation(["Admin"], "Import admin configuration"),
    },
    "/api/admin/project-modules": {
      put: securedOperation(["Admin"], "Update project module visibility settings"),
    },
    "/api/admin/projects/{projectId}/business-unit": {
      patch: securedOperation(["Admin"], "Move a project subtree to another business unit", [
        pathParam("projectId"),
      ]),
    },
    "/api/admin/role-permissions/{permissionId}": {
      patch: securedOperation(["Admin"], "Enable or disable role permission", [
        pathParam("permissionId"),
      ]),
    },
    "/api/admin/dictionary-items": {
      post: createOperation(["Admin"], "Create or upsert dictionary item"),
    },
    "/api/admin/dictionary-items/{itemId}": {
      patch: securedOperation(["Admin"], "Update dictionary item", [pathParam("itemId")]),
      delete: deleteOperation(["Admin"], "Deactivate dictionary item", [pathParam("itemId")]),
    },
    "/api/admin/system-settings": {
      put: securedOperation(["Admin"], "Update system settings including Jira settings"),
    },
    "/api/admin/config": {
      get: {
        tags: ["Admin"],
        summary: "Admin back office configuration",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Roles, permissions, dictionaries, settings" },
        },
      },
    },
  },
} as const;
