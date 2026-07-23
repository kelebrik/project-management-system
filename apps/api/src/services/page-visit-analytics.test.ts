import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPageVisitAnalyticsReport,
  clampTimezoneOffset,
  pageVisitReportRange,
  pageVisitRetentionDays,
  type PageVisitAnalyticsRow,
} from './page-visit-analytics.js';

function visit(overrides: Partial<PageVisitAnalyticsRow> = {}): PageVisitAnalyticsRow {
  return {
    actorType: 'USER',
    userId: 'user-1',
    userName: 'Иван',
    anonymousVisitorHash: null,
    projectId: 'project-1',
    projectCode: 'PRJ-1',
    projectName: 'Проект',
    pageKey: 'project-overview',
    occurredAt: new Date('2026-07-23T08:00:00.000Z'),
    user: { name: 'Иван', role: 'EXECUTIVE_VIEWER' },
    ...overrides,
  };
}

test('page visit report separates users and anonymous visitors and excludes admins', () => {
  const report = buildPageVisitAnalyticsReport({
    now: new Date('2026-07-23T12:00:00.000Z'),
    timezoneOffsetMinutes: -180,
    retentionDays: 30,
    rows: [
      visit(),
      visit({ pageKey: 'project-gantt', occurredAt: new Date('2026-07-23T09:00:00.000Z') }),
      visit({
        actorType: 'ANONYMOUS',
        userId: null,
        userName: null,
        anonymousVisitorHash: 'abcdef123456',
        projectId: null,
        projectCode: null,
        projectName: null,
        pageKey: 'portfolio',
        user: null,
        occurredAt: new Date('2026-07-22T20:30:00.000Z'),
      }),
      visit({
        userId: 'admin-1',
        userName: 'Admin',
        user: { name: 'Admin', role: 'ADMIN' },
      }),
    ],
  });

  assert.deepEqual(report.totals, {
    views: 3,
    authenticatedViews: 2,
    anonymousViews: 1,
    uniqueAuthenticated: 1,
    uniqueAnonymous: 1,
  });
  assert.equal(report.visitors[0]?.displayName, 'Иван');
  assert.equal(report.visitors[0]?.views, 2);
  assert.equal(report.visitors[1]?.displayName, 'Гость ABCDEF');
  assert.deepEqual(
    report.breakdown.map((item) => [item.displayName, item.projectCode, item.pageKey, item.views]),
    [
      ['Иван', 'PRJ-1', 'project-gantt', 1],
      ['Иван', 'PRJ-1', 'project-overview', 1],
      ['Гость ABCDEF', null, 'portfolio', 1],
    ],
  );
  assert.equal(report.daily.at(-2)?.totalViews, 1);
  assert.equal(report.daily.at(-1)?.totalViews, 2);
});

test('page visit report range uses the administrator local day', () => {
  const range = pageVisitReportRange(new Date('2026-07-23T22:30:00.000Z'), -180);
  assert.equal(range.from.toISOString(), '2026-07-17T21:00:00.000Z');
  assert.equal(range.to.toISOString(), '2026-07-24T21:00:00.000Z');
  assert.equal(clampTimezoneOffset(900), 840);
  assert.equal(clampTimezoneOffset('invalid'), 0);
});

test('page visit retention is finite and never shorter than the report window', () => {
  assert.equal(pageVisitRetentionDays('3'), 7);
  assert.equal(pageVisitRetentionDays('45'), 45);
  assert.equal(pageVisitRetentionDays('invalid'), 30);
});
