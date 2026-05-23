import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.INTEGRATION_BASE_URL;
const projectId = process.env.INTEGRATION_PROJECT_ID;
const authCookie = process.env.INTEGRATION_AUTH_COOKIE;

function workflowTest(name: string, options: { write?: boolean }, fn: () => Promise<void>) {
  const missingReadContext = !baseUrl || !projectId;
  const missingWriteContext = options.write && !authCookie;

  test(name, { skip: missingReadContext || missingWriteContext }, fn);
}

async function request(path: string, init?: RequestInit) {
  assert.ok(baseUrl, "INTEGRATION_BASE_URL must be set");
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: {
      ...(authCookie ? { Cookie: authCookie } : {}),
      ...init?.headers,
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text ? JSON.parse(text) : null,
  };
}

workflowTest("WBS and overview stay available for read-only executive views", {}, async () => {
  assert.ok(projectId, "INTEGRATION_PROJECT_ID must be set");

  const [overview, wbs] = await Promise.all([
    request(`/api/projects/${projectId}/overview`),
    request(`/api/projects/${projectId}/wbs-items`),
  ]);

  assert.equal(overview.status, 200);
  assert.equal(wbs.status, 200);
  assert.ok(Array.isArray(overview.json.wbsItems));
  assert.ok(Array.isArray(wbs.json));
});

workflowTest("baseline can be fixed through authenticated API", { write: true }, async () => {
  assert.ok(projectId, "INTEGRATION_PROJECT_ID must be set");

  const response = await request(`/api/projects/${projectId}/wbs-baseline`, {
    method: "POST",
  });

  assert.ok([200, 201].includes(response.status), `unexpected status: ${response.status}`);
  assert.ok(response.json);
});
