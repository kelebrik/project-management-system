import {
  useCallback,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { emptyIssueForm, type IssueEditDraft, type IssueFormState, type JiraLinkDraft, type TaskJiraDraft } from "../app/formState";
import { apiBase, authenticatedFetch, responseErrorMessage } from "../app/http";
import { isoDate } from "../app/dateUtils";

type IssueStatusDraft = { statusAt: string; text: string };

type UseIssueControllerOptions = {
  projectId: string | null;
  issueForm: IssueFormState;
  setIssueForm: Dispatch<SetStateAction<IssueFormState>>;
  taskDrafts: Record<string, TaskJiraDraft>;
  issueLinkDrafts: Record<string, JiraLinkDraft>;
  issueEditDrafts: Record<string, IssueEditDraft>;
  setIssueEditDrafts: Dispatch<SetStateAction<Record<string, IssueEditDraft>>>;
  issueStatusDrafts: Record<string, IssueStatusDraft>;
  setIssueStatusDrafts: Dispatch<SetStateAction<Record<string, IssueStatusDraft>>>;
  setIssueFormErrors: Dispatch<
    SetStateAction<Partial<Record<"title" | "jiraTicketUrl", string>>>
  >;
  setCreatingIssue: Dispatch<SetStateAction<boolean>>;
  setIssueDrawerMode: Dispatch<SetStateAction<"create" | null>>;
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
  issueEditDrafts,
  setIssueEditDrafts,
  issueStatusDrafts,
  setIssueStatusDrafts,
  setIssueFormErrors,
  setCreatingIssue,
  setIssueDrawerMode,
  refreshProject,
  setError,
  setNotice,
}: UseIssueControllerOptions) {
  const createOpenIssue = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!projectId) return;
      const nextErrors: Partial<Record<"title" | "jiraTicketUrl", string>> = {};
      if (!issueForm.title.trim()) {
        nextErrors.title = "Заполните заголовок";
      }
      if (issueForm.jiraTicketUrl.trim()) {
        try {
          new URL(issueForm.jiraTicketUrl.trim());
        } catch {
          nextErrors.jiraTicketUrl = "Некорректный Jira URL";
        }
      }
      setIssueFormErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
      setCreatingIssue(true);
      setError(null);
      setNotice(null);
      try {
        const payload = {
          ...issueForm,
          owner: issueForm.owner.trim(),
          impact: issueForm.impact.trim(),
          dueDate: issueForm.dueDate || null,
          jiraTicketKey: issueForm.jiraTicketKey.trim() || null,
          jiraTicketUrl: issueForm.jiraTicketUrl.trim() || null,
          jiraLinks: issueForm.jiraLinks.filter(
            (link) => link.jiraKey.trim() && link.jiraUrl.trim(),
          ),
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
      jiraLinks: [...issueForm.jiraLinks, { jiraKey: "", jiraUrl: "" }],
    });
  }, [issueForm, setIssueForm]);

  const removeIssueFormLink = useCallback(
    (index: number) => {
      setIssueForm({
        ...issueForm,
        jiraLinks:
          issueForm.jiraLinks.length === 1
            ? [{ jiraKey: "", jiraUrl: "" }]
            : issueForm.jiraLinks.filter((_, linkIndex) => linkIndex !== index),
      });
    },
    [issueForm, setIssueForm],
  );

  const addIssueJiraLink = useCallback(
    async (issueId: string) => {
      const draft = issueLinkDrafts[issueId];
      if (!draft?.jiraKey || !draft?.jiraUrl) return;
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}/jira-links`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(draft),
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
    [issueLinkDrafts, refreshProject, setError, setNotice],
  );

  const removeIssueJiraLink = useCallback(
    async (issueId: string, linkId: string) => {
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}/jira-links/${linkId}`,
          {
            method: "DELETE",
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
    (issueId: string, patch: Partial<IssueEditDraft>) => {
      const current = issueEditDrafts[issueId];
      if (!current) return;
      setIssueEditDrafts({
        ...issueEditDrafts,
        [issueId]: { ...current, ...patch },
      });
    },
    [issueEditDrafts, setIssueEditDrafts],
  );

  const updateIssueStatusDraft = useCallback(
    (issueId: string, patch: Partial<IssueStatusDraft>) => {
      const current =
        issueStatusDrafts[issueId] ?? { statusAt: isoDate(new Date()), text: "" };
      setIssueStatusDrafts({
        ...issueStatusDrafts,
        [issueId]: { ...current, ...patch },
      });
    },
    [issueStatusDrafts, setIssueStatusDrafts],
  );

  const saveOpenIssueWithPayload = useCallback(
    async (issueId: string, payload: Partial<IssueEditDraft>) => {
      setError(null);
      setNotice(null);
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
        await refreshProject();
        setNotice("Открытый вопрос обновлен");
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось сохранить открытый вопрос",
        );
      }
    },
    [refreshProject, setError, setNotice],
  );

  const saveOpenIssue = useCallback(
    async (issueId: string) => {
      const draft = issueEditDrafts[issueId];
      if (!draft) return;
      await saveOpenIssueWithPayload(issueId, {
        ...draft,
        dueDate: draft.dueDate || null,
        jiraTicketKey: draft.jiraTicketKey || null,
        jiraTicketUrl: draft.jiraTicketUrl || null,
      });
    },
    [issueEditDrafts, saveOpenIssueWithPayload],
  );

  const closeOpenIssue = useCallback(
    async (issueId: string) => {
      const current = issueEditDrafts[issueId];
      if (!current) return;
      setIssueEditDrafts({
        ...issueEditDrafts,
        [issueId]: { ...current, status: "Resolved", decisionRequired: false },
      });
      await saveOpenIssueWithPayload(issueId, {
        status: "Resolved",
        decisionRequired: false,
      });
    },
    [issueEditDrafts, saveOpenIssueWithPayload, setIssueEditDrafts],
  );

  const addIssueStatusUpdate = useCallback(
    async (issueId: string) => {
      const draft =
        issueStatusDrafts[issueId] ?? { statusAt: isoDate(new Date()), text: "" };
      if (!draft.text.trim()) {
        setError("Заполните текст статуса");
        return;
      }
      setError(null);
      setNotice(null);
      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/open-issues/${issueId}/status-updates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              statusAt: draft.statusAt || isoDate(new Date()),
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
        setIssueStatusDrafts({
          ...issueStatusDrafts,
          [issueId]: { statusAt: isoDate(new Date()), text: "" },
        });
        await refreshProject();
        setNotice("Статус открытого вопроса добавлен");
      } catch (statusError) {
        setError(
          statusError instanceof Error
            ? statusError.message
            : "Не удалось добавить статус",
        );
      }
    },
    [issueStatusDrafts, refreshProject, setError, setIssueStatusDrafts, setNotice],
  );

  return {
    createOpenIssue,
    saveTaskJiraLink,
    updateIssueFormLink,
    addIssueFormLink,
    removeIssueFormLink,
    addIssueJiraLink,
    removeIssueJiraLink,
    updateIssueDraft,
    updateIssueStatusDraft,
    saveOpenIssue,
    closeOpenIssue,
    addIssueStatusUpdate,
    saveOpenIssueWithPayload,
  };
}
