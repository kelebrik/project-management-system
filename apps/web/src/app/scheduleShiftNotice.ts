/** Sent when a save moved a milestone or goal past its baseline without a reason; carries the journal operation. */
export const SCHEDULE_SHIFT_REASON_EVENT = "pms:schedule-shift-reason";
/** Sent when reasons were saved, so the journal on the page reloads. */
export const SCHEDULE_SHIFTS_CHANGED_EVENT = "pms:schedule-shifts-changed";

/** Reads the journal headers of a structure save and asks for a reason when one is needed. */
export function noticeScheduleShift(response: Pick<Response, "headers">) {
  const operationId = response.headers.get("X-Schedule-Shift-Operation-Id");
  const needed = Number(response.headers.get("X-Schedule-Shift-Reason-Needed") ?? 0);
  if (!operationId || !(needed > 0) || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SCHEDULE_SHIFT_REASON_EVENT, { detail: { operationId } }));
}
