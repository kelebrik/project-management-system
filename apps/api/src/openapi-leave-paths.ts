import { apiSecuredOperation, createOperation, deleteOperation, pathParam } from "./openapi-helpers.js";

const tags = ["LeaveSchedule"];
const isoDate = { type: "string", format: "date", example: "2026-07-06" } as const;

const dateQuery = (name: string, description: string) => ({
  name,
  in: "query",
  required: true,
  description,
  schema: isoDate,
});

const jsonBody = (properties: Record<string, unknown>, required: string[] = []) => ({
  required: true,
  content: {
    "application/json": {
      schema: { type: "object", ...(required.length > 0 ? { required } : {}), properties },
    },
  },
});

const employeeProperties = {
  name: { type: "string", maxLength: 200 },
  department: { type: "string", maxLength: 200 },
  userId: {
    type: ["string", "null"],
    description: "Optional link to an active system user; each user links to at most one person",
  },
  isActive: { type: "boolean" },
  sortOrder: { type: "integer" },
};

const typeProperties = {
  name: { type: "string", maxLength: 100 },
  nameEn: { type: "string", maxLength: 100 },
  color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
  isActive: { type: "boolean" },
  sortOrder: { type: "integer" },
};

const leaveProperties = {
  employeeId: { type: "string" },
  typeId: { type: "string" },
  startDate: isoDate,
  endDate: { ...isoDate, description: "Inclusive; not earlier than startDate" },
  comment: { type: "string", maxLength: 2000 },
};

const userLinkResponse = {
  "409": { description: "The system user is already linked to another person" },
};

const overlapResponse = {
  "409": { description: "The leave overlaps another leave of the same person" },
};

export const openApiLeavePaths = {
  "/api/leave-schedule": {
    get: {
      ...apiSecuredOperation(tags, "Leave schedule for a period: people, leave types, leaves and calendar days"),
      parameters: [
        dateQuery("from", "First day of the period"),
        dateQuery("to", "Last day of the period, inclusive"),
      ],
    },
  },
  "/api/employees": {
    get: apiSecuredOperation(["LeaveSchedule"], "Active people from the leave schedule directory, for pickers in other modules"),
  },
  "/api/workload": {
    get: {
      ...apiSecuredOperation(
        ["LeaveSchedule"],
        "Leaf work with owners and dates across open projects, with people, leaves and calendar days, for a period of up to six years",
      ),
      parameters: [dateQuery("from", "First day of the period"), dateQuery("to", "Last day of the period, inclusive")],
    },
  },
  "/api/leave-schedule/employees": {
    post: (() => {
      const operation = createOperation(tags, "Add a person to the leave schedule");
      return {
        ...operation,
        requestBody: jsonBody(employeeProperties, ["name"]),
        responses: { ...operation.responses, ...userLinkResponse },
      };
    })(),
  },
  "/api/leave-schedule/employees/{employeeId}": {
    patch: (() => {
      const operation = apiSecuredOperation(tags, "Update a person on the leave schedule", [pathParam("employeeId")]);
      return {
        ...operation,
        requestBody: jsonBody(employeeProperties),
        responses: { ...operation.responses, ...userLinkResponse },
      };
    })(),
    delete: apiSecuredOperation(tags, "Remove a person, or archive them if they have leaves", [
      pathParam("employeeId"),
    ]),
  },
  "/api/leave-schedule/types": {
    post: {
      ...createOperation(tags, "Create a leave type"),
      requestBody: jsonBody(typeProperties, ["name", "color"]),
    },
  },
  "/api/leave-schedule/types/{typeId}": {
    patch: {
      ...apiSecuredOperation(tags, "Update or disable a leave type", [pathParam("typeId")]),
      requestBody: jsonBody(typeProperties),
    },
  },
  "/api/leave-schedule/leaves": {
    post: (() => {
      const operation = createOperation(tags, "Record a leave");
      return {
        ...operation,
        requestBody: jsonBody(leaveProperties, ["employeeId", "typeId", "startDate", "endDate"]),
        responses: { ...operation.responses, ...overlapResponse },
      };
    })(),
  },
  "/api/leave-schedule/leaves/bulk-delete": {
    post: {
      ...apiSecuredOperation(tags, "Delete several leaves"),
      requestBody: jsonBody({ ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 1000 } }, ["ids"]),
    },
  },
  "/api/leave-schedule/leaves/{leaveId}": {
    patch: (() => {
      const operation = apiSecuredOperation(tags, "Update a leave", [pathParam("leaveId")]);
      return {
        ...operation,
        requestBody: jsonBody(leaveProperties),
        responses: { ...operation.responses, ...overlapResponse },
      };
    })(),
    delete: deleteOperation(tags, "Delete a leave", [pathParam("leaveId")]),
  },
  "/api/leave-schedule/calendar-days/{date}": {
    put: {
      ...apiSecuredOperation(tags, "Mark a calendar day as working or non-working", [pathParam("date")]),
      requestBody: jsonBody(
        { isWorkingDay: { type: "boolean" }, description: { type: "string", maxLength: 200 } },
        ["isWorkingDay"],
      ),
    },
    delete: deleteOperation(tags, "Reset a calendar day to the Monday-to-Friday week", [pathParam("date")]),
  },
} as const;
