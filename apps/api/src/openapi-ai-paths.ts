import { pathParam, securedOperation } from "./openapi-helpers.js";

const tags = ["AI"];

const aiRefusals = {
  "400": { description: "Invalid request" },
  "403": { description: "API token, public demo without permission, or no right to change the project" },
  "404": { description: "Project not found" },
  "423": { description: "Project is closed and read-only" },
  "429": { description: "An AI budget is spent" },
  "502": { description: "The provider failed" },
  "503": { description: "AI is not configured" },
};

const factRef = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["wbs", "issue", "risk", "jira"] },
    id: { type: "string" },
    label: { type: "string" },
    type: { type: "string", description: "RAID type of a risk reference" },
  },
};

const wbsDraftItem = {
  type: "object",
  required: ["ref", "title", "type"],
  properties: {
    ref: { type: "string", pattern: "^\\d+(\\.\\d+){0,3}$" },
    title: { type: "string", maxLength: 200 },
    type: { type: "string", enum: ["PHASE", "WORK_PACKAGE", "TASK", "MILESTONE"] },
    workDays: { type: "integer", minimum: 0, maximum: 250 },
    owner: { type: "string", maxLength: 120 },
    predecessors: { type: "array", maxItems: 6, items: { type: "string" } },
  },
};

const applyResult = {
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: {
          createdIds: { type: "array", items: { type: "string" } },
          replayed: { type: "boolean" },
          wbsItems: { type: "array", items: { type: "object" } },
          wbsDependencies: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
};

/** AI helpers: session only, never API tokens, because the calls cost money. */
export const openApiAiPaths = {
  "/api/ai/status": {
    get: securedOperation(tags, "Whether AI helpers are configured and allowed for the current user", [], "Provider, model and whether the user may call it"),
  },
  "/api/projects/{projectId}/meeting-drafts": {
    post: {
      ...securedOperation(
        tags,
        "Turn meeting notes into draft tasks, open issues and risks for review; nothing is created",
        [pathParam("projectId")],
        "Drafts with the quoted source and whether the source and owner were found",
      ),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["text"], properties: { text: { type: "string", minLength: 1, maxLength: 30000 } } },
          },
        },
      },
      responses: {
        "200": { description: "Drafts" },
        "400": { description: "Missing or too long text" },
        "403": { description: "API token, public demo without permission, or no right to change the project" },
        "423": { description: "Project is closed and read-only" },
        "429": { description: "An AI budget is spent" },
        "502": { description: "The provider failed" },
        "503": { description: "AI is not configured" },
      },
    },
  },
  "/api/projects/{projectId}/ai/status-report": {
    post: {
      ...securedOperation(tags, "Write a status report for management from the project's facts; nothing is saved", [pathParam("projectId")], "Report sections"),
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { periodDays: { type: "integer", enum: [7, 14, 30], default: 7 }, locale: { type: "string", enum: ["ru", "en"], default: "ru" } },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Report sections",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  report: {
                    type: "object",
                    properties: {
                      status: { type: "string", enum: ["GREEN", "AMBER", "RED"] },
                      headline: { type: "string" },
                      summary: { type: "string" },
                      done: { type: "array", items: { type: "string" } },
                      slipped: { type: "array", items: { type: "string" } },
                      risks: { type: "array", items: { type: "string" } },
                      decisions: { type: "array", items: { type: "string" } },
                      next: { type: "array", items: { type: "string" } },
                    },
                  },
                  periodDays: { type: "integer" },
                  generatedAt: { type: "string", format: "date-time" },
                  provider: { type: "string" },
                  model: { type: "string" },
                },
              },
            },
          },
        },
        ...aiRefusals,
      },
    },
  },
  "/api/projects/{projectId}/ai/wbs-draft": {
    post: {
      ...securedOperation(tags, "Draft a structure from a project description; nothing is created", [pathParam("projectId")], "Draft rows and how many links were dropped"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object", required: ["description"], properties: { description: { type: "string", minLength: 20, maxLength: 8000 } } },
          },
        },
      },
      responses: {
        "200": {
          description: "Draft rows and how many links were dropped",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  items: { type: "array", maxItems: 150, items: wbsDraftItem },
                  droppedLinks: { type: "integer" },
                  provider: { type: "string" },
                  model: { type: "string" },
                },
              },
            },
          },
        },
        ...aiRefusals,
      },
    },
  },
  "/api/projects/{projectId}/wbs-draft/apply": {
    post: {
      ...securedOperation(["WBS"], "Add a reviewed structure draft after the existing rows; the model is not called", [pathParam("projectId")], "Created row ids and the WBS snapshot"),
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["items", "draftKey"],
              properties: {
                items: { type: "array", minItems: 1, maxItems: 500, items: wbsDraftItem, description: "Checked again on the server; at most 150 rows are kept" },
                startDate: { type: "string", format: "date" },
                draftKey: { type: "string", pattern: "^[A-Za-z0-9_-]{8,64}$", description: "Repeating a key returns the rows it created instead of adding them again" },
              },
            },
          },
        },
      },
      responses: {
        "201": { description: "Draft added", ...applyResult },
        "200": { description: "This draft key was already added; nothing new is created and the rows it created are returned", ...applyResult },
        "400": { description: "Invalid draft or no rows left after the check" },
        "403": { description: "API token or no right to change the project" },
        "404": { description: "Project not found" },
        "423": { description: "Project is closed and read-only" },
      },
    },
  },
  "/api/projects/{projectId}/ai/meeting-prep": {
    post: {
      ...securedOperation(tags, "Draft a meeting agenda and whom to ask what from the project's facts; nothing is saved", [pathParam("projectId")], "Agenda"),
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { horizonDays: { type: "integer", enum: [7, 14], default: 7 }, locale: { type: "string", enum: ["ru", "en"], default: "ru" } },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Agenda; refs are checked against the facts sent, unknown ones and unknown people are dropped and counted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  agenda: {
                    type: "array",
                    maxItems: 12,
                    items: {
                      type: "object",
                      properties: {
                        topic: { type: "string" },
                        why: { type: "string" },
                        owner: { type: "string" },
                        minutes: { type: "integer", minimum: 1, maximum: 60 },
                        refs: { type: "array", items: { type: "string" } },
                      },
                    },
                  },
                  askWhom: {
                    type: "array",
                    maxItems: 15,
                    items: { type: "object", properties: { person: { type: "string" }, question: { type: "string" }, refs: { type: "array", items: { type: "string" } } } },
                  },
                  refs: { type: "object", additionalProperties: factRef },
                  droppedRefs: { type: "integer" },
                  horizonDays: { type: "integer" },
                  provider: { type: "string" },
                  model: { type: "string" },
                },
              },
            },
          },
        },
        ...aiRefusals,
      },
    },
  },
};
