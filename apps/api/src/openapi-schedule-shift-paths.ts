import { pathParam, securedOperation } from "./openapi-helpers.js";

const tags = ["WBS"];

const step = {
  type: "object",
  properties: {
    id: { type: "string" },
    operationId: { type: "string" },
    at: { type: "string", format: "date-time" },
    previousDate: { type: ["string", "null"], format: "date" },
    newDate: { type: ["string", "null"], format: "date" },
    deltaDays: { type: ["integer", "null"], description: "Calendar days; null when the checkpoint had or has no date" },
    trigger: {
      type: "string",
      enum: ["MANUAL_EDIT", "BULK_EDIT", "STRUCTURE", "LINKS", "RESTORE", "CALENDAR", "TARGET_DATE", "ISSUE", "DRAFT", "RESTORE_DELETED", "SYSTEM"],
    },
    sourceItemId: { type: ["string", "null"] },
    sourceCode: { type: ["string", "null"] },
    sourceTitle: { type: ["string", "null"] },
    sourceIssueId: { type: ["string", "null"] },
    sourceNote: { type: ["string", "null"] },
    actorName: { type: ["string", "null"] },
    reason: { type: ["object", "null"] },
    needsReason: { type: "boolean", description: "Moved later and past the baseline without a reason" },
  },
};

/** The journal of milestone and goal dates: why checkpoints moved. */
export const openApiScheduleShiftPaths = {
  "/api/projects/{projectId}/schedule-shifts": {
    get: {
      ...securedOperation(tags, "Why milestones and goals moved: steps since each checkpoint's baseline", [pathParam("projectId")], "Checkpoints off their baseline or moved"),
      responses: {
        "200": {
          description: "Open checkpoints off their baseline or moved since it, the active goal first; at most 30 latest steps each",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  checkpoints: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        code: { type: "string" },
                        title: { type: "string" },
                        type: { type: "string", enum: ["MILESTONE", "GOAL"] },
                        isActiveGoal: { type: "boolean" },
                        baselineDate: { type: ["string", "null"], format: "date" },
                        currentDate: { type: ["string", "null"], format: "date" },
                        varianceDays: { type: ["integer", "null"] },
                        unexplainedDays: { type: ["integer", "null"], description: "Days no journaled step explains, such as moves before the journal" },
                        earlierSteps: { type: ["object", "null"], properties: { count: { type: "integer" }, deltaDays: { type: "integer" } } },
                        steps: { type: "array", items: step },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "404": { description: "Project not found or not readable" },
      },
    },
  },
};
