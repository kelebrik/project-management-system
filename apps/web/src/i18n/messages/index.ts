import { commonMessages } from "./common";
import { adminMessages } from "./admin";
import { jiraMessages } from "./jira";
import { automationMessages } from "./automation";
import { projectsMessages } from "./projects";
import { portfolioMessages } from "./portfolio";
import { reportsMessages } from "./reports";
import { resourcesMessages } from "./resources";
import { wikiMessages } from "./wiki";
import { leaveScheduleMessages } from "./leaveSchedule";
import { workloadMessages } from "./workload";
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
  ...leaveScheduleMessages,
  ...workloadMessages,
} as const;
