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
    setExpandedIssueId,
    setIssueLinkDrafts,
    updateIssueDraft,
    updateIssueStatusDraft,
  } = usePageContext();

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
                            <span className="issue-summary-title">
                              {issue.title}
                              </span>
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
                                {expandedIssueId === issue.id ? "-" : "+"}
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
                              return (
                                <>
                                  <section className="raid-status-panel issue-status-panel">
                                    <div className="subhead">Статус</div>
                                    {latestStatus ? (
                                      <div className="raid-status-latest">
                                        <strong>{date(latestStatus.statusAt)}</strong>
                                        <p>{latestStatus.text}</p>
                                      </div>
                                    ) : (
                                      <p className="muted-text">
                                        Статус пока не добавлен.
                                      </p>
                                    )}
                                    <div className="raid-status-history">
                                      {issue.statusUpdates.map((statusUpdate) => (
                                        <div
                                          className="raid-status-history-row"
                                          key={statusUpdate.id}
                                        >
                                          <span>{date(statusUpdate.statusAt)}</span>
                                          <p>{statusUpdate.text}</p>
                                        </div>
                                      ))}
                                    </div>
                                    <div className="raid-status-add">
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
                                      <textarea
                                        rows={2}
                                        value={issueStatusDrafts[issue.id]?.text ?? ""}
                                        onChange={(event) =>
                                          updateIssueStatusDraft(issue.id, {
                                            text: event.target.value,
                                          })
                                        }
                                        placeholder="Новый статус: что изменилось, следующий шаг, блокеры"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => addIssueStatusUpdate(issue.id)}
                                        disabled={isReadOnly}
                                      >
                                        Добавить статус
                                      </button>
                                    </div>
                                  </section>
                                  <div className="issue-detail-meta">
                                    <span
                                      className={`severity ${issue.severity.toLowerCase()}`}
                                    >
                                      {issueSeverityLabel(issue.severity)}
                                    </span>
                                    <span>Статус: {issueStatusLabel(issue.status)}</span>
                                    <span>
                                      Источник: {issue.source === "JIRA" ? "Jira" : "Внутренний"}
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
                                        <option value="HIGH">{issueSeverityLabel("HIGH")}</option>
                                        <option value="MEDIUM">
                                          {issueSeverityLabel("MEDIUM")}
                                        </option>
                                        <option value="LOW">{issueSeverityLabel("LOW")}</option>
                                      </select>
                                      <select
                                        value={draft.status}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            status: event.target.value,
                                          })
                                        }
                                        disabled={isReadOnly}
                                      >
                                        <option value="Open">{issueStatusLabel("Open")}</option>
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
                                      <input
                                        value={draft.title}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            title: event.target.value,
                                          })
                                        }
                                        placeholder="Заголовок"
                                        disabled={isReadOnly}
                                      />
                                      <input
                                        value={draft.owner}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            owner: event.target.value,
                                          })
                                        }
                                        placeholder="Ответственный"
                                        disabled={isReadOnly}
                                      />
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
                                      <input
                                        value={draft.jiraTicketKey}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            jiraTicketKey: event.target.value,
                                          })
                                        }
                                        placeholder="Ключ Jira"
                                        disabled={isReadOnly}
                                      />
                                      <input
                                        value={draft.jiraTicketUrl}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            jiraTicketUrl: event.target.value,
                                          })
                                        }
                                        placeholder="Jira URL"
                                        disabled={isReadOnly}
                                      />
                                      <label className="checkbox-line compact-checkbox">
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
                                      <textarea
                                        className="span-2"
                                        value={draft.impact}
                                        onChange={(event) =>
                                          updateIssueDraft(issue.id, {
                                            impact: event.target.value,
                                          })
                                        }
                                        rows={2}
                                        placeholder="Влияние"
                                        disabled={isReadOnly}
                                      />
                                      <div className="issue-actions span-2">
                                        <button
                                          type="button"
                                          onClick={() => saveOpenIssue(issue.id)}
                                          disabled={isReadOnly}
                                        >
                                          Сохранить вопрос
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => closeOpenIssue(issue.id)}
                                          disabled={isReadOnly}
                                        >
                                          Решено
                                        </button>
                                      </div>
                                    </div>
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
                                          onClick={() =>
                                            removeIssueJiraLink(issue.id, link.id)
                                          }
                                          disabled={isReadOnly}
                                        >
                                          x
                                        </button>
                                      </span>
                                    ))}
                                    {issue.jiraLinks.length === 0 && (
                                      <span className="muted-inline">
                                        Задачи Jira не связаны
                                      </span>
                                    )}
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
                              />
                              <button
                                type="button"
                                onClick={() => addIssueJiraLink(issue.id)}
                              >
                              Добавить
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      );
                      })}
                    </div>;
}
