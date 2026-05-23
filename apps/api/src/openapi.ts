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
            enum: ["PHASE", "WORK_PACKAGE", "DELIVERABLE", "MILESTONE", "TASK"],
          },
          status: {
            type: "string",
            enum: ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE", "CANCELLED"],
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
          calendarCode: { type: "string", enum: ["RU", "CN"] },
          jiraTicketKey: { type: ["string", "null"] },
          jiraTicketUrl: { type: ["string", "null"], format: "uri" },
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
        },
        required: ["id", "projectId", "title", "severity", "status"],
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
    "/api/projects/{projectId}/overview": {
      get: {
        tags: ["Projects", "ExecutiveOverview"],
        summary: "Project overview source data for UI",
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Project details, WBS, issues, risks, critical path" },
          "404": { description: "Project not found" },
        },
      },
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
    "/api/projects/{projectId}/wbs-baseline": {
      post: {
        tags: ["Baseline"],
        summary: "Freeze current WBS as active baseline",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Baseline created" },
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
    "/api/projects/{projectId}/jira/sync": {
      post: {
        tags: ["Jira"],
        summary: "Synchronize configured Jira JQL into snapshots",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Jira snapshots synchronized" },
          "400": { description: "Jira integration is not configured for project" },
          "502": { description: "Jira request failed" },
        },
      },
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
