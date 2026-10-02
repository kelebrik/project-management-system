import type { Page } from "@playwright/test";

type ProjectListItem = {
  code?: string;
  status?: string;
};

export async function projectPagePath(page: Page, section: string) {
  const projectCode = await activeProjectCode(page);
  return `/${encodeURIComponent(projectCode)}/${section}`;
}

async function activeProjectCode(page: Page) {
  if (process.env.E2E_PROJECT_CODE) {
    return process.env.E2E_PROJECT_CODE;
  }

  const apiBase = process.env.E2E_API_BASE_URL?.replace(/\/$/, "");
  const endpoint = apiBase ? `${apiBase}/api/projects` : "/api/projects";

  try {
    const response = await page.request.get(endpoint);
    if (response.ok()) {
      const projects = (await response.json()) as ProjectListItem[];
      const project =
        projects.find((item) => item.status !== "CLOSED" && item.code) ??
        projects.find((item) => item.code);
      if (project?.code) {
        return project.code;
      }
    }
  } catch {
    // Direct route fallback keeps E2E useful against the public demo deployment.
  }

  return "cvte968";
}

/**
 * Whether a real API with projects answers at the base URL. Tests that read
 * live data skip, with this reason, when only the web dev server runs.
 */
export async function liveApiAvailable(page: Page) {
  const apiBase = process.env.E2E_API_BASE_URL?.replace(/\/$/, "") ?? "";
  try {
    const response = await page.request.get(`${apiBase}/api/projects`, { timeout: 3_000 });
    if (!response.ok()) return false;
    const projects = (await response.json()) as unknown;
    return Array.isArray(projects) && projects.length > 0;
  } catch {
    return false;
  }
}

export const LIVE_API_REASON = "needs a running API with projects (E2E_BASE_URL, or E2E_API_BASE_URL for a separate API)";
