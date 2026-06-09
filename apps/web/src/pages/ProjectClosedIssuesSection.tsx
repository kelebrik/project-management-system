import { usePageContext } from "./PageContext";

export function ProjectClosedIssuesSection() {
  const {
    calendarDelayDays,
    date,
    expandedIssueId,
    issuePrimaryJiraLink,
    issueSeverityLabel,
    issueStatusLabel,
    project,
    setExpandedIssueId,
  } = usePageContext();

  return <section className="closed-issues-section">
                      <div className="section-heading compact">
                        <div>
                          <h3>Закрытые ранее вопросы</h3>
                          <p>Вопросы со статусом Решено или Закрыто</p>
                        </div>
                        <span>{project.closedIssues?.length ?? 0}</span>
                      </div>
                      <div className="issue-list closed-issue-list">
                        <div className="issue-list-head" aria-hidden="true">
                          <span>Наименование</span>
                          <span>Ключ Jira</span>
                          <span>Срок</span>
                          <span>Отставание</span>
                          <span>Ответственный</span>
                          <span />
                        </div>
                        {(project.closedIssues ?? []).map((issue) => {
                          const jiraLink = issuePrimaryJiraLink(issue);
                          const delayDays =
                            issue.closedDelayDays ??
                            calendarDelayDays(issue.initialDueDate, issue.dueDate);
                          return (
                            <div className="issue-row closed" key={issue.id}>
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
                                  {date(issue.dueDate)}
                                </span>
                                <span
                                  className={`issue-summary-cell ${delayDays > 0 ? "issue-delay" : ""}`}
                                >
                                  {delayDays > 0 ? `+${delayDays} дн.` : "нет"}
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
                                  <div className="issue-detail-meta">
                                    <span
                                      className={`severity ${issue.severity.toLowerCase()}`}
                                    >
                                      {issueSeverityLabel(issue.severity)}
                                    </span>
                                    <span>
                                      Статус: {issueStatusLabel(issue.status)}
                                    </span>
                                    <span>
                                      Отставание на момент закрытия:{" "}
                                      {delayDays > 0 ? `+${delayDays} кал. дн.` : "нет"}
                                    </span>
                                    <span>
                                      Источник:{" "}
                                      {issue.source === "JIRA" ? "Jira" : "Внутренний"}
                                    </span>
                                  </div>
                                  <div className="issue-impact">
                                    <span>Влияние</span>
                                    <p>{issue.impact || "не заполнено"}</p>
                                  </div>
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
                                      </span>
                                    ))}
                                    {issue.jiraLinks.length === 0 && !jiraLink.url && (
                                      <span className="muted-inline">
                                        Задачи Jira не связаны
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(project.closedIssues?.length ?? 0) === 0 && (
                          <div className="empty-state">
                            Закрытых вопросов пока нет.
                          </div>
                        )}
                      </div>
                    </section>;
}
