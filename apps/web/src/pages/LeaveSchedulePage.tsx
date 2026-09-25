import { CalendarDays, Plus, Settings2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../api/client";
import {
  buildLeaveTimeline,
  extendLeaveRange,
  initialLeaveRange,
  widenLeaveRange,
  calendarOverrides,
  filterLeaveEmployees,
  groupLeaveEmployees,
  leaveDepartments,
  leaveSegments,
  leaveTypeLabel,
  localDay,
  plannedWorkingDays,
  sortLeaveEmployees,
  type LeaveEmployee,
  type LeaveHorizon,
  type LeaveRange,
  type LeaveRecord,
  type LeaveScheduleData,
  type LeaveSortKey,
  type LeaveType,
} from "../app/leaveScheduleModel";
import { LeaveCalendarTab } from "../components/leaveSchedule/LeaveCalendarTab";
import { LeaveEditorDialog, type LeaveDraft } from "../components/leaveSchedule/LeaveEditorDialog";
import { LeaveEmployeesDialog } from "../components/leaveSchedule/LeaveEmployeesDialog";
import { LeaveListTab } from "../components/leaveSchedule/LeaveListTab";
import { LeaveScheduleGrid } from "../components/leaveSchedule/LeaveScheduleGrid";
import { LeaveTypesDialog } from "../components/leaveSchedule/LeaveTypesDialog";
import { canEditAppView } from "../app/routes";
import { useConfirm } from "../hooks/useConfirm";
import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

type LeaveTab = "schedule" | "list" | "calendar";
const HORIZONS: LeaveHorizon[] = [3, 6, 12];
const HORIZON_STORAGE_KEY = "pms-leave-schedule-horizon";

function storedHorizon(): LeaveHorizon {
  try {
    const value = Number(window.localStorage.getItem(HORIZON_STORAGE_KEY));
    return HORIZONS.includes(value as LeaveHorizon) ? (value as LeaveHorizon) : 3;
  } catch {
    return 3;
  }
}

export function LeaveSchedulePage() {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const { isAdminUser, sectionAccess, setNotice } = usePageContext();
  // Operations is open to every signed-in user, the public demo included.
  const canEdit = canEditAppView("leave-schedule", sectionAccess);
  // Only administrators (and the read-only demo) may list system users.
  const canLinkUsers = Boolean(isAdminUser || sectionAccess?.isPublicDemoVisitor);
  const today = localDay();
  const [tab, setTab] = useState<LeaveTab>("schedule");
  const [horizon, setHorizon] = useState<LeaveHorizon>(storedHorizon);
  // The loaded stretch grows as the user scrolls; the window is what is on screen.
  const [range, setRange] = useState<LeaveRange>(() => initialLeaveRange(today, storedHorizon()));
  const [visibleWindow, setVisibleWindow] = useState<LeaveRange>({ from: today, to: today });
  const [todayRequest, setTodayRequest] = useState(0);
  const [data, setData] = useState<LeaveScheduleData | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Today may lie outside the visible period, so "away today" has its own small request.
  const [todayLeaves, setTodayLeaves] = useState<LeaveRecord[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [absentToday, setAbsentToday] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [sort, setSort] = useState<{ key: LeaveSortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const [editor, setEditor] = useState<LeaveDraft | null>(null);
  const [dialog, setDialog] = useState<"employees" | "types" | null>(null);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);
  const extendRange = useCallback(
    (side: "before" | "after") => setRange((current) => extendLeaveRange(current, side, horizon)),
    [horizon],
  );

  // Only the latest request may replace the data: scrolling can grow the range
  // again before an earlier answer arrives. The old data stays up meanwhile.
  const rangeRequestRef = useRef(0);
  useEffect(() => {
    const request = ++rangeRequestRef.current;
    setLoadError(false);
    apiClient
      .get<LeaveScheduleData>(`/api/leave-schedule?from=${range.from}&to=${range.to}`)
      .then((next) => {
        if (request === rangeRequestRef.current) setData(next);
      })
      .catch(() => {
        // Stored as a flag so the message follows the interface language.
        if (request === rangeRequestRef.current) setLoadError(true);
      });
  }, [range.from, range.to, reloadToken]);

  useEffect(() => {
    if (!absentToday) return;
    let cancelled = false;
    apiClient
      .get<LeaveScheduleData>(`/api/leave-schedule?from=${today}&to=${today}`)
      .then((next) => {
        if (!cancelled) setTodayLeaves(next.leaves);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [absentToday, reloadToken, today]);

  const overrides = useMemo(() => calendarOverrides(data?.calendarDays ?? []), [data?.calendarDays]);
  const timeline = useMemo(() => buildLeaveTimeline(range.from, range.to, overrides, today), [overrides, range, today]);
  const employeesById = useMemo(() => new Map((data?.employees ?? []).map((person) => [person.id, person])), [data?.employees]);
  const typesById = useMemo(() => new Map((data?.types ?? []).map((type) => [type.id, type])), [data?.types]);
  const planned = useMemo(
    () => plannedWorkingDays(data?.leaves ?? [], visibleWindow.from, visibleWindow.to, overrides),
    [data?.leaves, overrides, visibleWindow],
  );
  const visibleEmployees = useMemo(() => {
    const filtered = filterLeaveEmployees(
      data?.employees ?? [],
      todayLeaves,
      { search, departments, absentOn: absentToday ? today : null, showArchived },
      locale,
    );
    return sortLeaveEmployees(filtered, sort.key, sort.direction, planned, locale);
  }, [absentToday, data, departments, locale, planned, search, showArchived, sort, today, todayLeaves]);
  const groups = useMemo(
    () =>
      grouped
        ? groupLeaveEmployees(sortLeaveEmployees(visibleEmployees, "department", "asc", planned, locale)).map((group) => ({
            department: group.department,
            employees: sortLeaveEmployees(group.employees, sort.key === "department" ? "name" : sort.key, sort.direction, planned, locale),
          }))
        : [{ department: null, employees: visibleEmployees }],
    [grouped, locale, planned, sort, visibleEmployees],
  );
  const segments = useMemo(() => leaveSegments(data?.leaves ?? [], range.from, range.to), [data?.leaves, range]);
  const allDepartments = useMemo(() => leaveDepartments(data?.employees ?? [], locale), [data?.employees, locale]);
  const activeTypes = (data?.types ?? []).filter((type) => type.isActive);

  const openCreate = useCallback(
    (employeeId: string, startDate: string, endDate: string) => {
      const typeId = data?.types.find((type) => type.isActive)?.id ?? "";
      setEditor({ employeeId, typeId, startDate, endDate, comment: "" });
    },
    [data?.types],
  );
  const openEdit = useCallback((leave: LeaveRecord) => setEditor({ ...leave }), []);

  const saveLeave = async (draft: LeaveDraft) => {
    const body = {
      employeeId: draft.employeeId,
      typeId: draft.typeId,
      startDate: draft.startDate,
      endDate: draft.endDate,
      comment: draft.comment,
    };
    if (draft.id) await apiClient.patch(`/api/leave-schedule/leaves/${draft.id}`, body);
    else await apiClient.post("/api/leave-schedule/leaves", body);
    setEditor(null);
    setNotice(t("ui.leave.saved"));
    reload();
  };

  const deleteLeave = async (leave: LeaveDraft) => {
    const type = typesById.get(leave.typeId);
    const confirmed = await confirm({
      title: t("ui.leave.deleteLeaveTitle"),
      message: t("ui.leave.deleteLeaveMessage", {
        employee: employeesById.get(leave.employeeId)?.name ?? "",
        type: leaveTypeLabel(type, locale),
        start: leave.startDate,
        end: leave.endDate,
      }),
      confirmLabel: t("ui.leave.delete"),
      tone: "danger",
    });
    if (!confirmed) return;
    await apiClient.delete(`/api/leave-schedule/leaves/${leave.id}`);
    setEditor(null);
    setNotice(t("ui.leave.deleted"));
    reload();
  };

  const toggleSort = (key: LeaveSortKey) =>
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));


  return (
    <section className="v2-page leave-page">
      {/* The section tab names the page on screen; this keeps a heading for assistive tech. */}
      <h1 className="sr-only">{t("ui.leave.title")}</h1>
      <div className="v2-compact-header leave-page-header">
        {/* The page title comes from the app header; this line explains the page. */}
        <p className="leave-page-description">{t("ui.leave.description")}</p>
        {canEdit && (
          <div className="leave-header-actions">
            <button onClick={() => setDialog("employees")} type="button">
              <Users aria-hidden="true" size={15} />
              {t("ui.leave.employees")}
            </button>
            <button onClick={() => setDialog("types")} type="button">
              <Settings2 aria-hidden="true" size={15} />
              {t("ui.leave.leaveTypes")}
            </button>
            <button
              className="primary"
              disabled={!data || activeTypes.length === 0}
              onClick={() => openCreate("", today, today)}
              type="button"
            >
              <Plus aria-hidden="true" size={15} />
              {t("ui.leave.addLeave")}
            </button>
          </div>
        )}
      </div>

      <div className="leave-tabs-row">
        <div className="leave-tabs" role="tablist" aria-label={t("ui.leave.title")}>
          {(["schedule", "list", "calendar"] as const).map((value) => (
            <button
              aria-selected={tab === value}
              className={tab === value ? "active" : ""}
              key={value}
              onClick={() => setTab(value)}
              role="tab"
              type="button"
            >
              {t(value === "schedule" ? "ui.leave.tabSchedule" : value === "list" ? "ui.leave.tabList" : "ui.leave.tabCalendar")}
            </button>
          ))}
        </div>
        {tab !== "calendar" && (
          <ul className="leave-legend" aria-label={t("ui.leave.title")}>
            <li>
              <i className="leave-legend-working" aria-hidden="true" />
              {t("ui.leave.workingTime")}
            </li>
            <li>
              <i className="leave-legend-off" aria-hidden="true" />
              {t("ui.leave.nonWorkingTime")}
            </li>
            {activeTypes.map((type: LeaveType) => (
              <li key={type.id}>
                <i aria-hidden="true" style={{ backgroundColor: type.color }} />
                {leaveTypeLabel(type, locale)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {tab === "calendar" ? (
        <LeaveCalendarTab canEdit={canEdit} initialYear={Number(today.slice(0, 4))} onChanged={reload} today={today} />
      ) : (
        <>
          <div className="leave-toolbar">
            <div className="leave-period-nav">
              <button
                onClick={() => {
                  setTab("schedule");
                  setTodayRequest((value) => value + 1);
                }}
                type="button"
              >
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
                      // Load enough around the current left edge for the new scale.
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
                aria-label={t("ui.leave.searchPlaceholder")}
                className="leave-search"
                placeholder={t("ui.leave.searchPlaceholder")}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <details className="leave-departments">
                <summary>
                  {departments.length === 0
                    ? t("ui.leave.departmentsAll")
                    : t("ui.leave.departmentsSelected", { count: departments.length })}
                </summary>
                <div>
                  {allDepartments.map((department) => (
                    <label key={department}>
                      <input
                        checked={departments.includes(department)}
                        type="checkbox"
                        onChange={(event) =>
                          setDepartments((current) =>
                            event.target.checked ? [...current, department] : current.filter((item) => item !== department),
                          )
                        }
                      />
                      {department}
                    </label>
                  ))}
                </div>
              </details>
              <label className="leave-check">
                <input checked={absentToday} type="checkbox" onChange={(event) => setAbsentToday(event.target.checked)} />
                {t("ui.leave.absentToday")}
              </label>
              <label className="leave-check">
                <input checked={grouped} type="checkbox" onChange={(event) => setGrouped(event.target.checked)} />
                {t("ui.leave.groupByDepartment")}
              </label>
              <label className="leave-check">
                <input checked={showArchived} type="checkbox" onChange={(event) => setShowArchived(event.target.checked)} />
                {t("ui.leave.showArchived")}
              </label>
            </div>
          </div>

          {loadError && (
            <div className="empty-state" role="alert">
              <span>{t("ui.leave.loadFailed")}</span>
              <button onClick={reload} type="button">
                {t("ui.leave.retry")}
              </button>
            </div>
          )}
          {!data && !loadError && (
            <div className="empty-state" role="status">
              {t("ui.leave.loading")}
            </div>
          )}
          {data && tab === "schedule" && (
            <>
              {canEdit && data.employees.length > 0 && <p className="leave-hint">{t("ui.leave.dragHint")}</p>}
              {data.employees.length === 0 ? (
                <div className="empty-state">{t("ui.leave.noEmployees")}</div>
              ) : visibleEmployees.length === 0 ? (
                <div className="empty-state">{t("ui.leave.noEmployeesForFilters")}</div>
              ) : (
                <LeaveScheduleGrid
                  onExtend={extendRange}
                  onVisibleWindowChange={setVisibleWindow}
                  range={range}
                  today={today}
                  todayRequest={todayRequest}
                  showDepartment={!grouped}
                  canEdit={canEdit && activeTypes.length > 0}
                  employeesById={employeesById}
                  groups={groups}
                  horizon={horizon}
                  onCreate={openCreate}
                  onOpen={openEdit}
                  onSort={toggleSort}
                  overrides={overrides}
                  planned={planned}
                  segments={segments}
                  sort={sort}
                  timeline={timeline}
                  typesById={typesById}
                />
              )}
            </>
          )}
          {data && tab === "list" && (
            <LeaveListTab
              canEdit={canEdit}
              employeesById={employeesById}
              leaves={data.leaves}
              onBulkDelete={async (ids) => {
                await apiClient.post("/api/leave-schedule/leaves/bulk-delete", { ids });
                setNotice(t("ui.leave.deleted"));
                reload();
              }}
              onOpen={openEdit}
              overrides={overrides}
              period={visibleWindow}
              types={data.types}
              typesById={typesById}
              visibleEmployeeIds={new Set(visibleEmployees.map((person) => person.id))}
            />
          )}
        </>
      )}

      {editor && data && (
        <LeaveEditorDialog
          employees={data.employees}
          initial={editor}
          leaves={data.leaves}
          onClose={() => setEditor(null)}
          onDelete={editor.id ? () => deleteLeave(editor) : undefined}
          onSave={saveLeave}
          overrides={overrides}
          types={data.types}
        />
      )}
      {dialog === "employees" && data && (
        <LeaveEmployeesDialog
          canLinkUsers={canLinkUsers}
          departments={allDepartments}
          employees={data.employees}
          onClose={() => setDialog(null)}
          onCreate={async (draft) => {
            await apiClient.post("/api/leave-schedule/employees", draft);
            reload();
          }}
          onRemove={async (employee: LeaveEmployee) => {
            const result = await apiClient.delete<{ archived: boolean }>(`/api/leave-schedule/employees/${employee.id}`);
            if (result?.archived) setNotice(t("ui.leave.employeeArchived", { name: employee.name }));
            reload();
          }}
          onUpdate={async (employee, patch) => {
            await apiClient.patch(`/api/leave-schedule/employees/${employee.id}`, patch);
            reload();
          }}
        />
      )}
      {dialog === "types" && data && (
        <LeaveTypesDialog
          onClose={() => setDialog(null)}
          onCreate={async (draft) => {
            await apiClient.post("/api/leave-schedule/types", { ...draft, sortOrder: (data.types.length + 1) * 10 });
            reload();
          }}
          onUpdate={async (type, patch) => {
            await apiClient.patch(`/api/leave-schedule/types/${type.id}`, patch);
            reload();
          }}
          types={data.types}
        />
      )}
    </section>
  );
}
