import {
  PUBLIC_DEMO_USER_ID,
  globalViewFields,
  mergeProjectView,
  projectOnlyViewFields,
  readProjectViewState,
  type ProjectViewState,
} from "@pms/shared";
import type { ProjectUiState } from "./domainTypes";

export type { ProjectViewState };

const demoKey = (projectId: string) => `pms-project-view:${projectId}`;
/** The demo's layout kept the same in every project, as a signed-in person's defaults are. */
const DEMO_DEFAULTS_KEY = "pms-view-defaults";

/** The view fields of a shared uiState, where everyone's layout used to be kept. */
export function viewFieldsOf(uiState: ProjectUiState | null | undefined): ProjectViewState {
  return readProjectViewState(uiState);
}

/** The view fields of a patch: what goes to the person's own view rather than to the project. */
export function viewPatchOf(patch: ProjectUiState): ProjectViewState {
  return viewFieldsOf(patch);
}

function readStoredView(key: string): ProjectViewState | null {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return stored ? readProjectViewState(stored) : null;
  } catch {
    return null;
  }
}

/** The demo's view of a project: its record of it with the layout kept everywhere on top, as the server merges it. */
export function readDemoView(projectId: string): ProjectViewState | null {
  return mergeProjectView(readStoredView(demoKey(projectId)), readStoredView(DEMO_DEFAULTS_KEY));
}

export function writeDemoView(projectId: string, patch: ProjectViewState) {
  try {
    const own = projectOnlyViewFields(patch);
    const everywhere = globalViewFields(patch);
    if (Object.keys(own).length > 0) {
      window.localStorage.setItem(demoKey(projectId), JSON.stringify({ ...(readStoredView(demoKey(projectId)) ?? {}), ...own }));
    }
    if (Object.keys(everywhere).length > 0) {
      window.localStorage.setItem(DEMO_DEFAULTS_KEY, JSON.stringify({ ...(readStoredView(DEMO_DEFAULTS_KEY) ?? {}), ...everywhere }));
    }
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
