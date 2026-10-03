import { pathParam, securedOperation } from "./openapi-helpers.js";

const json = (schema: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema } } });
const widths = { type: "object", additionalProperties: { type: "number", minimum: 20, maximum: 4000 } };
const viewState = {
  type: "object",
  additionalProperties: false,
  properties: {
    wbsColumnOrder: { type: "array", items: { type: "string" } },
    wbsHiddenColumns: { type: "array", items: { type: "string" } },
    wbsColumnWidths: widths,
    wbsSort: { type: ["object", "null"], properties: { columnKey: { type: "string" }, direction: { type: "string", enum: ["asc", "desc"] } } },
    wbsHierarchyLevel: { type: ["integer", "null"], minimum: 1, maximum: 20 },
    sidebarCollapsed: { type: "boolean" },
    ganttPanelHeight: { type: "number" },
    ganttPanelWidth: { type: "number" },
    ganttWbsWidth: { type: "number" },
    currentWorkColumnWidths: widths,
    openIssueColumnWidths: widths,
    openIssuesPrototypeColumnWidths: widths,
  },
};

/** A person's own view of a project, reports across projects, and checking a table before a project exists. */
export const openApiViewsReportsPaths = {
  "/api/projects/{projectId}/my-view": {
    get: securedOperation(["Projects"], "This person's own view of the project (columns, widths, sorting, level, panel sizes), or null before they arrange it", [pathParam("projectId")], "{ state }"),
    patch: {
      ...securedOperation(["Projects"], "Change some fields of this person's view; open to anyone who may read the project, also a closed one; the project itself does not change", [pathParam("projectId")], "{ state } after the change"),
      requestBody: json(viewState),
      responses: { "200": { description: "Saved" }, "400": { description: "A field out of range or unknown" }, "404": { description: "No such project" }, "413": { description: "The view is too large" } },
    },
  },
  "/api/reports/portfolio": {
    get: {
      ...securedOperation(["Reports"], "Reports across the open projects the person may read: a summary line per project, milestone shifts of a period, checkpoints within a horizon, red risks, decisions waiting for an answer", [], "Report"),
      parameters: [
        { name: "period", in: "query", schema: { type: "integer", enum: [7, 30, 90], default: 30 }, description: "Days of milestone shifts" },
        { name: "horizon", in: "query", schema: { type: "integer", enum: [14, 28, 56], default: 28 }, description: "Days ahead for upcoming checkpoints" },
      ],
    },
  },
  "/api/wbs-import/preview": {
    post: {
      ...securedOperation(["Structure"], "What a table would become as the Structure of a project not created yet; writes nothing", [], "Import plan summary"),
      requestBody: json({ type: "object", required: ["rows"], properties: { rows: { type: "array", minItems: 1, maxItems: 3000, items: { type: "object" } } } }),
    },
  },
};
