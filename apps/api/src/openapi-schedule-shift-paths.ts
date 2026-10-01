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
      enum: ["MANUAL_EDIT", "BULK_EDIT", "STRUCTURE", "LINKS", "RESTORE", "CALENDAR", "TARGET_DATE", "ISSUE", "DRAFT", "IMPORT", "AUTOMATION", "RESTORE_DELETED", "SYSTEM"],
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
                        reasonDays: {
                          type: "object",
                          additionalProperties: { type: "integer" },
                          description: "Days of later moves since the baseline by reason category; NONE has no reason yet",
                        },
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
  "/api/schedule-shifts/operations/{operationId}": {
    get: {
      ...securedOperation(tags, "The moves past the baseline one operation made that still have no reason", [pathParam("operationId")], "Moves to ask about"),
      responses: {
        "200": {
          description: "Empty when the project is not readable or nothing needs a reason",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  projectId: { type: ["string", "null"] },
                  shifts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        checkpointId: { type: ["string", "null"] },
                        checkpointCode: { type: "string" },
                        checkpointTitle: { type: "string" },
                        deltaDays: { type: ["integer", "null"] },
                        newDate: { type: ["string", "null"], format: "date" },
                        baselineDate: { type: ["string", "null"], format: "date" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  "/api/projects/{projectId}/schedule-shifts/reason": {
    patch: {
      ...securedOperation(tags, "Give moves of the project a reason; can be changed later", [pathParam("projectId")], "Number of moves updated"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["shiftIds", "category"],
              properties: {
                shiftIds: { type: "array", minItems: 1, maxItems: 50, items: { type: "string" } },
                category: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "RESOURCES", "ESTIMATE", "TECHNICAL", "EXTERNAL", "OTHER"] },
                text: { type: "string", maxLength: 500 },
                raidItemId: { type: ["string", "null"], description: "A risk or problem of the same project" },
              },
            },
          },
        },
      },
      responses: {
        "200": { description: "Reason saved" },
        "400": { description: "Invalid request, moves of another project or a risk of another project" },
        "401": { description: "Not signed in" },
        "403": { description: "No right to change the project" },
        "404": { description: "Project not found" },
        "423": { description: "Project is closed and read-only" },
      },
    },
  },
  "/api/wbs-items/{itemId}/date-drivers": {
    get: {
      ...securedOperation(tags, "What holds a row's dates: the link that sets them, the duration and days off, the children of a summary row", [pathParam("itemId")], "Date drivers"),
      responses: {
        "200": {
          description: "Explained by the same rules as the schedule calculation; consistent is false when the saved dates wait for a recalculation",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  itemId: { type: "string" },
                  kind: { type: "string", enum: ["SUMMARY", "CHECKPOINT", "TASK"] },
                  startDate: { type: ["string", "null"], format: "date" },
                  dueDate: { type: ["string", "null"], format: "date" },
                  start: { type: "object" },
                  finish: { type: "object" },
                  children: { type: ["object", "null"] },
                  consistent: { type: "boolean" },
                },
              },
            },
          },
        },
        "404": { description: "Row not found or its project not readable" },
      },
    },
  },
};
