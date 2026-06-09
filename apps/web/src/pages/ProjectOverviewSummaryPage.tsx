import { usePageContext } from "./PageContext";

export function ProjectOverviewSummaryPage() {
  const ctx = usePageContext();
  const {
    date,
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
                      <strong>{overviewDashboard.blockingTickets.length}</strong>
                    </div>
                    <div className="executive-overview-list">
                      {overviewDashboard.blockingTickets.map((ticket) => (
                        <div
                          className="executive-overview-row"
                          key={`${ticket.source}-${ticket.id}`}
                        >
                          <b>
                            {ticket.jiraTicketKey
                              ? `${ticket.jiraTicketKey} / `
                              : ticket.code
                                ? `${ticket.code} / `
                                : ""}
                            {ticket.title}
                          </b>
                          <span>
                            {ticket.source === "issue"
                              ? "Открытый вопрос"
                              : "Задача WBS"}
                            {ticket.dueDate ? ` / срок ${date(ticket.dueDate)}` : ""}
                          </span>
                          {ticket.jiraTicketUrl && (
                            <a
                              href={ticket.jiraTicketUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Открыть Jira
                            </a>
                          )}
                        </div>
                      ))}
                      {overviewDashboard.blockingTickets.length === 0 && (
                        <p>Тикетов под риском нет.</p>
                      )}
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
