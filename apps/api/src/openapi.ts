import { openApiAutomationPaths } from './openapi-automation-paths.js';
import { openApiAdminPaths } from "./openapi-admin-paths.js";
import { openApiComponents } from "./openapi-components.js";
import { openApiCorePaths } from "./openapi-core-paths.js";
import { openApiJiraPaths } from "./openapi-jira-paths.js";

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Project Management System API",
    version: "0.1.0",
    description:
      "REST API для портфеля проектов, Структуры, Гантта, открытых вопросов, рисков, базового плана и административного контура.",
  },
  servers: [
    {
      url: "/",
      description: "Текущий хост приложения",
    },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Projects" },
    { name: "WBS" },
    { name: "Baseline" },
    { name: "OpenIssues" },
    { name: "Risks" },
    { name: "Jira" },
    { name: "ExecutiveOverview" },
    { name: "Search" },
    { name: "SavedViews" },
    { name: "Integrations" },
    { name: "Admin" },
    { name: "Audit" },
    { name: "Analytics" },
  ],
  components: openApiComponents,
  paths: {
    ...openApiCorePaths,
    ...openApiAutomationPaths,
    ...openApiJiraPaths,
    ...openApiAdminPaths,
  },
} as const;
