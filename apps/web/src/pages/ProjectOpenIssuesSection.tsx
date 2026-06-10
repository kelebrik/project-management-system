import type { KeyboardEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
  Plus,
  Save,
  X,
} from "lucide-react";
import { usePageContext } from "./PageContext";
import type { Issue } from "../app/domainTypes";

export function ProjectOpenIssuesSection() {
  const {
    addIssueJiraLink,
    addIssueStatusUpdate,
    calendarDelayDays,
    closeOpenIssue,
    date,
    expandedIssueId,
    isReadOnly,
    isoDate,
    issueEditDrafts,
    issueLinkDrafts,
    issuePrimaryJiraLink,
    issueSeverityLabel,
    issueStatusDrafts,
    issueStatusLabel,
    latestIssueStatusUpdate,
    project,
    removeIssueJiraLink,
    saveOpenIssue,
    saveOpenIssueWithPayload,
    setExpandedIssueId,
    setIssueLinkDrafts,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();

  const saveIssueTitle = (issue: Issue) => {
    const draft = issueEditDrafts[issue.id];
    if (!draft) return;
    const title = draft.title.trim();
    if (!title || title === issue.title) {
      updateIssueDraft(issue.id, { title: issue.title });
      return;
    }
    void saveOpenIssueWithPayload(issue.id, { title });
  };

  const handleTitleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    issue: Issue,
  ) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      updateIssueDraft(issue.id, { title: issue.title });
    }
  };

  return <div className="issue-list">
                    <div className="issue-list-head" aria-hidden="true">
                      <span>Запись</span>
                      <span>Ключ Jira</span>
                      <span>Критичность</span>
                      <span>Срок</span>
                      <span>Ответственный</span>
                      <span />
                    </div>
                      {project.issues.map((issue) => {
                        const delayDays = calendarDelayDays(
                          issue.initialDueDate,
                          issue.dueDate,
                        );
                        const jiraLink = issuePrimaryJiraLink(issue);
                        return (
                        <div className="issue-row" key={issue.id}>
                          <div
                            className="issue-summary-row"
                            role="button"
                            tabIndex={0}
                            aria-expanded={expandedIssueId === issue.id}
                            aria-controls={`issue-details-${issue.id}`}
                            onClick={() =>
                              setExpandedIssueId(
                                expandedIssueId === issue.id ? null : issue.id,
                              )
                            }
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ") {
                                return;
                              }
                              event.preventDefault();
                              setExpandedIssueId(
                                expandedIssueId === issue.id ? null : issue.id,
                              );
                            }}
                          >
                            <input
                              className="issue-summary-title-input"
                              value={
                                issueEditDrafts[issue.id]?.title ?? issue.title
                              }
                              onChange={(event) =>
                                updateIssueDraft(issue.id, {
                                  title: event.target.value,
                                })
                              }
                              onBlur={() => saveIssueTitle(issue)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) =>
                                handleTitleKeyDown(event, issue)
                              }
                              aria-label="Название открытого вопроса"
                              disabled={isReadOnly}
                            />
                              <span className="issue-summary-cell">
                                {jiraLink.key && jiraLink.url ? (
                                  <a
                                    className="issue-jira-key"
                                    href={jiraLink.url}
                                    rel="noreferrer"
                                    target="_blank"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {jiraLink.key}
                                  </a>
                                ) : (
                                  jiraLink.key || "не задан"
                                )}
                              </span>
                            <span className="issue-summary-cell">
                              <span
                                className={`issue-severity-pill ${issue.severity.toLowerCase()}`}
                              >
                                {issueSeverityLabel(issue.severity)}
                              </span>
                            </span>
                            <span className="issue-summary-cell">
                              {date(issue.dueDate)}
                            </span>
                            <span className="issue-summary-cell">
                              {issue.owner || "не назначен"}
                            </span>
                              <span className="issue-chevron" aria-hidden="true">
                                {expandedIssueId === issue.id ? (
                                  <ChevronDown size={17} />
                                ) : (
                                  <ChevronRight size={17} />
                                )}
                              </span>
                            </div>
                        {expandedIssueId === issue.id && (
                          <div
                            className="issue-details-panel"
                            id={`issue-details-${issue.id}`}
                          >
                            {(() => {
                              const draft = issueEditDrafts[issue.id];
                              const latestStatus = latestIssueStatusUpdate(issue);
                              const statusHistory = issue.statusUpdates.filter(
                                (statusUpdate) =>
                                  statusUpdate.id !== latestStatus?.id,
                              );
                              return (
                                <>
                                  <div className="issue-detail-layout">
                                    <section className="issue-work-card issue-status-card">
                                      <div className="issue-card-title">
                                        <div>
                                          <span>Текущий статус</span>
                                          <p>Последнее обновление по вопросу</p>
                                        </div>
                                      </div>
                                      {latestStatus ? (
                                        <div className="issue-status-current">
                                          <strong>{date(latestStatus.statusAt)}</strong>
                                          <p>{latestStatus.text}</p>
                                        </div>
                                      ) : (
                                        <p className="muted-text">
                                          Статус пока не добавлен.
                                        </p>
                                      )}
                                      <div className="issue-status-add-card">
                                        <label>
                                          Дата
                                          <input
                                            type="date"
                                            value={
                                              issueStatusDrafts[issue.id]?.statusAt ??
                                              isoDate(new Date())
                                            }
                                            onChange={(event) =>
                                              updateIssueStatusDraft(issue.id, {
                                                statusAt: event.target.value,
                                              })
                                            }
                                          />
                                        </label>
                                        <label className="issue-status-text-field">
                                          Новый статус
                                          <textarea
                                            rows={3}
                                            value={issueStatusDrafts[issue.id]?.text ?? ""}
                                            onChange={(event) =>
                                              updateIssueStatusDraft(issue.id, {
                                                text: event.target.value,
                                              })
                                            }
                                            placeholder="Что изменилось, следующий шаг, блокеры"
                                          />
                                        </label>
                                        <button
                                          type="button"
                                          className="icon-text-button"
                                          onClick={() => addIssueStatusUpdate(issue.id)}
                                          disabled={isReadOnly}
                                        >
                                          <Plus size={16} />
                                          Добавить статус
                                        </button>
                                      </div>
                                      <div className="issue-status-history-card">
                                        <div className="issue-card-title compact">
                                          <span>История статусов</span>
                                        </div>
                                        {statusHistory.length > 0 ? (
                                          <div className="issue-status-history">
                                            {statusHistory.map((statusUpdate) => (
                                              <div
                                                className="issue-status-history-row"
                                                key={statusUpdate.id}
                                              >
                                                <span>{date(statusUpdate.statusAt)}</span>
                                                <p>{statusUpdate.text}</p>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="muted-text">
                                            Предыдущих статусов нет.
                                          </p>
                                        )}
                                      </div>
                                    </section>

                                    <aside className="issue-work-card issue-properties-card">
                                      <div className="issue-card-title">
                                        <div>
                                          <span>Параметры вопроса</span>
                                          <p>Ответственный, срок, влияние и Jira</p>
                                        </div>
                                      </div>
                                      <div className="issue-detail-meta">
                                        <span
                                          className={`severity ${issue.severity.toLowerCase()}`}
                                        >
                                          {issueSeverityLabel(issue.severity)}
                                        </span>
                                        <span>{issueStatusLabel(issue.status)}</span>
                                        <span>
                                          {issue.source === "JIRA" ? "Jira" : "Внутренний"}
                                        </span>
                                        {issue.initialDueDate && (
                                          <span>
                                            Первичный срок: {date(issue.initialDueDate)}
                                          </span>
                                        )}
                                        {delayDays > 0 && (
                                          <b>Сдвиг срока: +{delayDays} кал. дн.</b>
                                        )}
                                        {issue.decisionRequired && <b>Требует решения</b>}
                                      </div>
                                      {draft && (
                                        <div className="issue-edit-grid">
                                          <label>
                                            Критичность
                                            <select
                                              value={draft.severity}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  severity: event.target.value as Issue["severity"],
                                                })
                                              }
                                              disabled={isReadOnly}
                                            >
                                              <option value="CRITICAL">
                                                {issueSeverityLabel("CRITICAL")}
                                              </option>
                                              <option value="HIGH">
                                                {issueSeverityLabel("HIGH")}
                                              </option>
                                              <option value="MEDIUM">
                                                {issueSeverityLabel("MEDIUM")}
                                              </option>
                                              <option value="LOW">
                                                {issueSeverityLabel("LOW")}
                                              </option>
                                            </select>
                                          </label>
                                          <label>
                                            Статус вопроса
                                            <select
                                              value={draft.status}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  status: event.target.value,
                                                })
                                              }
                                              disabled={isReadOnly}
                                            >
                                              <option value="Open">
                                                {issueStatusLabel("Open")}
                                              </option>
                                              <option value="In Progress">
                                                {issueStatusLabel("In Progress")}
                                              </option>
                                              <option value="Blocked">
                                                {issueStatusLabel("Blocked")}
                                              </option>
                                              <option value="Resolved">
                                                {issueStatusLabel("Resolved")}
                                              </option>
                                              <option value="Closed">
                                                {issueStatusLabel("Closed")}
                                              </option>
                                            </select>
                                          </label>
                                          <label>
                                            Ответственный
                                            <input
                                              value={draft.owner}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  owner: event.target.value,
                                                })
                                              }
                                              placeholder="Кто ведет вопрос"
                                              disabled={isReadOnly}
                                            />
                                          </label>
                                          <label>
                                            Срок решения
                                            <input
                                              type="date"
                                              value={draft.dueDate}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  dueDate: event.target.value,
                                                })
                                              }
                                              disabled={isReadOnly}
                                            />
                                          </label>
                                          <label>
                                            Основной ключ Jira
                                            <input
                                              value={draft.jiraTicketKey}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  jiraTicketKey: event.target.value,
                                                })
                                              }
                                              placeholder="Например, PROJ-123"
                                              disabled={isReadOnly}
                                            />
                                          </label>
                                          <label>
                                            Основная ссылка Jira
                                            <input
                                              value={draft.jiraTicketUrl}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  jiraTicketUrl: event.target.value,
                                                })
                                              }
                                              placeholder="https://..."
                                              disabled={isReadOnly}
                                            />
                                          </label>
                                          <label className="checkbox-line compact-checkbox issue-decision-check">
                                            <input
                                              type="checkbox"
                                              checked={draft.decisionRequired}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  decisionRequired: event.target.checked,
                                                })
                                              }
                                              disabled={isReadOnly}
                                            />
                                            Требует решения
                                          </label>
                                          <label className="issue-impact-field">
                                            Влияние
                                            <textarea
                                              value={draft.impact}
                                              onChange={(event) =>
                                                updateIssueDraft(issue.id, {
                                                  impact: event.target.value,
                                                })
                                              }
                                              rows={3}
                                              placeholder="На что влияет вопрос"
                                              disabled={isReadOnly}
                                            />
                                          </label>
                                          <div className="issue-actions">
                                            <button
                                              type="button"
                                              className="icon-text-button"
                                              onClick={() => saveOpenIssue(issue.id)}
                                              disabled={isReadOnly}
                                            >
                                              <Save size={16} />
                                              Сохранить вопрос
                                            </button>
                                            <button
                                              type="button"
                                              className="icon-text-button"
                                              onClick={() => closeOpenIssue(issue.id)}
                                              disabled={isReadOnly}
                                            >
                                              <CheckCircle2 size={16} />
                                              Решено
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                      <div className="issue-jira-block">
                                        <div className="issue-card-title compact">
                                          <span>Связанные задачи Jira</span>
                                        </div>
                                        {jiraLink.key || jiraLink.url ? (
                                          <div className="issue-primary-jira">
                                            <Link2 size={15} />
                                            {jiraLink.url ? (
                                              <a
                                                href={jiraLink.url}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                {jiraLink.key || jiraLink.url}
                                                <ExternalLink size={13} />
                                              </a>
                                            ) : (
                                              <span>{jiraLink.key}</span>
                                            )}
                                          </div>
                                        ) : (
                                          <p className="muted-text">
                                            Основная задача Jira не задана.
                                          </p>
                                        )}
                                        <div className="jira-link-list">
                                          {issue.jiraLinks.map((link) => (
                                            <span className="jira-chip" key={link.id}>
                                              <a
                                                href={link.jiraUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                              >
                                                {link.jiraKey}
                                              </a>
                                              <button
                                                type="button"
                                                aria-label={`Удалить связь ${link.jiraKey}`}
                                                onClick={() =>
                                                  removeIssueJiraLink(issue.id, link.id)
                                                }
                                                disabled={isReadOnly}
                                              >
                                                <X size={12} />
                                              </button>
                                            </span>
                                          ))}
                                          {issue.jiraLinks.length === 0 && (
                                            <span className="muted-inline">
                                              Дополнительных связей нет.
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </aside>
                                  </div>
                                </>
                              );
                            })()}
                            <div className="issue-link-edit">
                              <input
                                value={issueLinkDrafts[issue.id]?.jiraKey ?? ""}
                                onChange={(event) =>
                                  setIssueLinkDrafts({
                                    ...issueLinkDrafts,
                                    [issue.id]: {
                                      ...(issueLinkDrafts[issue.id] ?? {
                                        jiraUrl: "",
                                      }),
                                      jiraKey: event.target.value,
                                    },
                                  })
                                }
                                placeholder="Ключ Jira"
                                disabled={isReadOnly}
                              />
                              <input
                                value={issueLinkDrafts[issue.id]?.jiraUrl ?? ""}
                                onChange={(event) =>
                                  setIssueLinkDrafts({
                                    ...issueLinkDrafts,
                                    [issue.id]: {
                                      ...(issueLinkDrafts[issue.id] ?? {
                                        jiraKey: "",
                                      }),
                                      jiraUrl: event.target.value,
                                    },
                                  })
                                }
                                placeholder="Jira URL"
                                disabled={isReadOnly}
                              />
                              <button
                                type="button"
                                onClick={() => addIssueJiraLink(issue.id)}
                                disabled={isReadOnly}
                              >
                                <Plus size={15} />
                                Добавить связь
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                      })}
                    </div>;
}
