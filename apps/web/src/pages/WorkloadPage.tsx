import { CalendarDays, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
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
import { reverseWorkloadChange, workloadChange, type WorkloadChange } from "../app/workloadPlanning";
import { describeDateHold } from "../app/scheduleLinks";
import { WorkloadGrid, type WorkloadSortKey } from "../components/workload/WorkloadGrid";
import { WorkloadItemPanel } from "../components/workload/WorkloadItemPanel";
import type { WorkloadDragPreview } from "../components/workload/useWorkloadDrag";
import { useI18n } from "../i18n/I18nProvider";
import { intlLocale } from "../i18n/locale";
import { usePageContext } from "./PageContext";
import { useTimelineFullscreen } from "../components/timeline/TimelineFullscreen";

const HORIZONS: LeaveHorizon[] = [1, 3, 6, 12];
const HORIZON_STORAGE_KEY = "pms-workload-horizon";

function storedHorizon(): LeaveHorizon {
  try {
    const value = Number(window.localStorage.getItem(HORIZON_STORAGE_KEY));
    return HORIZONS.includes(value as LeaveHorizon) ? (value as LeaveHorizon) : 3;
  } catch {
    return 3;
  }
}

type SavedItem = { item: { owner: string; startDate: string | null; dueDate: string | null; updatedAt?: string } };
type Feedback = { tone: "done" | "error" | "note"; message: string; undo?: { item: WorkloadItem; change: WorkloadChange } };

const day = (value: string | null, fallback: string) => (value ? value.slice(0, 10) : fallback);

export function WorkloadPage() {
  const { t, locale } = useI18n();
  const { selectProject } = usePageContext();
  const fullscreen = useTimelineFullscreen("workload");
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
  const [showIdle, setShowIdle] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
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
    return buildWorkloadRows(items, data?.employees ?? [], showIdle);
  }, [data?.employees, data?.items, projectFilter, showIdle]);
  const editableProjectIds = useMemo(() => new Set(data?.editableProjectIds ?? []), [data?.editableProjectIds]);
  const employeeNames = useMemo(
    () => [...new Set((data?.employees ?? []).map((employee) => employee.name))].sort((left, right) => left.localeCompare(right, locale)),
    [data?.employees, locale],
  );
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
  const openItem = (item: WorkloadItem) => setOpenItemId(item.id);
  const openedItem = data?.items.find((item) => item.id === openItemId) ?? null;
  const openStructure = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!openedItem || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const url = new URL(event.currentTarget.href);
    selectProject(openedItem.projectId, "project-structure");
    // Point at the work only once the structure really opened: a guard may keep the user here.
    if (window.location.pathname === url.pathname) window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  const describe = (item: WorkloadItem) => {
    const project = projectsById.get(item.projectId);
    return `${project ? `${project.code} · ` : ""}${item.code} ${item.title}`;
  };
  const dateRange = (item: Pick<WorkloadItem, "startDate" | "dueDate">) => {
    const format = new Intl.DateTimeFormat(intlLocale(locale), { day: "numeric", month: "short", timeZone: "UTC" });
    const text = (value: string) => format.format(new Date(`${value}T00:00:00Z`));
    return `${text(item.startDate)} – ${text(item.dueDate)}`;
  };

  /**
   * Saves who does the work and when. The item is sent with the version the page
   * read, so an edit made meanwhile by someone else is refused instead of lost;
   * the page then reloads, since links may have moved other work too.
   */
  const applyChange = async (item: WorkloadItem, change: WorkloadChange, isUndo = false) => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    setData((current) =>
      current && { ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, ...change } : entry)) },
    );
    try {
      const result = await apiClient.patch<SavedItem>(`/api/wbs-items/${item.id}`, {
        ...change,
        ...(change.startDate || change.dueDate ? { scheduleDriver: "dates" } : {}),
        expectedUpdatedAt: item.updatedAt,
      });
      const saved: WorkloadItem = {
        ...item,
        owner: result.item.owner,
        startDate: day(result.item.startDate, item.startDate),
        dueDate: day(result.item.dueDate, item.dueDate),
        updatedAt: result.item.updatedAt,
      };
      setFeedback({
        tone: "done",
        message: t(isUndo ? "ui.workload.undone" : "ui.workload.saved", {
          work: describe(saved),
          owner: saved.owner,
          dates: dateRange(saved),
        }),
        undo: isUndo || !saved.updatedAt ? undefined : { item: saved, change: reverseWorkloadChange(item, change) },
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : t("ui.workload.saveFailed") });
    } finally {
      setSaving(false);
      setReloadToken((value) => value + 1);
    }
  };

  const commitDrag = (preview: WorkloadDragPreview) => {
    const target = preview.rowKey !== preview.fromRowKey ? rows.find((row) => row.key === preview.rowKey) : undefined;
    const change = workloadChange(preview.item, { ...preview.dates, owner: target?.name });
    if (change) {
      void applyChange(preview.item, change);
      return;
    }
    // The pointer went sideways but links hold the dates: say which ones instead of doing nothing.
    if (preview.mode === "reassign" && preview.deltaDays !== 0) {
      const { item } = preview;
      const reasons = [
        item.startLocked && describeDateHold("start", item.startLinks ?? [], t),
        item.finishLocked && describeDateHold("finish", item.finishLinks ?? [], t),
      ].filter(Boolean);
      setFeedback({
        tone: "note",
        message: `${describe(item)}: ${reasons.join(" ")} ${t("ui.scheduleLinks.howToChange")}`,
      });
    }
  };

  return (
    <section className={`v2-page leave-page workload-page ${fullscreen.isFullscreen ? "timeline-page-fullscreen" : ""}`}>
      {/* The section tab names the page on screen; this keeps a heading for assistive tech. */}
      <h1 className="sr-only">{t("view.workload")}</h1>
      {!fullscreen.isFullscreen && (
        <div className="v2-compact-header leave-page-header">
          <p className="leave-page-description">{t("ui.workload.description")}</p>
        </div>
      )}

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
          {fullscreen.button}
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
          <label className="leave-check">
            <input checked={showIdle} type="checkbox" onChange={(event) => setShowIdle(event.target.checked)} />
            {t("ui.workload.showIdle")}
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
          <p className="leave-hint">{t(editableProjectIds.size > 0 ? "ui.workload.hintEditable" : "ui.workload.hint")}</p>
          {feedback && (
            <div className={`workload-feedback ${feedback.tone}`} role={feedback.tone === "done" ? "status" : "alert"}>
              <span>{feedback.message}</span>
              {feedback.undo && (
                <button
                  disabled={saving}
                  onClick={() => feedback.undo && void applyChange(feedback.undo.item, feedback.undo.change, true)}
                  type="button"
                >
                  <Undo2 aria-hidden="true" size={14} />
                  {t("ui.workload.undo")}
                </button>
              )}
              <button aria-label={t("ui.workload.dismiss")} className="workload-feedback-close" onClick={() => setFeedback(null)} type="button">
                <X aria-hidden="true" size={14} />
              </button>
            </div>
          )}
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
              onDragCommit={commitDrag}
              editableProjectIds={editableProjectIds}
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
      {openedItem && (
        <WorkloadItemPanel
          editableProjectIds={editableProjectIds}
          employeeNames={employeeNames}
          item={openedItem}
          key={`${openedItem.id}:${openedItem.updatedAt ?? ""}`}
          onClose={() => setOpenItemId(null)}
          onOpenStructure={openStructure}
          onSave={(change) => {
            setOpenItemId(null);
            void applyChange(openedItem, change);
          }}
          project={projectsById.get(openedItem.projectId)}
          saving={saving}
        />
      )}
      {fullscreen.hint}
    </section>
  );
}
