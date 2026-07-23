import { RefreshCw } from "lucide-react";
import { attendanceChartBars } from "../app/pageVisitAnalytics";
import { usePageVisitAnalytics } from "../hooks/usePageVisitAnalytics";

const shortDay = new Intl.DateTimeFormat("ru-RU", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});
const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function VisitorType({ kind }: { kind: "USER" | "ANONYMOUS" }) {
  return (
    <span className={`attendance-kind ${kind.toLowerCase()}`}>
      {kind === "USER" ? "Пользователь" : "Гость"}
    </span>
  );
}

export function AdminAnalyticsPageContent() {
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
          <p>Просмотры страниц за последние 7 дней без системных администраторов</p>
        </div>
        <button type="button" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={16} />
          {loading ? "Обновляю" : "Обновить"}
        </button>
      </div>

      {error && <div className="attendance-error">{error}</div>}
      {loading && !report ? (
        <div className="empty-state">Загрузка статистики посещений...</div>
      ) : report ? (
        <>
          <div className="attendance-metrics" aria-label="Сводка посещаемости">
            <div><span>Всего просмотров</span><b>{report.totals.views}</b></div>
            <div><span>Авторизованные</span><b>{report.totals.authenticatedViews}</b></div>
            <div><span>Гостевые</span><b>{report.totals.anonymousViews}</b></div>
            <div>
              <span>Уникальные посетители</span>
              <b>{report.totals.uniqueAuthenticated + report.totals.uniqueAnonymous}</b>
            </div>
          </div>

          <section className="attendance-section" aria-labelledby="attendance-chart-title">
            <div className="attendance-section-title">
              <div>
                <h3 id="attendance-chart-title">Просмотры по дням</h3>
                <p>Авторизованные пользователи и незалогиненные гости показаны отдельно</p>
              </div>
              <div className="attendance-legend" aria-label="Легенда">
                <span><i className="authenticated" /> Пользователи</span>
                <span><i className="anonymous" /> Гости</span>
              </div>
            </div>
            <div className="attendance-chart-shell">
              <svg
                className="attendance-chart"
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                role="img"
                aria-label="График просмотров страниц за последние семь дней"
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
                <h3 id="attendance-visitors-title">Посетители</h3>
                <p>Системные администраторы исключены из статистики</p>
              </div>
            </div>
            <div className="attendance-table-shell">
              <table className="attendance-table">
                <thead><tr><th>Тип</th><th>Посетитель</th><th>Просмотры</th><th>Проекты</th><th>Последний просмотр</th></tr></thead>
                <tbody>
                  {report.visitors.map((visitor) => (
                    <tr key={visitor.visitorKey}>
                      <td><VisitorType kind={visitor.kind} /></td>
                      <td><strong>{visitor.displayName}</strong></td>
                      <td>{visitor.views}</td>
                      <td>{visitor.projectCount}</td>
                      <td>{dateTime.format(new Date(visitor.lastVisitedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.visitors.length === 0 && (
                <div className="empty-state">За выбранную неделю посещений нет.</div>
              )}
            </div>
          </section>

          <section className="attendance-section" aria-labelledby="attendance-breakdown-title">
            <div className="attendance-section-title">
              <div>
                <h3 id="attendance-breakdown-title">Детализация просмотров</h3>
                <p>Агрегация по посетителю, проекту и странице</p>
              </div>
            </div>
            <div className="attendance-table-shell">
              <table className="attendance-table attendance-breakdown-table">
                <thead><tr><th>Посетитель</th><th>Проект</th><th>Страница</th><th>Просмотры</th><th>Последний просмотр</th></tr></thead>
                <tbody>
                  {report.breakdown.map((item) => (
                    <tr key={`${item.visitorKey}:${item.projectId ?? "global"}:${item.pageKey}`}>
                      <td><VisitorType kind={item.kind} /> <strong>{item.displayName}</strong></td>
                      <td>{item.projectCode ? `${item.projectCode} · ${item.projectName}` : "Общие страницы"}</td>
                      <td>{item.pageTitle}</td>
                      <td>{item.views}</td>
                      <td>{dateTime.format(new Date(item.lastVisitedAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="attendance-retention-note">
            События хранятся {report.range.retentionDays} дней. Гости различаются по анонимному идентификатору браузера; IP и email не сохраняются.
          </p>
        </>
      ) : null}
    </article>
  );
}
