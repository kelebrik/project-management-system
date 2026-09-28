import { buildWbsPredecessorRefs, wbsDateLinks, type WbsPredecessorLink } from "@pms/shared";
import type { WbsDependency, WbsItem } from "./domainTypes";
import { describeDateHold, type ScheduleLink } from "./scheduleLinks";
import type { Translator } from "../i18n/types";

/** The dates a row was saved with, as typed: YYYY-MM-DD or empty. */
export type SentWbsDates = { startDate: string; dueDate: string; workDays: string };

const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");

/**
 * Warnings for dates the user changed but the schedule put back because links
 * set them, e.g. a finish held by a finish-to-finish link. A date moved for any
 * other reason (a weekend, a calendar) is not reported.
 */
export function scheduleOverrideNotices({
  sent,
  before,
  saved,
  dependencies,
  t,
  formatDay,
}: {
  sent: Record<string, SentWbsDates>;
  before: WbsItem[];
  saved: WbsItem[];
  dependencies: WbsDependency[];
  t: Translator;
  formatDay: (day: string) => string;
}) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const refs = buildWbsPredecessorRefs(saved, dependencies);
  const describe = (links: WbsPredecessorLink[]): ScheduleLink[] =>
    links.map((link) => {
      const predecessor = savedById.get(link.predecessorId);
      return { code: predecessor?.code ?? "", title: predecessor?.title ?? "", type: link.type, lagDays: link.lagDays };
    });
  const notices: string[] = [];
  for (const [itemId, dates] of Object.entries(sent)) {
    const previous = beforeById.get(itemId);
    const item = savedById.get(itemId);
    if (!previous || !item) continue;
    const links = wbsDateLinks(refs.get(itemId) ?? []);
    const how = t("ui.scheduleLinks.howToChange");
    const startAsked = dates.startDate && dates.startDate !== day(previous.startDate);
    if (startAsked && links.start.length > 0 && day(item.startDate) !== dates.startDate && item.startDate) {
      notices.push(
        t("ui.scheduleLinks.startKept", {
          code: item.code,
          date: formatDay(day(item.startDate)),
          reason: describeDateHold("start", describe(links.start), t),
          how,
        }),
      );
    }
    const finishAsked =
      (dates.dueDate && dates.dueDate !== day(previous.dueDate)) ||
      (dates.workDays !== "" && Number(dates.workDays) !== previous.workDays);
    const finishKept = dates.dueDate && dates.dueDate !== day(previous.dueDate)
      ? day(item.dueDate) !== dates.dueDate
      : day(item.dueDate) === day(previous.dueDate);
    if (finishAsked && links.finish.length > 0 && finishKept && item.dueDate) {
      notices.push(
        t("ui.scheduleLinks.finishKept", {
          code: item.code,
          date: formatDay(day(item.dueDate)),
          reason: describeDateHold("finish", describe(links.finish), t),
          how,
        }),
      );
    }
  }
  return notices;
}
