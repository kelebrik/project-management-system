import {
  jiraAnalyticsFilterFields,
  jiraAnalyticsFilterOperators,
  jiraAnalyticsGroupings,
  jiraAnalyticsMetrics,
  jiraAnalyticsSortDirections,
  jiraAnalyticsSortFields,
  jiraSemanticAggregateGrains,
} from "@pms/shared";

const jiraAnalyticsOpenApiFields = jiraAnalyticsFilterFields;

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

const jiraAggregateErrorResponses = {
  "400": { description: "Validation error" },
  "401": { description: "Authentication required" },
  "403": { description: "Permission denied" },
  "404": { description: "Resource not found" },
  "409": { description: "Version, usage, or dashboard configuration conflict" },
  "413": { description: "The project analytics issue, event, group, or page-window limit was exceeded" },
  "423": { description: "Project is closed and read-only" },
  "500": { description: "Runtime locale support is unavailable" },
};

const jiraSemanticQueryRequestBody = {
  required: true,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/JiraSemanticQuery" },
    },
  },
};

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
    { name: "Analytics" },
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
      JiraHistoryAggregate: {
        type: "object",
        required: ["versions", "tickets", "payloadBytes", "averageBytes", "p95Bytes", "incompleteHydration", "attachmentReferencesStripped"],
        properties: {
          versions: { type: "integer" },
          tickets: { type: "integer" },
          payloadBytes: { type: "integer" },
          averageBytes: { type: "integer" },
          p95Bytes: { type: "integer" },
          incompleteHydration: { type: "integer" },
          attachmentReferencesStripped: { type: "integer" },
        },
      },
      JiraAnalyticsFilter: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 200 },
          field: {
            type: "string",
            enum: jiraAnalyticsOpenApiFields,
          },
          operator: {
            type: "string",
            enum: jiraAnalyticsFilterOperators,
          },
          value: { type: "string", maxLength: 1000 },
        },
        required: ["id", "field", "operator", "value"],
      },
      JiraSemanticAggregateDefinition: {
        type: "object",
        additionalProperties: false,
        properties: {
          schemaVersion: { type: "integer", const: 5 },
          name: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", maxLength: 1000 },
          grain: { type: "string", enum: jiraSemanticAggregateGrains },
          basePopulation: {
            type: "object",
            additionalProperties: false,
            properties: {
              logic: { type: "string", enum: ["and", "or"] },
              filters: { type: "array", maxItems: 30, items: { $ref: "#/components/schemas/JiraAnalyticsFilter" } },
            },
            required: ["logic", "filters"],
          },
          rowConfig: { type: "object" },
          rowIdentity: { type: "array", minItems: 1, maxItems: 10, uniqueItems: true, items: { type: "string", enum: ["rowId", ...jiraAnalyticsOpenApiFields] } },
          outputFields: {
            type: "array",
            minItems: 1,
            maxItems: jiraAnalyticsOpenApiFields.length,
            uniqueItems: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                key: { type: "string", enum: jiraAnalyticsOpenApiFields },
                label: { type: "string", minLength: 1, maxLength: 200 },
                type: { type: "string", enum: ["text", "number", "boolean", "date", "url"] },
                nullable: { type: "boolean" },
              },
              required: ["key", "label", "type", "nullable"],
            },
          },
          incompleteDataPolicy: { type: "string", enum: ["exclude", "includeWithWarning"] },
          qualityRules: {
            type: "object",
            additionalProperties: false,
            properties: {
              minimumCoveragePercent: { type: "number", minimum: 0, maximum: 100 },
              maximumRows: { type: "integer", minimum: 1, maximum: 1000000 },
              maximumRowsPerIssue: { type: "integer", minimum: 1, maximum: 10000 },
            },
            required: ["minimumCoveragePercent", "maximumRows", "maximumRowsPerIssue"],
          },
          timeZone: { type: "string", enum: ["Europe/Moscow", "UTC"] },
          asOfSupport: { type: "string", enum: ["none", "supported"] },
        },
        required: ["schemaVersion", "name", "description", "grain", "basePopulation", "rowConfig", "rowIdentity", "outputFields", "incompleteDataPolicy", "qualityRules", "timeZone", "asOfSupport"],
      },
      JiraSemanticWidget: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1, maxLength: 200 },
          title: { type: "string", minLength: 1, maxLength: 200 },
          aggregateId: { type: "string", minLength: 1, maxLength: 200 },
          aggregateVersion: { type: "integer", minimum: 1 },
          placement: { type: "string", enum: ["active", "retro"] },
          selectedFields: { type: "array", minItems: 1, maxItems: jiraAnalyticsOpenApiFields.length, uniqueItems: true, items: { type: "string", enum: jiraAnalyticsOpenApiFields } },
          filterLogic: { type: "string", enum: ["and", "or"] },
          filters: { type: "array", maxItems: 30, items: { $ref: "#/components/schemas/JiraAnalyticsFilter" } },
          dateField: { type: ["string", "null"], enum: [...jiraAnalyticsOpenApiFields, null] },
          asOf: { type: ["string", "null"], format: "date-time" },
          metric: { type: "string", enum: jiraAnalyticsMetrics },
          groupBy: { type: "string", enum: jiraAnalyticsGroupings },
          sortBy: { type: "string", enum: jiraAnalyticsSortFields },
          sortDirection: { type: "string", enum: jiraAnalyticsSortDirections },
          visualization: { type: "string", enum: ["number", "bar", "table"] },
          width: { type: "string", enum: ["half", "full"] },
        },
        required: ["id", "title", "aggregateId", "aggregateVersion", "placement", "selectedFields", "filterLogic", "filters", "dateField", "asOf", "metric", "groupBy", "sortBy", "sortDirection", "visualization", "width"],
      },
      JiraSemanticDashboard: {
        type: "object",
        additionalProperties: false,
        properties: {
          version: { type: "integer", const: 5 },
          periodDays: { type: "integer", enum: [30, 90, 180, 365] },
          assignee: { type: "string", maxLength: 200 },
          widgets: { type: "array", maxItems: 100, items: { $ref: "#/components/schemas/JiraSemanticWidget" } },
        },
        required: ["version", "periodDays", "assignee", "widgets"],
      },
      JiraSemanticQuery: {
        type: "object",
        additionalProperties: false,
        properties: {
          aggregateVersion: { type: "integer", minimum: 1 },
          selectedFields: { type: "array", minItems: 1, maxItems: jiraAnalyticsOpenApiFields.length, uniqueItems: true, items: { type: "string", enum: jiraAnalyticsOpenApiFields } },
          metric: { type: "string", enum: jiraAnalyticsMetrics },
          groupBy: { type: "string", enum: jiraAnalyticsGroupings },
          filters: { type: "array", maxItems: 30, items: { $ref: "#/components/schemas/JiraAnalyticsFilter" } },
          filterLogic: { type: "string", enum: ["and", "or"] },
          periodDays: { type: ["integer", "null"], enum: [30, 90, 180, 365, null] },
          dateField: { type: ["string", "null"], enum: [...jiraAnalyticsOpenApiFields, null] },
          assignee: { type: "string", maxLength: 200 },
          sortBy: { type: "string", enum: jiraAnalyticsSortFields },
          sortDirection: { type: "string", enum: jiraAnalyticsSortDirections },
          page: { type: "integer", minimum: 1, maximum: 100000 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          groupKey: { type: "string", maxLength: 500 },
          asOf: { type: ["string", "null"], format: "date-time" },
        },
        required: ["aggregateVersion", "selectedFields", "metric", "groupBy", "filters", "filterLogic", "periodDays", "dateField", "assignee", "sortBy", "sortDirection"],
      },
      JiraAggregateEvaluationResult: {
        type: "object",
        properties: {
          evaluatedAt: { type: "string", format: "date-time" },
          effective: { type: "object" },
          value: { type: "number" },
          groups: { type: "array", items: { type: "object" } },
          records: { type: "array", items: { type: "object" } },
          totalRecords: { type: "integer", minimum: 0 },
          page: { type: "integer", minimum: 1, maximum: 100000 },
          pageSize: { type: "integer", minimum: 1, maximum: 100 },
          quality: { $ref: "#/components/schemas/JiraAnalyticsDataQuality" },
          reconstruction: { $ref: "#/components/schemas/JiraAsOfReconstruction" },
        },
        required: ["evaluatedAt", "effective", "value", "groups", "records", "totalRecords", "page", "pageSize", "quality"],
      },
      JiraAnalyticsDataQuality: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", enum: ["COMPLETE", "PARTIAL", "NO_DATA", "UNAVAILABLE"] },
          basis: { type: "string", enum: ["CURRENT_PROJECTION", "OBSERVED_VERSIONS"] },
          source: { type: "string", enum: ["issues", "transitions", "development", "criticalBugs", "statusIntervals"] },
          population: { type: "integer", minimum: 0 },
          complete: { type: "integer", minimum: 0 },
          incomplete: { type: "integer", minimum: 0 },
          coveragePercent: { type: ["number", "null"], minimum: 0, maximum: 100 },
          oldestObservedAt: { type: ["string", "null"], format: "date-time" },
          latestObservedAt: { type: ["string", "null"], format: "date-time" },
          warnings: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "NO_SOURCE_POPULATION", "INCOMPLETE_TRANSITION_HISTORY", "MISSING_ISSUE_CREATED_AT",
                    "INCOMPLETE_DEVELOPMENT_DATA", "INCOMPLETE_CRITICAL_SLA",
                    "MISSING_HISTORICAL_OBSERVATION", "BEFORE_HISTORY_START", "HISTORY_WRITE_GAP",
                  ],
                },
                count: { type: "integer", minimum: 0 },
              },
              required: ["code", "count"],
            },
          },
        },
        required: [
          "status", "basis", "source", "population", "complete", "incomplete",
          "coveragePercent", "oldestObservedAt", "latestObservedAt", "warnings",
        ],
      },
      JiraAsOfReconstruction: {
        type: "object",
        additionalProperties: false,
        properties: {
          mode: { type: "string", const: "AS_OF" },
          provenance: { type: "string", const: "RECONSTRUCTED" },
          basis: { type: "string", const: "OBSERVED_VERSIONS" },
          asOf: { type: "string", format: "date-time" },
          tickets: { type: "integer", minimum: 0 },
          ticketsWithoutObservation: { type: "integer", minimum: 0 },
          ticketsRetiredAfterAsOf: { type: "integer", minimum: 0 },
          versionRowsScanned: { type: "integer", minimum: 0, maximum: 200000 },
          earliestObservationAt: { type: ["string", "null"], format: "date-time" },
          stalenessHours: {
            oneOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  p50: { type: "number", minimum: 0 },
                  p95: { type: "number", minimum: 0 },
                  max: { type: "number", minimum: 0 },
                },
                required: ["p50", "p95", "max"],
              },
            ],
          },
          beforeHistoryStart: { type: "boolean" },
          historyWriteGap: {
            type: "object",
            additionalProperties: false,
            properties: {
              includesAsOf: { type: "boolean" },
              runs: { type: "integer", minimum: 0 },
              firstAt: { type: ["string", "null"], format: "date-time" },
              lastAt: { type: ["string", "null"], format: "date-time" },
            },
            required: ["includesAsOf", "runs", "firstAt", "lastAt"],
          },
          quality: {
            type: "string",
            enum: ["AVAILABLE", "UNAVAILABLE_HISTORY_WRITE_GAP"],
          },
        },
        required: [
          "mode", "provenance", "basis", "asOf", "tickets", "ticketsWithoutObservation",
          "ticketsRetiredAfterAsOf", "versionRowsScanned", "earliestObservationAt",
          "stalenessHours", "beforeHistoryStart", "historyWriteGap", "quality",
        ],
      },
      JiraAnalyticsFacets: {
        type: "object",
        additionalProperties: false,
        properties: {
          issueCount: { type: "integer", minimum: 0 },
          activeIssueCount: { type: "integer", minimum: 0 },
          transitionHistoryCompleteCount: { type: "integer", minimum: 0 },
          developmentDataAvailableCount: { type: "integer", minimum: 0 },
          criticalSlaTrackedCount: { type: "integer", minimum: 0 },
          criticalSlaReadyCount: { type: "integer", minimum: 0 },
          latestSyncedAt: { type: ["string", "null"], format: "date-time" },
          assignees: { type: "array", maxItems: 500, items: { type: "string" } },
          assigneesTruncated: { type: "boolean" },
        },
        required: [
          "issueCount", "activeIssueCount", "transitionHistoryCompleteCount",
          "developmentDataAvailableCount", "criticalSlaTrackedCount", "criticalSlaReadyCount",
          "latestSyncedAt", "assignees", "assigneesTruncated",
        ],
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
    "/api/admin/wbs-tombstones/{tombstoneId}/restore": {
      post: {
        ...securedOperation(
          ["Admin", "Audit", "WBS"],
          "Restore deleted WBS items from a 30-day tombstone",
          [pathParam("tombstoneId")],
          "WBS items restored into a new phase",
        ),
        responses: {
          "200": { description: "WBS items restored into a new phase" },
          "400": { description: "Tombstone payload cannot be restored" },
          "401": { description: "Authentication required" },
          "403": { description: "Admin role required" },
          "404": { description: "Tombstone not found" },
          "409": { description: "Tombstone already restored" },
          "410": { description: "Tombstone retention period expired" },
        },
      },
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
