import { usePageContext } from "./PageContext";

export function ProjectOverviewSummaryPage() {
  const ctx = usePageContext();
  const {
    date,
    JIRA_BLOCKING_TICKET_PLACEHOLDER,
    latestRaidStatusUpdate,
    openRaidItemFromOverview,
    overviewDashboard,
  } = ctx;

  return (
              <>
                <section className="executive-overview-grid">
                  <article className="executive-overview-card danger">
                    <div className="executive-overview-card-title">
                      <span>Ключевые риски в красной зоне</span>
                      <strong>{overviewDashboard.redZoneRisks.length}</strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.redZoneRisks.map((item) => (
                        <div
                          className="executive-overview-row"
                          key={item.id}
                        >
                          <button
                            className="executive-overview-risk-link"
                            type="button"
                            onClick={() => openRaidItemFromOverview(item.id)}
                          >
                            {item.title}
                          </button>
                          {latestRaidStatusUpdate(item) && (
                            <p className="executive-status-text">
                              {latestRaidStatusUpdate(item)?.text}
                            </p>
                          )}
                        </div>
                      ))}
                      {overviewDashboard.redZoneRisks.length === 0 && (
                        <p>Рисков с оценкой 15+ нет.</p>
                      )}
                    </div>
                  </article>

                  <article className="executive-overview-card">
                    <div className="executive-overview-card-title">
                      <span>Тикеты под риском</span>
                      <strong>{JIRA_BLOCKING_TICKET_PLACEHOLDER.length}</strong>
                    </div>
                    <div
                      className="jira-placeholder-table"
                      aria-label="Временный снимок блокирующих тикетов Jira"
                    >
                      <div className="jira-placeholder-head">
                        <span>T</span>
                        <span>Key</span>
                        <span>Summary</span>
                        <span>Assignee</span>
                      </div>
                      {JIRA_BLOCKING_TICKET_PLACEHOLDER.map((ticket) => (
                        <div className="jira-placeholder-row" key={ticket.key}>
                          <span
                            className={`jira-placeholder-type ${
                              ticket.checked ? "checked" : "open"
                            }`}
                            aria-hidden="true"
                          >
                            {ticket.checked ? "✓" : ""}
                          </span>
                          <span className="jira-placeholder-key">
                            {ticket.key}
                          </span>
                          <b>{ticket.summary}</b>
                          <span>{ticket.assignee}</span>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="executive-overview-card">
                    <div className="executive-overview-card-title">
                      <span>Решения по ключевым открытым вопросам</span>
                      <strong>{overviewDashboard.decisionItems}</strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.openDecisionItems.map((issue) => (
                        <div
                          className="executive-overview-row"
                          key={issue.id}
                        >
                          <b>{issue.title}</b>
                          <span>
                            {issue.owner || "не назначен"} / срок{" "}
                            {date(issue.dueDate)}
                          </span>
                        </div>
                      ))}
                      {overviewDashboard.openDecisionItems.length === 0 && (
                        <p>Открытых вопросов, требующих решения, нет.</p>
                      )}
                    </div>
                  </article>

                  <article className="executive-overview-card">
                    <div className="executive-overview-card-title">
                      <span>Отклонение сроков</span>
                      <strong>
                        {overviewDashboard.scheduleVarianceFromStructure > 0 ? "+" : ""}
                        {overviewDashboard.scheduleVarianceFromStructure} дн.
                      </strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.scheduleDeltaItems.map(({ item, delay }) => (
                        <div
                          className="executive-overview-row"
                          key={item.id}
                        >
                          <b>
                            {item.jiraTicketKey ? `${item.jiraTicketKey} / ` : ""}
                            {item.code} {item.title}
                          </b>
                          <span>
                            Отклонение +{delay} календарных дней / исполнитель:{" "}
                            {item.owner || "не назначен"}
                          </span>
                        </div>
                      ))}
                      {overviewDashboard.scheduleDeltaItems.length === 0 && (
                        <p>Отклонений от базового плана нет.</p>
                      )}
                    </div>
                  </article>
                </section>
              </>
            );
}
