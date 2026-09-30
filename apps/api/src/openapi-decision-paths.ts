import { pathParam, securedOperation } from "./openapi-helpers.js";

const tags = ["Decisions"];
const versioned = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: { "application/json": { schema: { type: "object", required: ["expectedVersion", ...required], properties: { ...properties, expectedVersion: { type: "integer" } } } } },
});
const conflict = { "409": { description: "The decision changed meanwhile or is in another state" } };
const links = {
  issueId: { type: ["string", "null"] },
  raidItemId: { type: ["string", "null"] },
  wbsItemId: { type: ["string", "null"] },
  changeRequestId: { type: ["string", "null"] },
};

/** The project's decision log: proposals, one approver's answer, decisions recorded as taken, replacements. */
export const openApiDecisionPaths = {
  "/api/projects/{projectId}/decisions": {
    get: securedOperation(tags, "Decisions of the project, newest change first", [pathParam("projectId")], "Decisions"),
    post: {
      ...securedOperation(tags, "Propose a decision, or record one already taken; may replace a decision in force", [pathParam("projectId")], "Created decision"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["title"],
              properties: {
                title: { type: "string", minLength: 3, maxLength: 300 },
                context: { type: "string", maxLength: 4000 },
                decision: { type: "string", maxLength: 4000 },
                mode: { type: "string", enum: ["PROPOSE", "RECORD"] },
                decidedBy: { type: "string", maxLength: 200 },
                decidedAt: { type: "string", format: "date" },
                supersedesId: { type: ["string", "null"], description: "A decision in force of this project that the new one replaces" },
                ...links,
              },
            },
          },
        },
      },
      responses: { "201": { description: "Created" }, "400": { description: "Invalid, or a link to another project" }, "403": { description: "No right to change the project" }, "423": { description: "Project is closed" }, ...conflict },
    },
  },
  "/api/projects/{projectId}/decision-approvers": {
    get: securedOperation(tags, "Active users who may be asked to approve", [pathParam("projectId")], "Users"),
  },
  "/api/decisions/awaiting-me": {
    get: securedOperation(tags, "Decisions waiting for the signed-in user's answer across readable projects", [], "Decisions with their project"),
  },
  "/api/decisions/{decisionId}": {
    patch: { ...securedOperation(tags, "Edit a draft", [pathParam("decisionId")], "Decision"), requestBody: versioned({ title: { type: "string" }, context: { type: "string" }, decision: { type: "string" }, ...links }), responses: { "200": { description: "Saved" }, ...conflict } },
    delete: { ...securedOperation(tags, "Delete a draft", [pathParam("decisionId")], "Deleted"), responses: { "204": { description: "Deleted" }, ...conflict } },
  },
  "/api/decisions/{decisionId}/request-approval": {
    post: { ...securedOperation(tags, "Send a draft to one approver", [pathParam("decisionId")], "Decision"), requestBody: versioned({ approverUserId: { type: "string" } }, ["approverUserId"]), responses: { "200": { description: "Sent" }, ...conflict } },
  },
  "/api/decisions/{decisionId}/withdraw": {
    post: { ...securedOperation(tags, "Take a pending decision back to draft", [pathParam("decisionId")], "Decision"), requestBody: versioned({}), responses: { "200": { description: "Withdrawn" }, ...conflict } },
  },
  "/api/decisions/{decisionId}/record": {
    post: {
      ...securedOperation(tags, "Record a draft as taken, by whom and when", [pathParam("decisionId")], "Decision"),
      requestBody: versioned({ decidedBy: { type: "string" }, decidedAt: { type: "string", format: "date" } }, ["decidedBy", "decidedAt"]),
      responses: { "200": { description: "Recorded" }, ...conflict },
    },
  },
  "/api/decisions/{decisionId}/answer": {
    post: {
      ...securedOperation(tags, "Approve or reject, with a comment; only the chosen approver", [pathParam("decisionId")], "Decision"),
      requestBody: versioned({ verdict: { type: "string", enum: ["APPROVE", "REJECT"] }, comment: { type: "string", minLength: 3, maxLength: 2000 } }, ["verdict", "comment"]),
      responses: { "200": { description: "Answered" }, "403": { description: "Not the approver" }, ...conflict },
    },
  },
};
