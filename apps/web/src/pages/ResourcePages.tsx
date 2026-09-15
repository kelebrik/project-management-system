import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { useI18n as useLocaleTranslation } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/types";
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
  const { t: uiText } = useInterfaceTranslation();
  return (
    <article className="panel project-card project-module-page resource-management-page">
      <div className="panel-title resource-profile-title">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="resource-profile-actions">
          <button type="button">{uiText("ui.resources.resourceOpenCalendarAction")}</button>
          <button type="button">{uiText("ui.resources.historyAction")}</button>
          <button type="button" className="primary">
            {uiText("ui.resources.resourceRequestReplacementAction")}
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

function formatDate(value: string | null, uiLocale: Locale) {
  if (!value) return "не задано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не задано";
  return date.toLocaleDateString(intlLocale(uiLocale), {
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
  const { t: uiText } = useInterfaceTranslation();
  const { locale: uiLocale } = useLocaleTranslation();
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
        <div className="empty-state">{uiText("ui.resources.resourcesNoneToDisplay")}</div>
      </ResourcePageShell>
    );
  }

  return (
    <ResourcePageShell subtitle="Доступность, навыки, ставки, назначения и фактические часы по проектам.">
      <div className="resource-profile-layout">
        <section className="resource-profile-card">
          <div className="resource-avatar">{avatarLetters(row.owner)}</div>
          <label className="resource-profile-select">
            <span>{uiText("ui.resources.resourceColumnLabel")}</span>
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
              <dt>{uiText("ui.resources.resourceManagerColumnLabel")}</dt>
              <dd>{row.profile.kind === "coordinator" ? row.owner : uiText("ui.admin.notSetMasculine")}</dd>
            </div>
            <div>
              <dt>{uiText("ui.projects.calendarLabel")}</dt>
              <dd>{row.calendarCode ?? uiText("ui.admin.notSetMasculine")} / {row.capacityHoursPerWeek} {uiText("ui.resources.hoursShortUnit")}</dd>
            </div>
            <div>
              <dt>{uiText("ui.resources.resourcePlannedRateLabel")}</dt>
              <dd>{uiText("ui.resources.resourceRateNotSetValue")}</dd>
            </div>
            <div>
              <dt>{uiText("ui.resources.resourceAvailabilityLabel")}</dt>
              <dd>{row.capacityHoursPerWeek} {uiText("ui.resources.hoursPerWeekShortUnit")}</dd>
            </div>
            <div>
              <dt>{uiText("ui.resources.resourceReserveLabel")}</dt>
              <dd>{Math.max(0, row.capacityHoursPerWeek - (selectedCell?.demandHours ?? 0))} {uiText("ui.resources.hoursPerWeekShortUnit")}</dd>
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
                <h3>{uiText("ui.resources.resourceAssignmentsTitle")}</h3>
                <span>{uiText("ui.resources.resourcePeriodJuneJuly")}</span>
              </div>
              <div className="resource-assignment-table">
                <div className="resource-assignment-head">
                  <span>{uiText("ui.automation.workItem")}</span>
                  <span>{uiText("ui.automation.period")}</span>
                  <span>{uiText("ui.resources.planColumnLabel")}</span>
                  <span>{uiText("ui.resources.actualColumnLabel")}</span>
                  <span>{uiText("ui.admin.status")}</span>
                </div>
                {assignments.map((item) => (
                  <div className="resource-assignment-row" key={item.id}>
                    <b>
                      {item.code} {item.title}
                    </b>
                    <span>{formatDate(item.startDate, uiLocale)}-{formatDate(item.dueDate, uiLocale)}</span>
                    <span>{item.plannedHours} {uiText("ui.resources.hoursShortUnit")}</span>
                    <span>{Math.max(0, item.plannedHours - item.remainingHours)} {uiText("ui.resources.hoursShortUnit")}</span>
                    <AssignmentStatus utilization={peakCell?.utilization ?? 0} />
                  </div>
                ))}
                {assignments.length === 0 && (
                  <div className="resource-profile-empty">{uiText("ui.resources.resourceNoActiveAssignments")}</div>
                )}
              </div>
            </section>

            <section className="resource-profile-panel">
              <div className="resource-panel-head">
                <h3>{uiText("ui.resources.resourceWeeklyWorkloadTitle")}</h3>
                <span>capacity {row.capacityHoursPerWeek} {uiText("ui.resources.hoursShortUnit")}</span>
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
              <h3>{uiText("ui.resources.resourceSkillsAndConstraintsTitle")}</h3>
              <span>{uiText("ui.resources.resourceSkillsUsedForMatchingHint")}</span>
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
  const { t: uiText } = useInterfaceTranslation();
  const { resourceDashboard, updateResourceProfile } = useResourceDashboard();
  const visibleRows = resourceDashboard.rows.slice(0, 20);

  return (
    <ResourcePageShell
      title={uiText("ui.resources.resourceSettingsTabLabel")}
      subtitle="Норма часов, FTE, доля проектной работы и операционка."
    >
      <section className="resource-panel">
        <div className="resource-panel-head">
          <div>
            <h3>{uiText("ui.resources.resourceWorkloadSettingsTitle")}</h3>
            <p>{uiText("ui.resources.resourceAvailabilityFormulaHint")}</p>
          </div>
          <Settings2 size={18} />
        </div>
        <div className="resource-capacity-table">
          <div className="resource-capacity-row resource-capacity-head">
            <span>{uiText("ui.resources.resourceColumnLabel")}</span>
            <span>{uiText("ui.admin.type")}</span>
            <span>{uiText("ui.resources.resourceRoleColumnLabel")}</span>
            <span>{uiText("ui.resources.resourceStandardHoursColumnLabel")}</span>
            <span>FTE</span>
            <span>{uiText("ui.admin.projects")}</span>
            <span>{uiText("ui.resources.resourceThisUnitColumnLabel")}</span>
            <span>{uiText("ui.resources.resourceOperationsColumnLabel")}</span>
            <span>{uiText("ui.resources.resourceAvailableColumnLabel")}</span>
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
              <strong>{row.capacityHoursPerWeek} {uiText("ui.resources.hoursPerWeekShortUnit")}</strong>
            </div>
          ))}
          {visibleRows.length === 0 && (
            <div className="resource-muted-card">
              {uiText("ui.resources.resourcesNoneToConfigure")}
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
