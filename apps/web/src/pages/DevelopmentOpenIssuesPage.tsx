import { CalendarDays, ChevronDown, ChevronUp, CircleAlert, ExternalLink, History, MessageSquare, Pencil, Save, ShieldAlert, Tag, X } from "lucide-react";
import { Fragment, useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Issue } from "../app/domainTypes";
import { issueToDraft, type IssueEditDraft } from "../app/formState";
import {
  OPEN_ISSUES_PROTOTYPE_COLUMNS,
  normalizeOpenIssuesPrototypeColumnWidths,
  openIssuesPrototypeTableWidth,
  type OpenIssuesPrototypeColumnKey,
} from "../app/openIssueTable";
import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

type ActionKey = "section" | "due" | "phase" | "jira" | "mattermost" | "history";
type InlineField = "title" | "owner" | "severity" | "readiness";

const readinessLabelKeys = {
  RED: "ui.projects.issueReadinessRed",
  AMBER: "ui.projects.issueReadinessAmber",
  GREEN: "ui.projects.issueReadinessGreen",
} as const;

function sortedStatusUpdates(issue: Issue) {
  return [...issue.statusUpdates].sort((left, right) =>
    new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime(),
  );
}

export function DevelopmentOpenIssuesPage() {
  const { t, labels } = useI18n();
  const {
    closeOpenIssue,
    convertIssueToProblem,
    addIssueStatusUpdate,
    addIssueThreadLink,
    date,
    emptyIssueForm,
    isReadOnly,
    issueStatusDrafts,
    project,
    saveProjectUiState,
    saveOpenIssueWithPayload,
    setError,
    setNotice,
    setIssueDrawerMode,
    setIssueForm,
    issueEditDrafts,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [expandedClosedIssueId, setExpandedClosedIssueId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{ issueId: string; action: ActionKey } | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState<Set<string>>(() => new Set());
  // Link editors that the pencil has opened; a saved link is otherwise shown
  // as a link rather than as an input.
  const [editingLinks, setEditingLinks] = useState<Set<string>>(() => new Set());
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<
    Record<string, ReturnType<typeof normalizeOpenIssuesPrototypeColumnWidths>>
  >({});

  const issues = useMemo(
    () => [...(project.issues as Issue[])].sort((left, right) => (
      (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
    )),
    [project.issues],
  );
  const noSectionLabel = t("ui.projects.issueNoSection");
  const issueGroups = useMemo(() => {
    const groups = new Map<string, Issue[]>();
    for (const issue of issues) {
      const rawCategory = issue.category.trim();
      const category = rawCategory && rawCategory !== "Без раздела" ? rawCategory : noSectionLabel;
      groups.set(category, [...(groups.get(category) ?? []), issue]);
    }
    return [...groups.entries()];
  }, [issues, noSectionLabel]);
  const hasNamedSection = useMemo(
    () => issues.some((issue) => {
      const category = issue.category.trim();
      return category.length > 0 && category !== noSectionLabel && category !== "Без раздела";
    }),
    [issues, noSectionLabel],
  );
  const closedIssues = useMemo(
    () => [...(project.closedIssues ?? [])].sort((left, right) => (
      (right.updatedAt ?? right.dueDate ?? "").localeCompare(left.updatedAt ?? left.dueDate ?? "")
    )),
    [project.closedIssues],
  );
  const closedIssueGroups = useMemo(() => {
    const groups = new Map<string, Issue[]>();
    for (const issue of closedIssues) {
      const rawCategory = issue.category.trim();
      const category = rawCategory && rawCategory !== "Без раздела" ? rawCategory : noSectionLabel;
      groups.set(category, [...(groups.get(category) ?? []), issue]);
    }
    return [...groups.entries()];
  }, [closedIssues, noSectionLabel]);
  const hasNamedClosedSection = useMemo(
    () => closedIssues.some((issue) => {
      const category = issue.category.trim();
      return category.length > 0 && category !== noSectionLabel && category !== "Без раздела";
    }),
    [closedIssues, noSectionLabel],
  );
  const phases = useMemo(
    () => project.wbsItems.filter((item: { type: string }) => item.type === "PHASE"),
    [project.wbsItems],
  );
  const categoryOptions = useMemo(
    () => [...new Set((project.issues as Issue[]).map((issue) => issue.category.trim()).filter(Boolean))],
    [project.issues],
  );
  const storedColumnWidths = useMemo(
    () => normalizeOpenIssuesPrototypeColumnWidths(project.uiState?.openIssuesPrototypeColumnWidths),
    [project.uiState?.openIssuesPrototypeColumnWidths],
  );
  const columnWidths = columnWidthOverrides[project.id] ?? storedColumnWidths;
  const tableWidth = openIssuesPrototypeTableWidth(columnWidths);

  const startColumnResize = (
    columnKey: OpenIssuesPrototypeColumnKey,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const column = OPEN_ISSUES_PROTOTYPE_COLUMNS.find((candidate) => candidate.key === columnKey)!;
    const startX = event.clientX;
    const startWidth = columnWidths[columnKey];
    let latestWidths = columnWidths;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        column.max,
        Math.max(column.min, startWidth + moveEvent.clientX - startX),
      );
      latestWidths = { ...latestWidths, [columnKey]: nextWidth };
      setColumnWidthOverrides((current) => ({ ...current, [project.id]: latestWidths }));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (isReadOnly) return;
      void saveProjectUiState({ openIssuesPrototypeColumnWidths: latestWidths }).catch((error: unknown) =>
        setError(error instanceof Error ? error.message : t("ui.projects.issueColumnWidthSaveFailed")),
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const getDraft = (issue: Issue): IssueEditDraft =>
    (issueEditDrafts[issue.id] as IssueEditDraft | undefined) ?? issueToDraft(issue);

  const updateDraft = (issue: Issue, patch: Partial<IssueEditDraft>) => {
    updateIssueDraft(issue.id, patch, issueToDraft(issue));
  };

  const persistInlineField = async (
    issue: Issue,
    field: InlineField,
    value: IssueEditDraft[InlineField],
  ) => {
    const currentValue = issue[field as keyof Issue];
    const normalizedValue = value;
    if (normalizedValue === currentValue) return;
    if (field === "title" && !String(normalizedValue).trim()) {
      updateDraft(issue, { [field]: String(currentValue ?? "") });
      return;
    }
    const key = `${issue.id}:${field}`;
    updateDraft(issue, { [field]: normalizedValue } as Partial<IssueEditDraft>);
    setSavingFields((current) => new Set(current).add(key));
    try {
      const result = await saveOpenIssueWithPayload(issue.id, { [field]: normalizedValue }, { quiet: true, refresh: false });
      if (!result.ok) setError(result.error);
      else setNotice(t("ui.projects.openIssuesPrototypeSaved"));
    } finally {
      setSavingFields((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const saveStatusUpdate = async (issue: Issue) => {
    const key = `${issue.id}:statusUpdate`;
    const draft = issueStatusDrafts[issue.id] ?? { text: "" };
    if (!draft.text.trim()) return;
    setSavingFields((current) => new Set(current).add(key));
    try {
      const result = await addIssueStatusUpdate(issue.id, { quiet: true, refresh: false });
      if (!result.ok) setError(result.error);
      else setNotice(t("ui.projects.openIssuesPrototypeSaved"));
    } finally {
      setSavingFields((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleExpanded = (issueId: string) => {
    setExpandedIssueId((current) => current === issueId ? null : issueId);
    setActiveAction(null);
  };

  const toggleAction = (issue: Issue, action: ActionKey) => {
    setExpandedIssueId(issue.id);
    setEditingLinks((current) => {
      const next = new Set(current);
      next.delete(`${issue.id}:jira`);
      next.delete(`${issue.id}:mattermost`);
      return next;
    });
    setActiveAction((current) => current?.issueId === issue.id && current.action === action ? null : { issueId: issue.id, action });
    if (action === "section") setDraftValues((current) => ({ ...current, [`${issue.id}:section`]: getDraft(issue).category }));
    if (action === "due") setDraftValues((current) => ({ ...current, [`${issue.id}:due`]: getDraft(issue).dueDate }));
    if (action === "phase") setDraftValues((current) => ({ ...current, [`${issue.id}:phase`]: issue.phaseId ?? "" }));
    if (action === "jira") setDraftValues((current) => ({ ...current, [`${issue.id}:jira`]: issue.jiraTicketUrl ?? issue.jiraLinks[0]?.jiraUrl ?? issue.jiraTicketKey ?? issue.jiraLinks[0]?.jiraKey ?? "" }));
    if (action === "mattermost") setDraftValues((current) => ({ ...current, [`${issue.id}:mattermost`]: issue.threadLinks[0]?.threadUrl ?? "" }));
  };

  const saveAction = async (issue: Issue, action: "section" | "due" | "phase") => {
    const raw = draftValues[`${issue.id}:${action}`] ?? "";
    // The schema trims the section, so store the trimmed value locally too and
    // keep the draft in step with what the server actually recorded.
    const value = action === "section" ? raw.trim() : raw;
    const payload = action === "section"
      ? { category: value }
      : action === "due"
        ? { dueDate: value || null }
        : { phaseId: value || null };
    const result = await saveOpenIssueWithPayload(issue.id, payload, { quiet: true, refresh: action === "phase" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (action === "section") updateDraft(issue, { category: value });
    if (action === "due") updateDraft(issue, { dueDate: value });
    if (action === "phase") updateDraft(issue, { phaseId: value });
    setActiveAction(null);
    setNotice(t("ui.projects.openIssuesPrototypeSaved"));
  };

  const saveLink = async (issue: Issue, action: "jira" | "mattermost") => {
    const value = (draftValues[`${issue.id}:${action}`] ?? "").trim();
    if (!value) return;
    if (action === "jira") {
      const jiraKey = value.match(/\b[A-Z][A-Z0-9_]*-\d+\b/i)?.[0]?.toUpperCase();
      if (!jiraKey) {
        setError(t("ui.projects.openIssuesPrototypeInvalidJiraLink"));
        return;
      }
      const result = await saveOpenIssueWithPayload(issue.id, { jiraTicketKey: jiraKey }, { quiet: true, refresh: true });
      if (!result.ok) {
        setError(result.error);
        return;
      }
    } else {
      const result = await addIssueThreadLink(issue.id, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    setActiveAction(null);
    setNotice(t("ui.projects.openIssuesPrototypeLinkSaved"));
  };

  const renderEditor = (issue: Issue, action: ActionKey) => {
    if (action === "history") {
      const statuses = sortedStatusUpdates(issue);
      return (
        <div className="open-issues-prototype-history">
          {statuses.length === 0 ? <span className="muted-inline">{t("ui.projects.openIssuesPrototypeNoHistory")}</span> : statuses.map((status) => (
            <div key={status.id}>
              <time dateTime={status.statusAt}>{date(status.statusAt)}</time>
              <span>{status.text}</span>
            </div>
          ))}
        </div>
      );
    }
    if (action === "section") {
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.projects.section")}
            <input
              autoFocus
              list="open-issues-prototype-categories"
              value={draftValues[`${issue.id}:section`] ?? getDraft(issue).category}
              disabled={isReadOnly}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:section`]: event.target.value }))}
              onBlur={() => {
                // A question may legitimately belong to no section; the register
                // already groups those together, so only skip an unchanged value.
                const value = draftValues[`${issue.id}:section`] ?? getDraft(issue).category;
                if (value.trim() !== getDraft(issue).category.trim()) void saveAction(issue, "section");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveAction(issue, "section");
                }
              }}
            />
          </label>
          <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    if (action === "due") {
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.automation.dueDate")}
            <input
              autoFocus
              type="date"
              value={draftValues[`${issue.id}:due`] ?? getDraft(issue).dueDate}
              disabled={isReadOnly}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:due`]: event.target.value }))}
            />
          </label>
          <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    if (action === "phase") {
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.projects.phase")}
            <select
              autoFocus
              value={draftValues[`${issue.id}:phase`] ?? ""}
              disabled={isReadOnly}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:phase`]: event.target.value }))}
            >
              <option value="">{t("ui.projects.noPhase")}</option>
              {phases.map((phase: { id: string; code: string; title: string }) => <option value={phase.id} key={phase.id}>{phase.code} · {phase.title}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    if (action === "jira") {
      const currentUrl = issue.jiraTicketUrl ?? issue.jiraLinks[0]?.jiraUrl ?? null;
      const currentLabel = issue.jiraTicketKey ?? issue.jiraLinks[0]?.jiraKey ?? currentUrl;
      // A saved link is worth following, not just re-typing, so it stays a link
      // until the pencil is used.
      if (currentUrl && !editingLinks.has(`${issue.id}:jira`)) {
        return (
          <div className="open-issues-prototype-editor open-issues-prototype-link-editor">
            <span className="open-issues-prototype-link-label">{t("ui.projects.openIssuesPrototypeJiraLink")}</span>
            <a className="open-issues-prototype-link-value" href={currentUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} />{currentLabel}
            </a>
            <button
              type="button"
              className="icon-button"
              disabled={isReadOnly}
              title={t("ui.projects.openIssuesPrototypeEditLink")}
              aria-label={t("ui.projects.openIssuesPrototypeEditLink")}
              onClick={() => setEditingLinks((current) => new Set(current).add(`${issue.id}:jira`))}
            >
              <Pencil size={15} />
            </button>
          </div>
        );
      }
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.projects.openIssuesPrototypeJiraLink")}
            <input
              autoFocus
              type="url"
              value={draftValues[`${issue.id}:jira`] ?? ""}
              placeholder={t("ui.projects.openIssuesPrototypeJiraPlaceholder")}
              disabled={isReadOnly}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:jira`]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveLink(issue, "jira");
                }
              }}
            />
          </label>
          <button type="button" onClick={() => void saveLink(issue, "jira")} disabled={isReadOnly || !(draftValues[`${issue.id}:jira`] ?? "").trim()}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    if (action === "mattermost") {
      const threadUrl = issue.threadLinks[0]?.threadUrl ?? null;
      if (threadUrl && !editingLinks.has(`${issue.id}:mattermost`)) {
        return (
          <div className="open-issues-prototype-editor open-issues-prototype-link-editor">
            <span className="open-issues-prototype-link-label">{t("ui.projects.openIssuesPrototypeMattermostLink")}</span>
            <a className="open-issues-prototype-link-value" href={threadUrl} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={14} />{threadUrl}
            </a>
            <button
              type="button"
              className="icon-button"
              disabled={isReadOnly}
              title={t("ui.projects.openIssuesPrototypeEditLink")}
              aria-label={t("ui.projects.openIssuesPrototypeEditLink")}
              onClick={() => setEditingLinks((current) => new Set(current).add(`${issue.id}:mattermost`))}
            >
              <Pencil size={15} />
            </button>
          </div>
        );
      }
      return (
        <div className="open-issues-prototype-editor">
          <label>{t("ui.projects.openIssuesPrototypeMattermostLink")}
            <input
              autoFocus
              type="url"
              value={draftValues[`${issue.id}:mattermost`] ?? ""}
              placeholder="https://mm.sberdevices.ru/..."
              disabled={isReadOnly}
              onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:mattermost`]: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveLink(issue, "mattermost");
                }
              }}
            />
          </label>
          <button type="button" onClick={() => void saveLink(issue, "mattermost")} disabled={isReadOnly || !(draftValues[`${issue.id}:mattermost`] ?? "").trim()}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
        </div>
      );
    }
    return null;
  };

  return (
    <article className="panel project-card project-module-page open-issues-prototype-page">
      <div className="panel-title">
        <div>
          <h2>{t("ui.projects.openIssuesPrototypeTitle")}</h2>
          <p>{t("ui.projects.openIssuesPrototypeDescription")}</p>
        </div>
        <div className="open-issues-prototype-heading-actions"><span className="open-issues-prototype-count">{issues.length}</span><button type="button" onClick={() => { setIssueForm(emptyIssueForm); setIssueDrawerMode("create"); }}>{t("ui.projects.createIssue")}</button></div>
      </div>
      {issues.length === 0 ? <div className="empty-state">{t("ui.projects.noOpenQuestions")}</div> : (
        <div className="open-issues-prototype-table-shell">
          <table
            className="open-issues-prototype-table"
            style={{ width: tableWidth, minWidth: tableWidth } as CSSProperties}
          >
            <colgroup>
              {OPEN_ISSUES_PROTOTYPE_COLUMNS.map((column) => (
                <col style={{ width: columnWidths[column.key] }} key={column.key} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {OPEN_ISSUES_PROTOTYPE_COLUMNS.map((column) => (
                  <th
                    scope="col"
                    key={column.key}
                    aria-label={column.key === "actions" ? t(column.labelKey) : undefined}
                  >
                    {column.key === "actions" ? null : <span>{t(column.labelKey)}</span>}
                    <button
                      type="button"
                      className="open-issues-prototype-column-resizer"
                      aria-label={t("ui.projects.issueResizeColumnAction", { column: t(column.labelKey) })}
                      onPointerDown={(event) => startColumnResize(column.key, event)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            {issueGroups.map(([category, groupIssues]) => {
              const showGroupHeading = hasNamedSection || category !== noSectionLabel;
              return <tbody className="open-issues-prototype-group" key={category} aria-label={showGroupHeading ? category : undefined}>
                {showGroupHeading ? <tr className="open-issues-prototype-group-heading">
                  <th colSpan={OPEN_ISSUES_PROTOTYPE_COLUMNS.length} scope="rowgroup">{category}</th>
                </tr> : null}
              {groupIssues.map((issue, index) => {
                const expanded = expandedIssueId === issue.id;
                const action = activeAction?.issueId === issue.id ? activeAction.action : null;
                const phase = phases.find((item: { id: string }) => item.id === issue.phaseId);
                const draft = getDraft(issue);
                const latestStatus = sortedStatusUpdates(issue)[0];
                const statusDate = latestStatus?.statusAt ?? issue.updatedAt ?? issue.createdAt ?? null;
                const statusDraft = issueStatusDrafts[issue.id] ?? { text: "" };
                const statusSaving = savingFields.has(`${issue.id}:statusUpdate`);
                const isSaving = (field: InlineField) => savingFields.has(`${issue.id}:${field}`);
                return (
                  <Fragment key={issue.id}>
                    <tr className={`open-issues-prototype-row ${expanded ? "is-expanded" : ""}`}>
                      <td className="open-issues-prototype-number">{index + 1}</td>
                      <td>
                        {/* An input cannot wrap, so an expanded row swaps in a textarea
                            and shows the whole question, the way the status does. */}
                        {expanded ? (
                          <textarea
                            className="open-issues-prototype-inline-input open-issues-prototype-title-input open-issues-prototype-title-area"
                            rows={Math.min(6, Math.max(2, Math.ceil(draft.title.length / 40)))}
                            value={draft.title}
                            disabled={isReadOnly}
                            aria-busy={isSaving("title")}
                            onChange={(event) => updateDraft(issue, { title: event.target.value })}
                            onBlur={() => void persistInlineField(issue, "title", getDraft(issue).title)}
                            aria-label={t("ui.projects.questionTitleColumn")}
                          />
                        ) : (
                          <input
                            className="open-issues-prototype-inline-input open-issues-prototype-title-input"
                            value={draft.title}
                            disabled={isReadOnly}
                            aria-busy={isSaving("title")}
                            onChange={(event) => updateDraft(issue, { title: event.target.value })}
                            onBlur={() => void persistInlineField(issue, "title", getDraft(issue).title)}
                            aria-label={t("ui.projects.questionTitleColumn")}
                          />
                        )}
                        {issue.referenceLabel && <a href={issue.referenceUrl ?? "#"} className="open-issues-prototype-reference"><ExternalLink size={13} />{issue.referenceLabel}</a>}
                      </td>
                      <td className="open-issues-prototype-status-cell">
                        <div className="open-issues-prototype-status-fields">
                          <time
                            className="open-issues-prototype-status-date"
                            dateTime={statusDate ?? undefined}
                            aria-label={t("ui.projects.issueStatusDateLabel")}
                          >
                            {statusDate ? date(statusDate) : t("ui.projects.openIssuesPrototypeNoStatusDate")}
                          </time>
                          <div
                            className="open-issues-prototype-status-text"
                            role="textbox"
                            aria-readonly="true"
                            aria-label={t("ui.projects.currentIssueStatusLabel")}
                            title={latestStatus?.text ?? labels.issueStatusLabel(issue.status)}
                          >
                            {latestStatus?.text ?? labels.issueStatusLabel(issue.status)}
                          </div>
                        </div>
                      </td>
                      <td>
                        <input
                          className="open-issues-prototype-inline-input open-issues-prototype-owner-input"
                          value={draft.owner}
                          placeholder={t("ui.automation.owner")}
                          disabled={isReadOnly}
                          aria-busy={isSaving("owner")}
                          onChange={(event) => updateDraft(issue, { owner: event.target.value })}
                          onBlur={() => void persistInlineField(issue, "owner", getDraft(issue).owner)}
                          aria-label={t("ui.automation.owner")}
                        />
                      </td>
                      <td className={`open-issues-prototype-priority-cell ${draft.severity.toLowerCase()}`}>
                        <select
                          className="open-issues-prototype-priority"
                          value={draft.severity}
                          disabled={isReadOnly}
                          aria-busy={isSaving("severity")}
                          onChange={(event) => {
                            const severity = event.target.value as Issue["severity"];
                            updateDraft(issue, { severity });
                            void persistInlineField(issue, "severity", severity);
                          }}
                          aria-label={t("ui.projects.issueColumnPriority")}
                        >
                          <option value="LOW">{labels.issueSeverityLabel("LOW")}</option>
                          <option value="MEDIUM">{labels.issueSeverityLabel("MEDIUM")}</option>
                          <option value="HIGH">{labels.issueSeverityLabel("HIGH")}</option>
                          <option value="CRITICAL">{labels.issueSeverityLabel("CRITICAL")}</option>
                        </select>
                      </td>
                      <td className={`open-issues-prototype-readiness-cell ${draft.readiness.toLowerCase()}`}>
                        <select
                          className="open-issues-prototype-readiness"
                          value={draft.readiness}
                          disabled={isReadOnly}
                          aria-busy={isSaving("readiness")}
                          title={t("ui.projects.issueReadinessTooltip", { readiness: t(readinessLabelKeys[draft.readiness]) })}
                          onChange={(event) => {
                            const readiness = event.target.value as Issue["readiness"];
                            updateDraft(issue, { readiness });
                            void persistInlineField(issue, "readiness", readiness);
                          }}
                          aria-label={t("ui.projects.readiness")}
                        >
                          <option value="RED">{t(readinessLabelKeys.RED)}</option>
                          <option value="AMBER">{t(readinessLabelKeys.AMBER)}</option>
                          <option value="GREEN">{t(readinessLabelKeys.GREEN)}</option>
                        </select>
                      </td>
                      <td className="open-issues-prototype-expand-cell">
                        <button
                          type="button"
                          className="open-issues-prototype-expand"
                          onClick={() => toggleExpanded(issue.id)}
                          aria-expanded={expanded}
                          aria-label={expanded ? t("ui.projects.openIssuesPrototypeCollapse") : t("ui.projects.openIssuesPrototypeExpand")}
                          title={expanded ? t("ui.projects.openIssuesPrototypeCollapse") : t("ui.projects.openIssuesPrototypeExpand")}
                        >
                          {expanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}
                        </button>
                      </td>
                    </tr>
                    {expanded && <tr className="open-issues-prototype-actions-row" key={`${issue.id}-actions`}><td colSpan={OPEN_ISSUES_PROTOTYPE_COLUMNS.length}>
                      <div className="open-issues-prototype-action-bar">
                        <button type="button" className={action === "section" ? "active" : ""} onClick={() => toggleAction(issue, "section")}><Tag size={15} />{t("ui.projects.openIssuesPrototypeSection")}</button>
                        <button type="button" className={action === "due" ? "active" : ""} onClick={() => toggleAction(issue, "due")}><CalendarDays size={15} />{t("ui.automation.dueDate")}</button>
                        <button type="button" className={action === "phase" ? "active" : ""} onClick={() => toggleAction(issue, "phase")}><CircleAlert size={15} />{t("ui.projects.openIssuesPrototypePhase")}{phase ? ` · ${phase.code}` : ""}</button>
                        <button type="button" className={action === "jira" ? "active" : ""} onClick={() => toggleAction(issue, "jira")}><ExternalLink size={15} />Jira</button>
                        <button type="button" className={action === "mattermost" ? "active" : ""} onClick={() => toggleAction(issue, "mattermost")}><MessageSquare size={15} />MM</button>
                        <button type="button" onClick={() => void convertIssueToProblem(issue.id)} disabled={isReadOnly}><ShieldAlert size={15} />{t("ui.projects.openIssuesPrototypeConvert")}</button>
                        <button type="button" onClick={() => void closeOpenIssue(issue.id)} disabled={isReadOnly}><X size={15} />{t("ui.projects.openIssuesPrototypeClose")}</button>
                        <button type="button" className={action === "history" ? "active" : ""} onClick={() => toggleAction(issue, "history")}><History size={15} />{t("ui.projects.openIssuesPrototypeHistory")}</button>
                        <div className="open-issues-prototype-status-editor">
                          <input
                            value={statusDraft.text}
                            placeholder={t("ui.projects.addNewStatusAction")}
                            aria-label={t("ui.projects.newStatusTextLabel")}
                            disabled={isReadOnly || statusSaving}
                            onChange={(event) => updateIssueStatusDraft(issue.id, { text: event.target.value })}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveStatusUpdate(issue);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void saveStatusUpdate(issue)}
                            disabled={isReadOnly || statusSaving || !statusDraft.text.trim()}
                          >
                            <Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}
                          </button>
                        </div>
                      </div>
                      {action ? renderEditor(issue, action) : null}
                    </td></tr>}
                  </Fragment>
                );
              })}
              </tbody>;
            })}
          </table>
        </div>
      )}
      <section className="open-issues-prototype-closed" aria-labelledby="open-issues-prototype-closed-title">
        <div className="open-issues-prototype-closed-heading">
          <div><h3 id="open-issues-prototype-closed-title">{t("ui.projects.closedQuestionsSectionTitle")}</h3><p>{t("ui.projects.closedQuestionsSectionSubtitle")}</p></div>
          <span className="open-issues-prototype-count">{closedIssues.length}</span>
        </div>
        {closedIssues.length === 0 ? <div className="empty-state">{t("ui.projects.noClosedQuestionsYet")}</div> : (
          <div className="open-issues-prototype-table-shell" role="region" aria-label={t("ui.projects.closedQuestionsTableLabel")}>
            <table className="open-issues-prototype-table open-issues-prototype-closed-table" style={{ width: tableWidth, minWidth: tableWidth } as CSSProperties}>
              <colgroup>{OPEN_ISSUES_PROTOTYPE_COLUMNS.map((column) => <col style={{ width: columnWidths[column.key] }} key={column.key} />)}</colgroup>
              <thead><tr>{OPEN_ISSUES_PROTOTYPE_COLUMNS.map((column) => <th scope="col" key={column.key} aria-label={column.key === "actions" ? t("ui.projects.openIssuesPrototypeActions") : undefined}>{column.key === "actions" ? null : <span>{t(column.labelKey)}</span>}</th>)}</tr></thead>
              {closedIssueGroups.map(([category, groupIssues]) => {
                const showGroupHeading = hasNamedClosedSection || category !== noSectionLabel;
                return <tbody className="open-issues-prototype-group" key={category} aria-label={showGroupHeading ? category : undefined}>
                  {showGroupHeading ? <tr className="open-issues-prototype-group-heading"><th colSpan={OPEN_ISSUES_PROTOTYPE_COLUMNS.length} scope="rowgroup">{category}</th></tr> : null}
                  {groupIssues.map((issue, index) => {
                    const expanded = expandedClosedIssueId === issue.id;
                    const latestStatus = sortedStatusUpdates(issue)[0];
                    const statusDate = latestStatus?.statusAt ?? issue.updatedAt ?? issue.createdAt ?? null;
                    const jiraUrl = issue.jiraTicketUrl ?? issue.jiraLinks[0]?.jiraUrl;
                    const threadUrl = issue.threadLinks[0]?.threadUrl;
                    return <Fragment key={issue.id}>
                      <tr className={`open-issues-prototype-row open-issues-prototype-closed-row ${expanded ? "is-expanded" : ""}`} id={`closed-issue-item-${issue.id}`}>
                        <td className="open-issues-prototype-number">{index + 1}</td>
                        <td><strong>{issue.title}</strong>{issue.referenceLabel ? <small>{issue.referenceLabel}</small> : null}</td>
                        <td className="open-issues-prototype-status-cell"><div className="open-issues-prototype-status-fields"><time className="open-issues-prototype-status-date" dateTime={statusDate ?? undefined}>{statusDate ? date(statusDate) : t("ui.projects.openIssuesPrototypeNoStatusDate")}</time><div className="open-issues-prototype-status-text" title={latestStatus?.text ?? labels.issueStatusLabel(issue.status)}>{latestStatus?.text ?? labels.issueStatusLabel(issue.status)}</div></div></td>
                        <td><span className="open-issues-prototype-closed-value">{issue.owner || t("ui.projects.notAssignedLowercase")}</span></td>
                        <td className={`open-issues-prototype-priority-cell ${issue.severity.toLowerCase()}`}><span className="open-issues-prototype-priority-value">{labels.issueSeverityLabel(issue.severity)}</span></td>
                        <td className={`open-issues-prototype-readiness-cell ${issue.readiness.toLowerCase()}`}><span className="open-issues-prototype-readiness-value">{t(readinessLabelKeys[issue.readiness])}</span></td>
                        <td className="open-issues-prototype-expand-cell"><button type="button" className="open-issues-prototype-expand" aria-expanded={expanded} aria-label={expanded ? t("ui.projects.openIssuesPrototypeCollapse") : t("ui.projects.openIssuesPrototypeExpand")} title={expanded ? t("ui.projects.openIssuesPrototypeCollapse") : t("ui.projects.openIssuesPrototypeExpand")} onClick={() => setExpandedClosedIssueId((current) => current === issue.id ? null : issue.id)}>{expanded ? <ChevronUp size={22} /> : <ChevronDown size={22} />}</button></td>
                      </tr>
                      {expanded ? <tr className="open-issues-prototype-actions-row open-issues-prototype-closed-details"><td colSpan={OPEN_ISSUES_PROTOTYPE_COLUMNS.length}><div className="open-issues-prototype-closed-detail-content"><span>{t("ui.projects.issueColumnStatus")}: {labels.issueStatusLabel(issue.status)}</span>{jiraUrl ? <a href={jiraUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} />Jira</a> : null}{threadUrl ? <a href={threadUrl} target="_blank" rel="noreferrer"><MessageSquare size={14} />MM</a> : null}<span>{t("ui.automation.owner")}: {issue.owner || t("ui.projects.notAssignedLowercase")}</span><span>{t("ui.projects.closedAtLabel")}: {statusDate ? date(statusDate) : t("ui.projects.openIssuesPrototypeNoStatusDate")}</span></div>{issue.statusUpdates.length > 0 ? <div className="open-issues-prototype-history">{sortedStatusUpdates(issue).map((status) => <div key={status.id}><time dateTime={status.statusAt}>{date(status.statusAt)}</time><span>{status.text}</span></div>)}</div> : null}</td></tr> : null}
                    </Fragment>;
                  })}
                </tbody>;
              })}
            </table>
          </div>
        )}
      </section>
      <datalist id="open-issues-prototype-categories">
        {categoryOptions.map((category) => <option value={category} key={category} />)}
      </datalist>
    </article>
  );
}
