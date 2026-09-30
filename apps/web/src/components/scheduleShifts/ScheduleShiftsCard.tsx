import { useEffect, useState } from "react";
import { SCHEDULE_SHIFTS_CHANGED_EVENT } from "../../app/scheduleShiftNotice";
import { apiClient } from "../../api/client";
import { shiftStepCause, type ShiftLadder } from "../../app/scheduleShifts";
import { useOpenFactRef } from "../../hooks/useOpenFactRef";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import { ShiftReasonForm } from "./ShiftReasonForm";
import "../../styles/schedule-shifts.css";

/** Days by reason for the ladder's summary line, the biggest first; days before the journal come last. */
function reasonSummary(ladder: ShiftLadder): Array<[string, number]> {
  const entries = Object.entries(ladder.reasonDays ?? {}).sort((left, right) => right[1] - left[1]);
  if ((ladder.unexplainedDays ?? 0) > 0) entries.push(["BEFORE", ladder.unexplainedDays!]);
  return entries;
}

/**
 * Why checkpoints moved: for every milestone or goal off its baseline, the
 * steps from the baseline to today's date with what caused each, and the
 * days the journal cannot explain because they happened before it existed.
 */
export function ScheduleShiftsCard({ projectId, refreshKey }: { projectId: string; refreshKey?: unknown }) {
  const { t, formatters } = useI18n();
  const openRef = useOpenFactRef();
  const [ladders, setLadders] = useState<ShiftLadder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const ctx = usePageContext();
  const canGiveReasons = !ctx.isReadOnly && !ctx.isClosedProject;
  const risks = ((ctx.project?.id === projectId ? ctx.project?.raidItems : null) ?? [])
    .filter((item: { type: string; status: string }) => (item.type === "RISK" || item.type === "DEPENDENCY") && item.status !== "CLOSED" && item.status !== "VALIDATED")
    .map((item: { id: string; title: string }) => ({ id: item.id, title: item.title }));

  useEffect(() => {
    const reload = () => setReloads((value) => value + 1);
    window.addEventListener(SCHEDULE_SHIFTS_CHANGED_EVENT, reload);
    return () => window.removeEventListener(SCHEDULE_SHIFTS_CHANGED_EVENT, reload);
  }, []);

  useEffect(() => {
    let active = true;
    apiClient
      .get<{ checkpoints: ShiftLadder[] }>(`/api/projects/${projectId}/schedule-shifts`)
      .then((answer) => {
        if (!active) return;
        setLadders(answer.checkpoints);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [projectId, refreshKey, reloads]);

  const days = (value: number | null) => formatters.signedDaysLabel(value);
  return (
    <article className="executive-overview-card schedule-shifts-card" id="schedule-shifts">
      <div className="executive-overview-card-title">
        <span>{t("ui.shifts.title")}</span>
        {ladders && <strong>{ladders.length}</strong>}
      </div>
      {failed && <p>{t("ui.shifts.loadFailed")}</p>}
      {ladders && ladders.length === 0 && <p>{t("ui.shifts.none")}</p>}
      {ladders?.map((ladder) => (
        <section className="schedule-shift-ladder" key={ladder.id} aria-label={`${ladder.code} ${ladder.title}`}>
          <header>
            <button className="executive-overview-risk-link" onClick={() => openRef({ kind: "wbs", id: ladder.id, label: ladder.code })} type="button">
              {ladder.code} {ladder.title}
            </button>
            {ladder.isActiveGoal && <span className="schedule-shift-goal">{t("ui.shifts.activeGoal")}</span>}
            <span className="schedule-shift-total">
              {t("ui.shifts.baseline")} {formatters.date(ladder.baselineDate)} → {formatters.date(ladder.currentDate)}{" "}
              <strong className={(ladder.varianceDays ?? 0) > 0 ? "late" : "early"}>{days(ladder.varianceDays)}</strong>
            </span>
          </header>
          {reasonSummary(ladder).length > 0 && (
            <p className="schedule-shift-reasons">
              {t("ui.shifts.byReason")}{" "}
              {reasonSummary(ladder).map(([key, value]) => (
                <span className={`schedule-shift-reason-chip ${key === "NONE" || key === "BEFORE" ? "missing" : ""}`} key={key}>
                  {t(`ui.shifts.reason.${key}` as "ui.shifts.reason.NONE")} {days(value)}
                </span>
              ))}
            </p>
          )}
          <ol className="schedule-shift-steps">
            {ladder.unexplainedDays !== null && ladder.unexplainedDays !== 0 && (
              <li className="schedule-shift-step unexplained">
                <strong>{days(ladder.unexplainedDays)}</strong>
                <span>{t("ui.shifts.unexplained")}</span>
              </li>
            )}
            {ladder.earlierSteps && (
              <li className="schedule-shift-step folded">
                <strong>{days(ladder.earlierSteps.deltaDays)}</strong>
                <span>{t("ui.shifts.earlier", { count: ladder.earlierSteps.count })}</span>
              </li>
            )}
            {ladder.steps.map((step) => (
              <li className="schedule-shift-step" key={step.id}>
                <strong className={(step.deltaDays ?? 0) > 0 ? "late" : "early"}>
                  {step.deltaDays === null ? t("ui.shifts.dateSet") : days(step.deltaDays)}
                </strong>
                <span>
                  {step.sourceItemId && step.sourceItemId !== ladder.id && step.sourceCode ? (
                    <button className="link-button" onClick={() => openRef({ kind: "wbs", id: step.sourceItemId!, label: step.sourceCode! })} type="button">
                      {shiftStepCause(step, ladder.id, t, formatters.date)}
                    </button>
                  ) : (
                    shiftStepCause(step, ladder.id, t, formatters.date)
                  )}
                </span>
                <small>
                  {formatters.date(step.at)}
                  {step.actorName ? ` · ${step.actorName}` : ""}
                </small>
                <div className="schedule-shift-reason">
                  {step.reason && (
                    <span className="schedule-shift-reason-chip">
                      {t(`ui.shifts.reason.${step.reason.category}` as "ui.shifts.reason.NONE")}
                      {step.reason.text ? `: ${step.reason.text}` : ""}
                    </span>
                  )}
                  {canGiveReasons && editing !== step.id && (step.reason || step.needsReason) && (
                    <button className="link-button" onClick={() => setEditing(step.id)} type="button">
                      {step.reason ? t("ui.shifts.changeReason") : t("ui.shifts.giveReason")}
                    </button>
                  )}
                </div>
                {editing === step.id && (
                  <ShiftReasonForm
                    initial={step.reason}
                    onCancel={() => setEditing(null)}
                    onDone={() => setEditing(null)}
                    projectId={projectId}
                    risks={risks}
                    shiftIds={[step.id]}
                  />
                )}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
