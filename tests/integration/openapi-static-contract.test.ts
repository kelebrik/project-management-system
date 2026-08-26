import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { openApiDocument } from "../../apps/api/src/openapi.ts";

type HttpMethod = "get" | "post" | "patch" | "put" | "delete";

const httpMethods = new Set<HttpMethod>(["get", "post", "patch", "put", "delete"]);
const repoRoot = process.cwd();
const serverFile = path.join(repoRoot, "apps/api/src/server.ts");
const routesDir = path.join(repoRoot, "apps/api/src/routes");

function normalizeExpressPath(routePath: string) {
  const apiPath = routePath.startsWith("/api") ? routePath : `/api${routePath}`;
  return apiPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function readRouteSources() {
  return [
    serverFile,
    ...fs
      .readdirSync(routesDir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => path.join(routesDir, file)),
  ];
}

function collectExpressRoutes() {
  const routes: Array<{ method: HttpMethod; path: string; source: string }> = [];
  const routePattern = /\b(?:app|router)\.(get|post|patch|put|delete)\(\s*["']([^"']+)["']/g;

  for (const source of readRouteSources()) {
    const content = fs.readFileSync(source, "utf8");
    let match: RegExpExecArray | null;

    while ((match = routePattern.exec(content))) {
      const method = match[1] as HttpMethod;
      const rawPath = match[2];

      routes.push({
        method,
        path: normalizeExpressPath(rawPath),
        source: path.relative(repoRoot, source),
      });
    }
  }

  return routes;
}

function collectOpenApiOperations() {
  const operations = new Set<string>();

  for (const [apiPath, pathItem] of Object.entries(openApiDocument.paths)) {
    for (const method of Object.keys(pathItem)) {
      if (httpMethods.has(method as HttpMethod)) {
        operations.add(`${method.toUpperCase()} ${apiPath}`);
      }
    }
  }

  return operations;
}

test("OpenAPI covers every concrete Express API route", () => {
  const openApiOperations = collectOpenApiOperations();
  const missing = collectExpressRoutes()
    .map((route) => ({
      key: `${route.method.toUpperCase()} ${route.path}`,
      source: route.source,
    }))
    .filter((route) => !openApiOperations.has(route.key));

  assert.deepEqual(
    missing,
    [],
    `OpenAPI is missing operations:\n${missing.map((route) => `${route.key} (${route.source})`).join("\n")}`,
  );
});

test("OpenAPI operations define responses and protect mutating endpoints", () => {
  const publicMutations = new Set(["POST /api/auth/bootstrap", "POST /api/auth/login"]);

  for (const [apiPath, pathItem] of Object.entries(openApiDocument.paths)) {
    assert.ok(apiPath.startsWith("/api/"), `OpenAPI path must start with /api/: ${apiPath}`);

    for (const [method, rawOperation] of Object.entries(pathItem)) {
      if (!httpMethods.has(method as HttpMethod)) continue;

      const operation = rawOperation as {
        responses?: Record<string, unknown>;
        security?: unknown;
      };
      const operationKey = `${method.toUpperCase()} ${apiPath}`;

      assert.ok(operation.responses, `${operationKey} must define responses`);
      assert.ok(
        Object.keys(operation.responses).length > 0,
        `${operationKey} must define at least one response`,
      );

      if (method !== "get" && !publicMutations.has(operationKey)) {
        assert.ok(
          Array.isArray(operation.security) && operation.security.length > 0,
          `${operationKey} mutates state and must declare auth security`,
        );
      }
    }
  }
});

test("OpenAPI keeps required production endpoints documented", () => {
  const requiredOperations = [
    "GET /api/health",
    "GET /api/ready",
    "GET /api/metrics",
    "GET /api/openapi.json",
    "GET /api/projects",
    "POST /api/projects",
    "GET /api/projects/{projectId}/overview",
    "GET /api/projects/{projectId}/open-issues",
    "POST /api/projects/{projectId}/wbs-baseline",
    "POST /api/projects/{projectId}/wbs-dependencies",
    "GET /api/search",
    "GET /api/saved-views",
    "GET /api/admin/config",
    "GET /api/admin/system-health",
    "GET /api/admin/backup-status",
  ];
  const operations = collectOpenApiOperations();

  for (const operation of requiredOperations) {
    assert.ok(operations.has(operation), `Expected OpenAPI operation ${operation}`);
  }
});

test("OpenAPI describes the managed Jira aggregate concurrency and payload contract", () => {
  const document = openApiDocument as unknown as {
    components: { schemas: Record<string, Record<string, unknown>> };
    paths: Record<string, Record<string, any>>;
  };
  const definition = document.components.schemas.JiraAggregateDefinition;
  assert.equal(definition?.type, "object");
  assert.equal(definition?.additionalProperties, false);
  assert.equal("allOf" in (definition ?? {}), false);

  const mutationPaths = [
    "/api/projects/{projectId}/jira/aggregates",
    "/api/projects/{projectId}/jira/aggregates/{aggregateId}",
    "/api/projects/{projectId}/jira/aggregates/import-dashboard",
    "/api/projects/{projectId}/jira/aggregates/convert-dashboard",
    "/api/projects/{projectId}/jira/aggregates/switch-dashboard",
    "/api/projects/{projectId}/jira/aggregates/rollback-dashboard",
    "/api/projects/{projectId}/jira/aggregates/reconcile-dashboard",
    "/api/projects/{projectId}/jira/analytics-dashboard",
  ];
  for (const apiPath of mutationPaths) {
    for (const [method, operation] of Object.entries(document.paths[apiPath] ?? {})) {
      if (method === "get") continue;
      assert.ok(operation.responses?.["409"], `${method.toUpperCase()} ${apiPath} must document 409`);
    }
  }

  const dashboardMigrationBodies = {
    "import-dashboard": ["dryRun", "expectedConfigHash"],
    "convert-dashboard": ["dryRun", "expectedConfigHash"],
    "switch-dashboard": ["dryRun", "expectedConfigHash", "periodDays", "assignee"],
    "rollback-dashboard": ["dryRun", "expectedConfigHash", "attempt"],
  } as const;
  for (const [suffix, required] of Object.entries(dashboardMigrationBodies)) {
    const operation = document.paths[`/api/projects/{projectId}/jira/aggregates/${suffix}`]?.post;
    const schema = operation?.requestBody?.content?.["application/json"]?.schema;
    assert.equal(schema?.additionalProperties, false, `${suffix} body must reject unknown fields`);
    assert.deepEqual(schema?.required, required, `${suffix} required body fields`);
  }

  const convertOperation =
    document.paths["/api/projects/{projectId}/jira/aggregates/convert-dashboard"]?.post;
  assert.equal(convertOperation?.deprecated, true);
  assert.ok(convertOperation?.responses?.["410"]);

  const preview = document.paths["/api/projects/{projectId}/jira/aggregates/preview"]?.post;
  const previewProperties = preview?.requestBody?.content?.["application/json"]?.schema?.properties;
  assert.ok(previewProperties?.groupKey);
  assert.ok(previewProperties?.evaluatedAt);
  assert.equal(
    preview?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
    "#/components/schemas/JiraAggregateEvaluationResult",
  );
  const evaluation = document.components.schemas.JiraAggregateEvaluationResult as {
    properties?: Record<string, { $ref?: string }>;
    required?: string[];
  };
  assert.equal(evaluation.properties?.quality?.$ref, "#/components/schemas/JiraAnalyticsDataQuality");
  assert.ok(evaluation.required?.includes("quality"));
  assert.ok(document.paths["/api/projects/{projectId}/jira/aggregates/{aggregateId}/export.csv"]?.get);

  const aggregateDraft = document.components.schemas.JiraAggregateDraft as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  assert.deepEqual(aggregateDraft.required, [
    "name", "description", "source", "timeZone", "sortOrder",
  ]);
  assert.equal("exposedFields" in (aggregateDraft.properties ?? {}), false);
  assert.equal("baseFilterLogic" in (aggregateDraft.properties ?? {}), false);
  assert.equal("baseFilters" in (aggregateDraft.properties ?? {}), false);
  assert.equal("metric" in (aggregateDraft.properties ?? {}), false);
  assert.equal("groupBy" in (aggregateDraft.properties ?? {}), false);
  assert.equal("scope" in (aggregateDraft.properties ?? {}), false);
  const filter = document.components.schemas.JiraAnalyticsFilter as {
    properties?: { field?: { enum?: string[] } };
  };
  assert.ok((aggregateDraft.properties?.source as { enum?: string[] })?.enum?.includes("statusIntervals"));
  assert.ok(aggregateDraft.properties?.rowConfig);
  const intervalEndpoint = document.components.schemas.JiraStatusIntervalEndpoint as {
    oneOf?: Array<{ properties?: { anchor?: { const?: string } } }>;
  };
  assert.ok(intervalEndpoint.oneOf?.some(
    (schema) => schema.properties?.anchor?.const === "statusTransition",
  ));
  const intervalConfig = document.components.schemas.JiraStatusIntervalRowConfig as {
    properties?: { end?: { $ref?: string } };
  };
  assert.equal(
    intervalConfig.properties?.end?.$ref,
    "#/components/schemas/JiraStatusIntervalEndEndpoint",
  );

  const dashboard = document.components.schemas.JiraAnalyticsDashboardConfig as {
    oneOf?: Array<{ $ref?: string }>;
  };
  assert.ok(dashboard.oneOf?.some(
    (schema) => schema.$ref === "#/components/schemas/JiraAnalyticsDashboardConfigV3",
  ));
  assert.ok(dashboard.oneOf?.some(
    (schema) => schema.$ref === "#/components/schemas/JiraAnalyticsDashboardConfigV4",
  ));
  const widget = document.components.schemas.JiraAnalyticsManagedWidget as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  for (const property of ["aggregateId", "metric", "groupBy", "filters", "sortBy", "visualization"]) {
    assert.ok(widget.required?.includes(property), `v3 widget requires ${property}`);
  }
  const widgetV4 = document.components.schemas.JiraAnalyticsManagedWidgetV4 as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  for (const property of [
    "aggregateId", "selectedFields", "baseFilterLogic", "baseFilters", "metric",
    "groupBy", "filters", "sortBy", "visualization",
  ]) {
    assert.ok(widgetV4.required?.includes(property), `v4 widget requires ${property}`);
  }
  const selectedFields = widgetV4.properties?.selectedFields as {
    maxItems?: number;
    items?: { enum?: string[] };
  };
  assert.equal(selectedFields.maxItems, filter.properties?.field?.enum?.length);
  assert.deepEqual(selectedFields.items?.enum, filter.properties?.field?.enum);
  const aggregateCatalog = document.paths["/api/projects/{projectId}/jira/aggregates"]?.get
    ?.responses?.["200"]?.content?.["application/json"]?.schema as {
      properties?: { dashboard?: { properties?: {
        version?: { enum?: Array<number | null> };
        editableConfig?: { oneOf?: Array<{ $ref?: string }> };
      } } };
    };
  assert.ok(aggregateCatalog.properties?.dashboard?.properties?.version?.enum?.includes(4));
  assert.ok(aggregateCatalog.properties?.dashboard?.properties?.editableConfig?.oneOf?.some(
    (schema) => schema.$ref === "#/components/schemas/JiraAnalyticsDashboardConfigV4",
  ));
  const dashboardResults = document.paths["/api/projects/{projectId}/jira/aggregate-dashboard-results"]?.get
    ?.responses?.["200"]?.content?.["application/json"]?.schema as {
      properties?: { configVersion?: { enum?: number[] } };
    };
  assert.ok(dashboardResults.properties?.configVersion?.enum?.includes(4));
  const dashboardPatch = document.paths["/api/projects/{projectId}/jira/analytics-dashboard"]?.patch as {
    requestBody?: { content?: { "application/json"?: { schema?: {
      properties?: {
        config?: { $ref?: string };
        expectedConfigHash?: { pattern?: string };
        acceptPartialMigration?: { type?: string };
      };
      required?: string[];
    } } } };
    responses?: { "200"?: { content?: { "application/json"?: { schema?: {
      properties?: { dashboardConfig?: { $ref?: string } };
    } } } } };
  };
  assert.equal(
    dashboardPatch.requestBody?.content?.["application/json"]?.schema?.properties?.config?.$ref,
    "#/components/schemas/JiraAnalyticsDashboardConfigV4",
  );
  assert.ok(dashboardPatch.requestBody?.content?.["application/json"]?.schema?.properties?.acceptPartialMigration);
  assert.ok(dashboardPatch.requestBody?.content?.["application/json"]?.schema?.required?.includes("expectedConfigHash"));
  assert.equal(
    dashboardPatch.requestBody?.content?.["application/json"]?.schema?.properties?.expectedConfigHash?.pattern,
    "^[0-9a-f]{64}$",
  );
  assert.equal(
    dashboardPatch.responses?.["200"]?.content?.["application/json"]?.schema
      ?.properties?.dashboardConfig?.$ref,
    "#/components/schemas/JiraAnalyticsDashboardConfigV4",
  );
});
