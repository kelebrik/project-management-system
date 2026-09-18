import { CalendarDays, ChevronDown, ChevronUp, CircleAlert, ExternalLink, History, Link2, Save, ShieldAlert, Tag, X } from "lucide-react";
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

type ActionKey = "section" | "due" | "phase" | "risk" | "history";
type InlineField = "title" | "owner" | "readiness";

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
    date,
    isReadOnly,
    issueStatusDrafts,
    project,
    saveProjectUiState,
    saveOpenIssueWithPayload,
    setError,
    setNotice,
    issueEditDrafts,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<{ issueId: string; action: ActionKey } | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState<Set<string>>(() => new Set());
  const [columnWidthOverrides, setColumnWidthOverrides] = useState<
    Record<string, ReturnType<typeof normalizeOpenIssuesPrototypeColumnWidths>>
  >({});

  const issues = useMemo(
    () => [...(project.issues as Issue[])].sort((left, right) => (
      (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31")
    )),
    [project.issues],
  );
  const phases = useMemo(
    () => project.wbsItems.filter((item: { type: string }) => item.type === "PHASE"),
    [project.wbsItems],
  );
  const risks = useMemo(
    () => project.raidItems.filter((item: { type: string; status: string }) => (
      item.type === "RISK" && !["CLOSED", "VALIDATED"].includes(item.status)
    )),
    [project.raidItems],
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
    setActiveAction((current) => current?.issueId === issue.id && current.action === action ? null : { issueId: issue.id, action });
    if (action === "section") setDraftValues((current) => ({ ...current, [`${issue.id}:section`]: getDraft(issue).category }));
    if (action === "due") setDraftValues((current) => ({ ...current, [`${issue.id}:due`]: getDraft(issue).dueDate }));
    if (action === "phase") setDraftValues((current) => ({ ...current, [`${issue.id}:phase`]: issue.phaseId ?? "" }));
    if (action === "risk") setDraftValues((current) => ({ ...current, [`${issue.id}:risk`]: issue.riskId ?? "" }));
  };

  const saveAction = async (issue: Issue, action: "section" | "due" | "phase" | "risk") => {
    const value = draftValues[`${issue.id}:${action}`] ?? "";
    const payload = action === "section"
      ? { category: value }
      : action === "due"
        ? { dueDate: value || null }
        : action === "phase"
          ? { phaseId: value || null }
          : { riskId: value || null };
    const result = await saveOpenIssueWithPayload(issue.id, payload, { quiet: true, refresh: action === "phase" });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (action === "section") updateDraft(issue, { category: value });
    if (action === "due") updateDraft(issue, { dueDate: value });
    if (action === "phase") updateDraft(issue, { phaseId: value });
    if (action === "risk") updateDraft(issue, { riskId: value });
    setActiveAction(null);
    setNotice(t("ui.projects.openIssuesPrototypeSaved"));
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
                const value = draftValues[`${issue.id}:section`] ?? getDraft(issue).category;
                if (value.trim() && value !== getDraft(issue).category) void saveAction(issue, "section");
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
    return (
      <div className="open-issues-prototype-editor">
        <label>{t("ui.projects.linkedRiskLabel")}
          <select
            autoFocus
            value={draftValues[`${issue.id}:risk`] ?? ""}
            disabled={isReadOnly}
            onChange={(event) => setDraftValues((current) => ({ ...current, [`${issue.id}:risk`]: event.target.value }))}
          >
            <option value="">{t("ui.projects.noLinkedRiskValue")}</option>
            {risks.map((risk: { id: string; title: string }) => <option value={risk.id} key={risk.id}>{risk.title}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void saveAction(issue, action)} disabled={isReadOnly}><Save size={15} />{t("ui.projects.openIssuesPrototypeSave")}</button>
      </div>
    );
  };

  return (
    <article className="panel project-card project-module-page open-issues-prototype-page">
      <div className="panel-title">
        <div>
          <h2>{t("ui.projects.openIssuesPrototypeTitle")}</h2>
          <p>{t("ui.projects.openIssuesPrototypeDescription")}</p>
        </div>
        <span className="open-issues-prototype-count">{issues.length}</span>
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
            <tbody>
              {issues.map((issue, index) => {
                const expanded = expandedIssueId === issue.id;
                const action = activeAction?.issueId === issue.id ? activeAction.action : null;
                const phase = phases.find((item: { id: string }) => item.id === issue.phaseId);
                const linkedRisk = risks.find((item: { id: string }) => item.id === issue.riskId);
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
                        <input
                          className="open-issues-prototype-inline-input open-issues-prototype-title-input"
                          value={draft.title}
                          disabled={isReadOnly}
                          aria-busy={isSaving("title")}
                          onChange={(event) => updateDraft(issue, { title: event.target.value })}
                          onBlur={() => void persistInlineField(issue, "title", getDraft(issue).title)}
                          aria-label={t("ui.projects.questionTitleColumn")}
                        />
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
                    {expanded && <tr className="open-issues-prototype-actions-row" key={`${issue.id}-actions`}><td colSpan={6}>
                      <div className="open-issues-prototype-action-bar">
                        <button type="button" className={action === "section" ? "active" : ""} onClick={() => toggleAction(issue, "section")}><Tag size={15} />{t("ui.projects.openIssuesPrototypeSection")}</button>
                        <button type="button" className={action === "due" ? "active" : ""} onClick={() => toggleAction(issue, "due")}><CalendarDays size={15} />{t("ui.automation.dueDate")}</button>
                        <button type="button" className={action === "phase" ? "active" : ""} onClick={() => toggleAction(issue, "phase")}><CircleAlert size={15} />{t("ui.projects.openIssuesPrototypePhase")}{phase ? ` · ${phase.code}` : ""}</button>
                        <button type="button" className={action === "risk" ? "active" : ""} onClick={() => toggleAction(issue, "risk")}><Link2 size={15} />{t("ui.projects.openIssuesPrototypeRisk")}{linkedRisk ? ` · ${linkedRisk.title}` : ""}</button>
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
            </tbody>
          </table>
        </div>
      )}
      <datalist id="open-issues-prototype-categories">
        {categoryOptions.map((category) => <option value={category} key={category} />)}
      </datalist>
    </article>
  );
}
