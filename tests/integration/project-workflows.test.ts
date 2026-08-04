import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.INTEGRATION_BASE_URL;
const projectId = process.env.INTEGRATION_PROJECT_ID;
const authCookie = process.env.INTEGRATION_AUTH_COOKIE;

function workflowTest(name: string, options: { write?: boolean }, fn: () => Promise<void>) {
  const missingReadContext = !baseUrl || !projectId || !authCookie;
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

workflowTest("WBS and overview stay available for authenticated executive views", {}, async () => {
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

workflowTest(
  "bulk WBS save persists changes and restores the original row",
  { write: true },
  async () => {
    assert.ok(projectId, "INTEGRATION_PROJECT_ID must be set");

    const initialSnapshot = await request(`/api/projects/${projectId}/wbs-items`);
    assert.equal(initialSnapshot.status, 200);
    assert.ok(Array.isArray(initialSnapshot.json));

    const sourceItem = initialSnapshot.json.find(
      (item: { id?: string; title?: string; progress?: number }) =>
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.progress === "number",
    );
    assert.ok(sourceItem, "Project must contain at least one editable WBS item");

    const original = {
      title: sourceItem.title as string,
      progress: sourceItem.progress as number,
    };
    const changed = {
      title: `${original.title} [save-test ${Date.now()}]`,
      progress: original.progress === 100 ? 99 : original.progress + 1,
    };
    let restoreRequired = false;

    const saveItem = (patch: typeof original) =>
      request(`/api/projects/${projectId}/wbs-items/bulk`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: sourceItem.id, patch }],
          renumber: false,
        }),
      });

    const loadSavedItem = async () => {
      const snapshot = await request(`/api/projects/${projectId}/wbs-items`);
      assert.equal(snapshot.status, 200);
      assert.ok(Array.isArray(snapshot.json));
      const item = snapshot.json.find(
        (candidate: { id?: string }) => candidate.id === sourceItem.id,
      );
      assert.ok(item, "Saved WBS item must remain in the project");
      return item as { title: string; progress: number };
    };

    try {
      const saveChanged = await saveItem(changed);
      assert.equal(saveChanged.status, 200);
      assert.equal(saveChanged.json.updatedCount, 1);
      restoreRequired = true;

      const persistedChanged = await loadSavedItem();
      assert.equal(persistedChanged.title, changed.title);
      assert.equal(persistedChanged.progress, changed.progress);

      const saveOriginal = await saveItem(original);
      assert.equal(saveOriginal.status, 200);
      assert.equal(saveOriginal.json.updatedCount, 1);

      const persistedOriginal = await loadSavedItem();
      assert.equal(persistedOriginal.title, original.title);
      assert.equal(persistedOriginal.progress, original.progress);
      restoreRequired = false;
    } finally {
      if (restoreRequired) {
        const cleanup = await saveItem(original);
        assert.equal(cleanup.status, 200, "Cleanup must restore the original WBS row");
        const restored = await loadSavedItem();
        assert.equal(restored.title, original.title);
        assert.equal(restored.progress, original.progress);
      }
    }
  },
);
