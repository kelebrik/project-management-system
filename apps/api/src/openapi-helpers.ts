export const pathParam = (name: string) => ({
  name,
  in: "path",
  required: true,
  schema: { type: "string" },
});

export const securedOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
  successDescription = "Operation completed",
) => ({
  tags,
  summary,
  security: [{ sessionCookie: [] }],
  ...(parameters.length > 0 ? { parameters } : {}),
  responses: {
    "200": { description: successDescription },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission denied" },
    "404": { description: "Resource not found" },
    "423": { description: "Project is closed and read-only" },
  },
});

export const apiSecuredOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
  successDescription = "Operation completed",
) => ({
  ...securedOperation(tags, summary, parameters, successDescription),
  security: [{ sessionCookie: [] }, { bearerApiToken: [] }],
});

export const createOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
  successDescription = "Created",
) => ({
  ...securedOperation(tags, summary, parameters, successDescription),
  responses: {
    "201": { description: successDescription },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission denied" },
    "404": { description: "Resource not found" },
    "423": { description: "Project is closed and read-only" },
  },
});

export const deleteOperation = (
  tags: string[],
  summary: string,
  parameters: ReturnType<typeof pathParam>[] = [],
) => ({
  ...securedOperation(tags, summary, parameters, "Deleted"),
  responses: {
    "204": { description: "Deleted" },
    "400": { description: "Validation error" },
    "401": { description: "Authentication required" },
    "403": { description: "Permission denied" },
    "404": { description: "Resource not found" },
    "423": { description: "Project is closed and read-only" },
  },
});

export const projectIdParam = pathParam("projectId");
export const itemIdParam = pathParam("itemId");
export const issueIdParam = pathParam("issueId");

export const jiraAggregateErrorResponses = {
  "400": { description: "Validation error" },
  "401": { description: "Authentication required" },
  "403": { description: "Permission denied" },
  "404": { description: "Resource not found" },
  "409": { description: "Version, usage, or dashboard configuration conflict" },
  "413": { description: "The project analytics issue, event, group, or page-window limit was exceeded" },
  "423": { description: "Project is closed and read-only" },
  "500": { description: "Runtime locale support is unavailable" },
};
export const jiraSemanticQueryRequestBody = {
  required: true,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/JiraSemanticQuery" },
    },
  },
};
