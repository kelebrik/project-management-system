import { pathParam, securedOperation } from "./openapi-helpers.js";

const tags = ["AI"];

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
};
