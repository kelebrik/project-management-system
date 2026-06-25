import { ChevronDown, ChevronRight, Link as LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { usePageContext } from "./PageContext";

const RISK_TICKETS_SECTION_ID = "risk-tickets";
const SCHEDULE_VARIANCE_SECTION_ID = "schedule-variance";

function currentHashId() {
  if (typeof window === "undefined") return "";
  try {
    return decodeURIComponent(window.location.hash.replace(/^#/, ""));
  } catch {
    return window.location.hash.replace(/^#/, "");
  }
}

function scrollToHashSection(sectionId: string) {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

export function ProjectOverviewSummaryPage() {
  const {
    date,
    latestRaidStatusUpdate,
    openRaidItemFromOverview,
    overviewDashboard,
    raidTypeLabel,
  } = usePageContext();
  const [riskTicketsOpen, setRiskTicketsOpen] = useState(
    () => currentHashId() === RISK_TICKETS_SECTION_ID,
  );
  const [scheduleVarianceOpen, setScheduleVarianceOpen] = useState(
    () => currentHashId() === SCHEDULE_VARIANCE_SECTION_ID,
  );

  useEffect(() => {
    const syncHashSection = () => {
      const hashId = currentHashId();
      if (hashId === RISK_TICKETS_SECTION_ID) {
        setRiskTicketsOpen(true);
        scrollToHashSection(hashId);
      }
      if (hashId === SCHEDULE_VARIANCE_SECTION_ID) {
        setScheduleVarianceOpen(true);
        scrollToHashSection(hashId);
      }
    };

    syncHashSection();
    window.addEventListener("hashchange", syncHashSection);
    return () => window.removeEventListener("hashchange", syncHashSection);
  }, []);

  return (
    <section className="executive-overview-grid">
      <article className="executive-overview-card danger">
        <div className="executive-overview-card-title">
          <span>Ключевые риски и проблемы в красной зоне</span>
          <strong>{overviewDashboard.redZoneRisks.length}</strong>
        </div>
        <div className="executive-overview-list">
          {overviewDashboard.redZoneRisks.map((item) => (
            <div className="executive-overview-row" key={item.id}>
              <button
                className="executive-overview-risk-link"
                type="button"
                onClick={() => openRaidItemFromOverview(item.id, item.type)}
              >
                {item.title}
              </button>
              <span>{raidTypeLabel(item.type)}</span>
              {latestRaidStatusUpdate(item) && (
                <p className="executive-status-text">
                  {latestRaidStatusUpdate(item)?.text}
                </p>
              )}
            </div>
          ))}
          {overviewDashboard.redZoneRisks.length === 0 && (
            <p>Рисков и проблем с оценкой 15+ нет.</p>
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
            <div className="executive-overview-row" key={issue.id}>
              <b>{issue.title}</b>
              <span>
                {issue.owner || "не назначен"} / срок {date(issue.dueDate)}
              </span>
            </div>
          ))}
          {overviewDashboard.openDecisionItems.length === 0 && (
            <p>Открытых вопросов, требующих решения, нет.</p>
          )}
        </div>
      </article>

      <article
        className={`executive-overview-card ${
          riskTicketsOpen ? "" : "collapsed"
        }`}
        id={RISK_TICKETS_SECTION_ID}
      >
        <div className="executive-overview-card-title collapsible">
          <button
            type="button"
            className="executive-overview-card-toggle"
            onClick={() => setRiskTicketsOpen((current) => !current)}
            aria-expanded={riskTicketsOpen}
            aria-controls={`${RISK_TICKETS_SECTION_ID}-content`}
          >
            {riskTicketsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            <span>Тикеты под риском</span>
          </button>
          <div className="executive-overview-card-title-actions">
            <strong>{overviewDashboard.blockingTickets.length}</strong>
            <a
              className="overview-section-link"
              href={`#${RISK_TICKETS_SECTION_ID}`}
              onClick={() => setRiskTicketsOpen(true)}
              aria-label="Ссылка на раздел Тикеты под риском"
              title="Ссылка на раздел"
            >
              <LinkIcon size={14} />
            </a>
          </div>
        </div>
        {riskTicketsOpen && (
          <div
            className="executive-overview-list"
            id={`${RISK_TICKETS_SECTION_ID}-content`}
          >
            {overviewDashboard.blockingTickets.map((ticket) => (
              <div
                className="executive-overview-row"
                key={`${ticket.source}-${ticket.id}`}
              >
                <b>
                  {ticket.jiraTicketKey ? `${ticket.jiraTicketKey} / ` : ""}
                  {ticket.title}
                </b>
                <span>
                  {ticket.status} / {ticket.priority}
                  {ticket.assignee ? ` / ${ticket.assignee}` : ""}
                </span>
                {ticket.jiraTicketUrl && (
                  <a href={ticket.jiraTicketUrl} target="_blank" rel="noreferrer">
                    Открыть Jira
                  </a>
                )}
              </div>
            ))}
            {overviewDashboard.blockingTickets.length === 0 && (
              <p>Тикетов под риском нет.</p>
            )}
          </div>
        )}
      </article>

      <article
        className={`executive-overview-card ${
          scheduleVarianceOpen ? "" : "collapsed"
        }`}
        id={SCHEDULE_VARIANCE_SECTION_ID}
      >
        <div className="executive-overview-card-title collapsible">
          <button
            type="button"
            className="executive-overview-card-toggle"
            onClick={() => setScheduleVarianceOpen((current) => !current)}
            aria-expanded={scheduleVarianceOpen}
            aria-controls={`${SCHEDULE_VARIANCE_SECTION_ID}-content`}
          >
            {scheduleVarianceOpen ? (
              <ChevronDown size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
            <span>Отклонение сроков</span>
          </button>
          <div className="executive-overview-card-title-actions">
            <strong>
              {overviewDashboard.scheduleVarianceFromStructure > 0 ? "+" : ""}
              {overviewDashboard.scheduleVarianceFromStructure} дн.
            </strong>
            <a
              className="overview-section-link"
              href={`#${SCHEDULE_VARIANCE_SECTION_ID}`}
              onClick={() => setScheduleVarianceOpen(true)}
              aria-label="Ссылка на раздел Отклонение сроков"
              title="Ссылка на раздел"
            >
              <LinkIcon size={14} />
            </a>
          </div>
        </div>
        {scheduleVarianceOpen && (
          <div
            className="executive-overview-list"
            id={`${SCHEDULE_VARIANCE_SECTION_ID}-content`}
          >
            {overviewDashboard.scheduleDelayItems.length > 0 && (
              <div className="schedule-impact-group">
                <h4>Максимальное влияние на отставание</h4>
                {overviewDashboard.scheduleDelayItems.map(({ item, delay }) => (
                  <div className="executive-overview-row" key={`delay-${item.id}`}>
                    <b>
                      {item.jiraTicketKey ? `${item.jiraTicketKey} / ` : ""}
                      {item.code} {item.title}
                    </b>
                    <span>
                      +{delay} календарных дней / исполнитель:{" "}
                      {item.owner || "не назначен"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {overviewDashboard.scheduleAccelerationItems.length > 0 && (
              <div className="schedule-impact-group acceleration">
                <h4>Максимальное влияние на опережение</h4>
                {overviewDashboard.scheduleAccelerationItems.map(
                  ({ item, acceleration }) => (
                    <div
                      className="executive-overview-row"
                      key={`acceleration-${item.id}`}
                    >
                      <b>
                        {item.jiraTicketKey ? `${item.jiraTicketKey} / ` : ""}
                        {item.code} {item.title}
                      </b>
                      <span>
                        -{acceleration} календарных дней / исполнитель:{" "}
                        {item.owner || "не назначен"}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
            {overviewDashboard.scheduleDelayItems.length === 0 &&
              overviewDashboard.scheduleAccelerationItems.length === 0 && (
                <p>Отклонений от базового плана нет.</p>
              )}
          </div>
        )}
      </article>
    </section>
  );
}
