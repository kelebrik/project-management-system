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
