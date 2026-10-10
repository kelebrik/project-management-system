// The sections the header and the command palette offer.
import type { ReactNode } from "react";
import { Archive, BarChart3, BriefcaseBusiness, CalendarDays, CircleHelp, ClipboardCheck, FileArchive, FileSpreadsheet, FileText, FolderTree, GanttChartSquare, Gavel, GitBranch, GraduationCap, Grid3x3, HardDriveDownload, HeartPulse, History, Import, KeyRound, LayoutDashboard, ListChecks, ListTodo, NotebookText, ShieldAlert, ShieldCheck, SlidersHorizontal, Users, Workflow } from "lucide-react";
import type { AppView } from "../app/routes";
import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";
import type { ProjectNavItem } from "./ProjectSidebarMenu";

export const projectNavItems: ProjectNavItem[] = [
  {
    key: "overview",
    view: "project-overview",
    label: "view.project-overview",
    icon: <LayoutDashboard size={17} />,
  },
  {
    key: "overview",
    view: "project-schedule",
    label: "view.project-schedule",
    icon: <GanttChartSquare size={17} />,
  },
  {
    key: "gantt",
    view: "project-gantt",
    label: "view.project-gantt",
    icon: <GanttChartSquare size={17} />,
  },
  {
    key: "structure",
    view: "project-current-work",
    label: "view.project-current-work",
    icon: <ListTodo size={17} />,
  },
  {
    key: "structure",
    view: "project-structure",
    label: "view.project-structure",
    icon: <ListChecks size={17} />,
  },
  {
    key: "jiraWork",
    view: "project-jira-work",
    label: "view.project-jira-work",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    key: "passport",
    view: "project-passport",
    label: "view.project-passport",
    icon: <FileText size={17} />,
  },
  {
    key: "businessRequirements",
    view: "project-business-requirements",
    label: "view.project-business-requirements",
    icon: <FileSpreadsheet size={17} />,
  },
  {
    key: "issues",
    view: "project-issues",
    label: "view.project-issues",
    icon: <ShieldAlert size={17} />,
  },
  {
    key: "issues",
    view: "project-decisions",
    label: "view.project-decisions",
    icon: <Gavel size={17} />,
  },
  {
    key: "raid",
    view: "project-raid",
    label: "view.project-raid",
    icon: <BarChart3 size={17} />,
  },
  {
    key: "artifacts",
    view: "project-artifacts",
    label: "view.project-artifacts",
    icon: <FileArchive size={17} />,
  },
  {
    key: "calendars",
    view: "project-calendars",
    label: "view.project-calendars",
    icon: <CalendarDays size={17} />,
  },
  {
    key: "overview",
    view: "project-history",
    label: "view.project-history",
    icon: <History size={17} />,
  },
];

export type AdminNavItem = {
  view: AppView;
  label: TranslationKey;
  icon: ReactNode;
};

export const adminNavItems: AdminNavItem[] = [
  {
    view: "admin-projects",
    label: "view.admin-projects",
    icon: <FolderTree size={17} />,
  },
  {
    view: "admin-business-units",
    label: "view.admin-business-units",
    icon: <BriefcaseBusiness size={17} />,
  },
  {
    view: "admin-modules",
    label: "view.admin-modules",
    icon: <SlidersHorizontal size={17} />,
  },
  {
    view: "admin-project-access",
    label: "view.admin-project-access",
    icon: <ShieldCheck size={17} />,
  },
  {
    view: "admin-users",
    label: "view.admin-users",
    icon: <Users size={17} />,
  },
  {
    view: "admin-roles",
    label: "view.admin-roles",
    icon: <KeyRound size={17} />,
  },
  {
    view: "admin-integrations",
    label: "view.admin-integrations",
    icon: <GitBranch size={17} />,
  },
  {
    view: "admin-health",
    label: "view.admin-health",
    icon: <HeartPulse size={17} />,
  },
  {
    view: "admin-backups",
    label: "view.admin-backups",
    icon: <HardDriveDownload size={17} />,
  },
  {
    view: "admin-config",
    label: "view.admin-config",
    icon: <Import size={17} />,
  },
  {
    view: "admin-audit",
    label: "view.admin-audit",
    icon: <FileText size={17} />,
  },
  {
    view: "admin-analytics",
    label: "view.admin-analytics",
    icon: <BarChart3 size={17} />,
  },
];

export const developmentNavItems: AdminNavItem[] = [
  { view: "closed-projects", label: "nav.archive", icon: <Archive size={15} /> },
  { view: "jira-reconciliation", label: "view.jira-reconciliation", icon: <CircleHelp size={15} /> },
  {
    view: "decision-queue",
    label: "view.decision-queue",
    icon: <CircleHelp size={15} />,
  },
  {
    view: "lessons-register",
    label: "view.lessons-register",
    icon: <GraduationCap size={15} />,
  },
  {
    view: "raci-matrix",
    label: "view.raci-matrix",
    icon: <Grid3x3 size={15} />,
  },
  {
    view: "my-work",
    label: "view.my-work",
    icon: <ClipboardCheck size={15} />,
  },
  {
    view: "reports",
    label: "nav.reports",
    icon: <NotebookText size={15} />,
  },
  {
    view: "automation-rules",
    label: "view.automation-rules",
    icon: <Workflow size={15} />,
  },
  {
    view: "schedule-legacy",
    label: "view.schedule-legacy",
    icon: <GanttChartSquare size={15} />,
  },
];

export const operationsNavItems: AdminNavItem[] = [
  { view: "leave-schedule", label: "view.leave-schedule", icon: <CalendarDays size={15} /> },
  { view: "workload", label: "view.workload", icon: <BarChart3 size={15} /> },
];
