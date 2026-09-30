import { useCallback } from "react";
import type { FactRef } from "../app/aiDrafts";
import { requestRaidReveal } from "../app/raidReveal";
import { focusedWbsBranchState } from "../app/wbsTree";
import { usePageContext } from "../pages/PageContext";

const scrollToRow = (elementId: string) =>
  window.setTimeout(() => document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);

/**
 * Opens the row an AI answer refers to so that it is visible: a structure row
 * with its branch expanded and sorting off, an open issue, or a risk with the
 * register search and filters that could hide it cleared. Jira keys are not rows here.
 */
export function useOpenFactRef() {
  const ctx = usePageContext();
  return useCallback(
    (ref: FactRef) => {
      if (ref.kind === "wbs") {
        // The same focus a ?focusWbs= link applies: only the branch down to the row is expanded.
        const branch = focusedWbsBranchState(ctx.project?.wbsItems ?? [], ref.id);
        if (branch) {
          ctx.setWbsSort(null);
          ctx.setShowStructureCriticalPath(false);
          ctx.setCollapsedWbsIds(branch.collapsedIds);
        }
        ctx.setActiveWbsItemId(ref.id);
        ctx.openView("project-structure");
        scrollToRow(`wbs-item-${branch?.scrollItemId ?? ref.id}`);
      } else if (ref.kind === "issue") {
        ctx.openView("project-issues");
        scrollToRow(`issue-item-${ref.id}`);
      } else if (ref.kind === "risk") {
        // The register clears its search and filters for this row, whether it is open already or mounts next.
        requestRaidReveal(ref.id);
        ctx.openView("project-raid");
      }
    },
    [ctx],
  );
}
