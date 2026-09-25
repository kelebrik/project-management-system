import { ArrowDown, ArrowUp, Download, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  calendarDaysInRange,
  dayToDate,
  leaveCsv,
  leaveTypeLabel,
  workingDaysInRange,
  type LeaveCalendarDay,
  type LeaveEmployee,
  type LeaveRecord,
  type LeaveType,
} from "../../app/leaveScheduleModel";
import { useConfirm } from "../../hooks/useConfirm";
import { useI18n } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";

type ListSortKey = "employee" | "department" | "type" | "startDate" | "endDate" | "working";

type ListRow = {
  leave: LeaveRecord;
  employee: string;
  department: string;
  type: string;
  color: string;
  working: number;
  calendar: number;
};

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function LeaveListTab({
  leaves,
  visibleEmployeeIds,
  employeesById,
  types,
  typesById,
  overrides,
  period,
  canEdit,
  onOpen,
  onBulkDelete,
}: {
  leaves: LeaveRecord[];
  visibleEmployeeIds: Set<string>;
  employeesById: Map<string, LeaveEmployee>;
  types: LeaveType[];
  typesById: Map<string, LeaveType>;
  overrides: Map<string, LeaveCalendarDay>;
  period: { from: string; to: string };
  canEdit: boolean;
  onOpen: (leave: LeaveRecord) => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState<{ key: ListSortKey; direction: "asc" | "desc" }>({
    key: "startDate",
    direction: "asc",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  );

  const rows = useMemo(() => {
    const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
    const list: ListRow[] = leaves
      // The leaves that touch the days on screen in the schedule.
      .filter((leave) => leave.startDate <= period.to && leave.endDate >= period.from)
      .filter((leave) => visibleEmployeeIds.has(leave.employeeId) && (!typeFilter || leave.typeId === typeFilter))
      .map((leave) => {
        const employee = employeesById.get(leave.employeeId);
        const type = typesById.get(leave.typeId);
        return {
          leave,
          employee: employee?.name ?? "",
          department: employee?.department ?? "",
          type: leaveTypeLabel(type, locale),
          color: type?.color ?? "",
          working: workingDaysInRange(leave.startDate, leave.endDate, overrides),
          calendar: calendarDaysInRange(leave.startDate, leave.endDate),
        };
      });
    const value = (row: ListRow) =>
      sort.key === "startDate" || sort.key === "endDate" ? row.leave[sort.key] : sort.key === "working" ? row.working : row[sort.key];
    const sign = sort.direction === "asc" ? 1 : -1;
    return list.sort((left, right) => {
      const a = value(left);
      const b = value(right);
      const primary = typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
      return sign * (primary || collator.compare(left.employee, right.employee));
    });
  }, [employeesById, leaves, locale, overrides, period.from, period.to, sort, typeFilter, typesById, visibleEmployeeIds]);

  const selectedVisible = rows.filter((row) => selected.has(row.leave.id)).map((row) => row.leave.id);
  const allSelected = rows.length > 0 && selectedVisible.length === rows.length;

  const header = (key: ListSortKey, label: string) => (
    <th aria-sort={sort.key === key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className="leave-sort-button"
        onClick={() =>
          setSort((current) => ({
            key,
            direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
          }))
        }
        type="button"
      >
        {label}
        {sort.key === key &&
          (sort.direction === "asc" ? <ArrowDown aria-hidden="true" size={13} /> : <ArrowUp aria-hidden="true" size={13} />)}
      </button>
    </th>
  );

  const exportCsv = () => {
    const csv = leaveCsv(
      [
        t("ui.leave.employee"),
        t("ui.leave.department"),
        t("ui.leave.type"),
        t("ui.leave.startDate"),
        t("ui.leave.endDate"),
        t("ui.leave.workingDaysColumn"),
        t("ui.leave.calendarDaysColumn"),
        t("ui.leave.comment"),
      ],
      rows.map((row) => [
        row.employee,
        row.department,
        row.type,
        row.leave.startDate,
        row.leave.endDate,
        row.working,
        row.calendar,
        row.leave.comment,
      ]),
    );
    downloadCsv(`leave-schedule-${period.from}-${period.to}.csv`, csv);
  };

  return (
    <section className="leave-list">
      <div className="leave-list-toolbar">
        <span>
          {t("ui.leave.listPeriod", {
            from: dateFormat.format(dayToDate(period.from)),
            to: dateFormat.format(dayToDate(period.to)),
          })}
        </span>
        <select aria-label={t("ui.leave.type")} value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">{t("ui.leave.allTypes")}</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {leaveTypeLabel(type, locale)}
            </option>
          ))}
        </select>
        <span className="leave-dialog-spacer" />
        {canEdit && (
          <button
            className="leave-danger-button"
            disabled={selectedVisible.length === 0}
            onClick={async () => {
              const confirmed = await confirm({
                title: t("ui.leave.deleteSelectedTitle", { count: selectedVisible.length }),
                confirmLabel: t("ui.leave.delete"),
                tone: "danger",
              });
              if (!confirmed) return;
              await onBulkDelete(selectedVisible);
              setSelected(new Set());
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={15} />
            {t("ui.leave.deleteSelected", { count: selectedVisible.length })}
          </button>
        )}
        <button disabled={rows.length === 0} onClick={exportCsv} type="button">
          <Download aria-hidden="true" size={15} />
          {t("ui.leave.exportCsv")}
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">{t("ui.leave.noLeaves")}</div>
      ) : (
        <table className="leave-table leave-list-table">
          <thead>
            <tr>
              {canEdit && (
                <th className="leave-check-cell">
                  <input
                    aria-label={t("ui.leave.selectAll")}
                    checked={allSelected}
                    type="checkbox"
                    onChange={(event) =>
                      setSelected(event.target.checked ? new Set(rows.map((row) => row.leave.id)) : new Set())
                    }
                  />
                </th>
              )}
              {header("employee", t("ui.leave.employee"))}
              {header("department", t("ui.leave.department"))}
              {header("type", t("ui.leave.type"))}
              {header("startDate", t("ui.leave.startDate"))}
              {header("endDate", t("ui.leave.endDate"))}
              {header("working", t("ui.leave.workingDaysColumn"))}
              <th>{t("ui.leave.comment")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.leave.id}>
                {canEdit && (
                  <td className="leave-check-cell">
                    <input
                      aria-label={t("ui.leave.selectRow")}
                      checked={selected.has(row.leave.id)}
                      type="checkbox"
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(row.leave.id);
                          else next.delete(row.leave.id);
                          return next;
                        })
                      }
                    />
                  </td>
                )}
                <td>
                  {canEdit ? (
                    <button className="leave-link-button" onClick={() => onOpen(row.leave)} type="button">
                      {row.employee}
                    </button>
                  ) : (
                    row.employee
                  )}
                </td>
                <td>{row.department}</td>
                <td>
                  <span className="leave-type-chip">
                    <i aria-hidden="true" style={{ backgroundColor: row.color }} />
                    {row.type}
                  </span>
                </td>
                <td>{dateFormat.format(dayToDate(row.leave.startDate))}</td>
                <td>{dateFormat.format(dayToDate(row.leave.endDate))}</td>
                <td title={t("ui.leave.tooltipDays", { working: row.working, calendar: row.calendar })}>{row.working}</td>
                <td className="leave-comment-cell">{row.leave.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
