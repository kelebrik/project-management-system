import { pathParam, securedOperation } from "./openapi-helpers.js";

const json = (schema: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema } } });
const pageId = pathParam("pageId");
const label = json({ type: "object", properties: { label: { type: "string", maxLength: 120 } } });
const owned = (summary: string, params: ReturnType<typeof pathParam>[], result: string) => ({ ...securedOperation(["Pages"], summary, params, result), responses: { "200": { description: result }, "403": { description: "The public demo" }, "404": { description: "No such page of this person" } } });
const document = { type: "object", description: "PageDocument: schemaVersion 1, format (wide, a4-landscape, a4-portrait), theme, scope, periodDays, subtitle, widgets (at most 30, on a 12-column grid without overlaps)" };
const pageBody = { type: "object", required: ["title", "document"], properties: { title: { type: "string", maxLength: 120 }, document } };
const responses = (ok: string) => ({ "200": { description: ok }, "401": { description: "Not signed in" }, "403": { description: "The public demo trying to save" }, "404": { description: "No such page of this person" } });

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
  "/api/pages/{pageId}/revisions": {
    get: owned("Versions of a page kept on purpose, newest first (at most 30)", [pageId], "Versions"),
    post: { ...owned("Keep the saved page as a version", [pageId], "The version"), requestBody: label },
  },
  "/api/pages/{pageId}/revisions/{revisionId}/restore": {
    post: {
      ...owned("Go back to a version; the page as it was is kept as a version first; 409 when the page changed since expectedRevision", [pageId, pathParam("revisionId")], "The page"),
      requestBody: json({ type: "object", required: ["expectedRevision"], properties: { expectedRevision: { type: "integer" } } }),
    },
  },
  "/api/pages/{pageId}/releases": {
    get: owned("Releases of a page: the page as shown at a meeting, newest first (at most 20)", [pageId], "Releases"),
    post: { ...owned("Freeze the saved page with the answers of this moment", [pageId], "The release"), requestBody: label },
  },
  "/api/pages/{pageId}/releases/{releaseId}": {
    get: owned("A release with its document and frozen answers", [pageId, pathParam("releaseId")], "The release"),
    delete: owned("Delete a release and its links", [pageId, pathParam("releaseId")], "Nothing"),
  },
  "/api/pages/{pageId}/shares": {
    get: owned("Links to a page or its releases (tokens are not kept)", [pageId], "Links"),
    post: {
      ...owned("A new read-only link to the page (live) or to a release, optionally expiring; the token is returned once", [pageId], "{ id, token, expiresAt }"),
      requestBody: json({ type: "object", properties: { releaseId: { type: ["string", "null"] }, days: { type: ["integer", "null"], minimum: 1, maximum: 90 } } }),
    },
  },
  "/api/pages/{pageId}/shares/{shareId}": {
    delete: owned("Revoke a link", [pageId, pathParam("shareId")], "Nothing"),
  },
  "/api/page-links/{token}": {
    get: {
      ...securedOperation(["Pages"], "What a link opens for anyone signed in: a live page answered with the reader's own access, or a release if the reader may read all its projects", [pathParam("token")], "{ title, document, release, answer }"),
      responses: { "200": { description: "The page" }, "403": { description: "A release with projects the reader may not read" }, "404": { description: "Revoked, expired or unknown link" } },
    },
  },
  "/api/pages/{pageId}/duplicate": {
    post: { ...securedOperation(["Pages"], "A copy of a page of this person", [pageId], "The copy"), responses: { "201": { description: "Copied" }, "404": { description: "No such page" }, "409": { description: "Too many pages" } } },
  },
};
