import {
  AlertTriangle,
  CalendarDays,
  Gauge,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

import type { ResourceDashboard } from "../app/resourceModels";
import { usePageContext } from "./PageContext";

function useResourceDashboard() {
  return usePageContext() as { resourceDashboard: ResourceDashboard };
}

function ResourcePageShell({
  children,
  description,
  title = "Управление ресурсами",
}: {
  children: React.ReactNode;
  description: string;
  title?: string;
}) {
  return (
    <article className="panel project-card project-module-page resource-management-page">
      <div className="panel-title">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </article>
  );
}

function ResourceKpis({ dashboard }: { dashboard: ResourceDashboard }) {
  return (
    <div className="resource-kpi-grid">
      <div className="metric-card resource-kpi-card">
        <Users size={18} />
        <span>Исполнители</span>
        <b>{dashboard.summary.resourceCount}</b>
        <small>Назначены в структуре работ</small>
      </div>
      <div className="metric-card resource-kpi-card">
        <Gauge size={18} />
        <span>Перегружены</span>
        <b>{dashboard.summary.overloadedCount}</b>
        <small>Ресурсы с загрузкой выше 100%</small>
      </div>
      <div className="metric-card resource-kpi-card">
        <UserPlus size={18} />
        <span>Дефицит</span>
        <b>{dashboard.summary.roleGapHours} ч</b>
        <small>Перегрузка и работы без исполнителя</small>
      </div>
      <div className="metric-card resource-kpi-card">
        <CalendarDays size={18} />
        <span>Риск срока</span>
        <b>{dashboard.summary.criticalDelayRiskDays} дн.</b>
        <small>Оценка влияния критичных конфликтов</small>
      </div>
    </div>
  );
}

function ResourceEmptyState({ dashboard }: { dashboard: ResourceDashboard }) {
  const hasResourceData =
    dashboard.rows.length > 0 || Boolean(dashboard.unassignedRow);
  if (hasResourceData) return null;
  return (
    <div className="empty-state">
      В Структуре пока нет задач или результатов для расчета ресурсной загрузки.
    </div>
  );
}

function ResourceHeatmap({ dashboard }: { dashboard: ResourceDashboard }) {
  const visibleRows = dashboard.rows.slice(0, 8);
  const heatmapRows = dashboard.unassignedRow
    ? [...visibleRows, dashboard.unassignedRow]
    : visibleRows;
  return (
    <section className="resource-panel resource-heatmap-panel">
      <div className="resource-panel-head">
        <div>
          <h3>Загрузка на 8 недель</h3>
          <p>Остаточные часы распределены по датам работ.</p>
        </div>
        <span>{dashboard.summary.activeWorkCount} активных работ</span>
      </div>
      <div className="resource-heatmap" role="table">
        <div className="resource-heatmap-row resource-heatmap-head" role="row">
          <span>Ресурс</span>
          {dashboard.weeks.map((week) => (
            <span key={week.key}>{week.label}</span>
          ))}
        </div>
        {heatmapRows.map((row) => (
          <div className="resource-heatmap-row" key={row.owner} role="row">
            <div className="resource-heatmap-owner">
              <b>{row.owner}</b>
              <span>
                {row.role} · {row.capacityHoursPerWeek} ч/нед
              </span>
            </div>
            {row.cells.map((cell) => (
              <div
                className={`resource-load-cell resource-load-${cell.tone}`}
                key={cell.weekKey}
                title={`${cell.demandHours} ч спроса / ${cell.capacityHours} ч доступно`}
              >
                <b>{cell.label}</b>
                <span>{cell.demandHours} ч</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function ResourceConflicts({ dashboard }: { dashboard: ResourceDashboard }) {
  return (
    <section className="resource-panel">
      <div className="resource-panel-head">
        <div>
          <h3>Конфликты</h3>
          <p>Что требует решения до следующего статуса.</p>
        </div>
        <AlertTriangle size={18} />
      </div>
      <div className="resource-conflict-list">
        {dashboard.conflicts.map((conflict) => (
          <div
            className={`resource-conflict-card resource-conflict-${conflict.severity}`}
            key={conflict.id}
          >
            <b>{conflict.title}</b>
            {conflict.weekLabel && <small>Неделя {conflict.weekLabel}</small>}
            <span>{conflict.detail}</span>
          </div>
        ))}
        {dashboard.conflicts.length === 0 && (
          <div className="resource-muted-card">
            Критичных конфликтов на горизонте нет.
          </div>
        )}
      </div>
    </section>
  );
}

function ResourceRecommendations({ dashboard }: { dashboard: ResourceDashboard }) {
  return (
    <section className="resource-panel">
      <div className="resource-panel-head">
        <div>
          <h3>Рекомендации</h3>
          <p>Следующие управленческие действия.</p>
        </div>
        <Workflow size={18} />
      </div>
      <div className="resource-recommendation-list">
        {dashboard.recommendations.map((item) => (
          <div
            className={`resource-recommendation resource-load-${item.tone}`}
            key={item.id}
          >
            <b>{item.title}</b>
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ResourceOverviewPage() {
  const { resourceDashboard } = useResourceDashboard();
  return (
    <ResourcePageShell description="Приветственная страница ресурсного контура: capacity, риски перегрузки и ближайшие управленческие действия.">
      <ResourceKpis dashboard={resourceDashboard} />
      <ResourceEmptyState dashboard={resourceDashboard} />
      {(resourceDashboard.rows.length > 0 || resourceDashboard.unassignedRow) && (
        <div className="resource-command-grid">
          <ResourceHeatmap dashboard={resourceDashboard} />
          <aside className="resource-side-stack">
            <ResourceConflicts dashboard={resourceDashboard} />
            <ResourceRecommendations dashboard={resourceDashboard} />
          </aside>
        </div>
      )}
    </ResourcePageShell>
  );
}

export function ResourceWorkloadPage() {
  const { resourceDashboard } = useResourceDashboard();
  return (
    <ResourcePageShell description="Heatmap загрузки по людям и ролям на ближайшие недели.">
      <ResourceKpis dashboard={resourceDashboard} />
      <ResourceEmptyState dashboard={resourceDashboard} />
      {(resourceDashboard.rows.length > 0 || resourceDashboard.unassignedRow) && (
        <ResourceHeatmap dashboard={resourceDashboard} />
      )}
    </ResourcePageShell>
  );
}

export function ResourceSchedulePage() {
  const { resourceDashboard } = useResourceDashboard();
  const visibleRows = resourceDashboard.rows.slice(0, 8);
  return (
    <ResourcePageShell description="Расписание назначений: активные работы по самым загруженным исполнителям.">
      <section className="resource-panel">
        <div className="resource-panel-head">
          <div>
            <h3>Ближайшие назначения</h3>
            <p>Активные работы по самым загруженным исполнителям.</p>
          </div>
        </div>
        <div className="resource-schedule-grid">
          {visibleRows.slice(0, 6).map((row) => (
            <div className="resource-schedule-lane" key={row.owner}>
              <div className="resource-schedule-owner">
                <b>{row.owner}</b>
                <span>{row.remainingHours} ч осталось</span>
              </div>
              <div className="resource-bookings">
                {row.activeItems.slice(0, 5).map((item) => (
                  <div className="resource-booking" key={item.id}>
                    <b>
                      {item.code} {item.title}
                    </b>
                    <span>
                      {item.progress}% · {item.remainingHours} ч
                      {item.isCritical ? " · критический путь" : ""}
                    </span>
                  </div>
                ))}
                {row.activeItems.length === 0 && (
                  <div className="resource-muted-card">Нет активных работ.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </ResourcePageShell>
  );
}

export function ResourceDirectoryPage() {
  const { resourceDashboard } = useResourceDashboard();
  const visibleRows = resourceDashboard.rows.slice(0, 12);
  return (
    <ResourcePageShell description="Профили ресурсов: роли, календарь, остаточный объем и признаки перегрузки.">
      <section className="resource-panel">
        <div className="resource-panel-head">
          <div>
            <h3>Профили ресурсов</h3>
            <p>Сводка по ролям, календарям и остаточному объему.</p>
          </div>
        </div>
        <div className="resource-profile-table">
          <div className="resource-profile-row resource-profile-head">
            <span>Исполнитель</span>
            <span>Роль</span>
            <span>Календарь</span>
            <span>Осталось</span>
            <span>Просрочено</span>
          </div>
          {visibleRows.map((row) => (
            <div className="resource-profile-row" key={row.owner}>
              <b>{row.owner}</b>
              <span>{row.role}</span>
              <span>{row.calendarCode ?? "не задан"}</span>
              <span>{row.remainingHours} ч</span>
              <span>{row.overdue}</span>
            </div>
          ))}
        </div>
      </section>
    </ResourcePageShell>
  );
}

export function ResourceRequestsPage() {
  const { resourceDashboard } = useResourceDashboard();
  return (
    <ResourcePageShell description="Заявки и согласование ресурсов: дефицит ролей, усиление команды и waiting list.">
      <div className="resource-command-grid">
        <ResourceConflicts dashboard={resourceDashboard} />
        <section className="resource-panel">
          <div className="resource-panel-head">
            <div>
              <h3>Ресурсные заявки</h3>
              <p>Черновики усиления, рассчитанные по дефициту.</p>
            </div>
            <UserPlus size={18} />
          </div>
          <div className="resource-request-list">
            {resourceDashboard.requests.map((request) => (
              <div className="resource-request-card" key={request.id}>
                <div>
                  <b>{request.role}</b>
                  <span>{request.reason}</span>
                </div>
                <strong>{request.hours} ч</strong>
                <small>{request.dueLabel}</small>
              </div>
            ))}
            {resourceDashboard.requests.length === 0 && (
              <div className="resource-muted-card">
                Дополнительные заявки не требуются.
              </div>
            )}
          </div>
        </section>
      </div>
    </ResourcePageShell>
  );
}

export function ProjectResourcesPage() {
  return <ResourceOverviewPage />;
}
