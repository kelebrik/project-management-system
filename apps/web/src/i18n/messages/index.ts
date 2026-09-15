import { commonMessages } from "./common";
import { adminMessages } from "./admin";
import { jiraMessages } from "./jira";
import { automationMessages } from "./automation";
import { projectsMessages } from "./projects";
import { portfolioMessages } from "./portfolio";
import { reportsMessages } from "./reports";
import { resourcesMessages } from "./resources";
import { wikiMessages } from "./wiki";
export const catalogue = {
  ...commonMessages,
  ...adminMessages,
  ...jiraMessages,
  ...automationMessages,
  ...projectsMessages,
  ...portfolioMessages,
  ...reportsMessages,
  ...resourcesMessages,
  ...wikiMessages,
} as const;
