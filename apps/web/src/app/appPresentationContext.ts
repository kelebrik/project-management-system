import {
  emptyIssueForm,
  projectToRegistryDraft,
} from "./formState";
import {
  latestIssueStatusUpdate,
  latestRaidStatusUpdate,
} from "./statusUpdates";

export function buildAppPresentationContext(
  derived: Record<string, unknown>,
  appContext: Record<string, unknown>,
) {
  return {
    ...derived,
    ...appContext,
    emptyIssueForm,
    latestIssueStatusUpdate,
    latestRaidStatusUpdate,
    projectToRegistryDraft,
  };
}
