import { Check, ExternalLink, Link2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";

import type { Issue } from "../app/domainTypes";
import { issueToDraft, type IssueEditDraft } from "../app/formState";
import { usePageContext } from "./PageContext";

type EditableIssueField = keyof Pick<
  IssueEditDraft,
  | "category"
  | "title"
  | "referenceLabel"
  | "referenceUrl"
  | "severity"
  | "readiness"
  | "status"
  | "owner"
  | "impact"
  | "decisionRequired"
  | "dueDate"
  | "jiraTicketKey"
  | "jiraTicketUrl"
>;

const nullableFields = new Set<EditableIssueField>([
  "dueDate",
  "referenceUrl",
  "jiraTicketKey",
  "jiraTicketUrl",
]);

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

export function ProjectOpenIssuesSection() {
  const {
    addIssueJiraLink,
    addIssueStatusUpdate,
    calendarDelayDays,
    closeOpenIssue,
    convertIssueToProblem,
    date,
    isReadOnly,
    isoDate,
    issueEditDrafts,
    issueLinkDrafts,
    issueSeverityLabel,
    issueStatusDrafts,
    issueStatusLabel,
    project,
    removeIssueJiraLink,
    saveOpenIssueWithPayload,
    setIssueLinkDrafts,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();
  const [savingCells, setSavingCells] = useState<Set<string>>(() => new Set());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    const result = new Map<string, Issue[]>();
    for (const issue of project.issues as Issue[]) {
      const category = issue.category.trim() || "Без раздела";
      result.set(category, [...(result.get(category) ?? []), issue]);
    }
    return [...result.entries()];
  }, [project.issues]);
  const categoryOptions = groups.map(([category]) => category);

  const patchDraft = (
    issue: Issue,
    patch: Partial<IssueEditDraft>,
  ) => updateIssueDraft(issue.id, patch, issueToDraft(issue));

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
      patchDraft(issue, { [field]: nextValue ?? "" });
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
        { quiet: true, refresh: false },
      );
      if (result.ok) {
        setFieldErrors((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      } else {
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
      const result = await addIssueStatusUpdate(
        issue.id,
        { quiet: true, refresh: false },
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

  const commitOnEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    issue: Issue,
    field: EditableIssueField,
  ) => {
    if (event.key === "Enter") event.currentTarget.blur();
    if (event.key === "Escape") {
      const currentValue = issueFieldValue(issue, field);
      patchDraft(issue, { [field]: currentValue ?? "" });
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
        <table className="issue-register">
          <caption className="issue-register-caption">
            Открытые вопросы проекта с редактированием полей в таблице
          </caption>
          <colgroup>
            <col className="issue-col-number" />
            <col className="issue-col-task" />
            <col className="issue-col-link" />
            <col className="issue-col-status" />
            <col className="issue-col-owner" />
            <col className="issue-col-risk" />
            <col className="issue-col-readiness" />
            <col className="issue-col-parameters" />
          </colgroup>
          <thead className="issue-register-head">
            <tr>
              <th scope="col">№</th>
              <th scope="col">Задача</th>
              <th scope="col">Ссылка</th>
              <th scope="col">Статус</th>
              <th scope="col">Ответственный</th>
              <th scope="col">Риски</th>
              <th scope="col">Готовность</th>
              <th scope="col">Параметры</th>
            </tr>
          </thead>
          {groups.map(([category, issues]) => (
            <tbody className="issue-register-group" key={category}>
              <tr className="issue-register-group-heading">
                <th colSpan={8} scope="rowgroup">{category}</th>
              </tr>
              {issues.map((issue, index) => {
                const draft = (issueEditDrafts[issue.id] as IssueEditDraft | undefined)
                  ?? issueToDraft(issue);
                const statuses = sortedStatusUpdates(issue);
                const latestStatus = statuses[0];
                const statusDraft = issueStatusDrafts[issue.id] ?? {
                  statusAt: isoDate(new Date()),
                  text: "",
                };
                const jiraDraft = issueLinkDrafts[issue.id] ?? { jiraKey: "", jiraUrl: "" };
                const displayedReferenceUrl = draft.referenceUrl.trim();
                const delayDays = calendarDelayDays(
                  issue.initialDueDate,
                  issue.dueDate,
                );
                const isSaving = (field: EditableIssueField | "statusUpdate") =>
                  savingCells.has(`${issue.id}:${field}`);
                const fieldError = (...fields: Array<EditableIssueField | "statusUpdate">) => {
                  const message = fields
                    .map((field) => fieldErrors[`${issue.id}:${field}`])
                    .find(Boolean);
                  return message ? (
                    <span className="issue-inline-error" role="alert">{message}</span>
                  ) : null;
                };
                return (
                  <tr
                    className="issue-register-row"
                    id={`issue-item-${issue.id}`}
                    key={issue.id}
                  >
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
                      <input
                        value={draft.referenceLabel}
                        placeholder="Подпись ссылки"
                        disabled={isReadOnly}
                        aria-busy={isSaving("referenceLabel")}
                        onChange={(event) => patchDraft(issue, { referenceLabel: event.target.value })}
                        onBlur={() => void persistField(issue, "referenceLabel")}
                        onKeyDown={(event) => commitOnEnter(event, issue, "referenceLabel")}
                        aria-label="Подпись рабочей ссылки"
                      />
                      <div className="issue-inline-url">
                        <input
                          type="url"
                          value={draft.referenceUrl}
                          placeholder="https://..."
                          disabled={isReadOnly}
                          aria-busy={isSaving("referenceUrl")}
                          onChange={(event) => patchDraft(issue, { referenceUrl: event.target.value })}
                          onBlur={() => void persistField(issue, "referenceUrl")}
                          onKeyDown={(event) => commitOnEnter(event, issue, "referenceUrl")}
                          aria-label="Рабочая ссылка"
                        />
                        {displayedReferenceUrl ? (
                          <a
                            href={displayedReferenceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Открыть ссылку: ${draft.referenceLabel.trim() || displayedReferenceUrl}`}
                          >
                            <span>{draft.referenceLabel.trim() || "Открыть ссылку"}</span>
                            <ExternalLink size={15} />
                          </a>
                        ) : null}
                      </div>
                      <div className="issue-primary-jira-fields">
                        <span>{issue.source === "JIRA" ? "Источник Jira" : "Внутренний вопрос"}</span>
                        <input
                          value={draft.jiraTicketKey}
                          placeholder="Основной ключ Jira"
                          disabled={isReadOnly}
                          aria-busy={isSaving("jiraTicketKey")}
                          onChange={(event) => patchDraft(issue, { jiraTicketKey: event.target.value })}
                          onBlur={() => void persistField(issue, "jiraTicketKey")}
                          onKeyDown={(event) => commitOnEnter(event, issue, "jiraTicketKey")}
                          aria-label="Основной ключ Jira"
                        />
                        <input
                          type="url"
                          value={draft.jiraTicketUrl}
                          placeholder="Основной URL Jira"
                          disabled={isReadOnly}
                          aria-busy={isSaving("jiraTicketUrl")}
                          onChange={(event) => patchDraft(issue, { jiraTicketUrl: event.target.value })}
                          onBlur={() => void persistField(issue, "jiraTicketUrl")}
                          onKeyDown={(event) => commitOnEnter(event, issue, "jiraTicketUrl")}
                          aria-label="Основной URL Jira"
                        />
                      </div>
                      <div className="issue-inline-jira-list">
                        {issue.jiraLinks.map((link) => (
                          <span className="jira-chip" key={link.id}>
                            <a href={link.jiraUrl} target="_blank" rel="noreferrer">{link.jiraKey}</a>
                            {!isReadOnly ? (
                              <button
                                type="button"
                                aria-label={`Удалить связь ${link.jiraKey}`}
                                onClick={() => void removeIssueJiraLink(issue.id, link.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : null}
                          </span>
                        ))}
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
                            aria-label="Ключ новой связи Jira"
                          />
                          <input
                            type="url"
                            value={jiraDraft.jiraUrl}
                            placeholder="URL Jira"
                            onChange={(event) => setIssueLinkDrafts({
                              ...issueLinkDrafts,
                              [issue.id]: { ...jiraDraft, jiraUrl: event.target.value },
                            })}
                            aria-label="URL новой связи Jira"
                          />
                          <button
                            type="button"
                            aria-label="Добавить связь Jira"
                            disabled={!jiraDraft.jiraKey.trim() || !jiraDraft.jiraUrl.trim()}
                            onClick={() => void addIssueJiraLink(issue.id)}
                          >
                            <Link2 size={14} />
                          </button>
                        </div>
                      ) : null}
                      {fieldError(
                        "referenceLabel",
                        "referenceUrl",
                        "jiraTicketKey",
                        "jiraTicketUrl",
                      )}
                    </td>
                    <td className="issue-register-cell issue-register-status">
                      {latestStatus ? (
                        <div className="issue-current-status">
                          <time dateTime={latestStatus.statusAt}>{date(latestStatus.statusAt)}</time>
                          <p>{latestStatus.text}</p>
                        </div>
                      ) : (
                        <p className="muted-inline">Статус ещё не добавлен</p>
                      )}
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
                          <input
                            type="date"
                            value={statusDraft.statusAt}
                            disabled={isSaving("statusUpdate")}
                            onChange={(event) => updateIssueStatusDraft(issue.id, { statusAt: event.target.value })}
                            aria-label="Дата нового статуса"
                          />
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
                            aria-label="Добавить статус"
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
                    <td className="issue-register-cell issue-register-parameters">
                      <label>
                        <span>Критичность</span>
                        <select
                          value={draft.severity}
                          disabled={isReadOnly}
                          aria-busy={isSaving("severity")}
                          onChange={(event) => {
                            const severity = event.target.value as Issue["severity"];
                            patchDraft(issue, { severity });
                            void persistField(issue, "severity", severity);
                          }}
                        >
                          {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((value) => (
                            <option value={value} key={value}>{issueSeverityLabel(value)}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Состояние</span>
                        <select
                          value={draft.status}
                          disabled={isReadOnly}
                          aria-busy={isSaving("status")}
                          onChange={(event) => {
                            const status = event.target.value;
                            patchDraft(issue, { status });
                            void persistField(issue, "status", status);
                          }}
                        >
                          {["Open", "In Progress", "Blocked", "Resolved", "Closed"].map((value) => (
                            <option value={value} key={value}>{issueStatusLabel(value)}</option>
                          ))}
                        </select>
                      </label>
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
                        {issue.initialDueDate ? (
                          <span>Исходный срок: {date(issue.initialDueDate)}</span>
                        ) : null}
                        {delayDays !== 0 ? (
                          <span>
                            Сдвиг: {delayDays > 0 ? "+" : ""}{delayDays} кал. дн.
                          </span>
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
                      {fieldError("severity", "status", "dueDate", "decisionRequired")}
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
