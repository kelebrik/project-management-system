import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ResourceAllocationProfile,
  ResourceDashboard,
  ResourceDashboardRow,
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
  subtitle,
  title = "Профиль ресурса",
}: {
  children: React.ReactNode;
  subtitle?: string;
  title?: string;
}) {
  return (
    <article className="panel project-card project-module-page resource-management-page">
      <div className="panel-title resource-profile-title">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="resource-profile-actions">
          <button type="button">Открыть календарь</button>
          <button type="button">История</button>
          <button type="button" className="primary">
            Запросить замену
          </button>
        </div>
      </div>
      {children}
    </article>
  );
}

function avatarLetters(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "Р";
}

function formatDate(value: string | null) {
  if (!value) return "не задано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не задано";
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  });
}

function selectedRow(rows: ResourceDashboardRow[], owner: string) {
  return rows.find((row) => row.owner === owner) ?? rows[0] ?? null;
}

function ResourceMetricCard({
  label,
  note,
  value,
}: {
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="resource-profile-metric">
      <span>{label}</span>
      <b>{value}</b>
      <small>{note}</small>
    </div>
  );
}

function AssignmentStatus({ utilization }: { utilization: number }) {
  if (utilization > 100) return <span className="resource-pill danger">overload</span>;
  if (utilization >= 86) return <span className="resource-pill warning">risk</span>;
  return <span className="resource-pill soft">soft</span>;
}

export function ResourceOverviewPage() {
  const { resourceDashboard } = useResourceDashboard();
  const rows = resourceDashboard.rows;
  const [selectedOwner, setSelectedOwner] = useState(rows[0]?.owner ?? "");
  const row = selectedRow(rows, selectedOwner);
  const selectedCell = row?.cells.find((cell) => cell.demandHours > 0) ?? row?.cells[0] ?? null;
  const assignments = row?.activeItems.slice(0, 4) ?? [];
  const weeklyCells = row?.cells.slice(0, 5) ?? [];
  const peakCell = row?.cells.reduce(
    (peak, cell) => (cell.utilization > peak.utilization ? cell : peak),
    row.cells[0],
  );
  const skillTags = useMemo(() => {
    if (!row) return [];
    return [
      row.role,
      resourceKindLabels[row.profile.kind],
      row.calendarCode ? `${row.calendarCode} calendar` : "calendar TBD",
      row.profile.projectAllocationPercent >= 100 ? "full project pool" : "shared allocation",
      row.overdue > 0 ? "есть просроченные" : "без просрочек",
    ];
  }, [row]);

  if (!row) {
    return (
      <ResourcePageShell subtitle="Доступность, навыки, ставки, назначения и фактические часы по проектам.">
        <div className="empty-state">Нет ресурсов для отображения.</div>
      </ResourcePageShell>
    );
  }

  return (
    <ResourcePageShell subtitle="Доступность, навыки, ставки, назначения и фактические часы по проектам.">
      <div className="resource-profile-layout">
        <section className="resource-profile-card">
          <div className="resource-avatar">{avatarLetters(row.owner)}</div>
          <label className="resource-profile-select">
            <span>Ресурс</span>
            <select
              value={row.owner}
              onChange={(event) => setSelectedOwner(event.target.value)}
            >
              {rows.map((resourceRow) => (
                <option key={resourceRow.owner} value={resourceRow.owner}>
                  {resourceRow.owner}
                </option>
              ))}
            </select>
          </label>
          <p>
            {row.role}, {resourceKindLabels[row.profile.kind]},{" "}
            {row.profile.fte || 0} FTE
          </p>
          <div className="resource-tag-row">
            {skillTags.slice(0, 4).map((tag, index) => (
              <span
                className={`resource-pill ${index === 2 ? "warning" : index === 3 ? "danger" : "ok"}`}
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
          <dl className="resource-profile-facts">
            <div>
              <dt>Менеджер</dt>
              <dd>{row.profile.kind === "coordinator" ? row.owner : "не задан"}</dd>
            </div>
            <div>
              <dt>Календарь</dt>
              <dd>{row.calendarCode ?? "не задан"} / {row.capacityHoursPerWeek} ч</dd>
            </div>
            <div>
              <dt>Плановая ставка</dt>
              <dd>не задана</dd>
            </div>
            <div>
              <dt>Доступность</dt>
              <dd>{row.capacityHoursPerWeek} ч/нед</dd>
            </div>
            <div>
              <dt>Резерв</dt>
              <dd>{Math.max(0, row.capacityHoursPerWeek - (selectedCell?.demandHours ?? 0))} ч/нед</dd>
            </div>
          </dl>
        </section>

        <div className="resource-profile-main">
          <div className="resource-profile-metrics">
            <ResourceMetricCard
              label="Capacity"
              value={`${row.capacityHoursPerWeek} ч`}
              note={`в неделю с учетом ${row.profile.fte || 0} FTE`}
            />
            <ResourceMetricCard
              label="Utilization"
              value={`${peakCell?.utilization ?? 0}%`}
              note={`пик на неделе ${peakCell?.weekLabel ?? "-"}`}
            />
            <ResourceMetricCard
              label="Overtime risk"
              value={`+${Math.max(0, (peakCell?.demandHours ?? 0) - row.capacityHoursPerWeek)} ч`}
              note="без backup-ресурса"
            />
            <ResourceMetricCard
              label="Cost forecast"
              value="не задан"
              note="нет ставки ресурса"
            />
          </div>

          <div className="resource-profile-grid">
            <section className="resource-profile-panel">
              <div className="resource-panel-head">
                <h3>Назначения</h3>
                <span>июнь-июль</span>
              </div>
              <div className="resource-assignment-table">
                <div className="resource-assignment-head">
                  <span>Работа</span>
                  <span>Период</span>
                  <span>План</span>
                  <span>Факт</span>
                  <span>Статус</span>
                </div>
                {assignments.map((item) => (
                  <div className="resource-assignment-row" key={item.id}>
                    <b>
                      {item.code} {item.title}
                    </b>
                    <span>{formatDate(item.startDate)}-{formatDate(item.dueDate)}</span>
                    <span>{item.plannedHours} ч</span>
                    <span>{Math.max(0, item.plannedHours - item.remainingHours)} ч</span>
                    <AssignmentStatus utilization={peakCell?.utilization ?? 0} />
                  </div>
                ))}
                {assignments.length === 0 && (
                  <div className="resource-profile-empty">Активных назначений нет.</div>
                )}
              </div>
            </section>

            <section className="resource-profile-panel">
              <div className="resource-panel-head">
                <h3>Загрузка по неделям</h3>
                <span>capacity {row.capacityHoursPerWeek} ч</span>
              </div>
              <div className="resource-week-list">
                {weeklyCells.map((cell) => (
                  <div className="resource-week-row" key={cell.weekKey}>
                    <span>{cell.weekLabel}</span>
                    <div className="resource-week-track">
                      <i
                        className={`resource-week-fill ${cell.utilization > 100 ? "danger" : cell.utilization >= 86 ? "warning" : "ok"}`}
                        style={{ width: `${Math.min(100, cell.utilization)}%` }}
                      />
                    </div>
                    <b>{cell.utilization}%</b>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="resource-profile-panel">
            <div className="resource-panel-head">
              <h3>Навыки и ограничения</h3>
              <span>используется при подборе кандидатов</span>
            </div>
            <div className="resource-tag-row">
              {skillTags.map((tag, index) => (
                <span
                  className={`resource-pill ${index > 2 ? "warning" : "ok"}`}
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        </div>
      </div>
    </ResourcePageShell>
  );
}

export function ResourceCapacityPage() {
  const { resourceDashboard, updateResourceProfile } = useResourceDashboard();
  const visibleRows = resourceDashboard.rows.slice(0, 20);

  return (
    <ResourcePageShell
      title="Параметры"
      subtitle="Норма часов, FTE, доля проектной работы и операционка."
    >
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

export function ProjectResourcesPage() {
  return <ResourceOverviewPage />;
}
