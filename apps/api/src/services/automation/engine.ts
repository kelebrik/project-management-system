import { randomUUID } from 'node:crypto';
import { automationParamsSchemas, normalizePersonName, type AutomationTemplate, type NotificationParams } from '@pms/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { usersWhoCanReadProject } from '../../server/business-units.js';
import { logEvent } from '../../server/logger.js';
import { projectModulesConfig } from '../../routes/admin/project-modules.js';
import { missingCheckIns, weekStartOf } from '../my-work.js';
import { projectInsights } from '../project-automation.js';
import { needsReason } from '../schedule-shifts.js';
import { calculateProjectCriticalPath } from '../wbs-critical-path.js';
import { blockerEvents, blockerIssueTitle, cutText, exhaustedFloat, jiraDoneEvents, listed, newlyExhausted, rowRef, shiftEvents, type CheckInSource, type ShiftSource } from './templates.js';
import { automationTimeZone, DAILY_HOUR, localMoment, WEEKLY_CHECK_IN } from './time.js';

type Tx = Prisma.TransactionClient;
/** What a rule keeps between runs: when it was switched on, how far its event sources were read, and the float set it last saw. */
export type RuleState = { since?: string; cursor?: string; floatIds?: string[] };

/** Late commits of a source row are caught by reading this far back on every run; repeats are dropped by the firing key. */
const OVERLAP_MS = 10 * 60_000;
const SOURCE_BATCH = 2000;
const DAY_MS = 86_400_000;

type RunContext = {
  tx: Tx;
  rule: { id: string; projectId: string; template: AutomationTemplate; params: Prisma.JsonValue; recipientIds: string[] };
  project: { id: string; code: string; projectManager: string };
  state: RuleState;
  now: Date;
  zone: string;
  recipients: string[];
  /** Rows read per page of an event source. */
  batch: number;
};

/** Claims a firing; null when this key already fired, which is how repeats and overlapping reads are dropped. */
async function fire(ctx: RunContext, dedupeKey: string, summary: Record<string, unknown>) {
  const rows = await ctx.tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "AutomationFiring" ("id", "ruleId", "projectId", "template", "dedupeKey", "summary", "firedAt")
    VALUES (${randomUUID()}, ${ctx.rule.id}, ${ctx.project.id}, ${ctx.rule.template}, ${dedupeKey}, ${JSON.stringify(summary)}::jsonb, ${ctx.now})
    ON CONFLICT ("ruleId", "dedupeKey") DO NOTHING
    RETURNING "id"`;
  return rows[0]?.id ?? null;
}

async function notify(ctx: RunContext, firingId: string, userIds: string[], params: NotificationParams, href: string) {
  // Nobody hears about a project they may not see.
  const unique = await usersWhoCanReadProject([...new Set(userIds)], ctx.project.id);
  if (unique.length === 0) return;
  await ctx.tx.notification.createMany({
    data: unique.map((userId) => ({ userId, projectId: ctx.project.id, firingId, kind: params.kind, params: params as unknown as Prisma.InputJsonValue, href })),
    skipDuplicates: true,
  });
}

/** Active users linked to people of the leave schedule, by normalized name. */
async function linkedUsers(tx: Tx) {
  const people = await tx.leaveEmployee.findMany({ where: { isActive: true, userId: { not: null }, user: { isActive: true } }, select: { name: true, userId: true } });
  return new Map(people.map((person) => [normalizePersonName(person.name), person.userId!]));
}

const rulesHref = (projectId: string) => `/development/rules?project=${encodeURIComponent(projectId)}&tab=proposals`;
const rowHref = (code: string, itemId: string) => `/${encodeURIComponent(code)}/wbs?focusWbs=${encodeURIComponent(itemId)}`;

/** Where an event source starts being read on this run. */
function readFrom(ctx: RunContext) {
  const since = ctx.state.since ? Date.parse(ctx.state.since) : ctx.now.getTime();
  const cursor = ctx.state.cursor ? Date.parse(ctx.state.cursor) - OVERLAP_MS : since;
  return new Date(Math.max(since, cursor));
}

type Position = { at: Date; id: string };
/** The rows after a position in (time, id) order, so rows sharing a timestamp are never skipped between pages. */
export const afterPosition = (field: 'createdAt' | 'updatedAt', start: Date, after: Position | null) =>
  after ? { OR: [{ [field]: { gt: after.at } }, { [field]: after.at, id: { gt: after.id } }] } : { [field]: { gt: start } };

/**
 * Reads a source to its end in pages, handing each page on; the cursor is
 * left at the last row read. Overlap with the previous run is fine: the
 * firing keys drop what already fired.
 */
async function drain<T extends { id: string }>(ctx: RunContext, read: (after: Position | null) => Promise<T[]>, at: (row: T) => Date, handle: (page: T[]) => Promise<void>) {
  let after: Position | null = null;
  for (;;) {
    const page = await read(after);
    if (page.length === 0) return;
    await handle(page);
    const last = page[page.length - 1];
    after = { at: at(last), id: last.id };
    ctx.state.cursor = after.at.toISOString();
    if (page.length < ctx.batch) return;
  }
}

async function milestoneShift(ctx: RunContext) {
  const { minDays } = automationParamsSchemas.MILESTONE_SHIFT.parse(ctx.rule.params ?? {});
  const start = readFrom(ctx);
  const shifts: ShiftSource[] = [];
  await drain(
    ctx,
    (after) =>
      ctx.tx.scheduleShift.findMany({
        where: { projectId: ctx.project.id, kind: 'SHIFT', ...afterPosition('createdAt', start, after) },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ctx.batch,
      }),
    (row) => row.createdAt,
    async (page) => {
      shifts.push(...page);
    },
  );
  // The biggest move of a day is chosen over everything read, not page by page.
  await milestoneShiftPage(ctx, shifts, minDays);
}

async function milestoneShiftPage(ctx: RunContext, shifts: ShiftSource[], minDays: number) {
  const events = shiftEvents(shifts, minDays, (at) => localMoment(at, ctx.zone).date);
  if (events.length === 0) return;
  const owners = await ctx.tx.wbsItem.findMany({ where: { id: { in: events.map((event) => event.shift.checkpointId!) } }, select: { id: true, owner: true } });
  const ownerById = new Map(owners.map((row) => [row.id, row.owner]));
  const users = await linkedUsers(ctx.tx);
  for (const { dedupeKey, shift } of events) {
    const row = rowRef({ id: shift.checkpointId!, code: shift.checkpointCode, title: shift.checkpointTitle });
    const days = shift.deltaDays ?? 0;
    const firingId = await fire(ctx, dedupeKey, { row, days, shiftId: shift.id });
    if (!firingId) continue;
    const href = `/${encodeURIComponent(ctx.project.code)}/overview#schedule-shifts`;
    const newDate = shift.newDate ? shift.newDate.toISOString().slice(0, 10) : null;
    await notify(ctx, firingId, ctx.recipients, { kind: 'MILESTONE_SHIFTED', projectCode: ctx.project.code, row, days, newDate }, href);
    // The owner is asked for the reason only while the journal still has none and the move matters (past the baseline).
    const ownerUser = users.get(normalizePersonName(ownerById.get(shift.checkpointId!) ?? ''));
    if (ownerUser && !shift.reasonCategory && needsReason(shift as Parameters<typeof needsReason>[0])) {
      await notify(ctx, firingId, [ownerUser], { kind: 'SHIFT_REASON_ASKED', projectCode: ctx.project.code, row, days }, href);
    }
  }
}

async function checkInBlocker(ctx: RunContext) {
  const start = readFrom(ctx);
  await drain(
    ctx,
    (after) =>
      ctx.tx.workCheckIn.findMany({
        where: { projectId: ctx.project.id, ...afterPosition('updatedAt', start, after) },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: ctx.batch,
        include: { wbsItem: { select: { id: true, code: true, title: true } } },
      }),
    (row) => row.updatedAt,
    (page) => checkInBlockerPage(ctx, page),
  );
}

type CheckInRow = CheckInSource & { done: string; wbsItem: { id: string; code: string; title: string } };

async function checkInBlockerPage(ctx: RunContext, checkIns: CheckInRow[]) {
  const byId = new Map(checkIns.map((checkIn) => [checkIn.id, checkIn]));
  for (const { dedupeKey, checkIn } of blockerEvents(checkIns)) {
    const full = byId.get(checkIn.id)!;
    const row = rowRef(full.wbsItem);
    const blocker = cutText(full.blocker.trim());
    const offTrack = full.confidence === 'OFF_TRACK';
    const firingId = await fire(ctx, dedupeKey, { row, person: full.personName, offTrack });
    if (!firingId) continue;
    await ctx.tx.automationProposal.create({
      data: {
        projectId: ctx.project.id,
        ruleId: ctx.rule.id,
        firingId,
        kind: 'CREATE_ISSUE',
        wbsItemId: full.wbsItemId,
        payload: {
          title: blockerIssueTitle(full.wbsItem, full.blocker),
          impact: full.blocker.trim().slice(0, 2000),
          owner: ctx.project.projectManager.slice(0, 200),
          severity: 'HIGH',
          row,
          person: full.personName,
          offTrack,
        },
      },
    });
    await notify(ctx, firingId, ctx.recipients, { kind: 'CHECK_IN_BLOCKER', projectCode: ctx.project.code, row, person: full.personName, blocker, offTrack }, rulesHref(ctx.project.id));
  }
}

async function missingCheckIn(ctx: RunContext) {
  const local = localMoment(ctx.now, ctx.zone);
  if (local.weekday !== WEEKLY_CHECK_IN.weekday || local.hour < WEEKLY_CHECK_IN.hour) return;
  const weekStart = weekStartOf(ctx.now, ctx.zone);
  const week = weekStart.toISOString().slice(0, 10);
  const firingId = await fire(ctx, `missing:${week}`, { weekStart: week });
  if (!firingId) return;
  const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
  const [checkIns, openWork] = await Promise.all([
    ctx.tx.workCheckIn.findMany({ where: { projectId: ctx.project.id, weekStart }, select: { personName: true } }),
    ctx.tx.wbsItem.findMany({
      where: { projectId: ctx.project.id, type: { in: ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] }, status: { notIn: ['DONE', 'CANCELLED'] }, owner: { not: '' }, children: { none: {} }, startDate: { lte: weekEnd } },
      select: { owner: true },
    }),
  ]);
  const people = missingCheckIns(openWork.map((row) => row.owner.trim()), checkIns.map((row) => row.personName));
  await ctx.tx.automationFiring.update({ where: { id: firingId }, data: { summary: { weekStart: week, missing: people.length } } });
  if (people.length === 0) return;
  const { rows: named, more } = listed(people);
  await notify(ctx, firingId, ctx.recipients, { kind: 'CHECK_IN_MISSING_SUMMARY', projectCode: ctx.project.code, weekStart: week, people: named, more }, `/development/my-work`);
  const users = await linkedUsers(ctx.tx);
  for (const person of people) {
    const userId = users.get(normalizePersonName(person));
    if (!userId) continue;
    const rows = openWork.filter((row) => normalizePersonName(row.owner) === normalizePersonName(person)).length;
    await notify(ctx, firingId, [userId], { kind: 'CHECK_IN_MISSING', projectCode: ctx.project.code, weekStart: week, rows }, `/development/my-work`);
  }
}

async function floatExhausted(ctx: RunContext) {
  const local = localMoment(ctx.now, ctx.zone);
  if (local.hour < DAILY_HOUR) return;
  const firingId = await fire(ctx, `float:${local.date}`, { date: local.date });
  if (!firingId) return;
  const rows = await loadExhaustedFloat(ctx.tx, ctx.project.id);
  const { fresh, ids } = newlyExhausted(ctx.state.floatIds, rows);
  ctx.state.floatIds = ids;
  await ctx.tx.automationFiring.update({ where: { id: firingId }, data: { summary: { date: local.date, exhausted: ids.length, fresh: fresh.length } } });
  if (fresh.length === 0) return;
  const { rows: named, more } = listed(fresh.map(rowRef));
  await notify(ctx, firingId, ctx.recipients, { kind: 'FLOAT_EXHAUSTED', projectCode: ctx.project.code, rows: named, more }, rowHref(ctx.project.code, fresh[0].id));
}

async function jiraDone(ctx: RunContext) {
  const local = localMoment(ctx.now, ctx.zone);
  if (local.hour < DAILY_HOUR) return;
  const runId = await fire(ctx, `jira-run:${local.date}`, { date: local.date });
  if (!runId) return;
  const fresh = [];
  for (const { dedupeKey, row } of jiraDoneEvents(await loadReconciliation(ctx.tx, ctx.project, ctx.now))) {
    const firingId = await fire(ctx, dedupeKey, { row: rowRef(row), jiraKey: row.jiraKey });
    if (!firingId) continue;
    await ctx.tx.automationProposal.create({
      data: {
        projectId: ctx.project.id,
        ruleId: ctx.rule.id,
        firingId,
        kind: 'SET_WBS_STATUS',
        wbsItemId: row.id,
        payload: { status: 'DONE', expectedUpdatedAt: row.expectedUpdatedAt, expectedJira: { key: row.jiraKey, updatedAt: row.expectedJiraUpdatedAt }, row: rowRef(row) },
      },
    });
    fresh.push(rowRef(row));
  }
  await ctx.tx.automationFiring.update({ where: { id: runId }, data: { summary: { date: local.date, proposed: fresh.length } } });
  if (fresh.length === 0) return;
  const { rows: named, more } = listed(fresh);
  await notify(ctx, runId, ctx.recipients, { kind: 'JIRA_DONE', projectCode: ctx.project.code, rows: named, more }, rulesHref(ctx.project.id));
}

type Reader = Tx | typeof prisma;

/** Unfinished rows (not phases) of a project that have no float left, by the same calculation the Structure shows. */
export async function loadExhaustedFloat(client: Reader, projectId: string) {
  const [path, items] = await Promise.all([
    calculateProjectCriticalPath(projectId),
    client.wbsItem.findMany({ where: { projectId }, select: { id: true, type: true, status: true } }),
  ]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  return exhaustedFloat(
    path.items.flatMap((row) => {
      const item = itemById.get(row.itemId);
      return item ? [{ id: row.itemId, code: row.code, title: row.title, type: item.type, status: item.status, totalFloatWorkDays: row.totalFloatWorkDays }] : [];
    }),
  );
}

/**
 * The Jira reconciliation of a project, from the snapshots the regular
 * read-only synchronization stored: Jira itself is never called here. Empty
 * when the Jira work or Structure module is off.
 */
export async function loadReconciliation(client: Reader, project: { id: string; code: string }, now: Date) {
  const modules = await projectModulesConfig();
  const enabled = (key: string) => modules.some((module) => module.key === key && module.enabled);
  if (!enabled('jiraWork') || !enabled('structure')) return [];
  const [items, dependencies, issues, risks, milestones, snapshots] = await Promise.all([
    client.wbsItem.findMany({ where: { projectId: project.id }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
    client.wbsDependency.findMany({ where: { projectId: project.id } }),
    client.issue.findMany({ where: { projectId: project.id } }),
    client.raidItem.findMany({ where: { projectId: project.id } }),
    client.milestone.findMany({ where: { projectId: project.id } }),
    client.jiraIssueSnapshot.findMany({ where: { projectId: project.id, retiredAt: null } }),
  ]);
  return projectInsights({ code: project.code, items, dependencies, issues, risks, milestones, snapshots }, now).reconciliation;
}

const HANDLERS: Record<AutomationTemplate, (ctx: RunContext) => Promise<void>> = {
  MILESTONE_SHIFT: milestoneShift,
  MISSING_CHECK_IN: missingCheckIn,
  CHECK_IN_BLOCKER: checkInBlocker,
  FLOAT_EXHAUSTED: floatExhausted,
  JIRA_DONE: jiraDone,
};

class RuleChanged extends Error {}

/**
 * Runs one rule in one transaction: firings, notifications, proposals and the
 * rule's cursors are written together or not at all. Another instance running
 * the same rule holds its lock, and this one skips it; a rule edited meanwhile
 * rolls the run back, to be done again on the next tick.
 */
export async function runAutomationRule(ruleId: string, now = new Date(), options: { batch?: number } = {}) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext(${`automation:${ruleId}`})) AS locked`;
        if (!lock?.locked) return 'busy' as const;
        const rule = await tx.automationRule.findUnique({
          where: { id: ruleId },
          include: { project: { select: { id: true, code: true, projectManager: true, status: true } } },
        });
        if (!rule || !rule.enabled || rule.project.status === 'CLOSED') return 'skipped' as const;
        const template = rule.template as AutomationTemplate;
        if (!HANDLERS[template]) return 'skipped' as const;
        const active = await tx.user.findMany({ where: { id: { in: rule.recipientIds }, isActive: true }, select: { id: true } });
        const state = { ...((rule.state ?? {}) as RuleState) };
        await HANDLERS[template]({
          tx,
          rule: { ...rule, template },
          project: rule.project,
          state,
          now,
          zone: automationTimeZone(),
          recipients: active.map((user) => user.id),
          batch: options.batch ?? SOURCE_BATCH,
        });
        const saved = await tx.automationRule.updateMany({ where: { id: rule.id, version: rule.version }, data: { state: state as Prisma.InputJsonValue } });
        if (saved.count !== 1) throw new RuleChanged();
        return 'ran' as const;
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    if (error instanceof RuleChanged) return 'changed' as const;
    throw error;
  }
}

/** One pass over every switched-on rule of open projects; a failing rule is logged and does not stop the others. */
export async function runAutomationTick(now = new Date()) {
  const rules = await prisma.automationRule.findMany({ where: { enabled: true, project: { status: { not: 'CLOSED' } } }, select: { id: true, template: true, projectId: true } });
  for (const rule of rules) {
    try {
      await runAutomationRule(rule.id, now);
    } catch (error) {
      logEvent('error', 'automation.rule_failed', { ruleId: rule.id, template: rule.template, projectId: rule.projectId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return rules.length;
}

/** The background runner: a tick every minute by default; `stop` waits for a tick in progress. */
export function createAutomationRunner(options: { pollMs?: number } = {}) {
  const pollMs = options.pollMs ?? (Number.parseInt(process.env.AUTOMATION_RUNNER_POLL_MS ?? '', 10) || 60_000);
  let timer: NodeJS.Timeout | null = null;
  let current: Promise<unknown> | null = null;
  const pump = () => {
    if (current) return;
    current = runAutomationTick()
      .catch((error: unknown) => logEvent('error', 'automation.tick_failed', { message: error instanceof Error ? error.message : String(error) }))
      .finally(() => {
        current = null;
      });
  };
  return {
    start() {
      if (timer || process.env.AUTOMATION_RUNNER_ENABLED === 'false') return;
      timer = setInterval(pump, Math.max(5_000, pollMs));
      timer.unref();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      await current;
    },
  };
}
