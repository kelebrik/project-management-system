import {
  apiSecuredOperation,
  createOperation,
  deleteOperation,
  pathParam,
  projectIdParam,
  securedOperation,
} from "./openapi-helpers.js";

export const openApiAdminPaths = {
    "/api/admin/business-units/{businessUnitId}": {
      patch: {
        ...securedOperation(["Admin"], "Rename a business unit and its project portfolio labels (system admin only)", [pathParam("businessUnitId")]),
        requestBody: {
          required: true,
          content: { "application/json": { schema: {
            type: "object", additionalProperties: false, required: ["name"],
            properties: { name: { type: "string", minLength: 2, maxLength: 120 } },
          } } },
        },
      },
    },
    "/api/executive-overviews/{overviewId}/status": {
      post: securedOperation(
        ["ExecutiveOverview"],
        "Move executive overview through review or approval workflow",
        [pathParam("overviewId")],
        "Executive overview status updated",
      ),
    },
    "/api/executive-overviews/{overviewId}/publish": {
      post: securedOperation(
        ["ExecutiveOverview"],
        "Publish approved executive overview version",
        [pathParam("overviewId")],
        "Executive overview published",
      ),
    },
    "/api/executive-overviews/{overviewId}/export.json": {
      get: securedOperation(
        ["ExecutiveOverview"],
        "Export executive overview version as JSON",
        [pathParam("overviewId")],
        "JSON export",
      ),
    },
    "/api/executive-overviews/{overviewId}/export.html": {
      get: securedOperation(
        ["ExecutiveOverview"],
        "Export executive overview version as standalone HTML",
        [pathParam("overviewId")],
        "HTML export",
      ),
    },
    "/api/projects/{projectId}/executive-overviews/generate": {
      post: {
        tags: ["ExecutiveOverview"],
        summary: "Generate executive overview version",
        security: [{ sessionCookie: [] }],
        parameters: [
          { name: "projectId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "201": { description: "Overview version generated" },
        },
      },
    },
    "/api/project-modules": {
      get: {
        tags: ["Admin"],
        summary: "Visible project module configuration",
        responses: {
          "200": { description: "Project module visibility settings" },
        },
      },
    },
    "/api/users": {
      get: securedOperation(["Admin"], "List users for administration"),
      post: createOperation(["Admin"], "Create user"),
    },
    "/api/users/{userId}": {
      patch: securedOperation(["Admin"], "Update user profile, role or active flag", [
        pathParam("userId"),
      ]),
    },
    "/api/audit-events": {
      get: {
        tags: ["Audit"],
        summary: "Audit log for administrators",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Audit events" },
          "403": { description: "Admin role required" },
        },
      },
    },
    "/api/admin/system-health": {
      get: securedOperation(["Admin"], "System health for Admin Back Office"),
    },
    "/api/admin/integrations": {
      get: apiSecuredOperation(
        ["Admin", "Integrations"],
        "API tokens, webhooks and enterprise integration settings",
      ),
    },
    "/api/admin/api-tokens": {
      post: apiSecuredOperation(["Admin", "Integrations"], "Create API token"),
    },
    "/api/admin/api-tokens/{tokenId}": {
      patch: apiSecuredOperation(["Admin", "Integrations"], "Update API token", [
        pathParam("tokenId"),
      ]),
      delete: deleteOperation(["Admin", "Integrations"], "Disable API token", [
        pathParam("tokenId"),
      ]),
    },
    "/api/admin/webhooks": {
      post: apiSecuredOperation(["Admin", "Integrations"], "Create webhook endpoint"),
    },
    "/api/admin/webhooks/{endpointId}": {
      patch: apiSecuredOperation(["Admin", "Integrations"], "Update webhook endpoint", [
        pathParam("endpointId"),
      ]),
      delete: deleteOperation(["Admin", "Integrations"], "Disable webhook endpoint", [
        pathParam("endpointId"),
      ]),
    },
    "/api/admin/webhooks/{endpointId}/test": {
      post: apiSecuredOperation(["Admin", "Integrations"], "Send test webhook event", [
        pathParam("endpointId"),
      ]),
    },
    "/api/admin/backup-status": {
      get: securedOperation(["Admin"], "Backup and restore status for Admin Back Office"),
    },
    "/api/admin/wbs-tombstones/{tombstoneId}/restore": {
      post: {
        ...securedOperation(
          ["Admin", "Audit", "WBS"],
          "Restore deleted WBS items from a 30-day tombstone",
          [pathParam("tombstoneId")],
          "WBS items restored into a new phase",
        ),
        responses: {
          "200": { description: "WBS items restored into a new phase" },
          "400": { description: "Tombstone payload cannot be restored" },
          "401": { description: "Authentication required" },
          "403": { description: "Admin role required" },
          "404": { description: "Tombstone not found" },
          "409": { description: "Tombstone already restored" },
          "410": { description: "Tombstone retention period expired" },
        },
      },
    },
    "/api/admin/config/export": {
      get: securedOperation(["Admin"], "Export admin configuration"),
    },
    "/api/admin/config/import": {
      post: securedOperation(["Admin"], "Import admin configuration"),
    },
    "/api/admin/project-modules": {
      put: securedOperation(["Admin"], "Update project module visibility settings"),
    },
    "/api/admin/projects/{projectId}/business-unit": {
      patch: securedOperation(["Admin"], "Move a project subtree to another business unit", [
        pathParam("projectId"),
      ]),
    },
    "/api/admin/role-permissions/{permissionId}": {
      patch: securedOperation(["Admin"], "Enable or disable role permission", [
        pathParam("permissionId"),
      ]),
    },
    "/api/admin/dictionary-items": {
      post: createOperation(["Admin"], "Create or upsert dictionary item"),
    },
    "/api/admin/dictionary-items/{itemId}": {
      patch: securedOperation(["Admin"], "Update dictionary item", [pathParam("itemId")]),
      delete: deleteOperation(["Admin"], "Deactivate dictionary item", [pathParam("itemId")]),
    },
    "/api/admin/system-settings": {
      put: securedOperation(["Admin"], "Update system settings including Jira settings"),
    },
    "/api/admin/config": {
      get: {
        tags: ["Admin"],
        summary: "Admin back office configuration",
        security: [{ sessionCookie: [] }],
        responses: {
          "200": { description: "Roles, permissions, dictionaries, settings" },
        },
      },
    },
} as const;
