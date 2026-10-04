import { z } from "zod";
import type { JiraAnalyticsIssueData } from "./jira-analytics-evaluation-types.js";

/**
 * A slice of a project's Jira work: the filters of the bar above all widgets.
 * Within a field any chosen value matches, across fields all must; an empty
 * string means "not set" (no assignee, no epic, no sprint...). It narrows the
 * issues every widget counts, whatever the widget's own filters.
 */

export const JIRA_SLICE_FIELDS = ["assignees", "statusCategories", "statuses", "issueTypes", "priorities", "sprints", "epics", "labels", "components", "fixVersions"] as const;
export type JiraSliceField = (typeof JIRA_SLICE_FIELDS)[number];
export const JIRA_SLICE_MAX_VALUES = 100;

const values = z.array(z.string().max(200)).max(JIRA_SLICE_MAX_VALUES).default([]);

export const jiraAnalyticsSliceSchema = z
  .object({
    assignees: values,
    statusCategories: z.array(z.enum(["new", "indeterminate", "done", ""])).max(4).default([]),
    statuses: values,
    issueTypes: values,
    priorities: values,
    sprints: values,
    epics: values,
    labels: values,
    components: values,
    fixVersions: values,
  })
  .strict();
export type JiraAnalyticsSlice = z.infer<typeof jiraAnalyticsSliceSchema>;

export const JIRA_EMPTY_SLICE: JiraAnalyticsSlice = jiraAnalyticsSliceSchema.parse({});

/** A saved slice: a SavedView of this type belongs to one project. */
export const JIRA_SLICE_VIEW_TYPE = "jira-slice";
export const jiraSavedSliceConfigSchema = z.object({ version: z.literal(1), slice: jiraAnalyticsSliceSchema }).strict();

export function jiraSliceIsEmpty(slice: JiraAnalyticsSlice | null | undefined) {
  return !slice || JIRA_SLICE_FIELDS.every((field) => slice[field].length === 0);
}

/** The values one issue has for one field; an issue without a value has "". */
/** What a slice looks at in an issue. */
export type JiraSliceIssue = Pick<JiraAnalyticsIssueData, "assignee" | "status" | "issueType" | "priority" | "sprint" | "labels" | "attributes">;

export function jiraIssueSliceValues(issue: JiraSliceIssue, field: JiraSliceField): string[] {
  const attributes = issue.attributes ?? null;
  const one = (value: string | null | undefined) => [value?.trim() ? value : ""];
  const many = (list: string[] | undefined) => (list && list.length > 0 ? list : [""]);
  switch (field) {
    case "assignees":
      return one(issue.assignee);
    case "statusCategories":
      return one(attributes?.statusCategoryKey);
    case "statuses":
      return one(issue.status);
    case "issueTypes":
      return one(issue.issueType);
    case "priorities":
      return one(issue.priority);
    case "sprints":
      return one(issue.sprint);
    case "epics":
      return one(attributes?.epicKey);
    case "labels":
      return many(issue.labels);
    case "components":
      return many(attributes?.components);
    case "fixVersions":
      return many(attributes?.fixVersions);
  }
}

export function jiraIssueMatchesSlice(issue: JiraSliceIssue, slice: JiraAnalyticsSlice | null | undefined) {
  if (jiraSliceIsEmpty(slice)) return true;
  return JIRA_SLICE_FIELDS.every((field) => {
    const wanted = slice![field] as string[];
    if (wanted.length === 0) return true;
    const own = jiraIssueSliceValues(issue, field);
    return own.some((value) => wanted.includes(value));
  });
}

/** A slice in a link: base64url of its JSON, only the fields that are set. */
export function encodeJiraSlice(slice: JiraAnalyticsSlice) {
  const compact = Object.fromEntries(JIRA_SLICE_FIELDS.filter((field) => slice[field].length > 0).map((field) => [field, slice[field]]));
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeJiraSlice(text: string): JiraAnalyticsSlice | null {
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    const parsed = jiraAnalyticsSliceSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
