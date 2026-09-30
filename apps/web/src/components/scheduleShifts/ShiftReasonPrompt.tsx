import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { SCHEDULE_SHIFT_REASON_EVENT } from "../../app/scheduleShiftNotice";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import "../../styles/schedule-shifts.css";
import { ShiftReasonForm } from "./ShiftReasonForm";

type PendingShift = { id: string; checkpointCode: string; checkpointTitle: string; deltaDays: number | null; newDate: string | null; baselineDate: string | null };
type Pending = { projectId: string; shifts: PendingShift[] };

/**
 * After a save that moved a milestone or goal past its baseline, asks why, in
 * one click, without blocking the work. Several saves in a row gather into one
 * question; closing it leaves the moves without a reason, which the Status
 * page shows.
 */
export function ShiftReasonPrompt() {
  const { t, formatters } = useI18n();
  const ctx = usePageContext();
  const [pending, setPending] = useState<Pending | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onReason = (event: Event) => {
      const operationId = (event as CustomEvent<{ operationId: string }>).detail?.operationId;
      if (!operationId) return;
      apiClient
        .get<{ projectId: string | null; shifts: PendingShift[] }>(`/api/schedule-shifts/operations/${encodeURIComponent(operationId)}`)
        .then((answer) => {
          if (!answer.projectId || answer.shifts.length === 0) return;
          setSaved(false);
          setPending((current) =>
            current && current.projectId === answer.projectId
              ? { projectId: current.projectId, shifts: [...current.shifts.filter((shift) => !answer.shifts.some((next) => next.id === shift.id)), ...answer.shifts] }
              : { projectId: answer.projectId!, shifts: answer.shifts },
          );
        })
        .catch(() => undefined);
    };
    window.addEventListener(SCHEDULE_SHIFT_REASON_EVENT, onReason);
    return () => window.removeEventListener(SCHEDULE_SHIFT_REASON_EVENT, onReason);
  }, []);

  if (saved) {
    return (
      <aside className="shift-reason-prompt" role="status">
        <span>{t("ui.shifts.reasonSaved")}</span>
        <button aria-label={t("ui.shifts.reasonCancel")} className="shift-reason-close" onClick={() => setSaved(false)} type="button">
          <X size={14} />
        </button>
      </aside>
    );
  }
  if (!pending) return null;
  // Risks and problems of the project on the page, when the moves are in it.
  const risks =
    ctx.project?.id === pending.projectId
      ? (ctx.project.raidItems ?? [])
          .filter((item: { type: string; status: string }) => (item.type === "RISK" || item.type === "DEPENDENCY") && item.status !== "CLOSED" && item.status !== "VALIDATED")
          .map((item: { id: string; title: string }) => ({ id: item.id, title: item.title }))
      : [];
  return (
    <aside aria-labelledby="shift-reason-title" className="shift-reason-prompt" role="dialog">
      <div className="shift-reason-head">
        <strong id="shift-reason-title">{t("ui.shifts.promptTitle")}</strong>
        <button aria-label={t("ui.shifts.reasonSkip")} className="shift-reason-close" onClick={() => setPending(null)} type="button">
          <X size={14} />
        </button>
      </div>
      <ul className="shift-reason-list">
        {pending.shifts.map((shift) => (
          <li key={shift.id}>
            {shift.checkpointCode} {shift.checkpointTitle}: <strong className="late">{formatters.signedDaysLabel(shift.deltaDays)}</strong>{" "}
            {t("ui.shifts.pastBaseline", { baseline: formatters.date(shift.baselineDate), date: formatters.date(shift.newDate) })}
          </li>
        ))}
      </ul>
      <ShiftReasonForm
        cancelLabel={t("ui.shifts.reasonSkip")}
        key={pending.shifts.map((shift) => shift.id).join()}
        onCancel={() => setPending(null)}
        onDone={() => {
          setPending(null);
          setSaved(true);
        }}
        projectId={pending.projectId}
        risks={risks}
        shiftIds={pending.shifts.map((shift) => shift.id)}
      />
    </aside>
  );
}
