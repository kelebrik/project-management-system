import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { RefreshCw } from "lucide-react";
import { attendanceChartBars, visitPageTitle, visitorDisplayName } from "../app/pageVisitAnalytics";
import { usePageVisitAnalytics } from "../hooks/usePageVisitAnalytics";


function VisitorType({ kind }: { kind: "USER" | "ANONYMOUS" }) {
  const { t: uiText } = useInterfaceTranslation();
  return (
    <span className={`attendance-kind ${kind.toLowerCase()}`}>
      {kind === "USER" ? uiText("ui.admin.user") : uiText("ui.admin.guest")}
    </span>
  );
}

export function AdminAnalyticsPageContent() {
  const { t: uiText } = useInterfaceTranslation();
  const { locale } = useI18n();
  const { shortDay, dateTime } = useMemo(() => {
const shortDay = new Intl.DateTimeFormat(intlLocale(locale), {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
const dateTime = new Intl.DateTimeFormat(intlLocale(locale), {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

    return { shortDay, dateTime };
  }, [locale]);
  const { report, loading, error, reload } = usePageVisitAnalytics();
  const chart = attendanceChartBars(report?.daily ?? []);
  const chartWidth = 840;
  const chartHeight = 245;
  const plotTop = 28;
  const plotHeight = 150;
  const plotBottom = plotTop + plotHeight;
  const groupWidth = 104;
  const groupStart = 76;
  const barWidth = 25;

  return (
    <article className="panel project-card attendance-page">
      <div className="panel-title">
        <div>
          <p>{uiText("ui.admin.pageViewsLastSevenDaysDescription")}</p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? uiText("ui.admin.refreshing") : uiText("ui.admin.refresh")}
        </button>
      </div>

      {error && <div className="attendance-error">{error}</div>}
      {loading && !report ? (
        <div className="empty-state">{uiText("ui.admin.loadingVisitStats")}</div>
      ) : report ? (
        <>
          <div className="attendance-metrics" aria-label={uiText("ui.admin.trafficSummary")}>
            <div><span>{uiText("ui.admin.totalViews")}</span><b>{report.totals.views}</b></div>
            <div><span>{uiText("ui.admin.signedInViews")}</span><b>{report.totals.authenticatedViews}</b></div>
            <div><span>{uiText("ui.admin.guestViews")}</span><b>{report.totals.anonymousViews}</b></div>
            <div>
              <span>{uiText("ui.admin.uniqueVisitors")}</span>
              <b>{report.totals.uniqueAuthenticated + report.totals.uniqueAnonymous}</b>
            </div>
          </div>

          <section className="attendance-section" aria-labelledby="attendance-chart-title">
            <div className="attendance-section-title">
              <div>
                <h3 id="attendance-chart-title">{uiText("ui.admin.viewsByDay")}</h3>
                <p>{uiText("ui.admin.signedInAndGuestsShownSeparately")}</p>
              </div>
              <div className="attendance-legend" aria-label={uiText("ui.admin.legend")}>
                <span><i className="authenticated" /> {uiText("ui.admin.users")}</span>
                <span><i className="anonymous" /> {uiText("ui.admin.guests")}</span>
              </div>
            </div>
            <div className="attendance-chart-shell">
              <svg
                className="attendance-chart"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                role="img"
                aria-label={uiText("ui.admin.pageViewsChartCaption")}
              >
                {[0, 0.5, 1].map((position) => (
                  <line
                    key={position}
                    x1="58"
                    x2="818"
                    y1={plotTop + plotHeight * position}
                    y2={plotTop + plotHeight * position}
                    className="attendance-chart-grid"
                  />
                ))}
                {chart.map((day, index) => {
                  const x = groupStart + index * groupWidth;
                  return (
                    <g key={day.date}>
                      <rect
                        x={x}
                        y={plotBottom - day.authenticatedHeight}
                        width={barWidth}
                        height={day.authenticatedHeight}
                        className="attendance-bar authenticated"
                        rx="3"
                      >
                        <title>{`Пользователи: ${day.authenticatedViews}`}</title>
                      </rect>
                      <rect
                        x={x + barWidth + 8}
                        y={plotBottom - day.anonymousHeight}
                        width={barWidth}
                        height={day.anonymousHeight}
                        className="attendance-bar anonymous"
                        rx="3"
                      >
                        <title>{`Гости: ${day.anonymousViews}`}</title>
                      </rect>
                      <text x={x + barWidth + 4} y={plotBottom + 24} textAnchor="middle">
                        {shortDay.format(new Date(`${day.date}T00:00:00Z`))}
                      </text>
                      <text
                        x={x + barWidth + 4}
                        y={Math.max(18, plotBottom - Math.max(day.authenticatedHeight, day.anonymousHeight) - 8)}
                        textAnchor="middle"
                        className="attendance-chart-total"
                      >
                        {day.totalViews}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </section>

          <section className="attendance-section" aria-labelledby="attendance-visitors-title">
            <div className="attendance-section-title">
              <div>
                <h3 id="attendance-visitors-title">{uiText("ui.admin.visitors")}</h3>
                <p>{uiText("ui.admin.sysAdminsExcluded")}</p>
              </div>
            </div>
            <div className="attendance-table-shell">
              <table className="attendance-table">
                <thead><tr><th>{uiText("ui.admin.type")}</th><th>{uiText("ui.admin.visitor")}</th><th>{uiText("ui.admin.views")}</th><th>{uiText("ui.admin.projects")}</th><th>{uiText("ui.admin.lastView")}</th></tr></thead>
                <tbody>
                  {report.visitors.map((visitor) => (
                    <tr key={visitor.visitorKey}>
                      <td><VisitorType kind={visitor.kind} /></td>
                      <td><strong>{visitorDisplayName(visitor, uiText)}</strong></td>
                      <td>{visitor.views}</td>
                      <td>{visitor.projectCount}</td>
                      <td>{dateTime.format(new Date(visitor.lastVisitedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.visitors.length === 0 && (
                <div className="empty-state">{uiText("ui.admin.noVisitsInSelectedWeek")}</div>
              )}
            </div>
          </section>

          <section className="attendance-section" aria-labelledby="attendance-breakdown-title">
            <div className="attendance-section-title">
              <div>
                <h3 id="attendance-breakdown-title">{uiText("ui.admin.viewBreakdown")}</h3>
                <p>{uiText("ui.admin.aggregatedByVisitorProjectPage")}</p>
              </div>
            </div>
            <div className="attendance-table-shell">
              <table className="attendance-table attendance-breakdown-table">
                <thead><tr><th>{uiText("ui.admin.visitor")}</th><th>{uiText("ui.admin.project")}</th><th>{uiText("ui.admin.page")}</th><th>{uiText("ui.admin.views")}</th><th>{uiText("ui.admin.lastView")}</th></tr></thead>
                <tbody>
                  {report.breakdown.map((item) => (
                    <tr key={`${item.visitorKey}:${item.projectId ?? "global"}:${item.pageKey}`}>
                      <td><VisitorType kind={item.kind} /> <strong>{visitorDisplayName(item, uiText)}</strong></td>
                      <td>{item.projectCode ? `${item.projectCode} · ${item.projectName}` : uiText("ui.admin.generalPages")}</td>
                      <td>{visitPageTitle(item, locale)}</td>
                      <td>{item.views}</td>
                      <td>{dateTime.format(new Date(item.lastVisitedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="attendance-retention-note">
            {uiText("ui.admin.eventsStoredFor")} {report.range.retentionDays} {uiText("ui.admin.retentionGuestPrivacyNote")}
          </p>
        </>
      ) : null}
    </article>
  );
}
