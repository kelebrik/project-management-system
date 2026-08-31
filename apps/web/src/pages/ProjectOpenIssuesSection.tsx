import { Check, ExternalLink, Pencil, Plus, X } from "lucide-react";
import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { Issue } from "../app/domainTypes";
import { issueToDraft, type IssueEditDraft } from "../app/formState";
import {
  OPEN_ISSUE_COLUMNS,
  normalizeOpenIssueColumnWidths,
  openIssueTableWidth,
  type OpenIssueColumnKey,
} from "../app/openIssueTable";
import { usePageContext } from "./PageContext";

type EditableIssueField = keyof Pick<
  IssueEditDraft,
  | "phaseId"
  | "category"
  | "title"
  | "referenceUrl"
  | "readiness"
  | "owner"
  | "impact"
  | "decisionRequired"
  | "dueDate"
>;

const nullableFields = new Set<EditableIssueField>(["phaseId", "referenceUrl", "dueDate"]);

const readinessLabels = {
  RED: "Красная",
  AMBER: "Жёлтая",
  GREEN: "Зелёная",
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

export function ProjectOpenIssuesSection() {
  const {
    addIssueJiraLink,
    addIssueStatusUpdate,
    calendarDelayDays,
    closeOpenIssue,
    convertIssueToProblem,
    date,
    isReadOnly,
    issueEditDrafts,
    issueLinkDrafts,
    issueStatusDrafts,
    project,
    removeIssueJiraLink,
    saveOpenIssueWithPayload,
    saveProjectUiState,
    setError,
    setIssueLinkDrafts,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();
  const [savingCells, setSavingCells] = useState<Set<string>>(() => new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [addingTicketIssueIds, setAddingTicketIssueIds] = useState<Set<string>>(() => new Set());
  const [editingThreadIssueIds, setEditingThreadIssueIds] = useState<Set<string>>(() => new Set());
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
  const groups = useMemo(() => {
    const result = new Map<string, Issue[]>();
    for (const issue of project.issues as Issue[]) {
      const category = issue.category.trim() || "Без раздела";
      result.set(category, [...(result.get(category) ?? []), issue]);
    }
    return [...result.entries()];
  }, [project.issues]);
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
        setError(error instanceof Error ? error.message : "Не удалось сохранить ширину колонок"),
      );
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const patchDraft = (issue: Issue, patch: Partial<IssueEditDraft>) =>
    updateIssueDraft(issue.id, patch, issueToDraft(issue));

  const persistField = async (
    issue: Issue,
    field: EditableIssueField,
    requestedValue?: IssueEditDraft[EditableIssueField],
  ) => {
    const draft = (issueEditDrafts[issue.id] as IssueEditDraft | undefined) ?? issueToDraft(issue);
    const key = `${issue.id}:${field}`;
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

  const commitOnEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    issue: Issue,
    field: EditableIssueField,
  ) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      patchDraft(issue, { [field]: issueFieldValue(issue, field) ?? "" });
      event.currentTarget.blur();
    }
  };

  if (project.issues.length === 0) {
    return <div className="empty-state issue-register-empty">Открытых вопросов нет.</div>;
  }

  return (
    <>
      <div
        className="issue-register-scroll"
        role="region"
        tabIndex={0}
        aria-label="Таблица открытых вопросов, доступна горизонтальная прокрутка"
      >
        <table
          className="issue-register"
          style={{ width: tableWidth, minWidth: tableWidth } as CSSProperties}
        >
          <caption className="issue-register-caption">
            Открытые вопросы проекта с редактированием полей в таблице
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
                  <span>{column.label}</span>
                  <button
                    type="button"
                    className="issue-column-resizer"
                    aria-label={`Изменить ширину колонки ${column.label}`}
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
                const jiraDraft = issueLinkDrafts[issue.id] ?? { jiraKey: "", jiraUrl: "" };
                const ticketLinks = issueTicketLinks(issue);
                const delayDays = calendarDelayDays(issue.initialDueDate, issue.dueDate);
                const isSaving = (field: EditableIssueField | "statusUpdate") =>
                  savingCells.has(`${issue.id}:${field}`);
                const fieldError = (...fields: Array<EditableIssueField | "statusUpdate">) => {
                  const message = fields
                    .map((field) => fieldErrors[`${issue.id}:${field}`])
                    .find(Boolean);
                  return message ? <span className="issue-inline-error" role="alert">{message}</span> : null;
                };
                const addingTicket = addingTicketIssueIds.has(issue.id);
                const editingThread = editingThreadIssueIds.has(issue.id);

                return (
                  <tr className="issue-register-row" id={`issue-item-${issue.id}`} key={issue.id}>
                    <th className="issue-register-number" scope="row">{index + 1}</th>
                    <td className="issue-register-cell issue-register-task">
                      <input
                        className="issue-inline-category"
                        list="open-issue-categories"
                        value={draft.category}
                        disabled={isReadOnly}
                        aria-busy={isSaving("category")}
                        onChange={(event) => patchDraft(issue, { category: event.target.value })}
                        onBlur={() => void persistField(issue, "category")}
                        onKeyDown={(event) => commitOnEnter(event, issue, "category")}
                        aria-label="Раздел вопроса"
                      />
                      <textarea
                        rows={3}
                        value={draft.title}
                        disabled={isReadOnly}
                        aria-busy={isSaving("title")}
                        onChange={(event) => patchDraft(issue, { title: event.target.value })}
                        onBlur={() => void persistField(issue, "title")}
                        aria-label="Название вопроса"
                      />
                      {fieldError("category", "title")}
                    </td>
                    <td className="issue-register-cell issue-register-links">
                      <div className="issue-thread-control">
                        {editingThread ? (
                          <input
                            autoFocus
                            type="url"
                            value={draft.referenceUrl}
                            aria-label="Ссылка на трэд"
                            aria-busy={isSaving("referenceUrl")}
                            onChange={(event) => patchDraft(issue, { referenceUrl: event.target.value })}
                            onKeyDown={(event) => commitOnEnter(event, issue, "referenceUrl")}
                            onBlur={() => {
                              void persistField(issue, "referenceUrl").finally(() => {
                                setEditingThreadIssueIds((current) => {
                                  const next = new Set(current);
                                  next.delete(issue.id);
                                  return next;
                                });
                              });
                            }}
                          />
                        ) : issue.referenceUrl ? (
                          <a
                            className="issue-thread-link"
                            href={issue.referenceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span>Ссылка на трэд</span>
                            <ExternalLink size={15} />
                          </a>
                        ) : (
                          <span className="issue-thread-link is-empty">Ссылка на трэд</span>
                        )}
                        {!isReadOnly && !editingThread ? (
                          <button
                            type="button"
                            className="icon-button issue-thread-edit"
                            aria-label="Изменить ссылку на трэд"
                            onClick={() => setEditingThreadIssueIds((current) => new Set(current).add(issue.id))}
                          >
                            <Pencil size={14} />
                          </button>
                        ) : null}
                      </div>
                      {fieldError("referenceUrl")}
                      <span className="issue-ticket-label">Ссылка на тикет</span>
                      <div className="issue-ticket-links" aria-label="Ссылки на тикеты">
                        {ticketLinks.map((link) => (
                          <span className="issue-ticket-link-item" key={link.id}>
                            <a href={link.jiraUrl} target="_blank" rel="noreferrer">
                              {link.jiraKey}
                            </a>
                            {!isReadOnly && !link.id.startsWith("primary-") ? (
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Удалить ссылку ${link.jiraKey}`}
                                onClick={() => void removeIssueJiraLink(issue.id, link.id)}
                              >
                                <X size={13} />
                              </button>
                            ) : !isReadOnly ? (
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Удалить ссылку ${link.jiraKey}`}
                                onClick={() => void saveOpenIssueWithPayload(issue.id, {
                                  jiraTicketKey: null,
                                  jiraTicketUrl: null,
                                })}
                              >
                                <X size={13} />
                              </button>
                            ) : null}
                          </span>
                        ))}
                        {!isReadOnly ? (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Добавить ссылку на тикет"
                            aria-expanded={addingTicket}
                            onClick={() => setAddingTicketIssueIds((current) => {
                              const next = new Set(current);
                              if (next.has(issue.id)) next.delete(issue.id);
                              else next.add(issue.id);
                              return next;
                            })}
                          >
                            <Plus size={15} />
                          </button>
                        ) : null}
                      </div>
                      {addingTicket ? (
                        <div className="issue-inline-jira-add">
                          <input
                            value={jiraDraft.jiraKey}
                            placeholder="JIRA-123"
                            onChange={(event) => setIssueLinkDrafts({
                              ...issueLinkDrafts,
                              [issue.id]: { ...jiraDraft, jiraKey: event.target.value },
                            })}
                            aria-label="Ключ дополнительного тикета"
                          />
                          <input
                            type="url"
                            value={jiraDraft.jiraUrl}
                            placeholder="URL Jira"
                            onChange={(event) => setIssueLinkDrafts({
                              ...issueLinkDrafts,
                              [issue.id]: { ...jiraDraft, jiraUrl: event.target.value },
                            })}
                            aria-label="URL дополнительного тикета"
                          />
                          <button
                            type="button"
                            aria-label="Сохранить ссылку на тикет"
                            disabled={!jiraDraft.jiraKey.trim() || !jiraDraft.jiraUrl.trim()}
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
                      ) : <p className="muted-inline">Статус ещё не добавлен</p>}
                      {statuses.length > 1 ? (
                        <details className="issue-status-history">
                          <summary>История · {statuses.length}</summary>
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
                          <span className="issue-status-today">Сегодня</span>
                          <textarea
                            rows={2}
                            value={statusDraft.text}
                            placeholder="Добавить новый статус"
                            disabled={isSaving("statusUpdate")}
                            onChange={(event) => updateIssueStatusDraft(issue.id, { text: event.target.value })}
                            aria-label="Текст нового статуса"
                          />
                          <button
                            type="button"
                            aria-label="Добавить статус с текущей датой"
                            disabled={isSaving("statusUpdate") || !statusDraft.text.trim()}
                            onClick={() => void appendStatus(issue)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                      ) : null}
                      {fieldError("statusUpdate")}
                    </td>
                    <td className="issue-register-cell">
                      <textarea
                        rows={3}
                        value={draft.owner}
                        placeholder="Ответственный"
                        disabled={isReadOnly}
                        aria-busy={isSaving("owner")}
                        onChange={(event) => patchDraft(issue, { owner: event.target.value })}
                        onBlur={() => void persistField(issue, "owner")}
                        aria-label="Ответственный"
                      />
                      {fieldError("owner")}
                    </td>
                    <td className="issue-register-cell">
                      <textarea
                        rows={4}
                        value={draft.impact}
                        placeholder="Риск и последствия"
                        disabled={isReadOnly}
                        aria-busy={isSaving("impact")}
                        onChange={(event) => patchDraft(issue, { impact: event.target.value })}
                        onBlur={() => void persistField(issue, "impact")}
                        aria-label="Риски"
                      />
                      {fieldError("impact")}
                    </td>
                    <td className={`issue-register-cell issue-readiness-cell ${draft.readiness.toLowerCase()}`}>
                      <select
                        value={draft.readiness}
                        disabled={isReadOnly}
                        aria-busy={isSaving("readiness")}
                        onChange={(event) => {
                          const readiness = event.target.value as Issue["readiness"];
                          patchDraft(issue, { readiness });
                          void persistField(issue, "readiness", readiness);
                        }}
                        aria-label="Готовность"
                      >
                        {Object.entries(readinessLabels).map(([value, label]) => (
                          <option value={value} key={value}>{label}</option>
                        ))}
                      </select>
                      {fieldError("readiness")}
                    </td>
                    <td className="issue-register-cell issue-register-phase">
                      <select
                        value={draft.phaseId}
                        disabled={isReadOnly || isSaving("phaseId")}
                        onChange={(event) => {
                          const phaseId = event.target.value;
                          patchDraft(issue, { phaseId });
                          void persistField(issue, "phaseId", phaseId);
                        }}
                        aria-label="Фаза проекта"
                      >
                        <option value="" disabled={Boolean(issue.workPackageId)}>Без фазы</option>
                        {phases.map((phase: { id: string; code: string; title: string }) => (
                          <option value={phase.id} key={phase.id}>
                            {phase.code} · {phase.title}
                          </option>
                        ))}
                      </select>
                      {issue.workPackageId ? (
                        <span className="issue-phase-package-note">Пакет работ создан в Структуре</span>
                      ) : null}
                      {fieldError("phaseId")}
                    </td>
                    <td className="issue-register-cell issue-register-parameters">
                      <label>
                        <span>Срок</span>
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
                        {issue.initialDueDate ? <span>Исходный срок: {date(issue.initialDueDate)}</span> : null}
                        {delayDays !== 0 ? (
                          <span>Сдвиг: {delayDays > 0 ? "+" : ""}{delayDays} кал. дн.</span>
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
                        Требует решения
                      </label>
                      {fieldError("dueDate", "decisionRequired")}
                      {!isReadOnly ? (
                        <div className="issue-inline-actions">
                          <button type="button" className="secondary-button" onClick={() => void convertIssueToProblem(issue.id)}>В проблему</button>
                          <button type="button" className="secondary-button" onClick={() => void closeOpenIssue(issue.id)}><Check size={14} />Закрыть</button>
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
