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
      enum: ["MANUAL_EDIT", "BULK_EDIT", "STRUCTURE", "LINKS", "RESTORE", "CALENDAR", "TARGET_DATE", "ISSUE", "DRAFT", "IMPORT", "AUTOMATION", "RESTORE_DELETED", "SYSTEM", "SESSION"],
      description: "SESSION: several saves of one editing session summed up",
    },
    sessionId: { type: ["string", "null"], description: "The editing session the step sums up" },
    sessionOpen: { type: "boolean" },
    shiftIds: { type: "array", items: { type: "string" }, description: "The journal rows the step sums up" },
    operations: { type: "integer" },
    reasonEditable: { type: "boolean", description: "False for an open session's step too large to name; its reason waits until the session ends" },
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
                          description: "Days the checkpoint is past its baseline now, by the reason category of the later moves that remain after the moves back; at most varianceDays, empty without a baseline. NONE has no reason yet",
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
              required: ["category"],
              description: "The moves are named by shiftIds, or by sessionId with checkpointIds for a finished editing session",
              properties: {
                shiftIds: { type: "array", minItems: 1, maxItems: 50, items: { type: "string" } },
                sessionId: { type: "string" },
                checkpointIds: { type: "array", minItems: 1, maxItems: 500, items: { type: "string" } },
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
  "/api/projects/{projectId}/schedule-shifts/pending": {
    get: {
      ...securedOperation(tags, "The signed-in person's finished editing sessions whose net moves past the baseline want a reason, and their open session", [pathParam("projectId")], "Sessions to ask about"),
      responses: {
        "200": {
          description: "Sessions with their checkpoints' net moves, and the project's open risks and problems to name",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  projectId: { type: "string" },
                  sessions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        startedAt: { type: "string", format: "date-time" },
                        endedAt: { type: "string", format: "date-time" },
                        steps: { type: "array", items: { type: "object" } },
                      },
                    },
                  },
                  risks: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } } },
                  ownOpen: { type: ["object", "null"], properties: { id: { type: "string" }, lastActivityAt: { type: "string", format: "date-time" } } },
                },
              },
            },
          },
        },
        "401": { description: "Not signed in" },
        "404": { description: "Project not found" },
      },
    },
  },
  "/api/projects/{projectId}/schedule-shifts/sessions/{sessionId}/close": {
    post: {
      ...securedOperation(tags, "End one of the person's editing sessions: they left the editing pages or paused", [pathParam("projectId"), pathParam("sessionId")], "Whether the session is closed"),
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", required: ["mode"], properties: { mode: { type: "string", enum: ["leave", "idle", "stale"], description: "idle closes only after the server saw 30 minutes without saves; stale only if lastActivityAt is still the session's" }, lastActivityAt: { type: "string", format: "date-time" } } } } },
      },
      responses: {
        "200": { description: "closed is false when an idle close found the session still being edited" },
        "400": { description: "Invalid request" },
        "401": { description: "Not signed in" },
        "404": { description: "Project or session of this person not found" },
      },
    },
  },
  "/api/projects/{projectId}/schedule-shifts/sessions/review": {
    post: {
      ...securedOperation(tags, "Mark the person's finished sessions looked at: they are not asked about again", [pathParam("projectId")], "Number of sessions marked"),
      requestBody: {
        required: true,
        content: { "application/json": { schema: { type: "object", required: ["sessionIds"], properties: { sessionIds: { type: "array", minItems: 1, maxItems: 100, items: { type: "string" } } } } } },
      },
      responses: {
        "200": { description: "Sessions marked" },
        "400": { description: "Invalid request" },
        "401": { description: "Not signed in" },
        "404": { description: "Project not found" },
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
