import assert from 'node:assert/strict';
import test from 'node:test';
import { issueStays, jiraProcessMining, type ProcessIssue } from './jira-process-mining.js';

const now = new Date('2026-10-10T00:00:00.000Z');
const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000);
const issue = (key: string, patch: Partial<ProcessIssue>): ProcessIssue => ({
  issueKey: key, issueUrl: `https://jira.example.test/browse/${key}`, status: 'Open', assignee: null,
  issueCreatedAt: day(-20), resolutionAt: null, transitionHistoryComplete: true, transitions: [], ...patch,
});
const move = (fromStatus: string | null, toStatus: string, offset: number) => ({ fromStatus, toStatus, at: day(offset) });

test('an issue stays in the status it left first from its creation; a resolved issue has no last stay', () => {
  const resolved = issue('A-1', { status: 'Done', resolutionAt: day(-2), transitions: [move('Open', 'In Progress', -10), move('In Progress', 'Done', -2), move('Done', 'Done', -1)] });
  assert.deepEqual(issueStays(resolved).stays.map((stay) => [stay.status, stay.end === null]), [['Open', false], ['In Progress', false]]);
  const untouched = issue('A-2', {});
  assert.deepEqual(issueStays(untouched).stays.map((stay) => [stay.status, stay.end]), [['Open', null]]);
  const unknown = issue('A-3', { issueCreatedAt: null, transitions: [move('Open', 'Review', -5)] });
  assert.equal(issueStays(unknown).unknownStart, true);
  assert.deepEqual(issueStays(unknown).stays.map((stay) => stay.status), ['Review']);
  // Created after it first moved: that first stay would be negative, so it is unknown.
  const contradictory = issue('A-4', { issueCreatedAt: day(-1), transitions: [move('Open', 'Review', -5)] });
  assert.equal(issueStays(contradictory).unknownStart, true);
});

test('time in status, moves, returns, paths and stuck issues come out of the moves in the period', () => {
  const finished = Array.from({ length: 5 }, (_, index) => issue(`F-${index}`, {
    status: 'Done',
    resolutionAt: day(-3),
    issueCreatedAt: day(-20),
    // Two days in review each, except a slower one.
    transitions: [move('Open', 'In Progress', -15), move('In Progress', 'Review', -7), move('Review', 'Done', index === 4 ? -3 : -5)],
  }));
  const reworked = issue('R-1', {
    status: 'Done', resolutionAt: day(-1),
    transitions: [move('Open', 'In Progress', -12), move('In Progress', 'Review', -9), move('Review', 'In Progress', -8), move('In Progress', 'Review', -4), move('Review', 'Done', -1)],
  });
  const stuck = issue('S-1', { status: 'Review', issueCreatedAt: day(-40), transitions: [move('Open', 'In Progress', -30), move('In Progress', 'Review', -10)] });
  const old = issue('O-1', { status: 'Done', resolutionAt: day(-200), issueCreatedAt: day(-220), transitions: [move('Open', 'Done', -200)] });
  const result = jiraProcessMining([...finished, reworked, stuck, old], { now, periodDays: 30 });

  assert.deepEqual(result.statuses.slice(0, 3), ['Open', 'In Progress', 'Review']);
  const review = result.statusStats.find((stat) => stat.status === 'Review')!;
  // One finished review stay of each of the five issues and two of R-1; S-1 is still in review.
  assert.equal(review.samples, 7);
  assert.equal(review.medianHours, 48);
  assert.equal(review.current, 1);
  assert.ok(review.totalHours > 0);
  assert.equal(result.statusStats.reduce((sum, stat) => sum + stat.share, 0).toFixed(1), '1.0');

  const toReview = result.edges.find((edge) => edge.from === 'In Progress' && edge.to === 'Review')!;
  assert.equal(toReview.count, 8);
  assert.equal(result.rework.issues, 1);
  assert.equal(result.rework.ofIssues, 7);
  assert.deepEqual(result.rework.loops.map((loop) => [loop.from, loop.to, loop.count]), [['Review', 'In Progress', 1], ['In Progress', 'Review', 1]]);

  assert.deepEqual(result.variants[0], { path: ['Open', 'In Progress', 'Review', 'Done'], count: 5, medianLeadDays: 17 });
  assert.equal(result.variants[1]?.path.length, 6);

  assert.deepEqual(result.stuck.map((item) => [item.issueKey, item.status, item.days]), [['S-1', 'Review', 10]]);
  assert.equal(result.kpi.resolved, 6);
  assert.equal(result.kpi.issues, 7);
  assert.equal(result.quality.issues, 8);
  // Exactly the statuses with fewer than five finished stays cannot judge anything stuck.
  assert.deepEqual(result.quality.statusesWithoutBaseline, result.statusStats.filter((stat) => stat.samples < 5).map((stat) => stat.status));
  assert.ok(!result.quality.statusesWithoutBaseline.includes('Review'));
});

test('a creation date after the first move measures neither waits nor lead times', () => {
  const wrong = issue('W-1', { status: 'Done', issueCreatedAt: day(-1), resolutionAt: day(-2), transitions: [move('Open', 'Done', -2)] });
  const result = jiraProcessMining([wrong], { now, periodDays: 30 });
  assert.equal(result.edges[0]?.medianHoursBefore, null);
  assert.equal(result.kpi.medianLeadDays, null);
  assert.equal(result.kpi.resolved, 0);
});

test('a status without enough finished stays flags nobody as stuck, and says so', () => {
  const lonely = issue('L-1', { status: 'Blocked', issueCreatedAt: day(-50), transitions: [move('Open', 'Blocked', -40)] });
  const result = jiraProcessMining([lonely, issue('L-2', { issueCreatedAt: null }), issue('L-3', { transitionHistoryComplete: false })], { now, periodDays: 30 });
  assert.deepEqual(result.stuck, []);
  assert.ok(result.quality.statusesWithoutBaseline.includes('Blocked'));
  assert.equal(result.quality.unknownStart, 1);
  assert.equal(result.quality.incompleteHistory, 1);
  assert.equal(result.rework.rate, null);
});
