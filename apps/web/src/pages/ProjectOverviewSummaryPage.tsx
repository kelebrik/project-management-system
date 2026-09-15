import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { ChevronDown, ChevronRight, Link as LinkIcon } from "lucide-react";
import { ReadinessPanel } from '../components/automation/ReadinessPanel';
import { useEffect, useState } from "react";
import type { IssueStatusUpdate, RaidItemStatusUpdate } from "../app/domainTypes";
import { JiraCurrentFreshnessNotice } from "../components/JiraCurrentFreshnessNotice";
import { useJiraRiskTickets } from "../hooks/useJiraRiskTickets";
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
  const { t: uiText } = useInterfaceTranslation();
  const statuses = sortedStatusUpdates(updates);
  if (statuses.length === 0) {
    return <p className="overview-status-empty">{uiText("ui.projects.noStatusesAddedYet")}</p>;
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
  const { t: uiText } = useInterfaceTranslation();
  const {
    date,
    openRaidItemFromOverview,
    openView,
    overviewDashboard,
    project,
    raidTypeLabel,
    setExpandedIssueId,
  } = usePageContext();
  const riskTickets = useJiraRiskTickets(project?.id);
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
      <ReadinessPanel key={project.id} projectId={project.id} />
      <article className="executive-overview-card danger">
        <div className="executive-overview-card-title">
          <span>{uiText("ui.projects.overviewRedZoneRisksAndIssuesTitle")}</span>
          <strong>{overviewDashboard.overviewRedZoneRisks.length}</strong>
        </div>
        <div className="executive-overview-list">
          {overviewDashboard.overviewRedZoneRisks.map((item) => (
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
          {overviewDashboard.overviewRedZoneRisks.length === 0 && (
            <p>{uiText("ui.projects.overviewNoScore15PlusRecords")}</p>
          )}
        </div>
      </article>

      <article className="executive-overview-card">
        <div className="executive-overview-card-title">
          <span>{uiText("ui.projects.overviewDecisionsOnKeyQuestionsTitle")}</span>
          <strong>{overviewDashboard.decisionItems}</strong>
        </div>
        <div className="executive-overview-list">
          {overviewDashboard.overviewOpenDecisionItems.map((issue) => (
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
                  {issue.owner || uiText("ui.projects.notAssignedLowercase")} {uiText("ui.projects.dueDateInlineSuffix")} {date(issue.dueDate)}
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
          {overviewDashboard.overviewOpenDecisionItems.length === 0 && (
            <p>{uiText("ui.projects.overviewNoQuestionsRequiringDecision")}</p>
          )}
        </div>
      </article>

      <article className="executive-overview-card" id={RISK_TICKETS_SECTION_ID}>
        <div className="executive-overview-card-title">
          <span>{uiText("ui.projects.ticketsAtRiskTitle")}</span>
          <div className="executive-overview-card-title-actions">
            <strong>
              {riskTickets.loading || riskTickets.error || !riskTickets.available
                ? "—"
                : riskTickets.total}
            </strong>
            <a
              className="overview-section-link"
              href={`#${RISK_TICKETS_SECTION_ID}`}
              aria-label={uiText("ui.projects.ticketsAtRiskAnchorLabel")}
              title={uiText("ui.projects.sectionAnchorLabel")}
            >
              <LinkIcon size={14} />
            </a>
          </div>
        </div>
        <div
          className="executive-overview-list"
          id={`${RISK_TICKETS_SECTION_ID}-content`}
        >
          <JiraCurrentFreshnessNotice {...riskTickets.currentFreshness} />
          {riskTickets.tickets.map((ticket) => (
            <div className="executive-overview-row" key={ticket.id}>
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
                  {uiText("ui.projects.openJiraAction")}
                </a>
              )}
            </div>
          ))}
          {riskTickets.loading && <p>{uiText("ui.projects.aggregateLoadingMessage")}</p>}
          {!riskTickets.loading && riskTickets.error && (
            <p>{riskTickets.error}</p>
          )}
          {!riskTickets.loading &&
            !riskTickets.error &&
            !riskTickets.available && (
              <p>{uiText("ui.projects.ticketsAtRiskAggregateNotPublished")}</p>
            )}
          {!riskTickets.loading &&
            !riskTickets.error &&
            riskTickets.available &&
            riskTickets.tickets.length === 0 && (
              <p>{uiText("ui.projects.noTicketsAtRisk")}</p>
            )}
          {riskTickets.total > riskTickets.tickets.length && (
            <p>
              {uiText("ui.projects.showingFirstPrefix")} {riskTickets.tickets.length} {uiText("ui.portfolio.countRangeOf")} {riskTickets.total}
              {" "}
              {uiText("ui.projects.ticketsCountSuffix")}
            </p>
          )}
        </div>
      </article>

      <article
        className="executive-overview-card"
        id={SCHEDULE_VARIANCE_SECTION_ID}
      >
        <div className="executive-overview-card-title">
          <span>{uiText("ui.projects.scheduleVarianceTitle")}</span>
          <div className="executive-overview-card-title-actions">
            <strong>
              {overviewDashboard.scheduleVarianceFromStructure > 0 ? "+" : ""}
              {overviewDashboard.scheduleVarianceFromStructure} {uiText("ui.portfolio.daysAbbrev")}
            </strong>
            <a
              className="overview-section-link"
              href={`#${SCHEDULE_VARIANCE_SECTION_ID}`}
              aria-label={uiText("ui.projects.scheduleVarianceAnchorLabel")}
              title={uiText("ui.projects.sectionAnchorLabel")}
            >
              <LinkIcon size={14} />
            </a>
          </div>
        </div>
        <div
          className="executive-overview-list"
          id={`${SCHEDULE_VARIANCE_SECTION_ID}-content`}
        >
          {overviewDashboard.overviewScheduleDelayItems.length > 0 && (
            <div className="schedule-impact-group">
              <h4>{uiText("ui.projects.largestDelayImpactLabel")}</h4>
              {overviewDashboard.overviewScheduleDelayItems.map(({ item, delay }) => (
                <div className="executive-overview-row" key={`delay-${item.id}`}>
                  <b>
                    {item.jiraTicketKey ? `${item.jiraTicketKey} / ` : ""}
                    {item.code} {item.title}
                  </b>
                  <span>
                    +{delay} {uiText("ui.projects.calendarDaysAssigneeLabel")}{" "}
                    {item.owner || uiText("ui.projects.notAssignedLowercase")}
                  </span>
                </div>
              ))}
            </div>
          )}
          {overviewDashboard.overviewScheduleAccelerationItems.length > 0 && (
            <div className="schedule-impact-group acceleration">
              <h4>{uiText("ui.projects.largestAheadOfScheduleImpactLabel")}</h4>
              {overviewDashboard.overviewScheduleAccelerationItems.map(
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
                      -{acceleration} {uiText("ui.projects.calendarDaysAssigneeLabel")}{" "}
                      {item.owner || uiText("ui.projects.notAssignedLowercase")}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
          {overviewDashboard.overviewScheduleDelayItems.length === 0 &&
            overviewDashboard.overviewScheduleAccelerationItems.length === 0 && (
              <p>{uiText("ui.projects.noBaselineDeviations")}</p>
            )}
        </div>
      </article>
    </section>
  );
}
