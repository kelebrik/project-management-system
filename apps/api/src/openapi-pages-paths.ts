import { pathParam, securedOperation } from "./openapi-helpers.js";

const json = (schema: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema } } });
const pageId = pathParam("pageId");
const document = { type: "object", description: "PageDocument: schemaVersion 1, format (wide, a4-landscape, a4-portrait), theme, scope, periodDays, subtitle, widgets (at most 30, on a 12-column grid without overlaps)" };
const pageBody = { type: "object", required: ["title", "document"], properties: { title: { type: "string", maxLength: 120 }, document } };
const responses = (ok: string) => ({ "200": { description: ok }, "401": { description: "Not signed in" }, "403": { description: "Not an administrator, or the public demo trying to save" }, "404": { description: "No such page of this person" } });

/** "My page": a person's own pages and the answers for their widgets. */
export const openApiPagesPaths = {
  "/api/pages": {
    get: securedOperation(["Pages"], "This person's pages, newest first, and whether they may save (the public demo may not)", [], "{ canSave, limit, pages }"),
    post: {
      ...securedOperation(["Pages"], "Save a new page; at most 50 per person", [], "The page"),
      requestBody: json(pageBody),
      responses: { "201": { description: "Created" }, "400": { description: "Invalid document or overlapping widgets" }, "409": { description: "Too many pages" }, "413": { description: "The page is too large" } },
    },
  },
  "/api/pages/scope-options": {
    get: securedOperation(["Pages"], "The open projects this person may read and their portfolios, to choose a page's scope", [], "{ projects, portfolios }"),
  },
  "/api/pages/query": {
    post: {
      ...securedOperation(["Pages"], "Answers for the widgets of a page in one go: each widget's named metric with its split, filters and order, over the open projects of the scope that the person may read; reads only", [], "{ today, generatedAt, projects, results }"),
      requestBody: json({ type: "object", required: ["scope", "periodDays", "queries"], properties: { scope: { type: "object" }, periodDays: { type: "integer", enum: [7, 14, 30, 90, 180, 365] }, fresh: { type: "boolean" }, queries: { type: "array", maxItems: 30, items: { type: "object" } } } }),
    },
  },
  "/api/pages/{pageId}": {
    get: { ...securedOperation(["Pages"], "One page of this person", [pageId], "The page"), responses: responses("The page") },
    patch: {
      ...securedOperation(["Pages"], "Change the title or the document; refused with 409 and the current page when it changed since expectedRevision", [pageId], "The page"),
      requestBody: json({ type: "object", required: ["expectedRevision"], properties: { title: { type: "string" }, document, expectedRevision: { type: "integer" } } }),
      responses: { ...responses("Saved"), "409": { description: "Changed elsewhere" } },
    },
    delete: { ...securedOperation(["Pages"], "Delete a page of this person", [pageId], "Nothing"), responses: { "204": { description: "Deleted" }, "404": { description: "No such page of this person" } } },
  },
  "/api/pages/{pageId}/duplicate": {
    post: { ...securedOperation(["Pages"], "A copy of a page of this person", [pageId], "The copy"), responses: { "201": { description: "Copied" }, "404": { description: "No such page" }, "409": { description: "Too many pages" } } },
  },
};
