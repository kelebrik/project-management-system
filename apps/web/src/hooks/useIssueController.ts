import {
  useCallback,
  useRef,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { Issue, IssueStatusUpdate, ProjectDetails } from "../app/domainTypes";
import { emptyIssueForm, type IssueEditDraft, type IssueFormState, type JiraLinkDraft, type TaskJiraDraft } from "../app/formState";
import { apiBase, authenticatedFetch, responseErrorMessage } from "../app/http";
import { useConfirm } from "./useConfirm";

type IssueStatusDraft = { text: string };

type UseIssueControllerOptions = {
  projectId: string | null;
  issueForm: IssueFormState;
  setIssueForm: Dispatch<SetStateAction<IssueFormState>>;
  taskDrafts: Record<string, TaskJiraDraft>;
  issueLinkDrafts: Record<string, JiraLinkDraft>;
  setIssueLinkDrafts: Dispatch<SetStateAction<Record<string, JiraLinkDraft>>>;
  issueEditDrafts: Record<string, IssueEditDraft>;
  setIssueEditDrafts: Dispatch<SetStateAction<Record<string, IssueEditDraft>>>;
  issueStatusDrafts: Record<string, IssueStatusDraft>;
  setIssueStatusDrafts: Dispatch<SetStateAction<Record<string, IssueStatusDraft>>>;
  setIssueFormErrors: Dispatch<
    SetStateAction<Partial<Record<"title", string>>>
  >;
  setCreatingIssue: Dispatch<SetStateAction<boolean>>;
  setIssueDrawerMode: Dispatch<SetStateAction<"create" | null>>;
  setProject: Dispatch<SetStateAction<ProjectDetails | null>>;
  refreshProject: (projectId?: string) => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function useIssueController({
  projectId,
  issueForm,
  setIssueForm,
  taskDrafts,
  issueLinkDrafts,
  setIssueLinkDrafts,
  issueEditDrafts,
  setIssueEditDrafts,
  issueStatusDrafts,
  setIssueStatusDrafts,
  setIssueFormErrors,
  setCreatingIssue,
  setIssueDrawerMode,
  setProject,
  refreshProject,
  setError,
  setNotice,
}: UseIssueControllerOptions) {
  const confirm = useConfirm();
  const issueSaveSequencesRef = useRef<Record<string, number>>({});

  const mergeIssuePatch = useCallback(
    (
      issueId: string,
      updatedIssue: Issue,
      acceptedFields: Array<keyof IssueEditDraft>,
    ) => {
      setProject((currentProject) => {
        if (!currentProject) return currentProject;
        const currentIssue = currentProject.issues.find((issue) => issue.id === issueId)
          ?? currentProject.closedIssues?.find((issue) => issue.id === issueId);
        if (!currentIssue) return currentProject;

        const nextIssue: Issue = { ...currentIssue };
        for (const field of acceptedFields) {
          Object.assign(nextIssue, { [field]: updatedIssue[field as keyof Issue] });
        }
        if (acceptedFields.includes("dueDate")) {
          nextIssue.initialDueDate = updatedIssue.initialDueDate;
        }
        if (acceptedFields.includes("status")) {
          nextIssue.closedDelayDays = updatedIssue.closedDelayDays;
        }
        nextIssue.updatedAt = updatedIssue.updatedAt;

        const isClosed = ["resolved", "closed", "done"].includes(
          nextIssue.status.trim().toLowerCase(),
        );
        return {
          ...currentProject,
          issues: isClosed
            ? currentProject.issues.filter((issue) => issue.id !== issueId)
            : currentProject.issues.some((issue) => issue.id === issueId)
              ? currentProject.issues.map((issue) => issue.id === issueId ? nextIssue : issue)
              : [...currentProject.issues, nextIssue],
          closedIssues: isClosed
            ? (currentProject.closedIssues ?? []).some((issue) => issue.id === issueId)
              ? (currentProject.closedIssues ?? []).map((issue) => issue.id === issueId ? nextIssue : issue)
              : [...(currentProject.closedIssues ?? []), nextIssue]
            : (currentProject.closedIssues ?? []).filter((issue) => issue.id !== issueId),
        };
      });
    },
    [setProject],
  );

  const mergeIssueStatusUpdate = useCallback(
    (issueId: string, statusUpdate: IssueStatusUpdate) => {
      setProject((currentProject) => {
        if (!currentProject) return currentProject;
        const mergeStatus = (issue: Issue) => issue.id === issueId
          ? {
              ...issue,
              statusUpdates: [
                statusUpdate,
                ...issue.statusUpdates.filter((update) => update.id !== statusUpdate.id),
              ],
            }
          : issue;
        return {
          ...currentProject,
          issues: currentProject.issues.map(mergeStatus),
          closedIssues: currentProject.closedIssues?.map(mergeStatus),
        };
      });
    },
    [setProject],
  );
  const createOpenIssue = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId) return;
      const nextErrors: Partial<Record<"title", string>> = {};
      if (!issueForm.title.trim()) {
        nextErrors.title = "Заполните заголовок";
      }
      setIssueFormErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
      setCreatingIssue(true);
      setError(null);
      setNotice(null);
      try {
        const payload = {
          ...issueForm,
          phaseId: issueForm.phaseId || null,
          category: issueForm.category.trim(),
          title: issueForm.title.trim(),
          referenceLabel: issueForm.referenceLabel.trim(),
          referenceUrl: issueForm.referenceUrl.trim() || null,
          owner: issueForm.owner.trim(),
          impact: issueForm.impact.trim(),
          dueDate: issueForm.dueDate || null,
          jiraTicketKey: issueForm.jiraTicketKey.trim() || null,
          jiraLinks: issueForm.jiraLinks.filter(
            (link) => link.jiraKey.trim(),
          ).map((link) => ({ jiraKey: link.jiraKey.trim() })),
        };
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${projectId}/open-issues`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseErrorMessage(result, "Не удалось создать открытый вопрос"),
          );
        }
        setIssueForm(emptyIssueForm);
        setIssueFormErrors({});
        await refreshProject(projectId);
        setIssueDrawerMode(null);
        setNotice("Открытый вопрос создан");
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось создать открытый вопрос",
        );
      } finally {
        setCreatingIssue(false);
      }
    },
    [
      issueForm,
      projectId,
      refreshProject,
      setCreatingIssue,
      setError,
      setIssueDrawerMode,
      setIssueForm,
      setIssueFormErrors,
      setNotice,
    ],
  );

  const saveTaskJiraLink = useCallback(
    async (taskId: string) => {
      const draft = taskDrafts[taskId];
      if (!draft) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/tasks/${taskId}/jira-link`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jiraTicketKey: draft.jiraTicketKey || null,
              jiraTicketUrl: draft.jiraTicketUrl || null,
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось сохранить ссылку",
          );
        }
        await refreshProject();
        setNotice("Ссылка задачи на Jira сохранена");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить ссылку",
        );
      }
    },
    [refreshProject, setError, setNotice, taskDrafts],
  );

  const updateIssueFormLink = useCallback(
    (index: number, patch: Partial<JiraLinkDraft>) => {
      setIssueForm({
        ...issueForm,
        jiraLinks: issueForm.jiraLinks.map((link, linkIndex) =>
          linkIndex === index ? { ...link, ...patch } : link,
        ),
      });
    },
    [issueForm, setIssueForm],
  );

  const addIssueFormLink = useCallback(() => {
    setIssueForm({
      ...issueForm,
      jiraLinks: [...issueForm.jiraLinks, { jiraKey: "" }],
    });
  }, [issueForm, setIssueForm]);

  const removeIssueFormLink = useCallback(
    (index: number) => {
      setIssueForm({
        ...issueForm,
        jiraLinks:
          issueForm.jiraLinks.length === 1
            ? [{ jiraKey: "" }]
            : issueForm.jiraLinks.filter((_, linkIndex) => linkIndex !== index),
      });
    },
    [issueForm, setIssueForm],
  );

  const addIssueJiraLink = useCallback(
    async (issueId: string) => {
      const draft = issueLinkDrafts[issueId];
      if (!draft?.jiraKey.trim()) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}/jira-links`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jiraKey: draft.jiraKey.trim() }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось добавить задачу Jira",
          );
        }
        setIssueLinkDrafts((drafts) => ({
          ...drafts,
          [issueId]: { jiraKey: "" },
        }));
        await refreshProject();
        setNotice("Задача Jira добавлена к открытому вопросу");
      } catch (addError) {
        setError(
          addError instanceof Error
            ? addError.message
            : "Не удалось добавить задачу Jira",
        );
      }
    },
    [issueLinkDrafts, refreshProject, setError, setIssueLinkDrafts, setNotice],
  );

  const updateIssueJiraLink = useCallback(
    async (issueId: string, linkId: string, jiraKey: string) => {
      const normalizedKey = jiraKey.trim();
      if (!normalizedKey) return { ok: false as const, error: "Укажите ключ Jira" };
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          linkId.startsWith("primary-")
            ? `${apiBase}/api/open-issues/${issueId}`
            : `${apiBase}/api/open-issues/${issueId}/jira-links/${linkId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(linkId.startsWith("primary-")
              ? { jiraTicketKey: normalizedKey }
              : { jiraKey: normalizedKey }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(responseErrorMessage(result, "Не удалось изменить ключ Jira"));
        }
        await refreshProject();
        setNotice("Ключ Jira обновлён");
        return { ok: true as const };
      } catch (updateError) {
        const error = updateError instanceof Error
          ? updateError.message
          : "Не удалось изменить ключ Jira";
        setError(error);
        return { ok: false as const, error };
      }
    },
    [refreshProject, setError, setNotice],
  );

  const removeIssueJiraLink = useCallback(
    async (issueId: string, linkId: string) => {
      setError(null);
      setNotice(null);
      try {
        const syntheticPrimary = linkId.startsWith("primary-");
        const response = await authenticatedFetch(
          syntheticPrimary
            ? `${apiBase}/api/open-issues/${issueId}`
            : `${apiBase}/api/open-issues/${issueId}/jira-links/${linkId}`,
          {
            method: syntheticPrimary ? "PATCH" : "DELETE",
            headers: syntheticPrimary ? { "Content-Type": "application/json" } : undefined,
            body: syntheticPrimary ? JSON.stringify({ jiraTicketKey: null }) : undefined,
          },
        );
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error ?? "Не удалось удалить задачу Jira");
        }
        await refreshProject();
        setNotice("Задача Jira удалена из открытого вопроса");
      } catch (removeError) {
        setError(
          removeError instanceof Error
            ? removeError.message
            : "Не удалось удалить задачу Jira",
        );
      }
    },
    [refreshProject, setError, setNotice],
  );

  const updateIssueDraft = useCallback(
    (
      issueId: string,
      patch: Partial<IssueEditDraft>,
      fallback?: IssueEditDraft,
    ) => {
      setIssueEditDrafts((drafts) => {
        const current = drafts[issueId] ?? fallback;
        if (!current) return drafts;
        return {
          ...drafts,
          [issueId]: { ...current, ...patch },
        };
      });
    },
    [setIssueEditDrafts],
  );

  const updateIssueStatusDraft = useCallback(
    (issueId: string, patch: Partial<IssueStatusDraft>) => {
      const current =
        issueStatusDrafts[issueId] ?? { text: "" };
      setIssueStatusDrafts({
        ...issueStatusDrafts,
        [issueId]: { ...current, ...patch },
      });
    },
    [issueStatusDrafts, setIssueStatusDrafts],
  );

  const saveOpenIssueWithPayload = useCallback(
    async (
      issueId: string,
      payload: Partial<IssueEditDraft>,
      options: { quiet?: boolean; refresh?: boolean } = {},
    ) => {
      const requestSequences = Object.keys(payload).map((field) => {
        const key = `${issueId}:${field}`;
        const sequence = (issueSaveSequencesRef.current[key] ?? 0) + 1;
        issueSaveSequencesRef.current[key] = sequence;
        return { field: field as keyof IssueEditDraft, key, sequence };
      });
      if (!options.quiet) {
        setError(null);
        setNotice(null);
      }
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось сохранить открытый вопрос",
          );
        }
        const acceptedFields = requestSequences
          .filter(({ key, sequence }) => issueSaveSequencesRef.current[key] === sequence)
          .map(({ field }) => field);
        if (acceptedFields.length > 0) {
          mergeIssuePatch(issueId, result as Issue, acceptedFields);
        }
        if (options.refresh !== false) await refreshProject();
        if (!options.quiet) setNotice("Открытый вопрос обновлен");
        return { ok: true as const, issue: result };
      } catch (saveError) {
        const message = saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить открытый вопрос";
        if (!options.quiet) setError(message);
        return { ok: false as const, error: message };
      }
    },
    [mergeIssuePatch, refreshProject, setError, setNotice],
  );

  const saveOpenIssue = useCallback(
    async (issueId: string) => {
      const draft = issueEditDrafts[issueId];
      if (!draft) return;
      await saveOpenIssueWithPayload(issueId, {
        ...draft,
        phaseId: draft.phaseId || null,
        dueDate: draft.dueDate || null,
      });
    },
    [issueEditDrafts, saveOpenIssueWithPayload],
  );

  const closeOpenIssue = useCallback(
    async (issueId: string) => {
      const current = issueEditDrafts[issueId];
      if (!current) return;
      if (
        !(await confirm({
          title: "Закрыть открытый вопрос?",
          message:
            "Вопрос получит статус «Решён» и будет исключён из активного списка.",
          confirmLabel: "Закрыть",
          tone: "default",
        }))
      ) return;
      setIssueEditDrafts({
        ...issueEditDrafts,
        [issueId]: { ...current, status: "Resolved", decisionRequired: false },
      });
      await saveOpenIssueWithPayload(issueId, {
        status: "Resolved",
        decisionRequired: false,
      });
    },
    [confirm, issueEditDrafts, saveOpenIssueWithPayload, setIssueEditDrafts],
  );

  const convertIssueToProblem = useCallback(
    async (issueId: string) => {
      if (
        !(await confirm({
          title: "Перевести вопрос в проблему?",
          message:
            "На основе вопроса будет создана проблема RAID, а исходный вопрос изменит статус.",
          confirmLabel: "Перевести",
          tone: "default",
        }))
      ) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}/convert-to-problem`,
          { method: "POST" },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            responseErrorMessage(result, "Не удалось перевести вопрос в проблему"),
          );
        }
        await refreshProject();
        setNotice("Открытый вопрос переведен в проблему");
      } catch (convertError) {
        setError(
          convertError instanceof Error
            ? convertError.message
            : "Не удалось перевести вопрос в проблему",
        );
      }
    },
    [confirm, refreshProject, setError, setNotice],
  );

  const addIssueStatusUpdate = useCallback(
    async (
      issueId: string,
      options: { quiet?: boolean; refresh?: boolean } = {},
    ) => {
      const draft =
        issueStatusDrafts[issueId] ?? { text: "" };
      if (!draft.text.trim()) {
        const error = "Заполните текст статуса";
        if (!options.quiet) setError(error);
        return { ok: false as const, error };
      }
      if (!options.quiet) {
        setError(null);
        setNotice(null);
      }
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}/status-updates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: draft.text.trim(),
            }),
          },
        );
        const result = await response.json();
        if (!response.ok) {
          throw new Error(
            result.error?.formErrors?.join(", ") ||
              result.error ||
              "Не удалось добавить статус",
          );
        }
        setIssueStatusDrafts((drafts) => ({
          ...drafts,
          [issueId]: { text: "" },
        }));
        mergeIssueStatusUpdate(issueId, result as IssueStatusUpdate);
        if (options.refresh !== false) await refreshProject();
        if (!options.quiet) setNotice("Статус открытого вопроса добавлен");
        return { ok: true as const, status: result };
      } catch (statusError) {
        const error = statusError instanceof Error
          ? statusError.message
          : "Не удалось добавить статус";
        if (!options.quiet) setError(error);
        return { ok: false as const, error };
      }
    },
    [issueStatusDrafts, mergeIssueStatusUpdate, refreshProject, setError, setIssueStatusDrafts, setNotice],
  );

  return {
    createOpenIssue,
    saveTaskJiraLink,
    updateIssueFormLink,
    addIssueFormLink,
    removeIssueFormLink,
    addIssueJiraLink,
    updateIssueJiraLink,
    removeIssueJiraLink,
    updateIssueDraft,
    updateIssueStatusDraft,
    saveOpenIssue,
    closeOpenIssue,
    convertIssueToProblem,
    addIssueStatusUpdate,
    saveOpenIssueWithPayload,
  };
}
