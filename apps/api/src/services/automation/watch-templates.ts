/**
 * What the watching rules pick out of the project, as pure functions over
 * plain rows: decisions waiting for an answer, risks missing an owner or a
 * date, overdue issues, work due soon and not started, milestones close with
 * work behind them, change requests left lying. Dates are calendar days
 * (YYYY-MM-DD) in the team's time zone.
 */

const DAY_MS = 86_400_000;
const CLOSED_ISSUE = new Set(['Done', 'Closed', 'Resolved']);
const CLOSED_WORK = new Set(['DONE', 'CANCELLED']);
const OPEN_CHANGE = new Set(['DRAFT', 'SUBMITTED', 'IN_REVIEW']);

export const isoDay = (value: Date) => value.toISOString().slice(0, 10);
export const addDays = (day: string, days: number) => isoDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS));
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / DAY_MS);

export type DecisionSource = { id: string; title: string; status: string; approverUserId: string | null; approverName: string | null; requestedAt: Date | null; createdAt: Date };

/** Decisions sent for approval at least `days` ago and still unanswered; each request fires once. */
export function waitingDecisions(decisions: DecisionSource[], today: string, days: number) {
  return decisions.flatMap((decision) => {
    if (decision.status !== 'PENDING_APPROVAL') return [];
    const since = isoDay(decision.requestedAt ?? decision.createdAt);
    const waited = daysBetween(since, today);
    return waited >= days ? [{ decision, waited, dedupeKey: `decision:${decision.id}:${since}` }] : [];
  });
}

export type RiskSource = { id: string; title: string; type: string; status: string; owner: string; dueDate: Date | null };

/** Open risks nobody owns or nobody dated. */
export function incompleteRisks(risks: RiskSource[]) {
  return risks.filter((risk) => risk.type === 'RISK' && risk.status !== 'CLOSED' && risk.status !== 'VALIDATED' && (!risk.owner.trim() || !risk.dueDate));
}

/** The ones not reported before; on the first run all of them, since each is a gap to close, not a change. */
export function notSeenBefore<T extends { id: string }>(previousIds: string[] | undefined, current: T[]) {
  const seen = new Set(previousIds ?? []);
  return { fresh: current.filter((row) => !seen.has(row.id)), ids: current.map((row) => row.id) };
}

export type IssueSource = { id: string; title: string; status: string; owner: string; dueDate: Date | null };

/** Open issues past their date by more than the grace days; each date fires once. */
export function overdueIssues(issues: IssueSource[], today: string, graceDays: number) {
  return issues.flatMap((issue) => {
    if (CLOSED_ISSUE.has(issue.status) || !issue.dueDate) return [];
    const due = isoDay(issue.dueDate);
    const late = daysBetween(due, today);
    return late > graceDays ? [{ issue, due, late, dedupeKey: `issue:${issue.id}:${due}` }] : [];
  });
}

export type WorkSource = { id: string; code: string; title: string; status: string; owner: string; dueDate: Date | null };

/** Work not started whose date falls within the next `days` days, today included; each date fires once. */
export function dueSoonWork(rows: WorkSource[], today: string, days: number) {
  const last = addDays(today, days);
  return rows.flatMap((row) => {
    if (row.status !== 'NOT_STARTED' || !row.dueDate) return [];
    const due = isoDay(row.dueDate);
    return due >= today && due <= last ? [{ row, due, dedupeKey: `due:${row.id}:${due}` }] : [];
  });
}

export type MilestoneSource = { id: string; code: string; title: string; type: string; status: string; dueDate: Date | null };
export type FeederSource = { id: string; status: string; progress: number };

/**
 * Milestones and goals due within `days` days whose work before them (their
 * children and the rows linked into them) has something not started or below
 * the progress threshold.
 */
export function milestonesAtRisk(
  milestones: MilestoneSource[],
  feedersOf: (milestoneId: string) => FeederSource[],
  today: string,
  days: number,
  minProgress: number,
) {
  const last = addDays(today, days);
  return milestones.flatMap((milestone) => {
    if ((milestone.type !== 'MILESTONE' && milestone.type !== 'GOAL') || CLOSED_WORK.has(milestone.status) || !milestone.dueDate) return [];
    const due = isoDay(milestone.dueDate);
    if (due < today || due > last) return [];
    const lagging = feedersOf(milestone.id).filter((row) => !CLOSED_WORK.has(row.status) && (row.status === 'NOT_STARTED' || row.progress < minProgress)).length;
    return lagging > 0 ? [{ milestone, due, lagging, dedupeKey: `milestone:${milestone.id}:${due}` }] : [];
  });
}

export type ChangeSource = { id: string; title: string; status: string; updatedAt: Date };

/** Change requests open and untouched for at least `days` days; each status fires once. */
export function pendingChanges(changes: ChangeSource[], today: string, days: number) {
  return changes.flatMap((change) => {
    if (!OPEN_CHANGE.has(change.status)) return [];
    const idle = daysBetween(isoDay(change.updatedAt), today);
    return idle >= days ? [{ change, idle, dedupeKey: `change:${change.id}:${change.status}` }] : [];
  });
}
