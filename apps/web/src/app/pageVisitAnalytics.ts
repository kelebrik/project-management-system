import { viewLabel } from "../i18n/navigation";
import type { Locale, Translator } from "../i18n/types";

export type PageVisitAnalyticsReport = {
  range: {
    from: string;
    to: string;
    days: number;
    timezoneOffsetMinutes: number;
    retentionDays: number;
  };
  totals: {
    views: number;
    authenticatedViews: number;
    anonymousViews: number;
    uniqueAuthenticated: number;
    uniqueAnonymous: number;
  };
  daily: Array<{
    date: string;
    authenticatedViews: number;
    anonymousViews: number;
    totalViews: number;
  }>;
  visitors: Array<{
    visitorKey: string;
    kind: "USER" | "ANONYMOUS";
    displayName: string;
    views: number;
    projectCount: number;
    lastVisitedAt: string;
  }>;
  breakdown: Array<{
    visitorKey: string;
    kind: "USER" | "ANONYMOUS";
    displayName: string;
    projectId: string | null;
    projectCode: string | null;
    projectName: string | null;
    pageKey: string;
    pageTitle: string;
    views: number;
    lastVisitedAt: string;
  }>;
};

type PageVisitVisitor = Pick<PageVisitAnalyticsReport["visitors"][number], "visitorKey" | "kind" | "displayName">;

/** The API names visitors in Russian; rebuild guest and deleted-user names in the interface language. */
export function visitorDisplayName(visitor: PageVisitVisitor, t: Translator) {
  if (visitor.kind === "ANONYMOUS") {
    const hash = visitor.visitorKey.replace(/^anonymous:/, "");
    return t("ui.admin.guestVisitor", { id: hash.slice(0, 6).toUpperCase() });
  }
  if (visitor.visitorKey === "user:deleted:unknown") return t("ui.admin.deletedUser");
  return visitor.displayName;
}

export function visitPageTitle(item: Pick<PageVisitAnalyticsReport["breakdown"][number], "pageKey" | "pageTitle">, locale: Locale) {
  return viewLabel(item.pageKey, locale) ?? item.pageTitle;
}

export function attendanceChartBars(
  daily: PageVisitAnalyticsReport["daily"],
  plotHeight = 150,
) {
  const maximum = Math.max(1, ...daily.map((day) => day.totalViews));
  return daily.map((day) => ({
    ...day,
    authenticatedHeight: (day.authenticatedViews / maximum) * plotHeight,
    anonymousHeight: (day.anonymousViews / maximum) * plotHeight,
  }));
}
