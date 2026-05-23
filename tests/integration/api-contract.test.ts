import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.INTEGRATION_BASE_URL;

function integrationTest(name: string, fn: () => Promise<void>) {
  test(name, { skip: !baseUrl }, fn);
}

async function getJson(path: string) {
  assert.ok(baseUrl, "INTEGRATION_BASE_URL must be set");
  const response = await fetch(new URL(path, baseUrl));
  const body = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    json: body ? JSON.parse(body) : null,
  };
}

integrationTest("health endpoint exposes database and Jira readiness", async () => {
  const response = await getJson("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.database, "ok");
  assert.equal(typeof response.json.jiraConfigured, "boolean");
});

integrationTest("read-only project data is available without login", async () => {
  const response = await getJson("/api/projects");

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.json));
});

integrationTest("OpenAPI document is published by the API", async () => {
  const response = await getJson("/api/openapi.json");

  assert.equal(response.status, 200);
  assert.equal(response.json.openapi, "3.1.0");
  assert.ok(response.json.paths["/api/projects"]);
});

integrationTest("overview endpoint returns executive source data for a project", async () => {
  const projects = await getJson("/api/projects");
  const project = projects.json.find((item: { status: string }) => item.status !== "CLOSED") ?? projects.json[0];

  if (!project) {
    return;
  }

  const overview = await getJson(`/api/projects/${project.id}/overview`);

  assert.equal(overview.status, 200);
  assert.equal(overview.json.id, project.id);
  assert.ok(Array.isArray(overview.json.wbsItems));
  assert.ok(Array.isArray(overview.json.issues));
  assert.ok(Array.isArray(overview.json.closedIssues));
  assert.ok(Array.isArray(overview.json.criticalPath));
});

integrationTest("write endpoints require authentication", async () => {
  assert.ok(baseUrl, "INTEGRATION_BASE_URL must be set");
  const response = await fetch(new URL("/api/projects", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 401);
});
