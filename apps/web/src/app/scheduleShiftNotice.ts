import { noteShiftSession } from "./shiftSessions";

/** Sent when reasons were saved, so the journal on the page reloads. */
export const SCHEDULE_SHIFTS_CHANGED_EVENT = "pms:schedule-shifts-changed";

/**
 * Reads the journal headers of a save: the editing session it joined and its
 * project and person, as the server tells them, whatever page is shown by now. The reason
 * for the moves is asked once the session ends, not after each save.
 */
export function noticeScheduleShift(response: Pick<Response, "headers">) {
  const sessionId = response.headers.get("X-Schedule-Shift-Session-Id");
  const projectId = response.headers.get("X-Schedule-Shift-Project-Id");
  const actorId = response.headers.get("X-Schedule-Shift-Actor-Id");
  if (!sessionId || !projectId || !actorId) return;
  noteShiftSession(projectId, sessionId, actorId);
}
