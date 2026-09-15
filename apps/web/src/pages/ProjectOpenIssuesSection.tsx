import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { Check, ExternalLink, Pencil, Plus, X } from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Issue } from "../app/domainTypes";
import { issueToDraft, type IssueEditDraft } from "../app/formState";
import { appPathForView } from "../app/routes";
import {
  OPEN_ISSUE_COLUMNS,
  normalizeOpenIssueColumnWidths,
  openIssueTableWidth,
  type OpenIssueColumnKey,
} from "../app/openIssueTable";
import { useConfirm } from "../hooks/useConfirm";
import { usePageContext } from "./PageContext";

type EditableIssueField = keyof Pick<
  IssueEditDraft,
  | "phaseId"
  | "riskId"
  | "category"
  | "title"
  | "readiness"
  | "owner"
  | "decisionRequired"
  | "dueDate"
>;

const nullableFields = new Set<EditableIssueField>(["phaseId", "riskId", "dueDate"]);

const readinessLabelKeys = {
  RED: "ui.projects.issueReadinessRed",
  AMBER: "ui.projects.issueReadinessAmber",
  GREEN: "ui.projects.issueReadinessGreen",
} as const;

function sortedStatusUpdates(issue: Issue) {
  return [...issue.statusUpdates].sort((left, right) => {
    const statusDelta = new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime();
    if (statusDelta !== 0) return statusDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function normalizedFieldValue(
  field: EditableIssueField,
  value: IssueEditDraft[EditableIssueField] | Issue[keyof Issue] | null | undefined,
) {
  if (value == null && nullableFields.has(field)) return "";
  if (typeof value !== "string") return value;
  if (field === "dueDate") return value.slice(0, 10);
  return value.trim();
}

function issueFieldValue(issue: Issue, field: EditableIssueField) {
  return normalizedFieldValue(field, issue[field as keyof Issue]);
}

function issueTicketLinks(issue: Issue) {
  const links = issue.jiraLinks.map((link) => ({
    id: link.id,
    jiraKey: link.jiraKey,
    jiraUrl: link.jiraUrl,
  }));
  if (
    issue.jiraTicketKey
    && issue.jiraTicketUrl
    && !links.some((link) => link.jiraKey === issue.jiraTicketKey)
  ) {
    links.unshift({
      id: `primary-${issue.id}`,
      jiraKey: issue.jiraTicketKey,
      jiraUrl: issue.jiraTicketUrl,
    });
  }
  return links;
}

export function ProjectOpenIssuesSection({ issueSearch = "", issueFilter = "all", issueSortDesc = false }: { issueSearch?: string; issueFilter?: "all" | "high" | "overdue"; issueSortDesc?: boolean }) {
  const { t: uiText } = useInterfaceTranslation();
  const confirm = useConfirm();
  const {
    addIssueJiraLink,
    addIssueStatusUpdate,
    addIssueThreadLink,
    calendarDelayDays,
    closeOpenIssue,
    convertIssueToProblem,
    currentUser,
    date,
    isReadOnly,
    issueEditDrafts,
    issueLinkDrafts,
    issueStatusDrafts,
    project,
    openView,
    removeIssueJiraLink,
    removeIssueThreadLink,
    saveOpenIssueWithPayload,
    saveProjectUiState,
    setError,
    setNotice,
    setIssueLinkDrafts,
    updateIssueJiraLink,
    updateIssueThreadLink,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();
  const [savingCells, setSavingCells] = useState<Set<string>>(() => new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingThreadLinkIds, setEditingThreadLinkIds] = useState<Set<string>>(() => new Set());
  const [threadUrlDrafts, setThreadUrlDrafts] = useState<Record<string, string>>({});
  const [newThreadUrlDrafts, setNewThreadUrlDrafts] = useState<Record<string, string>>({});
  const [editingRiskIssueIds, setEditingRiskIssueIds] = useState<Set<string>>(() => new Set());
  const [editingTicketLinkIds, setEditingTicketLinkIds] = useState<Set<string>>(() => new Set());
  const [ticketKeyDrafts, setTicketKeyDrafts] = useState<Record<string, string>>({});
  const cancelledFieldSavesRef = useRef(new Set<string>());
  const cancelledTicketEditsRef = useRef(new Set<string>());
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<
    Record<string, ReturnType<typeof normalizeOpenIssueColumnWidths>>
  >({});
  const storedColumnWidths = useMemo(
    () => normalizeOpenIssueColumnWidths(project.uiState?.openIssueColumnWidths),
    [project.uiState?.openIssueColumnWidths],
  );
  const columnWidths = columnWidthOverrides[project.id] ?? storedColumnWidths;

  const phases = useMemo(
    () => project.wbsItems.filter((item: { type: string }) => item.type === "PHASE"),
    [project.wbsItems],
  );
  const projectRisks = useMemo(
    () => project.raidItems.filter((item: { type: string; status: string }) => (
      item.type === "RISK" && !["CLOSED", "VALIDATED"].includes(item.status)
    )),
    [project.raidItems],
  );
  const groups = useMemo(() => {
    const query = issueSearch.trim().toLowerCase();
    const result = new Map<string, Issue[]>();
    for (const issue of project.issues as Issue[]) {
      const matchesQuery = !query || [issue.title, issue.owner, issue.jiraTicketKey, issue.impact].some((value) => String(value ?? "").toLowerCase().includes(query));
      const overdue = Boolean(issue.dueDate && new Date(issue.dueDate) < new Date());
      const matchesFilter = issueFilter === "all" || (issueFilter === "high" && ["HIGH", "CRITICAL"].includes(issue.severity)) || (issueFilter === "overdue" && overdue);
      if (!matchesQuery || !matchesFilter) continue;
      const category = issue.category.trim() || uiText("ui.projects.issueNoSection");
      result.set(category, [...(result.get(category) ?? []), issue]);
    }
    return [...result.entries()].map(([category, issues]) => [category, [...issues].sort((left, right) => (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") * (issueSortDesc ? -1 : 1))] as [string, Issue[]]);
  }, [issueFilter, issueSearch, issueSortDesc, project.issues, uiText]);
  const categoryOptions = groups.map(([category]) => category);
  const tableWidth = openIssueTableWidth(columnWidths);

  const startColumnResize = (
    columnKey: OpenIssueColumnKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const column = OPEN_ISSUE_COLUMNS.find((candidate) => candidate.key === columnKey)!;
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey];
    let latestWidths = columnWidths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        column.max,
        Math.max(column.min, startWidth + moveEvent.clientX - startX),
      );
      latestWidths = { ...latestWidths, [columnKey]: nextWidth };
      setColumnWidthOverrides((current) => ({
        ...current,
        [project.id]: latestWidths,
      }));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (isReadOnly) return;
      void saveProjectUiState({ openIssueColumnWidths: latestWidths }).catch((error: unknown) =>
        setError(error instanceof Error ? error.message : uiText("ui.projects.issueColumnWidthSaveFailed")),
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const openFocusedProjectView = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    view: "project-raid" | "project-structure",
  ) => {
    if (
      event.button !== 0
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) return;
    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    window.history.pushState(null, "", `${url.pathname}${url.search}`);
    openView(view, { projectCode: project.code });
  };

  const patchDraft = (issue: Issue, patch: Partial<IssueEditDraft>) =>
    updateIssueDraft(issue.id, patch, issueToDraft(issue));

  const persistField = async (
    issue: Issue,
    field: EditableIssueField,
    requestedValue?: IssueEditDraft[EditableIssueField],
  ) => {
    const key = `${issue.id}:${field}`;
    if (cancelledFieldSavesRef.current.delete(key)) return;
    const draft = (issueEditDrafts[issue.id] as IssueEditDraft | undefined) ?? issueToDraft(issue);
    const nextValue = normalizedFieldValue(field, requestedValue ?? draft[field]);
    const currentValue = issueFieldValue(issue, field);
    if (nextValue === currentValue) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      return;
    }
    if ((field === "title" || field === "category") && !String(nextValue).trim()) {
      patchDraft(issue, { [field]: String(currentValue ?? "") });
      return;
    }

    const payloadValue = nullableFields.has(field) && nextValue === "" ? null : nextValue;
    patchDraft(issue, { [field]: nextValue ?? "" });
    setSavingCells((current) => new Set(current).add(key));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const result = await saveOpenIssueWithPayload(
        issue.id,
        { [field]: payloadValue },
        { quiet: true, refresh: field === "phaseId" },
      );
      if (!result.ok) {
        setFieldErrors((current) => ({ ...current, [key]: result.error }));
      }
      return result.ok;
    } finally {
      setSavingCells((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const appendStatus = async (issue: Issue) => {
    const key = `${issue.id}:statusUpdate`;
    setSavingCells((current) => new Set(current).add(key));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    try {
      const result = await addIssueStatusUpdate(issue.id, { quiet: true, refresh: false });
      if (!result.ok) setFieldErrors((current) => ({ ...current, [key]: result.error }));
    } finally {
      setSavingCells((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const selectIssuePhase = async (issue: Issue, phaseId: string) => {
    const currentPhaseId = issue.phaseId ?? "";
    if (phaseId === currentPhaseId) return;
    if (currentUser?.role !== "ADMIN") {
      const message = uiText("ui.projects.issuePhaseSelectionForbidden");
      setFieldErrors((current) => ({ ...current, [`${issue.id}:phaseId`]: message }));
      setError(message);
      return;
    }
    if (!phaseId) {
      patchDraft(issue, { phaseId: "" });
      await persistField(issue, "phaseId", "");
      return;
    }
    const phase = phases.find((candidate: { id: string }) => candidate.id === phaseId);
    if (!phase) return;
    const moving = Boolean(issue.workPackageId);
    const phaseLabel = `${phase.code} · ${phase.title}`;
    const approved = await confirm({
      title: uiText(moving
        ? "ui.projects.issueMoveWorkPackageTitle"
        : "ui.projects.issueCreateWorkPackageTitle"),
      message: moving
        ? uiText("ui.projects.issueMoveWorkPackageMessage", { phase: phaseLabel })
        : uiText("ui.projects.issueCreateWorkPackageMessage", { phase: phaseLabel }),
      confirmLabel: uiText(moving
        ? "ui.projects.issueMoveWorkPackageConfirmLabel"
        : "ui.projects.issueCreateWorkPackageConfirmLabel"),
    });
    if (!approved) return;
    patchDraft(issue, { phaseId });
    const saved = await persistField(issue, "phaseId", phaseId);
    if (saved) {
      setNotice(
        moving
          ? uiText("ui.projects.issueWorkPackageMoved", { phase: phaseLabel })
          : uiText("ui.projects.issueWorkPackageCreated", { phase: phaseLabel }),
      );
    }
  };

  const saveTicketKey = async (
    issue: Issue,
    link: { id: string; jiraKey: string },
  ) => {
    if (cancelledTicketEditsRef.current.delete(link.id)) return;
    const jiraKey = (ticketKeyDrafts[link.id] ?? link.jiraKey).trim();
    if (!jiraKey) return;
    if (jiraKey.toUpperCase() === link.jiraKey.toUpperCase()) {
      setEditingTicketLinkIds((current) => {
        const next = new Set(current);
        next.delete(link.id);
        return next;
      });
      return;
    }
    const result = await updateIssueJiraLink(issue.id, link.id, jiraKey);
    if (!result.ok) return;
    setEditingTicketLinkIds((current) => {
      const next = new Set(current);
      next.delete(link.id);
      return next;
    });
    setTicketKeyDrafts((current) => {
      const next = { ...current };
      delete next[link.id];
      return next;
    });
  };

  const saveThreadUrl = async (
    issue: Issue,
    link: { id: string; threadUrl: string },
  ) => {
    const threadUrl = (threadUrlDrafts[link.id] ?? link.threadUrl).trim();
    if (!threadUrl) return;
    if (threadUrl === link.threadUrl) {
      setEditingThreadLinkIds((current) => {
        const next = new Set(current);
        next.delete(link.id);
        return next;
      });
      return;
    }
    const result = await updateIssueThreadLink(issue.id, link.id, threadUrl);
    if (!result.ok) return;
    setEditingThreadLinkIds((current) => {
      const next = new Set(current);
      next.delete(link.id);
      return next;
    });
    setThreadUrlDrafts((current) => {
      const next = { ...current };
      delete next[link.id];
      return next;
    });
  };

  const addThreadUrl = async (issue: Issue) => {
    const threadUrl = (newThreadUrlDrafts[issue.id] ?? "").trim();
    if (!threadUrl) return;
    const result = await addIssueThreadLink(issue.id, threadUrl);
    if (!result.ok) return;
    setNewThreadUrlDrafts((current) => ({ ...current, [issue.id]: "" }));
  };

  const commitOnEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    issue: Issue,
    field: EditableIssueField,
  ) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      cancelledFieldSavesRef.current.add(`${issue.id}:${field}`);
      patchDraft(issue, { [field]: issueFieldValue(issue, field) ?? "" });
      event.currentTarget.blur();
    }
  };

  if (project.issues.length === 0) {
    return <div className="empty-state issue-register-empty">{uiText("ui.projects.noOpenQuestions")}</div>;
  }

  return (
    <>
      <div
        className="issue-register-scroll"
        role="region"
        tabIndex={0}
        aria-label={uiText("ui.projects.openQuestionsTableScrollHint")}
      >
        <table
          className="issue-register"
          style={{ width: tableWidth, minWidth: tableWidth } as CSSProperties}
        >
          <caption className="issue-register-caption">
            {uiText("ui.projects.openQuestionsTableCaption")}
          </caption>
          <colgroup>
            {OPEN_ISSUE_COLUMNS.map((column) => (
              <col style={{ width: columnWidths[column.key] }} key={column.key} />
            ))}
          </colgroup>
          <thead className="issue-register-head">
            <tr>
              {OPEN_ISSUE_COLUMNS.map((column) => (
                <th scope="col" key={column.key}>
                  <span>{uiText(column.labelKey)}</span>
                  <button
                    type="button"
                    className="issue-column-resizer"
                    aria-label={uiText("ui.projects.issueResizeColumnAction", {
                      column: uiText(column.labelKey),
                    })}
                    onPointerDown={(event) => startColumnResize(column.key, event)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          {groups.map(([category, issues]) => (
            <tbody className="issue-register-group" key={category}>
              <tr className="issue-register-group-heading">
                <th colSpan={OPEN_ISSUE_COLUMNS.length} scope="rowgroup">{category}</th>
              </tr>
              {issues.map((issue, index) => {
                const draft = (issueEditDrafts[issue.id] as IssueEditDraft | undefined)
                  ?? issueToDraft(issue);
                const statuses = sortedStatusUpdates(issue);
                const latestStatus = statuses[0];
                const statusDraft = issueStatusDrafts[issue.id] ?? { text: "" };
                const jiraDraft = issueLinkDrafts[issue.id] ?? { jiraKey: "" };
                const ticketLinks = issueTicketLinks(issue);
                const workPackage = issue.workPackageId
                  ? project.wbsItems.find((item: { id: string }) => item.id === issue.workPackageId)
                  : null;
                const linkedRisk = draft.riskId
                  ? project.raidItems.find((item: { id: string }) => item.id === draft.riskId)
                  : null;
                const delayDays = calendarDelayDays(issue.initialDueDate, issue.dueDate);
                const isSaving = (field: EditableIssueField | "statusUpdate") =>
                  savingCells.has(`${issue.id}:${field}`);
                const fieldError = (...fields: Array<EditableIssueField | "statusUpdate">) => {
                  const message = fields
                    .map((field) => fieldErrors[`${issue.id}:${field}`])
                    .find(Boolean);
                  return message ? <span className="issue-inline-error" role="alert">{message}</span> : null;
                };
                return (
                  <tr className="issue-register-row" id={`issue-item-${issue.id}`} key={issue.id}>
                    <th className="issue-register-number" scope="row">{index + 1}</th>
                    <td className="issue-register-cell issue-register-task">
                      <textarea
                        className="issue-title-editor"
                        rows={2}
                        value={draft.title}
                        disabled={isReadOnly}
                        aria-busy={isSaving("title")}
                        onChange={(event) => patchDraft(issue, { title: event.target.value })}
                        onBlur={() => void persistField(issue, "title")}
                        aria-label={uiText("ui.projects.questionTitleColumn")}
                      />
                      <div className="issue-inline-classification">
                        <label>
                          <span>{uiText("ui.projects.section")}</span>
                          <input
                            className="issue-inline-category"
                            list="open-issue-categories"
                            value={draft.category}
                            disabled={isReadOnly}
                            aria-busy={isSaving("category")}
                            onChange={(event) => patchDraft(issue, { category: event.target.value })}
                            onBlur={() => void persistField(issue, "category")}
                            onKeyDown={(event) => commitOnEnter(event, issue, "category")}
                            aria-label={uiText("ui.projects.questionSectionColumn")}
                          />
                        </label>
                        {!workPackage ? (
                          <label>
                            <span>{uiText("ui.projects.phase")}</span>
                            <select
                              value={draft.phaseId}
                              disabled={isReadOnly || isSaving("phaseId")}
                              onChange={(event) => void selectIssuePhase(issue, event.target.value)}
                              aria-label={uiText("ui.projects.projectPhaseColumn")}
                              aria-describedby={`${issue.id}-phase-error`}
                            >
                              <option value="">{uiText("ui.projects.noPhase")}</option>
                              {phases.map((phase: { id: string; code: string; title: string }) => (
                                <option value={phase.id} key={phase.id}>
                                  {phase.code} · {phase.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                        <span className="issue-phase-error-slot" id={`${issue.id}-phase-error`}>
                          {fieldError("phaseId")}
                        </span>
                        {workPackage ? (
                          <div className="issue-work-package-reference">
                            <span>{uiText("ui.projects.workPackageColumn")}</span>
                            <a
                              href={`${appPathForView("project-structure", project.code)}?focusWbs=${encodeURIComponent(workPackage.id)}`}
                              onClick={(event) => openFocusedProjectView(event, "project-structure")}
                              title={workPackage.title}
                            >
                              {workPackage.code} · {workPackage.title}
                            </a>
                          </div>
                        ) : null}
                      </div>
                      {fieldError("category", "title")}
                    </td>
                    <td className="issue-register-cell issue-register-links">
                      <div className="issue-thread-links" aria-label={uiText("ui.projects.threadLinksLabel")}>
                        {(issue.threadLinks ?? []).map((link) => {
                          const editingThread = editingThreadLinkIds.has(link.id);
                          return (
                            <div className="issue-thread-control" key={link.id}>
                              {editingThread ? (
                                <input
                                  autoFocus
                                  type="url"
                                  value={threadUrlDrafts[link.id] ?? link.threadUrl}
                                  aria-label={uiText("ui.projects.threadUrlLabel")}
                                  onChange={(event) => setThreadUrlDrafts((current) => ({
                                    ...current,
                                    [link.id]: event.target.value,
                                  }))}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                    if (event.key === "Escape") {
                                      setEditingThreadLinkIds((current) => {
                                        const next = new Set(current);
                                        next.delete(link.id);
                                        return next;
                                      });
                                    }
                                  }}
                                  onBlur={() => void saveThreadUrl(issue, link)}
                                />
                              ) : (
                                <a
                                  className="issue-thread-link"
                                  href={link.threadUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <span>{uiText("ui.projects.threadLabel")}</span>
                                  <ExternalLink size={15} />
                                </a>
                              )}
                              {!isReadOnly && !editingThread ? (
                                <button
                                  type="button"
                                  className="icon-button issue-thread-edit"
                                  aria-label={uiText("ui.projects.editThreadLink")}
                                  onClick={() => {
                                    setThreadUrlDrafts((current) => ({
                                      ...current,
                                      [link.id]: link.threadUrl,
                                    }));
                                    setEditingThreadLinkIds((current) => new Set(current).add(link.id));
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                              ) : null}
                              {!isReadOnly && !editingThread ? (
                                <button
                                  type="button"
                                  className="icon-button"
                                  aria-label={uiText("ui.projects.deleteThreadLink")}
                                  onClick={() => void removeIssueThreadLink(issue.id, link.id)}
                                >
                                  <X size={13} />
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                      {!isReadOnly ? (
                        <div className="issue-inline-thread-add">
                          <input
                            type="url"
                            value={newThreadUrlDrafts[issue.id] ?? ""}
                            placeholder="https://..."
                            onChange={(event) => setNewThreadUrlDrafts((current) => ({
                              ...current,
                              [issue.id]: event.target.value,
                            }))}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") void addThreadUrl(issue);
                            }}
                            aria-label={uiText("ui.projects.additionalThreadUrlLabel")}
                          />
                          <button
                            type="button"
                            aria-label={uiText("ui.projects.addThreadAction")}
                            disabled={!(newThreadUrlDrafts[issue.id] ?? "").trim()}
                            onClick={() => void addThreadUrl(issue)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : null}
                      <div className="issue-ticket-links" aria-label={uiText("ui.projects.ticketLinksLabel")}>
                        {ticketLinks.map((link) => {
                          const editingTicket = editingTicketLinkIds.has(link.id);
                          return (
                          <span className="issue-ticket-link-item" key={link.id}>
                            {editingTicket ? (
                              <input
                                autoFocus
                                value={ticketKeyDrafts[link.id] ?? link.jiraKey}
                                aria-label={uiText("ui.projects.issueTicketKeyLabel", { key: link.jiraKey })}
                                onChange={(event) => setTicketKeyDrafts((current) => ({
                                  ...current,
                                  [link.id]: event.target.value,
                                }))}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") event.currentTarget.blur();
                                  if (event.key === "Escape") {
                                    cancelledTicketEditsRef.current.add(link.id);
                                    setTicketKeyDrafts((current) => ({
                                      ...current,
                                      [link.id]: link.jiraKey,
                                    }));
                                    setEditingTicketLinkIds((current) => {
                                      const next = new Set(current);
                                      next.delete(link.id);
                                      return next;
                                    });
                                  }
                                }}
                                onBlur={() => void saveTicketKey(issue, link)}
                              />
                            ) : (
                              <a href={link.jiraUrl} target="_blank" rel="noreferrer">
                                <span>{link.jiraKey}</span>
                                <ExternalLink size={13} />
                              </a>
                            )}
                            {!isReadOnly && !editingTicket ? (
                              <button
                                type="button"
                                className="icon-button issue-thread-edit"
                                aria-label={uiText("ui.projects.issueEditTicketKeyAction", { key: link.jiraKey })}
                                onClick={() => {
                                  setTicketKeyDrafts((current) => ({
                                    ...current,
                                    [link.id]: link.jiraKey,
                                  }));
                                  setEditingTicketLinkIds((current) => new Set(current).add(link.id));
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                            ) : null}
                            {!isReadOnly && !editingTicket ? (
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={uiText("ui.projects.issueRemoveTicketLinkAction", { key: link.jiraKey })}
                                onClick={() => void removeIssueJiraLink(issue.id, link.id)}
                              >
                                <X size={13} />
                              </button>
                            ) : null}
                          </span>
                          );
                        })}
                      </div>
                      {!isReadOnly ? (
                        <div className="issue-inline-jira-add">
                          <input
                            value={jiraDraft.jiraKey}
                            placeholder="JIRA-123"
                            onChange={(event) => setIssueLinkDrafts({
                              ...issueLinkDrafts,
                              [issue.id]: { ...jiraDraft, jiraKey: event.target.value },
                            })}
                            aria-label={uiText("ui.projects.additionalTicketKeyLabel")}
                          />
                          <button
                            type="button"
                            aria-label={uiText("ui.projects.saveTicketLinkAction")}
                            disabled={!jiraDraft.jiraKey.trim()}
                            onClick={() => void addIssueJiraLink(issue.id)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="issue-register-cell issue-register-status">
                      {latestStatus ? (
                        <div className="issue-current-status">
                          <time dateTime={latestStatus.statusAt}>{date(latestStatus.statusAt)}</time>
                          <p>{latestStatus.text}</p>
                        </div>
                      ) : <p className="muted-inline">{uiText("ui.projects.questionStatusNotAddedYet")}</p>}
                      {statuses.length > 1 ? (
                        <details className="issue-status-history">
                          <summary>{uiText("ui.projects.historyPrefixLabel")} {statuses.length}</summary>
                          {statuses.slice(1).map((status) => (
                            <div key={status.id}>
                              <time dateTime={status.statusAt}>{date(status.statusAt)}</time>
                              <p>{status.text}</p>
                            </div>
                          ))}
                        </details>
                      ) : null}
                      {!isReadOnly ? (
                        <div className="issue-inline-status-add">
                          <span className="issue-status-today">{uiText("ui.common.today")}</span>
                          <textarea
                            rows={2}
                            value={statusDraft.text}
                            placeholder={uiText("ui.projects.addNewStatusAction")}
                            disabled={isSaving("statusUpdate")}
                            onChange={(event) => updateIssueStatusDraft(issue.id, { text: event.target.value })}
                            aria-label={uiText("ui.projects.newStatusTextLabel")}
                          />
                          <button
                            type="button"
                            aria-label={uiText("ui.projects.addStatusWithCurrentDateAction")}
                            disabled={isSaving("statusUpdate") || !statusDraft.text.trim()}
                            onClick={() => void appendStatus(issue)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      ) : null}
                      {fieldError("statusUpdate")}
                    </td>
                    <td className="issue-register-cell issue-register-owner">
                      <textarea
                        rows={2}
                        value={draft.owner}
                        placeholder={uiText("ui.automation.owner")}
                        disabled={isReadOnly}
                        aria-busy={isSaving("owner")}
                        onChange={(event) => patchDraft(issue, { owner: event.target.value })}
                        onBlur={() => void persistField(issue, "owner")}
                        aria-label={uiText("ui.automation.owner")}
                      />
                      {fieldError("owner")}
                    </td>
                    <td className="issue-register-cell issue-register-risk">
                      {editingRiskIssueIds.has(issue.id) ? (
                        <select
                          autoFocus
                          value={draft.riskId}
                          aria-label={uiText("ui.projects.linkedRiskLabel")}
                          disabled={isSaving("riskId")}
                          onChange={(event) => {
                            const riskId = event.target.value;
                            patchDraft(issue, { riskId });
                            void persistField(issue, "riskId", riskId).then((saved) => {
                              if (!saved) return;
                              setEditingRiskIssueIds((current) => {
                                const next = new Set(current);
                                next.delete(issue.id);
                                return next;
                              });
                            });
                          }}
                        >
                          <option value="">{uiText("ui.projects.noLinkedRiskValue")}</option>
                          {linkedRisk && !projectRisks.some((risk: { id: string }) => risk.id === linkedRisk.id) ? (
                            <option value={linkedRisk.id}>{linkedRisk.title}</option>
                          ) : null}
                          {projectRisks.map((risk: { id: string; title: string }) => (
                            <option value={risk.id} key={risk.id}>{risk.title}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="issue-risk-control">
                          {linkedRisk ? (
                            <a
                              className="issue-risk-link"
                              href={`${appPathForView("project-raid", project.code)}?focusRaid=${encodeURIComponent(linkedRisk.id)}`}
                              onClick={(event) => openFocusedProjectView(event, "project-raid")}
                              title={linkedRisk.title}
                            >
                              <span>{linkedRisk.title}</span>
                              <ExternalLink size={14} />
                            </a>
                          ) : <span className="muted-inline">-</span>}
                          {!isReadOnly ? (
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={linkedRisk ? uiText("ui.projects.changeLinkedRiskAction") : uiText("ui.projects.linkRiskAction")}
                              onClick={() => setEditingRiskIssueIds((current) => new Set(current).add(issue.id))}
                            >
                              {linkedRisk ? <Pencil size={13} /> : <Plus size={14} />}
                            </button>
                          ) : null}
                        </div>
                      )}
                      {fieldError("riskId")}
                    </td>
                    <td className={`issue-register-cell issue-readiness-cell ${draft.readiness.toLowerCase()}`}>
                      <select
                        value={draft.readiness}
                        disabled={isReadOnly}
                        aria-busy={isSaving("readiness")}
                        title={uiText("ui.projects.issueReadinessTooltip", {
                          readiness: uiText(readinessLabelKeys[draft.readiness]),
                        })}
                        onChange={(event) => {
                          const readiness = event.target.value as Issue["readiness"];
                          patchDraft(issue, { readiness });
                          void persistField(issue, "readiness", readiness);
                        }}
                        aria-label={uiText("ui.projects.readiness")}
                      >
                        {Object.entries(readinessLabelKeys).map(([value, labelKey]) => (
                          <option value={value} key={value}>{uiText(labelKey)}</option>
                        ))}
                      </select>
                      {fieldError("readiness")}
                    </td>
                    <td className="issue-register-cell issue-register-parameters">
                      <label>
                        <span>{uiText("ui.automation.dueDate")}</span>
                        <input
                          type="date"
                          value={draft.dueDate}
                          disabled={isReadOnly}
                          aria-busy={isSaving("dueDate")}
                          onChange={(event) => patchDraft(issue, { dueDate: event.target.value })}
                          onBlur={() => void persistField(issue, "dueDate")}
                        />
                      </label>
                      <div className="issue-inline-history-meta">
                        {issue.initialDueDate ? <span>{uiText("ui.projects.originalDueDateLabel")} {date(issue.initialDueDate)}</span> : null}
                        {delayDays !== 0 ? (
                          <span>{uiText("ui.projects.dateShiftLabel")} {delayDays > 0 ? "+" : ""}{delayDays} {uiText("ui.projects.calendarDaysShortUnit")}</span>
                        ) : null}
                      </div>
                      <label className="issue-inline-decision">
                        <input
                          type="checkbox"
                          checked={draft.decisionRequired}
                          disabled={isReadOnly}
                          aria-busy={isSaving("decisionRequired")}
                          onChange={(event) => {
                            const decisionRequired = event.target.checked;
                            patchDraft(issue, { decisionRequired });
                            void persistField(issue, "decisionRequired", decisionRequired);
                          }}
                        />
                        {uiText("ui.projects.requiresDecision")}
                      </label>
                      {fieldError("dueDate", "decisionRequired")}
                      {!isReadOnly ? (
                        <div className="issue-inline-actions">
                          <button type="button" className="secondary-button" onClick={() => void convertIssueToProblem(issue.id)}>{uiText("ui.projects.convertToIssueAction")}</button>
                          <button type="button" className="secondary-button" onClick={() => void closeOpenIssue(issue.id)}><Check size={14} />{uiText("ui.admin.close")}</button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <datalist id="open-issue-categories">
        {categoryOptions.map((category) => <option value={category} key={category} />)}
      </datalist>
    </>
  );
}
