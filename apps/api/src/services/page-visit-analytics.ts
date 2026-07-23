import { appViewLabels, type AppViewKey } from '@pms/shared';

const DAY_MS = 86_400_000;
export const PAGE_VISIT_REPORT_DAYS = 7;

export type PageVisitAnalyticsRow = {
  actorType: 'USER' | 'ANONYMOUS';
  userId: string | null;
  userName: string | null;
  anonymousVisitorHash: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  pageKey: string;
  occurredAt: Date;
  user: {
    name: string;
    role: string;
  } | null;
};

export function clampTimezoneOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-840, Math.min(840, Math.trunc(parsed)));
}

export function pageVisitRetentionDays(value = process.env.PAGE_VISIT_RETENTION_DAYS) {
  const parsed = Number(value ?? 30);
  return Number.isFinite(parsed) ? Math.max(7, Math.trunc(parsed)) : 30;
}

export function pageVisitRetentionCutoff(now = new Date(), retentionDays = pageVisitRetentionDays()) {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}

export function pageVisitReportRange(
  now = new Date(),
  timezoneOffsetMinutes = 0,
  days = PAGE_VISIT_REPORT_DAYS,
) {
  const offset = clampTimezoneOffset(timezoneOffsetMinutes);
  const shiftedNow = new Date(now.getTime() - offset * 60_000);
  const year = shiftedNow.getUTCFullYear();
  const month = shiftedNow.getUTCMonth();
  const date = shiftedNow.getUTCDate();
  return {
    from: new Date(Date.UTC(year, month, date - days + 1) + offset * 60_000),
    to: new Date(Date.UTC(year, month, date + 1) + offset * 60_000),
    timezoneOffsetMinutes: offset,
  };
}

function localDayKey(value: Date, timezoneOffsetMinutes: number) {
  return new Date(value.getTime() - timezoneOffsetMinutes * 60_000)
    .toISOString()
    .slice(0, 10);
}

function anonymousLabel(hash: string | null) {
  return `Гость ${(hash ?? 'unknown').slice(0, 6).toUpperCase()}`;
}

function rowActor(row: PageVisitAnalyticsRow) {
  if (row.actorType === 'ANONYMOUS') {
    const hash = row.anonymousVisitorHash ?? 'unknown';
    return {
      key: `anonymous:${hash}`,
      kind: 'ANONYMOUS' as const,
      displayName: anonymousLabel(hash),
    };
  }
  const id = row.userId ?? `deleted:${row.userName ?? 'unknown'}`;
  return {
    key: `user:${id}`,
    kind: 'USER' as const,
    displayName: row.user?.name ?? row.userName ?? 'Удаленный пользователь',
  };
}

export function buildPageVisitAnalyticsReport({
  rows,
  now = new Date(),
  timezoneOffsetMinutes = 0,
  retentionDays = pageVisitRetentionDays(),
}: {
  rows: PageVisitAnalyticsRow[];
  now?: Date;
  timezoneOffsetMinutes?: number;
  retentionDays?: number;
}) {
  const range = pageVisitReportRange(now, timezoneOffsetMinutes);
  const reportRows = rows.filter(
    (row) =>
      row.occurredAt >= range.from &&
      row.occurredAt < range.to &&
      row.user?.role !== 'ADMIN',
  );
  const dailyByKey = new Map<
    string,
    { date: string; authenticatedViews: number; anonymousViews: number; totalViews: number }
  >();
  for (let index = 0; index < PAGE_VISIT_REPORT_DAYS; index += 1) {
    const day = new Date(range.from.getTime() + index * DAY_MS);
    const key = localDayKey(day, range.timezoneOffsetMinutes);
    dailyByKey.set(key, {
      date: key,
      authenticatedViews: 0,
      anonymousViews: 0,
      totalViews: 0,
    });
  }

  const visitors = new Map<
    string,
    {
      visitorKey: string;
      kind: 'USER' | 'ANONYMOUS';
      displayName: string;
      views: number;
      projectIds: Set<string>;
      lastVisitedAt: Date;
    }
  >();
  const breakdown = new Map<
    string,
    {
      visitorKey: string;
      kind: 'USER' | 'ANONYMOUS';
      displayName: string;
      projectId: string | null;
      projectCode: string | null;
      projectName: string | null;
      pageKey: string;
      pageTitle: string;
      views: number;
      lastVisitedAt: Date;
    }
  >();

  reportRows.forEach((row) => {
    const actor = rowActor(row);
    const day = dailyByKey.get(localDayKey(row.occurredAt, range.timezoneOffsetMinutes));
    if (day) {
      day.totalViews += 1;
      if (actor.kind === 'USER') day.authenticatedViews += 1;
      else day.anonymousViews += 1;
    }

    const visitor = visitors.get(actor.key) ?? {
      visitorKey: actor.key,
      kind: actor.kind,
      displayName: actor.displayName,
      views: 0,
      projectIds: new Set<string>(),
      lastVisitedAt: row.occurredAt,
    };
    visitor.views += 1;
    if (row.projectId) visitor.projectIds.add(row.projectId);
    if (row.occurredAt > visitor.lastVisitedAt) visitor.lastVisitedAt = row.occurredAt;
    visitors.set(actor.key, visitor);

    const key = JSON.stringify([actor.key, row.projectId, row.pageKey]);
    const item = breakdown.get(key) ?? {
      visitorKey: actor.key,
      kind: actor.kind,
      displayName: actor.displayName,
      projectId: row.projectId,
      projectCode: row.projectCode,
      projectName: row.projectName,
      pageKey: row.pageKey,
      pageTitle: appViewLabels[row.pageKey as AppViewKey] ?? row.pageKey,
      views: 0,
      lastVisitedAt: row.occurredAt,
    };
    item.views += 1;
    if (row.occurredAt > item.lastVisitedAt) item.lastVisitedAt = row.occurredAt;
    breakdown.set(key, item);
  });

  const visitorList = [...visitors.values()]
    .map(({ projectIds, lastVisitedAt, ...visitor }) => ({
      ...visitor,
      projectCount: projectIds.size,
      lastVisitedAt: lastVisitedAt.toISOString(),
    }))
    .sort((left, right) => right.views - left.views || left.displayName.localeCompare(right.displayName, 'ru'));
  const breakdownList = [...breakdown.values()]
    .map((item) => ({ ...item, lastVisitedAt: item.lastVisitedAt.toISOString() }))
    .sort(
      (left, right) =>
        right.views - left.views ||
        right.lastVisitedAt.localeCompare(left.lastVisitedAt) ||
        left.displayName.localeCompare(right.displayName, 'ru'),
    );
  const uniqueAuthenticated = visitorList.filter((visitor) => visitor.kind === 'USER').length;
  const uniqueAnonymous = visitorList.filter((visitor) => visitor.kind === 'ANONYMOUS').length;

  return {
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      days: PAGE_VISIT_REPORT_DAYS,
      timezoneOffsetMinutes: range.timezoneOffsetMinutes,
      retentionDays,
    },
    totals: {
      views: reportRows.length,
      authenticatedViews: reportRows.filter((row) => row.actorType === 'USER').length,
      anonymousViews: reportRows.filter((row) => row.actorType === 'ANONYMOUS').length,
      uniqueAuthenticated,
      uniqueAnonymous,
    },
    daily: [...dailyByKey.values()],
    visitors: visitorList,
    breakdown: breakdownList,
  };
}
