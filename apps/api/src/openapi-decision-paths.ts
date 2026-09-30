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
  "/api/projects/{projectId}/plan-snapshots": {
    get: securedOperation(["WBS"], "Named plan snapshots of the project, newest first (without rows)", [pathParam("projectId")], "Snapshots"),
    post: {
      ...securedOperation(["WBS"], "Save the plan as it is under a name; changes neither the baseline nor the plan", [pathParam("projectId")], "Snapshot"),
      requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 2, maxLength: 120 } } } } } },
      responses: { "201": { description: "Saved" }, "409": { description: "50 snapshots already" }, "413": { description: "The structure is too large for a snapshot" }, "423": { description: "Project is closed" } },
    },
  },
  "/api/projects/{projectId}/plan-snapshots/compare": {
    get: {
      ...securedOperation(["WBS"], "Compare two snapshots, or a snapshot with the plan today (from, to: snapshot id or current)", [pathParam("projectId")], "Changes, added and removed rows"),
      responses: { "200": { description: "Comparison; rows matched by id, then by code" }, "400": { description: "A snapshot of another project or none" } },
    },
  },
  "/api/plan-snapshots/{snapshotId}": {
    delete: { ...securedOperation(["WBS"], "Delete a snapshot (administrators only)", [pathParam("snapshotId")], "Deleted"), responses: { "204": { description: "Deleted" }, "403": { description: "Not an administrator" } } },
  },
  "/api/projects/{projectId}/lessons": {
    get: securedOperation(["Projects"], "Lessons of the project", [pathParam("projectId")], "Lessons"),
    post: {
      ...securedOperation(["Projects"], "Save a lesson; allowed after the project closes too", [pathParam("projectId")], "Lesson"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["category", "title"],
              properties: {
                category: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "RESOURCES", "ESTIMATE", "TECHNICAL", "EXTERNAL", "OTHER", "GOOD_PRACTICE"] },
                title: { type: "string", minLength: 3, maxLength: 300 },
                text: { type: "string", maxLength: 4000 },
                recommendation: { type: "string", maxLength: 4000 },
                sourceKind: { type: "string", enum: ["MANUAL", "SHIFT", "RISK", "ISSUE", "DECISION"] },
                sourceRef: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
  "/api/projects/{projectId}/lessons/draft": {
    get: securedOperation(["Projects"], "A draft of lessons from the project's records (goal moves by reason, problems, risks that came true, critical issues, decisions); no model", [pathParam("projectId")], "Draft lessons with their sources"),
  },
  "/api/lessons/{lessonId}": {
    patch: securedOperation(["Projects"], "Change a lesson", [pathParam("lessonId")], "Lesson"),
    delete: securedOperation(["Projects"], "Delete a lesson", [pathParam("lessonId")], "Deleted"),
  },
  "/api/lessons": {
    get: securedOperation(["Projects"], "Lessons of all readable projects, newest first; category, q and page filters, 50 per page", [], "Page of lessons with their project"),
  },
};
