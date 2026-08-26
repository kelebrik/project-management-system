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


test("OpenAPI keeps semantic aggregates separate from widget presentation", () => {
  const document = openApiDocument as unknown as {
    components: { schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }> };
    paths: Record<string, Record<string, unknown>>;
  };
  const aggregate = document.components.schemas.JiraSemanticAggregateDefinition;
  const widget = document.components.schemas.JiraSemanticWidget;
  const dashboard = document.components.schemas.JiraSemanticDashboard;

  for (const presentationField of ["metric", "groupBy", "sortBy", "visualization", "placement", "width"]) {
    assert.equal(presentationField in (aggregate.properties ?? {}), false, `aggregate must not own ${presentationField}`);
  }
  for (const widgetField of ["aggregateId", "aggregateVersion", "metric", "groupBy", "sortBy", "visualization", "placement", "width"]) {
    assert.ok(widget.required?.includes(widgetField), `widget must own ${widgetField}`);
  }
  assert.ok(dashboard.required?.includes("widgets"));
  for (const suffix of ["query", "query.csv"]) {
    assert.ok(document.paths[`/api/projects/{projectId}/jira/semantic-aggregates/{aggregateId}/${suffix}`]?.post);
  }
  assert.ok(document.paths["/api/projects/{projectId}/jira/semantic-aggregates/query-batch"]?.post);
  assert.ok(document.paths["/api/projects/{projectId}/jira/semantic-aggregates/bootstrap"]?.post);
  for (const retiredPath of [
    "/api/projects/{projectId}/jira/aggregates",
    "/api/projects/{projectId}/jira/aggregate-dashboard-results",
    "/api/projects/{projectId}/jira/analytics-dashboard",
  ]) {
    assert.equal(document.paths[retiredPath], undefined, `${retiredPath} must not advertise the retired v1-v4 API`);
  }
});
