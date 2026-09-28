import type { Translator } from "../i18n/types";

/** A predecessor that fixes a date, as the workload API and the structure describe it. */
export type ScheduleLink = { code: string; title: string; type: string; lagDays: number };

const LINK_TYPE_KEYS = {
  FS: "ui.scheduleLinks.typeFS",
  SS: "ui.scheduleLinks.typeSS",
  FF: "ui.scheduleLinks.typeFF",
  SF: "ui.scheduleLinks.typeSF",
} as const;

/** «связь «окончание–окончание» с 1.1.5 «Название» (+3 раб. дн.)» */
export function describeScheduleLink(link: ScheduleLink, t: Translator) {
  const type = t(LINK_TYPE_KEYS[link.type as keyof typeof LINK_TYPE_KEYS] ?? LINK_TYPE_KEYS.FS);
  const lag = link.lagDays === 0 ? "" : t("ui.scheduleLinks.lag", { days: `${link.lagDays > 0 ? "+" : ""}${link.lagDays}` });
  return t("ui.scheduleLinks.link", { type, code: link.code, title: link.title, lag });
}

/** Why a date cannot be moved: the links that set it, joined for a sentence. */
export function describeScheduleLinks(links: ScheduleLink[], t: Translator) {
  return links.map((link) => describeScheduleLink(link, t)).join("; ");
}

/**
 * «Окончание задаёт связь …», or, with several links, that the latest of them
 * wins: the schedule takes the latest date any of them allows.
 */
export function describeDateHold(side: "start" | "finish", links: ScheduleLink[], t: Translator) {
  const text = describeScheduleLinks(links, t);
  if (side === "start") {
    return links.length > 1
      ? t("ui.scheduleLinks.startSetByMany", { links: text })
      : t("ui.scheduleLinks.startSetBy", { links: text });
  }
  return links.length > 1
    ? t("ui.scheduleLinks.finishSetByMany", { links: text })
    : t("ui.scheduleLinks.finishSetBy", { links: text });
}
