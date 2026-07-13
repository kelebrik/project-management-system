import { ChevronDown, ChevronRight, Link as LinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { IssueStatusUpdate, RaidItemStatusUpdate } from "../app/domainTypes";
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

type OverviewStatusUpdate = IssueStatusUpdate | RaidItemStatusUpdate;

function sortedStatusUpdates(updates: OverviewStatusUpdate[]) {
  return [...updates].sort((left, right) => {
    const statusDelta =
      new Date(right.statusAt).getTime() - new Date(left.statusAt).getTime();
    if (statusDelta !== 0) return statusDelta;
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function OverviewStatusHistory({
  date,
  updates,
}: {
  date: (value: string | null) => string;
  updates: OverviewStatusUpdate[];
}) {
  const statuses = sortedStatusUpdates(updates);
  if (statuses.length === 0) {
    return <p className="overview-status-empty">Статусы пока не добавлены.</p>;
  }
  return (
    <div className="overview-status-history">
      {statuses.map((status) => (
        <div className="overview-status-history-row" key={status.id}>
          <time>{date(status.statusAt)}</time>
          <p>{status.text}</p>
        </div>
      ))}
    </div>
  );
}

export function ProjectOverviewSummaryPage() {
  const {
    date,
    openRaidItemFromOverview,
    openView,
    overviewDashboard,
    raidTypeLabel,
    setExpandedIssueId,
  } = usePageContext();
  const [expandedRaidStatusId, setExpandedRaidStatusId] = useState<string | null>(null);
  const [expandedIssueStatusId, setExpandedIssueStatusId] = useState<string | null>(null);

  const openIssue = (issueId: string) => {
    setExpandedIssueId(issueId);
    openView("project-issues");
    window.setTimeout(() => {
      document
        .getElementById(`issue-item-${issueId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  useEffect(() => {
    const syncHashSection = () => {
      const hashId = currentHashId();
      if (
        hashId === RISK_TICKETS_SECTION_ID ||
        hashId === SCHEDULE_VARIANCE_SECTION_ID
      ) {
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
              <div className="executive-overview-row-main">
                <button
                  className="executive-overview-risk-link"
                  type="button"
                  onClick={() => openRaidItemFromOverview(item.id, item.type)}
                >
                  {item.title}
                </button>
                <span>{raidTypeLabel(item.type)}</span>
                <button
                  type="button"
                  className="executive-overview-expand"
                  aria-label={`Показать статусы: ${item.title}`}
                  aria-expanded={expandedRaidStatusId === item.id}
                  onClick={() =>
                    setExpandedRaidStatusId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                >
                  {expandedRaidStatusId === item.id ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              </div>
              {expandedRaidStatusId !== item.id && item.statusUpdates[0] && (
                <p className="executive-status-text">
                  {sortedStatusUpdates(item.statusUpdates)[0]?.text}
                </p>
              )}
              {expandedRaidStatusId === item.id && (
                <OverviewStatusHistory date={date} updates={item.statusUpdates} />
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
              <div className="executive-overview-row-main">
                <button
                  className="executive-overview-risk-link"
                  type="button"
                  onClick={() => openIssue(issue.id)}
                >
                  {issue.title}
                </button>
                <span>
                  {issue.owner || "не назначен"} / срок {date(issue.dueDate)}
                </span>
                <button
                  type="button"
                  className="executive-overview-expand"
                  aria-label={`Показать статусы: ${issue.title}`}
                  aria-expanded={expandedIssueStatusId === issue.id}
                  onClick={() =>
                    setExpandedIssueStatusId((current) =>
                      current === issue.id ? null : issue.id,
                    )
                  }
                >
                  {expandedIssueStatusId === issue.id ? (
                    <ChevronDown size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              </div>
              {expandedIssueStatusId === issue.id && (
                <OverviewStatusHistory date={date} updates={issue.statusUpdates} />
              )}
            </div>
          ))}
          {overviewDashboard.openDecisionItems.length === 0 && (
            <p>Открытых вопросов, требующих решения, нет.</p>
          )}
        </div>
      </article>

      <article className="executive-overview-card" id={RISK_TICKETS_SECTION_ID}>
        <div className="executive-overview-card-title">
          <span>Тикеты под риском</span>
          <div className="executive-overview-card-title-actions">
            <strong>{overviewDashboard.blockingTickets.length}</strong>
            <a
              className="overview-section-link"
              href={`#${RISK_TICKETS_SECTION_ID}`}
              aria-label="Ссылка на раздел Тикеты под риском"
              title="Ссылка на раздел"
            >
              <LinkIcon size={14} />
            </a>
          </div>
        </div>
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
      </article>

      <article
        className="executive-overview-card"
        id={SCHEDULE_VARIANCE_SECTION_ID}
      >
        <div className="executive-overview-card-title">
          <span>Отклонение сроков</span>
          <div className="executive-overview-card-title-actions">
            <strong>
              {overviewDashboard.scheduleVarianceFromStructure > 0 ? "+" : ""}
              {overviewDashboard.scheduleVarianceFromStructure} дн.
            </strong>
            <a
              className="overview-section-link"
              href={`#${SCHEDULE_VARIANCE_SECTION_ID}`}
              aria-label="Ссылка на раздел Отклонение сроков"
              title="Ссылка на раздел"
            >
              <LinkIcon size={14} />
            </a>
          </div>
        </div>
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
      </article>
    </section>
  );
}
