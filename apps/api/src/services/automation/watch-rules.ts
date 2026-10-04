import { automationParamsSchemas, normalizePersonName } from '@pms/shared';
import { fire, linkedUsers, notify, type RunContext } from './context.js';
import { cutText, listed, rowRef } from './templates.js';
import { DAILY_HOUR, localMoment } from './time.js';
import { dueSoonWork, incompleteRisks, milestonesAtRisk, notSeenBefore, overdueIssues, pendingChanges, waitingDecisions } from './watch-templates.js';

/**
 * The watching rules: once a day, from the morning, each looks at the project
 * and tells about what needs a person's attention. They only tell, in the
 * application; each thing is told once (per request, per date or per status).
 */

const projectHref = (ctx: RunContext, section: string) => `/${encodeURIComponent(ctx.project.code)}/${section}`;
const rowHref = (ctx: RunContext, itemId: string) => `/${encodeURIComponent(ctx.project.code)}/wbs?focusWbs=${encodeURIComponent(itemId)}`;
const item = (row: { id: string; title: string }) => ({ id: row.id, title: cutText(row.title) });

/** The day this run speaks for, or null before the morning hour; the run itself fires once a day. */
async function dailyRun(ctx: RunContext, name: string) {
  const local = localMoment(ctx.now, ctx.zone);
  if (local.hour < DAILY_HOUR) return null;
  const runId = await fire(ctx, `${name}-run:${local.date}`, { date: local.date });
  return runId ? local.date : null;
}

export async function decisionWaiting(ctx: RunContext) {
  const { days } = automationParamsSchemas.DECISION_WAITING.parse(ctx.rule.params ?? {});
  const today = await dailyRun(ctx, 'decision');
  if (!today) return;
  const decisions = await ctx.tx.decision.findMany({
    where: { projectId: ctx.project.id, status: 'PENDING_APPROVAL' },
    select: { id: true, title: true, status: true, approverUserId: true, approverName: true, requestedAt: true, createdAt: true },
  });
  for (const { decision, waited, dedupeKey } of waitingDecisions(decisions, today, days)) {
    const firingId = await fire(ctx, dedupeKey, { decisionId: decision.id, waited });
    if (!firingId) continue;
    // The approver is the one it waits for; the recipients follow the project.
    const to = [...ctx.recipients, ...(decision.approverUserId ? [decision.approverUserId] : [])];
    await notify(ctx, firingId, to, { kind: 'DECISION_WAITING', projectCode: ctx.project.code, item: item(decision), days: waited, approver: decision.approverName }, projectHref(ctx, 'decisions'));
  }
}

export async function riskIncomplete(ctx: RunContext) {
  const today = await dailyRun(ctx, 'risk');
  if (!today) return;
  const risks = await ctx.tx.raidItem.findMany({
    where: { projectId: ctx.project.id, type: 'RISK', status: { notIn: ['CLOSED', 'VALIDATED'] } },
    select: { id: true, title: true, type: true, status: true, owner: true, dueDate: true },
  });
  const { fresh, ids } = notSeenBefore(ctx.state.riskIds, incompleteRisks(risks));
  ctx.state.riskIds = ids;
  if (fresh.length === 0) return;
  const firingId = await fire(ctx, `risk:${today}`, { fresh: fresh.length, open: ids.length });
  if (!firingId) return;
  const { rows, more } = listed(fresh.map(item));
  await notify(ctx, firingId, ctx.recipients, { kind: 'RISK_INCOMPLETE', projectCode: ctx.project.code, items: rows, more }, projectHref(ctx, 'risks'));
}

export async function issueOverdue(ctx: RunContext) {
  const { graceDays } = automationParamsSchemas.ISSUE_OVERDUE.parse(ctx.rule.params ?? {});
  const today = await dailyRun(ctx, 'issue');
  if (!today) return;
  const issues = await ctx.tx.issue.findMany({
    where: { projectId: ctx.project.id, status: { notIn: ['Done', 'Closed', 'Resolved'] }, dueDate: { not: null } },
    select: { id: true, title: true, status: true, owner: true, dueDate: true },
  });
  const users = await linkedUsers(ctx.tx);
  for (const { issue, due, late, dedupeKey } of overdueIssues(issues, today, graceDays)) {
    const firingId = await fire(ctx, dedupeKey, { issueId: issue.id, late });
    if (!firingId) continue;
    const owner = users.get(normalizePersonName(issue.owner));
    await notify(ctx, firingId, [...ctx.recipients, ...(owner ? [owner] : [])], { kind: 'ISSUE_OVERDUE', projectCode: ctx.project.code, item: item(issue), dueDate: due, days: late }, projectHref(ctx, 'issues'));
  }
}

export async function workDueSoon(ctx: RunContext) {
  const { days } = automationParamsSchemas.WORK_DUE_SOON.parse(ctx.rule.params ?? {});
  const today = await dailyRun(ctx, 'due');
  if (!today) return;
  const rows = await ctx.tx.wbsItem.findMany({
    where: { projectId: ctx.project.id, type: { in: ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] }, status: 'NOT_STARTED', children: { none: {} }, dueDate: { not: null } },
    select: { id: true, code: true, title: true, status: true, owner: true, dueDate: true },
  });
  const users = await linkedUsers(ctx.tx);
  const told = [];
  for (const { row, due, dedupeKey } of dueSoonWork(rows, today, days)) {
    const firingId = await fire(ctx, dedupeKey, { row: rowRef(row), due });
    if (!firingId) continue;
    told.push(rowRef(row));
    const owner = users.get(normalizePersonName(row.owner));
    if (owner) await notify(ctx, firingId, [owner], { kind: 'WORK_DUE_SOON', projectCode: ctx.project.code, row: rowRef(row), dueDate: due }, rowHref(ctx, row.id));
  }
  if (told.length === 0) return;
  // The recipients get one list a day instead of a notice per row.
  const summaryId = await fire(ctx, `due-summary:${today}`, { rows: told.length });
  if (!summaryId) return;
  const { rows: named, more } = listed(told);
  await notify(ctx, summaryId, ctx.recipients, { kind: 'WORK_DUE_SOON_SUMMARY', projectCode: ctx.project.code, rows: named, more }, projectHref(ctx, 'current-work'));
}

export async function milestoneAtRisk(ctx: RunContext) {
  const { days, minProgress } = automationParamsSchemas.MILESTONE_AT_RISK.parse(ctx.rule.params ?? {});
  const today = await dailyRun(ctx, 'milestone');
  if (!today) return;
  const [items, links] = await Promise.all([
    ctx.tx.wbsItem.findMany({ where: { projectId: ctx.project.id }, select: { id: true, parentId: true, code: true, title: true, type: true, status: true, progress: true, dueDate: true } }),
    ctx.tx.wbsDependency.findMany({ where: { projectId: ctx.project.id }, select: { predecessorId: true, successorId: true } }),
  ]);
  const byId = new Map(items.map((row) => [row.id, row]));
  // The work before a milestone: its children and the rows linked into it.
  const feedersOf = (milestoneId: string) => {
    const ids = new Set([...items.filter((row) => row.parentId === milestoneId).map((row) => row.id), ...links.filter((link) => link.successorId === milestoneId).map((link) => link.predecessorId)]);
    return [...ids].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  };
  for (const { milestone, due, lagging, dedupeKey } of milestonesAtRisk(items, feedersOf, today, days, minProgress)) {
    const firingId = await fire(ctx, dedupeKey, { row: rowRef(milestone), lagging });
    if (!firingId) continue;
    await notify(ctx, firingId, ctx.recipients, { kind: 'MILESTONE_AT_RISK', projectCode: ctx.project.code, row: rowRef(milestone), dueDate: due, lagging }, rowHref(ctx, milestone.id));
  }
}

export async function changeRequestPending(ctx: RunContext) {
  const { days } = automationParamsSchemas.CHANGE_REQUEST_PENDING.parse(ctx.rule.params ?? {});
  const today = await dailyRun(ctx, 'change');
  if (!today) return;
  const changes = await ctx.tx.changeRequest.findMany({
    where: { projectId: ctx.project.id, status: { in: ['DRAFT', 'SUBMITTED', 'IN_REVIEW'] } },
    select: { id: true, title: true, status: true, updatedAt: true },
  });
  for (const { change, idle, dedupeKey } of pendingChanges(changes, today, days)) {
    const firingId = await fire(ctx, dedupeKey, { changeId: change.id, idle });
    if (!firingId) continue;
    await notify(ctx, firingId, ctx.recipients, { kind: 'CHANGE_REQUEST_PENDING', projectCode: ctx.project.code, item: item(change), status: change.status, days: idle }, projectHref(ctx, 'changes'));
  }
}
