import { structureEndDateOf } from "./charts/portfolioOptions";
import type { ProjectDetails, ProjectListItem } from "./domainTypes";

/** The rows the projects list carries of a Structure, as the server picks them. */
const LIST_ROW_TYPES = new Set(["GOAL", "TASK", "DELIVERABLE"]);

/**
 * The list's entry of the open project brought to its Structure as it stands:
 * its rows, its target (the last goal's date, which the server keeps the same
 * way) and its last date. The list is loaded once, so without this a moved goal
 * shows in the portfolio only after a reload. Other projects stay as they are.
 */
export function syncProjectListEntry(projects: ProjectListItem[], project: ProjectDetails): ProjectListItem[] {
  const index = projects.findIndex((item) => item.id === project.id);
  if (index < 0) return projects;
  const entry = projects[index]!;
  const lastGoalDue = project.wbsItems
    .filter((item) => item.type === "GOAL" && item.status !== "CANCELLED" && item.dueDate)
    .reduce<string | null>((last, item) => (!last || item.dueDate!.slice(0, 10) > last.slice(0, 10) ? item.dueDate : last), null);
  const next: ProjectListItem = {
    ...entry,
    wbsItems: project.wbsItems.filter((item) => LIST_ROW_TYPES.has(item.type)),
    targetDate: lastGoalDue ?? entry.targetDate,
    structureEndDate: structureEndDateOf(project.wbsItems),
  };
  return projects.map((item, position) => (position === index ? next : item));
}
