import type { PageDatasetRow, PageQueryResult, PageQuerySpec, PageRoadmapLane } from "./dataset-types.js";
import { pageFilterMatches, pageQueryProblem } from "./dataset-evaluate.js";
import { PAGE_SOURCES } from "./sources.js";

/**
 * The answer of a roadmap: one lane per project of the scope — in the
 * registry's order, a project without milestones or goals keeps an empty
 * lane — and in each lane all its milestones and goals that pass the filters,
 * by forecast. Nothing is cut by the row limit of tables: the widget decides
 * what fits its window and its height. Pure, like the other answers.
 */

/** More lanes than a sheet can hold are not sent; the widget says how many there are. */
export const PAGE_ROADMAP_LANE_LIMIT = 100;

export type PageRoadmapProject = { id: string; code: string; name: string };

const ROADMAP_FIELDS = ["code", "title", "type", "status", "plannedDate", "forecastDate", "slipDays", "open"] as const;

export function evaluatePageRoadmap(rows: PageDatasetRow[], projects: readonly PageRoadmapProject[], spec: PageQuerySpec): PageQueryResult {
  if (spec.source !== "checkpoints") return { kind: "error", code: "PAGE_QUERY_INVALID", error: "Дорожная карта строится по вехам и целям", warnings: [] };
  const problem = pageQueryProblem(spec);
  if (problem) return { kind: "error", code: "PAGE_QUERY_INVALID", error: problem, warnings: [] };
  const source = PAGE_SOURCES[spec.source];
  const fieldOf = (key: string) => source.fields.find((field) => field.key === key)!;
  const byProject = new Map<string, PageDatasetRow[]>();
  let items = 0;
  for (const row of rows) {
    if (!spec.filters.every((filter) => pageFilterMatches(fieldOf(filter.field), row.values[filter.field], filter))) continue;
    const list = byProject.get(row.projectId) ?? [];
    list.push({ ...row, values: Object.fromEntries(ROADMAP_FIELDS.map((key) => [key, row.values[key] ?? null])) });
    byProject.set(row.projectId, list);
  }
  const day = (row: PageDatasetRow) => String(row.values.forecastDate ?? row.values.plannedDate ?? "");
  const lanes: PageRoadmapLane[] = projects.slice(0, PAGE_ROADMAP_LANE_LIMIT).map((project) => {
    const laneItems = (byProject.get(project.id) ?? []).sort((left, right) => day(left).localeCompare(day(right)) || String(left.values.title).localeCompare(String(right.values.title), "ru"));
    items += laneItems.length;
    return { projectId: project.id, project: project.code, projectName: project.name, href: `/${encodeURIComponent(project.code)}/schedule`, items: laneItems };
  });
  return { kind: "roadmap", lanes, totalLanes: projects.length, items, warnings: [] };
}
