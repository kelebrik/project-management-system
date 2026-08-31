import { useState } from "react";
import {
  emptyIssueForm,
  type IssueEditDraft,
  type IssueFormState,
  type JiraLinkDraft,
  type TaskJiraDraft,
} from "../app/formState";

export function useIssueState() {
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueFormState>(emptyIssueForm);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskJiraDraft>>({});
  const [issueLinkDrafts, setIssueLinkDrafts] = useState<
    Record<string, JiraLinkDraft>
  >({});
  const [issueEditDrafts, setIssueEditDrafts] = useState<
    Record<string, IssueEditDraft>
  >({});
  const [issueStatusDrafts, setIssueStatusDrafts] = useState<
    Record<string, { text: string }>
  >({});
  const [issueFormErrors, setIssueFormErrors] = useState<
    Partial<Record<"title", string>>
  >({});
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [issueDrawerMode, setIssueDrawerMode] = useState<"create" | null>(null);

  return {
    creatingIssue,
    setCreatingIssue,
    issueForm,
    setIssueForm,
    taskDrafts,
    setTaskDrafts,
    issueLinkDrafts,
    setIssueLinkDrafts,
    issueEditDrafts,
    setIssueEditDrafts,
    issueStatusDrafts,
    setIssueStatusDrafts,
    issueFormErrors,
    setIssueFormErrors,
    expandedIssueId,
    setExpandedIssueId,
    issueDrawerMode,
    setIssueDrawerMode,
  };
}
