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
