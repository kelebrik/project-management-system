import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import {
  buildLeaveTimeline,
  calendarOverrides,
  extendLeaveRange,
  initialLeaveRange,
  localDay,
  widenLeaveRange,
  type LeaveHorizon,
  type LeaveRange,
} from "../app/leaveScheduleModel";
import {
  buildWorkloadRows,
  itemsInWindow,
  overlapWorkingDays,
  overlapsTouchWindow,
  projectColors,
  type WorkloadData,
  type WorkloadItem,
  type WorkloadLeave,
  type WorkloadRow,
} from "../app/workloadModel";
import { WorkloadGrid, type WorkloadSortKey } from "../components/workload/WorkloadGrid";
import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

const HORIZONS: LeaveHorizon[] = [3, 6, 12];
const HORIZON_STORAGE_KEY = "pms-workload-horizon";

function storedHorizon(): LeaveHorizon {
  try {
    const value = Number(window.localStorage.getItem(HORIZON_STORAGE_KEY));
    return HORIZONS.includes(value as LeaveHorizon) ? (value as LeaveHorizon) : 3;
  } catch {
    return 3;
  }
}

export function WorkloadPage() {
  const { t, locale } = useI18n();
  const { selectProject } = usePageContext();
  const today = localDay();
  const [horizon, setHorizon] = useState<LeaveHorizon>(storedHorizon);
  const [range, setRange] = useState<LeaveRange>(() => initialLeaveRange(today, storedHorizon()));
  const [visibleWindow, setVisibleWindow] = useState<LeaveRange>({ from: today, to: today });
  const [todayRequest, setTodayRequest] = useState(0);
  const [data, setData] = useState<WorkloadData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string[]>([]);
  const [overlapsOnly, setOverlapsOnly] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [sort, setSort] = useState<{ key: WorkloadSortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });

  const extendRange = useCallback(
    (side: "before" | "after") => setRange((current) => extendLeaveRange(current, side, horizon)),
    [horizon],
  );

  // Only the latest request may replace the data; the old data stays up meanwhile.
  const requestRef = useRef(0);
  useEffect(() => {
    const request = ++requestRef.current;
    setLoadError(false);
    apiClient
      .get<WorkloadData>(`/api/workload?from=${range.from}&to=${range.to}`)
      .then((next) => {
        if (request === requestRef.current) setData(next);
      })
      .catch(() => {
        if (request === requestRef.current) setLoadError(true);
      });
  }, [range.from, range.to, reloadToken]);

  const overrides = useMemo(() => calendarOverrides(data?.calendarDays ?? []), [data?.calendarDays]);
  const timeline = useMemo(() => buildLeaveTimeline(range.from, range.to, overrides, today), [overrides, range, today]);
  // Colours come from every project in the answer, before any filter.
  const colors = useMemo(() => projectColors(data?.projects ?? []), [data?.projects]);
  const projectsById = useMemo(() => new Map((data?.projects ?? []).map((project) => [project.id, project])), [data?.projects]);
  const leavesByEmployee = useMemo(() => {
    const map = new Map<string, WorkloadLeave[]>();
    for (const leave of data?.leaves ?? []) map.set(leave.employeeId, [...(map.get(leave.employeeId) ?? []), leave]);
    return map;
  }, [data?.leaves]);
  const rows = useMemo(() => {
    const selected = new Set(projectFilter);
    const items = (data?.items ?? []).filter((item) => selected.size === 0 || selected.has(item.projectId));
    return buildWorkloadRows(items, data?.employees ?? []);
  }, [data?.employees, data?.items, projectFilter]);
  const counts = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.key,
          {
            tasks: itemsInWindow(row.items, visibleWindow).length,
            overlap: overlapWorkingDays(row.overlaps, visibleWindow, overrides),
          },
        ]),
      ),
    [overrides, rows, visibleWindow],
  );
  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase(locale);
    const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    const sign = sort.direction === "asc" ? 1 : -1;
    return rows
      .filter((row) => !query || row.name.toLocaleLowerCase(locale).includes(query))
      .filter((row) => !overlapsOnly || overlapsTouchWindow(row.overlaps, visibleWindow))
      .sort((left, right) => {
        const a = counts.get(left.key)!;
        const b = counts.get(right.key)!;
        const primary = sort.key === "tasks" ? a.tasks - b.tasks : sort.key === "overlap" ? a.overlap - b.overlap : 0;
        return sign * (primary || collator.compare(left.name, right.name));
      });
  }, [counts, locale, overlapsOnly, rows, search, sort, visibleWindow]);
  const groups = useMemo(() => {
    if (!grouped) return [{ department: null, rows: visibleRows }];
    const byDepartment = new Map<string, WorkloadRow[]>();
    for (const row of visibleRows) byDepartment.set(row.department, [...(byDepartment.get(row.department) ?? []), row]);
    return [...byDepartment.entries()]
      .sort(([left], [right]) => (left ? (right ? left.localeCompare(right, locale) : -1) : 1))
      .map(([department, groupRows]) => ({ department, rows: groupRows }));
  }, [grouped, locale, visibleRows]);
  const presentProjects = useMemo(() => {
    const present = new Set((data?.items ?? []).map((item) => item.projectId));
    return (data?.projects ?? []).filter((project) => present.has(project.id));
  }, [data?.items, data?.projects]);

  const toggleSort = (key: WorkloadSortKey) =>
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  const openItem = (item: WorkloadItem) => selectProject(item.projectId, "project-structure");

  return (
    <section className="v2-page leave-page workload-page">
      {/* The section tab names the page on screen; this keeps a heading for assistive tech. */}
      <h1 className="sr-only">{t("view.workload")}</h1>
      <div className="v2-compact-header leave-page-header">
        <p className="leave-page-description">{t("ui.workload.description")}</p>
      </div>

      <div className="leave-tabs-row">
        <ul className="leave-legend" aria-label={t("view.workload")}>
          {presentProjects.map((project) => (
            <li key={project.id} title={project.name}>
              <i aria-hidden="true" style={{ backgroundColor: colors.get(project.id) }} />
              {project.code}
            </li>
          ))}
          <li>
            <i aria-hidden="true" className="workload-legend-overlap" />
            {t("ui.workload.overlapsLegend")}
          </li>
          <li>
            <i aria-hidden="true" className="workload-legend-leave" />
            {t("ui.workload.leaveLegend")}
          </li>
        </ul>
      </div>

      <div className="leave-toolbar">
        <div className="leave-period-nav">
          <button onClick={() => setTodayRequest((value) => value + 1)} type="button">
            <CalendarDays aria-hidden="true" size={15} />
            {t("ui.leave.today")}
          </button>
          <div className="leave-horizon" role="group" aria-label={t("ui.leave.horizon")}>
            {HORIZONS.map((value) => (
              <button
                aria-pressed={horizon === value}
                className={horizon === value ? "active" : ""}
                key={value}
                onClick={() => {
                  setHorizon(value);
                  setRange((current) => widenLeaveRange(current, visibleWindow.from, value));
                  try {
                    window.localStorage.setItem(HORIZON_STORAGE_KEY, String(value));
                  } catch {
                    /* Persistence is optional. */
                  }
                }}
                type="button"
              >
                {t("ui.leave.horizonMonths", { count: value })}
              </button>
            ))}
          </div>
        </div>
        <div className="leave-filters">
          <input
            aria-label={t("ui.workload.searchPlaceholder")}
            className="leave-search"
            placeholder={t("ui.workload.searchPlaceholder")}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <details className="leave-departments">
            <summary>
              {projectFilter.length === 0
                ? t("ui.workload.projectsAll")
                : t("ui.workload.projectsSelected", { count: projectFilter.length })}
            </summary>
            <div>
              {presentProjects.map((project) => (
                <label key={project.id}>
                  <input
                    checked={projectFilter.includes(project.id)}
                    type="checkbox"
                    onChange={(event) =>
                      setProjectFilter((current) =>
                        event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id),
                      )
                    }
                  />
                  <i aria-hidden="true" className="workload-swatch" style={{ backgroundColor: colors.get(project.id) }} />
                  {project.code} — {project.name}
                </label>
              ))}
            </div>
          </details>
          <label className="leave-check">
            <input checked={overlapsOnly} type="checkbox" onChange={(event) => setOverlapsOnly(event.target.checked)} />
            {t("ui.workload.overlapsOnly")}
          </label>
          <label className="leave-check">
            <input checked={grouped} type="checkbox" onChange={(event) => setGrouped(event.target.checked)} />
            {t("ui.workload.groupByDepartment")}
          </label>
        </div>
      </div>

      {loadError && (
        <div className="empty-state" role="alert">
          <span>{t("ui.workload.loadFailed")}</span>
          <button onClick={() => setReloadToken((value) => value + 1)} type="button">
            {t("ui.workload.retry")}
          </button>
        </div>
      )}
      {!data && !loadError && (
        <div className="empty-state" role="status">
          {t("ui.workload.loading")}
        </div>
      )}
      {data && (
        <>
          <p className="leave-hint">{t("ui.workload.hint")}</p>
          {rows.length === 0 ? (
            <div className="empty-state">{t("ui.workload.noWork")}</div>
          ) : visibleRows.length === 0 ? (
            <div className="empty-state">{t("ui.workload.noRowsForFilters")}</div>
          ) : (
            <WorkloadGrid
              colors={colors}
              counts={counts}
              groups={groups}
              horizon={horizon}
              leavesByEmployee={leavesByEmployee}
              onExtend={extendRange}
              onOpenItem={openItem}
              onSort={toggleSort}
              onVisibleWindowChange={setVisibleWindow}
              overrides={overrides}
              projectsById={projectsById}
              range={range}
              showDepartment={!grouped}
              sort={sort}
              timeline={timeline}
              today={today}
              todayRequest={todayRequest}
            />
          )}
        </>
      )}
    </section>
  );
}
