import { createTranslator } from "../i18n/translate";
import { createFormatters } from "../i18n/formatters";
import { createDomainLabels } from "../i18n/domainLabels";
import type { Locale } from "../i18n/types";
import {
  labels,
  type IssueSeverity,
  type ProjectStatus,
  type RagStatus,
  type RaidItemStatus,
  type RaidItemType,
  type WbsItemStatus,
  type WbsItemType,
} from "@pms/shared";

type ProjectOption = {
  code: string;
  name: string;
};

type IssueJiraLinkLike = {
  jiraKey: string;
  jiraUrl: string;
};

type IssueLike = {
  jiraTicketKey: string | null;
  jiraTicketUrl: string | null;
  jiraLinks: IssueJiraLinkLike[];
};

export function projectOptionLabel(project: ProjectOption) {
  return `${project.code} - ${project.name}`;
}

export function projectStatusLabel(status: ProjectStatus) {
  return labels.projectStatus[status];
}

export function projectHealthLabel(rag: RagStatus) {
  return labels.rag[rag];
}

export function projectScheduleHealth(
  rag: RagStatus,
  scheduleVarianceDays: number,
  locale: Locale = "ru",
) {
  if (scheduleVarianceDays > 10) {
    return {
      tone: "red" as const,
      label: createTranslator(locale)("topbar.delay", { days: createFormatters(locale).signedDaysLabel(scheduleVarianceDays) }),
    };
  }
  if (scheduleVarianceDays > 0) {
    return {
      tone: "amber" as const,
      label: createTranslator(locale)("topbar.delay", { days: createFormatters(locale).signedDaysLabel(scheduleVarianceDays) }),
    };
  }
  return {
    tone: rag.toLowerCase() as Lowercase<RagStatus>,
    label: createDomainLabels(locale).projectHealthLabel(rag),
  };
}

export function ragOptionLabel(rag: RagStatus) {
  const ragLabels: Record<RagStatus, string> = {
    GREEN: "Зеленый",
    AMBER: "Желтый",
    RED: "Красный",
  };
  return ragLabels[rag];
}

export function wbsTypeLabel(type: WbsItemType) {
  return labels.wbsType[type];
}

export function wbsStatusLabel(status: WbsItemStatus) {
  return labels.wbsStatus[status];
}

export function issueSeverityLabel(severity: IssueSeverity) {
  return labels.issueSeverity[severity];
}

export function issueStatusLabel(status: string) {
  return (
    labels.openIssueStatus[status as keyof typeof labels.openIssueStatus] ??
    status
  );
}

export function issuePrimaryJiraLink(issue: IssueLike) {
  const linkedIssue = issue.jiraTicketKey
    ? issue.jiraLinks.find((link) => link.jiraKey === issue.jiraTicketKey) ??
      issue.jiraLinks[0]
    : issue.jiraLinks[0];
  const key = issue.jiraTicketKey || linkedIssue?.jiraKey || "";
  const url = issue.jiraTicketUrl || linkedIssue?.jiraUrl || "";
  return { key, url };
}

export function artifactStatusLabel(status: string) {
  const artifactStatusLabels: Record<string, string> = {
    Draft: "Черновик",
    "In Review": "На согласовании",
    Approved: "Одобрен",
    Baseline: "Базовый план",
    Archived: "Архив",
  };
  return artifactStatusLabels[status] ?? status;
}

export function raidTypeLabel(type: RaidItemType) {
  return labels.raidType[type];
}

export function raidStatusLabel(status: RaidItemStatus) {
  return labels.raidStatus[status];
}

export function riskTone(score: number): "red" | "amber" | "green" {
  if (score >= 15) return "red";
  if (score >= 8) return "amber";
  return "green";
}
