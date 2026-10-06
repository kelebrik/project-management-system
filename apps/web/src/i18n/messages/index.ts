import { commonMessages } from "./common";
import { adminMessages } from "./admin";
import { jiraMessages } from "./jira";
import { automationMessages } from "./automation";
import { projectsMessages } from "./projects";
import { portfolioMessages } from "./portfolio";
import { reportsMessages } from "./reports";
import { wikiMessages } from "./wiki";
import { leaveScheduleMessages } from "./leaveSchedule";
import { workloadMessages } from "./workload";
import { jiraSliceMessages } from "./jiraSlice";
import { scheduleLinksMessages } from "./scheduleLinks";
import { aiMessages } from "./ai";
import { scheduleShiftsMessages } from "./scheduleShifts";
import { decisionsMessages } from "./decisions";
import { wbsTableMessages } from "./wbsTable";
import { automationRulesMessages } from "./automationRules";
import { pagesMessages } from "./pages";
export const catalogue = {
  ...commonMessages,
  ...adminMessages,
  ...jiraMessages,
  ...automationMessages,
  ...projectsMessages,
  ...portfolioMessages,
  ...reportsMessages,
  ...wikiMessages,
  ...leaveScheduleMessages,
  ...workloadMessages,
  ...jiraSliceMessages,
  ...scheduleLinksMessages,
  ...aiMessages,
  ...scheduleShiftsMessages,
  ...decisionsMessages,
  ...wbsTableMessages,
  ...automationRulesMessages,
  ...pagesMessages,
} as const;
