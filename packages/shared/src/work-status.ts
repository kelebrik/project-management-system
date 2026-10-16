/**
 * Work that is over: done, cancelled or failed (BLOCKED, shown as «Провалено»).
 * Failed work is final like done work: it is not open, not overdue and not
 * current. Only done work counts as completed.
 */
export const CLOSED_WORK_STATUSES = ["DONE", "CANCELLED", "BLOCKED"] as const;

export function isClosedWorkStatus(status: string) {
  return (CLOSED_WORK_STATUSES as readonly string[]).includes(status);
}

/** Statuses that carry the day the work was closed: done and failed. */
export const DATED_CLOSE_STATUSES = ["DONE", "BLOCKED"] as const;

export function closesWithDate(status: string) {
  return (DATED_CLOSE_STATUSES as readonly string[]).includes(status);
}
