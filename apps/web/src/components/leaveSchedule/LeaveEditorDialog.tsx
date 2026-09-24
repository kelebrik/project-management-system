import { useMemo, useState } from "react";
import {
  calendarDaysInRange,
  dayToDate,
  findOverlappingLeave,
  leaveTypeLabel,
  workingDaysInRange,
  type LeaveCalendarDay,
  type LeaveEmployee,
  type LeaveRecord,
  type LeaveType,
} from "../../app/leaveScheduleModel";
import { useI18n } from "../../i18n/I18nProvider";
import { intlLocale } from "../../i18n/locale";
import { LeaveDialog } from "./LeaveDialog";

export type LeaveDraft = Omit<LeaveRecord, "id"> & { id?: string };

export function LeaveEditorDialog({
  initial,
  employees,
  types,
  leaves,
  overrides,
  onSave,
  onDelete,
  onClose,
}: {
  initial: LeaveDraft;
  employees: LeaveEmployee[];
  types: LeaveType[];
  leaves: LeaveRecord[];
  overrides: Map<string, LeaveCalendarDay>;
  onSave: (draft: LeaveDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [draft, setDraft] = useState<LeaveDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(intlLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
    [locale],
  );
  // An archived person or a disabled type stays selectable for the leave that already uses it.
  const employeeOptions = employees.filter((employee) => employee.isActive || employee.id === initial.employeeId);
  const typeOptions = types.filter((type) => type.isActive || type.id === initial.typeId);
  const datesValid = Boolean(draft.startDate && draft.endDate && draft.startDate <= draft.endDate);
  const overlap = datesValid && draft.employeeId ? findOverlappingLeave(leaves, { ...draft }) : null;
  const overlapType = overlap ? types.find((type) => type.id === overlap.typeId) : undefined;
  const canSave = Boolean(draft.employeeId && draft.typeId && datesValid && !overlap && !saving);

  const run = async (action: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
      setSaving(false);
    }
  };

  return (
    <LeaveDialog
      closeLabel={t("ui.leave.close")}
      onClose={onClose}
      title={initial.id ? t("ui.leave.editLeave") : t("ui.leave.newLeave")}
      footer={
        <>
          {onDelete && (
            <button className="leave-danger-button" disabled={saving} onClick={() => void run(onDelete)} type="button">
              {t("ui.leave.delete")}
            </button>
          )}
          <span className="leave-dialog-spacer" />
          <button disabled={saving} onClick={onClose} type="button">
            {t("ui.leave.cancel")}
          </button>
          <button className="primary" disabled={!canSave} onClick={() => void run(() => onSave(draft))} type="button">
            {t("ui.leave.save")}
          </button>
        </>
      }
    >
      <div className="leave-form">
        <label>
          <span>{t("ui.leave.employee")}</span>
          <select
            value={draft.employeeId}
            onChange={(event) => setDraft({ ...draft, employeeId: event.target.value })}
          >
            <option value="">{t("ui.leave.chooseEmployee")}</option>
            {employeeOptions.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.department ? `${employee.name} · ${employee.department}` : employee.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("ui.leave.type")}</span>
          <select value={draft.typeId} onChange={(event) => setDraft({ ...draft, typeId: event.target.value })}>
            {typeOptions.map((type) => (
              <option key={type.id} value={type.id}>
                {leaveTypeLabel(type, locale)}
              </option>
            ))}
          </select>
        </label>
        <div className="leave-form-row">
          <label>
            <span>{t("ui.leave.startDate")}</span>
            <input
              type="date"
              value={draft.startDate}
              onChange={(event) => {
                const startDate = event.target.value;
                setDraft({ ...draft, startDate, endDate: draft.endDate < startDate ? startDate : draft.endDate });
              }}
            />
          </label>
          <label>
            <span>{t("ui.leave.endDate")}</span>
            <input
              min={draft.startDate}
              type="date"
              value={draft.endDate}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })}
            />
          </label>
        </div>
        <p className="leave-form-duration" aria-live="polite">
          <span>{t("ui.leave.duration")}:</span>{" "}
          <strong>
            {datesValid
              ? t("ui.leave.tooltipDays", {
                  working: workingDaysInRange(draft.startDate, draft.endDate, overrides),
                  calendar: calendarDaysInRange(draft.startDate, draft.endDate),
                })
              : "—"}
          </strong>
        </p>
        {overlap && (
          <p className="leave-form-error" role="alert">
            {t("ui.leave.overlapWarning", {
              type: leaveTypeLabel(overlapType, locale),
              start: dateFormat.format(dayToDate(overlap.startDate)),
              end: dateFormat.format(dayToDate(overlap.endDate)),
            })}
          </p>
        )}
        <label>
          <span>{t("ui.leave.comment")}</span>
          <textarea
            maxLength={2000}
            rows={3}
            value={draft.comment}
            onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
          />
        </label>
        {error && (
          <p className="leave-form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </LeaveDialog>
  );
}
