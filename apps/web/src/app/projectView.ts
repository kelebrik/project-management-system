import { PUBLIC_DEMO_USER_ID, readProjectViewState, type ProjectViewState } from "@pms/shared";
import type { ProjectUiState } from "./domainTypes";

export type { ProjectViewState };

const demoKey = (projectId: string) => `pms-project-view:${projectId}`;

/** The view fields of a shared uiState, where everyone's layout used to be kept. */
export function viewFieldsOf(uiState: ProjectUiState | null | undefined): ProjectViewState {
  return readProjectViewState(uiState);
}

/** The view fields of a patch: what goes to the person's own view rather than to the project. */
export function viewPatchOf(patch: ProjectUiState): ProjectViewState {
  return viewFieldsOf(patch);
}

function readDemoView(projectId: string): ProjectViewState | null {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(demoKey(projectId)) ?? "null");
    return stored ? readProjectViewState(stored) : null;
  } catch {
    return null;
  }
}

export function writeDemoView(projectId: string, patch: ProjectViewState) {
  try {
    window.localStorage.setItem(demoKey(projectId), JSON.stringify({ ...(readDemoView(projectId) ?? {}), ...patch }));
  } catch {
    // Storage is optional: the layout then lasts until the page is reloaded.
  }
}

/**
 * How this person sees the project: their own saved view on top of the
 * project's former shared layout, which is only the starting point.
 */
export function effectiveProjectView(
  project: { id: string; uiState?: ProjectUiState | null; myViewState?: ProjectViewState | null },
  userId: string | null | undefined,
): ProjectViewState {
  const own = userId === PUBLIC_DEMO_USER_ID ? readDemoView(project.id) : readProjectViewState(project.myViewState);
  return { ...viewFieldsOf(project.uiState), ...(own ?? {}) };
}
