import {
  AlertTriangle,
  CalendarDays,
  Gauge,
  Settings2,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

import type {
  ResourceAllocationProfile,
  ResourceDashboard,
  ResourceProfileKind,
} from "../app/resourceModels";
import { usePageContext } from "./PageContext";

function useResourceDashboard() {
  return usePageContext() as {
    resourceDashboard: ResourceDashboard;
    updateResourceProfile: (
      owner: string,
      patch: Partial<ResourceAllocationProfile>,
    ) => void;
  };
}

const resourceKindLabels: Record<ResourceProfileKind, string> = {
  person: "Сотрудник",
  "contractor-team": "Команда подрядчика",
  coordinator: "Координатор",
};

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
        <small>Назначены в структуре работ активных проектов</small>
      </div>
      <div className="metric-card resource-kpi-card">
        <Gauge size={18} />
        <span>Перегружены</span>
        <b>{dashboard.summary.overloadedCount}</b>
        <small>Спрос выше расчетной доступности</small>
      </div>
      <div className="metric-card resource-kpi-card">
        <UserPlus size={18} />
        <span>Дефицит</span>
        <b>{dashboard.summary.roleGapHours} ч</b>
        <small>Перегрузка и незакрепленный спрос</small>
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
          <p>Трудоемкость WBS / доступность из параметров ресурса.</p>
        </div>
        <span>
          {dashboard.summary.activeWorkCount} активных работ ·{" "}
          {dashboard.source.activeProjectsCount} проектов
        </span>
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
                {row.role} · {resourceKindLabels[row.profile.kind]} ·{" "}
                {row.capacityHoursPerWeek} ч/нед
              </span>
            </div>
            {row.cells.map((cell) => (
              <div
                className={`resource-load-cell resource-load-${cell.tone}`}
                key={cell.weekKey}
                title={`${cell.demandHours} ч спроса / ${cell.capacityHours} ч доступно. Спрос считается по полю трудоемкости WBS в процентах.`}
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
                      {item.projectCode ? `${item.projectCode} · ` : ""}
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
    <ResourcePageShell description="Профили ресурсов: тип, доступность, остаточный объем и признаки перегрузки.">
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
            <span>Тип</span>
            <span>Доступно</span>
            <span>Осталось</span>
            <span>Просрочено</span>
          </div>
          {visibleRows.map((row) => (
            <div className="resource-profile-row" key={row.owner}>
              <b>{row.owner}</b>
              <span>{row.role}</span>
              <span>{resourceKindLabels[row.profile.kind]}</span>
              <span>{row.capacityHoursPerWeek} ч/нед</span>
              <span>{row.remainingHours} ч</span>
              <span>{row.overdue}</span>
            </div>
          ))}
        </div>
      </section>
    </ResourcePageShell>
  );
}

export function ResourceCapacityPage() {
  const { resourceDashboard, updateResourceProfile } = useResourceDashboard();
  const visibleRows = resourceDashboard.rows.slice(0, 20);

  return (
    <ResourcePageShell description="Параметры расчета: норма часов, FTE, доля проектной работы и операционка. Нагрузка берется из трудоемкости WBS.">
      <section className="resource-panel">
        <div className="resource-panel-head">
          <div>
            <h3>Параметры расчета загрузки</h3>
            <p>Доступность = норма × FTE × проектная доля × доля этого контура.</p>
          </div>
          <Settings2 size={18} />
        </div>
        <div className="resource-capacity-table">
          <div className="resource-capacity-row resource-capacity-head">
            <span>Ресурс</span>
            <span>Тип</span>
            <span>Роль</span>
            <span>Норма</span>
            <span>FTE</span>
            <span>Проекты</span>
            <span>Этот контур</span>
            <span>Операционка</span>
            <span>Доступно</span>
          </div>
          {visibleRows.map((row) => (
            <div className="resource-capacity-row" key={row.owner}>
              <div className="resource-capacity-owner">
                <b>{row.owner}</b>
                <small>{row.profile.note}</small>
              </div>
              <label>
                <select
                  value={row.profile.kind}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, {
                      kind: event.target.value as ResourceProfileKind,
                    })
                  }
                >
                  {Object.entries(resourceKindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  value={row.profile.role}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, { role: event.target.value })
                  }
                />
              </label>
              <label>
                <input
                  min={0}
                  type="number"
                  value={row.profile.baseHoursPerWeek}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, {
                      baseHoursPerWeek: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <input
                  min={0}
                  step={0.1}
                  type="number"
                  value={row.profile.fte}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, {
                      fte: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <input
                  max={100}
                  min={0}
                  type="number"
                  value={row.profile.projectAllocationPercent}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, {
                      projectAllocationPercent: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <input
                  max={100}
                  min={0}
                  type="number"
                  value={row.profile.currentProjectAllocationPercent}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, {
                      currentProjectAllocationPercent: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                <input
                  max={100}
                  min={0}
                  type="number"
                  value={row.profile.operationalAllocationPercent}
                  onChange={(event) =>
                    updateResourceProfile(row.owner, {
                      operationalAllocationPercent: Number(event.target.value),
                    })
                  }
                />
              </label>
              <strong>{row.capacityHoursPerWeek} ч/нед</strong>
            </div>
          ))}
          {visibleRows.length === 0 && (
            <div className="resource-muted-card">
              Нет ресурсов для настройки.
            </div>
          )}
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
