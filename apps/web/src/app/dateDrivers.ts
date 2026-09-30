export type DateDriverLink = { predecessorId: string; code: string; title: string; type: "FS" | "SS" | "FF" | "SF"; lagDays: number; date: string; binding: boolean };

export type DateDrivers = {
  itemId: string;
  code: string;
  title: string;
  kind: "SUMMARY" | "CHECKPOINT" | "TASK";
  startDate: string | null;
  dueDate: string | null;
  start: { links: DateDriverLink[]; setBy: "LINK" | "CHILDREN" | "MANUAL" | "NONE" };
  finish: {
    links: DateDriverLink[];
    setBy: "DURATION" | "LINK" | "CHILDREN" | "MANUAL" | "NONE";
    durationWorkDays: number | null;
    daysOff: { count: number; weekends: number; other: number; listed: Array<{ date: string; weekend: boolean; description: string | null }> };
  };
  children: { earliest: { id: string; code: string; title: string; date: string } | null; latest: { id: string; code: string; title: string; date: string } | null } | null;
  consistent: boolean;
};

/** "FS +2" style label of a link: its type and a signed lag in working days when there is one. */
export function linkLabel(link: Pick<DateDriverLink, "type" | "lagDays">) {
  return link.lagDays === 0 ? link.type : `${link.type} ${link.lagDays > 0 ? "+" : "−"}${Math.abs(link.lagDays)}`;
}

/** Days off inside the work: the counts from the server, and the listed holidays to name. */
export function daysOffSummary(daysOff: DateDrivers["finish"]["daysOff"]) {
  return { weekends: daysOff.weekends, other: daysOff.other, holidays: daysOff.listed.filter((entry) => !entry.weekend) };
}
