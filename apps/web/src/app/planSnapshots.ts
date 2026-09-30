export type PlanSnapshotSummary = { id: string; name: string; takenAt: string; createdByName: string | null; rowCount: number };
type Brief = { id: string; code: string; title: string; type: string };
export type PlanChange = Brief & {
  checkpoint: boolean;
  startDays: number | null;
  dueDays: number | null;
  from: { startDate: string | null; dueDate: string | null; status: string; owner: string };
  to: { startDate: string | null; dueDate: string | null; status: string; owner: string };
  moved: boolean;
  statusChanged: boolean;
  ownerChanged: boolean;
};
export type PlanComparison = {
  changes: PlanChange[];
  added: Brief[];
  removed: Brief[];
  summary: { changed: number; moved: number; later: number; earlier: number; added: number; removed: number };
};

/** A default name for a snapshot taken today: "Committee 01.10". */
export function defaultSnapshotName(prefix: string, now = new Date()) {
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${prefix} ${day}.${month}`;
}
