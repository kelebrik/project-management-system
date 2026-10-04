import { automationTemplates } from "@pms/shared";
import { pathParam, securedOperation } from "./openapi-helpers.js";

const tags = ["Automation"];
const templateParam = { name: "template", in: "path", required: true, schema: { type: "string", enum: [...automationTemplates] } };
const proposalParam = pathParam("proposalId");
const json = (schema: Record<string, unknown>) => ({ required: true, content: { "application/json": { schema } } });

/** Project rules: five templates that tell people or prepare a change a person applies; and the signed-in user's bell. */
export const openApiAutomationRulesPaths = {
  "/api/projects/{projectId}/automation-rules": {
    get: securedOperation(tags, "The rule templates of the project with their settings, users who can be told, and the number of proposals waiting", [pathParam("projectId")], "Rules"),
  },
  "/api/projects/{projectId}/automation-rules/{template}": {
    put: {
      ...securedOperation(tags, "Switch a rule on or off, set its parameters and recipients; switching on starts it from now", [pathParam("projectId"), templateParam], "The rule"),
      requestBody: json({
        type: "object",
        required: ["enabled", "recipientIds"],
        properties: {
          enabled: { type: "boolean" },
          params: { type: "object", description: "MILESTONE_SHIFT { minDays 1..90 }, DECISION_WAITING { days 1..60 }, ISSUE_OVERDUE { graceDays 0..30 }, WORK_DUE_SOON { days 1..30 }, MILESTONE_AT_RISK { days 1..60, minProgress 1..100 }, CHANGE_REQUEST_PENDING { days 1..60 }; other templates: {}" },
          recipientIds: { type: "array", maxItems: 20, items: { type: "string" } },
          version: { type: "integer", description: "The version shown; required once the rule exists" },
        },
      }),
      responses: { "200": { description: "Saved" }, "409": { description: "The rule changed meanwhile" } },
    },
  },
  "/api/projects/{projectId}/automation-rules/{template}/preview": {
    get: securedOperation(tags, "What the rule would have said over the last 28 days: from recorded history, approximately, or only for now", [pathParam("projectId"), templateParam], "Preview; writes nothing"),
  },
  "/api/projects/{projectId}/automation/firings": {
    get: securedOperation(tags, "The last 100 times the project's rules fired", [pathParam("projectId")], "Journal"),
  },
  "/api/projects/{projectId}/automation/proposals": {
    get: securedOperation(tags, "Proposals prepared by the rules (status=PENDING by default, or APPLIED, REJECTED, STALE)", [pathParam("projectId")], "Proposals"),
  },
  "/api/projects/{projectId}/automation/proposals/{proposalId}/apply": {
    post: {
      ...securedOperation(
        tags,
        "Apply a proposal: create the prepared issue (optionally corrected) or set the row status with the same checks as a manual change. Jira is never written to; a proposal whose row or ticket changed is closed as stale",
        [pathParam("projectId"), proposalParam],
        "Applied",
      ),
      requestBody: json({
        type: "object",
        required: ["version"],
        properties: { version: { type: "integer" }, title: { type: "string", maxLength: 500 }, owner: { type: "string", maxLength: 200 }, severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] } },
      }),
      responses: { "200": { description: "Applied" }, "409": { description: "Already decided, changed, or stale" } },
    },
  },
  "/api/projects/{projectId}/automation/proposals/{proposalId}/reject": {
    post: {
      ...securedOperation(tags, "Reject a proposal", [pathParam("projectId"), proposalParam], "Rejected"),
      requestBody: json({ type: "object", required: ["version"], properties: { version: { type: "integer" } } }),
    },
  },
  "/api/notifications": {
    get: securedOperation(tags, "The signed-in user's newest 50 notifications and the unread count", [], "Notifications"),
  },
  "/api/notifications/read": {
    post: {
      ...securedOperation(tags, "Mark the given notifications, or all, as read", [], "Number marked"),
      requestBody: json({ oneOf: [{ type: "object", required: ["ids"], properties: { ids: { type: "array", maxItems: 100, items: { type: "string" } } } }, { type: "object", required: ["all"], properties: { all: { type: "boolean", enum: [true] } } }] }),
    },
  },
};
