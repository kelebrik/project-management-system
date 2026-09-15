import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

export function ProjectClosedIssuesSection() {
  const { t: uiText } = useInterfaceTranslation();
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
                          <h3>{uiText("ui.projects.closedQuestionsSectionTitle")}</h3>
                          <p>{uiText("ui.projects.closedQuestionsSectionSubtitle")}</p>
                        </div>
                        <span>{project.closedIssues?.length ?? 0}</span>
                      </div>
                      <div className="issue-list closed-issue-list">
                        <div className="issue-list-head" aria-hidden="true">
                          <span>{uiText("ui.admin.itemName")}</span>
                          <span>{uiText("ui.projects.jiraKeyLabel")}</span>
                          <span>{uiText("ui.automation.dueDate")}</span>
                          <span>{uiText("ui.projects.delayColumnLabel")}</span>
                          <span>{uiText("ui.automation.owner")}</span>
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
                                    jiraLink.key || uiText("ui.admin.notSetMasculine")
                                  )}
                                </span>
                                <span className="issue-summary-cell">
                                  {date(issue.dueDate)}
                                </span>
                                <span
                                  className={`issue-summary-cell ${delayDays > 0 ? "issue-delay" : ""}`}
                                >
                                  {delayDays > 0 ? `+${delayDays} дн.` : uiText("ui.projects.noneValue")}
                                </span>
                                <span className="issue-summary-cell">
                                  {issue.owner || uiText("ui.projects.notAssignedLowercase")}
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
                                      {uiText("ui.common.statusLabel")} {issueStatusLabel(issue.status)}
                                    </span>
                                    <span>
                                      {uiText("ui.projects.delayAtClosureLabel")}{" "}
                                      {delayDays > 0 ? `+${delayDays} кал. дн.` : uiText("ui.projects.noneValue")}
                                    </span>
                                    <span>
                                      {uiText("ui.projects.sourceLabel")}{" "}
                                      {issue.source === "JIRA" ? "Jira" : uiText("ui.projects.sourceInternalValue")}
                                    </span>
                                  </div>
                                  <div className="issue-impact">
                                    <span>{uiText("ui.projects.impact")}</span>
                                    <p>{issue.impact || uiText("ui.projects.notFilledInValue")}</p>
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
                                        {uiText("ui.projects.noJiraIssuesLinked")}
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
                            {uiText("ui.projects.noClosedQuestionsYet")}
                          </div>
                        )}
                      </div>
                    </section>;
}
