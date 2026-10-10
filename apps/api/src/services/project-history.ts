import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db.js';
import { logEvent } from '../server/logger.js';
import { stableJson } from './jira-aggregates-core.js';

export const HISTORY_TIME_ZONE = 'Europe/Moscow';
/** Writes come in bursts; one capture follows the burst. */
export const HISTORY_CAPTURE_DELAY_MS = 2 * 60_000;
/** A project changed without a pause is still captured this often. */
export const HISTORY_CAPTURE_MAX_WAIT_MS = 10 * 60_000;
export const HISTORY_SWEEP_INTERVAL_MS = 60 * 60_000;
/** Above this a day is kept as unavailable rather than stored. */
export const HISTORY_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

/** The Moscow calendar day of an instant, as YYYY-MM-DD. */
export function historyDayKey(instant: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: HISTORY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** A real calendar day written YYYY-MM-DD, not after today: 2026-02-31 does not slip into March. */
export function isPastHistoryDay(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const day = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(day.getTime()) && day.toISOString().startsWith(value) && value <= historyDayKey(now);
}

/** The last instant of a Moscow day (Moscow has no daylight saving time). */
export function historyDayEnd(day: string) {
  return new Date(new Date(`${day}T00:00:00.000+03:00`).getTime() + 24 * 3_600_000 - 1);
}

export type ProjectHistoryPayload = {
  project: Record<string, unknown>;
  wbs: { items: Array<Record<string, unknown>>; dependencies: Array<Record<string, unknown>>; calendarOverrides: Array<Record<string, unknown>> };
  raid: Array<Record<string, unknown>>;
  issues: Array<Record<string, unknown>>;
};

export async function readProjectHistoryPayload(transaction: Prisma.TransactionClient | PrismaClient, projectId: string): Promise<ProjectHistoryPayload | null> {
  const project = await transaction.project.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, status: true, rag: true, startDate: true, targetDate: true, initialTargetDate: true, projectManager: true, sponsor: true, createdAt: true, updatedAt: true },
  });
  if (!project) return null;
  const [items, dependencies, calendarOverrides, raid, issues] = await Promise.all([
    transaction.wbsItem.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
    transaction.wbsDependency.findMany({ where: { projectId }, orderBy: { id: 'asc' }, select: { id: true, predecessorId: true, successorId: true, type: true, lagDays: true } }),
    transaction.projectCalendarOverride.findMany({ where: { projectId }, orderBy: [{ calendarCode: 'asc' }, { date: 'asc' }], select: { calendarCode: true, date: true, isWorkingDay: true } }),
    transaction.raidItem.findMany({ where: { projectId }, orderBy: { id: 'asc' }, include: { statusUpdates: { orderBy: [{ statusAt: 'asc' }, { id: 'asc' }] } } }),
    transaction.issue.findMany({
      where: { projectId },
      orderBy: { id: 'asc' },
      include: {
        statusUpdates: { orderBy: [{ statusAt: 'asc' }, { id: 'asc' }] },
        threadLinks: { orderBy: { id: 'asc' } },
        jiraLinks: { orderBy: { id: 'asc' } },
      },
    }),
  ]);
  return JSON.parse(JSON.stringify({ project, wbs: { items, dependencies, calendarOverrides }, raid, issues })) as ProjectHistoryPayload;
}

/**
 * Captures how the project stands now as the state of the day of its last
 * write. One consistent read under a per-project lock, so captures from
 * several processes queue; an unchanged state writes nothing.
 */
export async function captureProjectHistory(
  projectId: string,
  burst: { firstWriteAt: Date; lastWriteAt: Date },
  client: PrismaClient = defaultPrisma,
  maxBytes = HISTORY_MAX_PAYLOAD_BYTES,
) {
  // The consistent read starts before the lock is granted, so a capture that
  // waited behind another one conflicts on write; it simply reads again.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await captureOnce(projectId, burst, client, maxBytes);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 3) throw error;
    }
  }
}

async function captureOnce(
  projectId: string,
  burst: { firstWriteAt: Date; lastWriteAt: Date },
  client: PrismaClient,
  maxBytes: number,
) {
  return client.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`history:${projectId}`}))`;
    const payload = await readProjectHistoryPayload(transaction, projectId);
    if (!payload) return { status: 'missing' as const };
    const json = stableJson(payload);
    const contentHash = createHash('sha256').update(json).digest('hex');
    const latest = await transaction.projectHistorySnapshot.findFirst({ where: { projectId }, orderBy: { day: 'desc' }, select: { contentHash: true, day: true } });
    // The newest day holds the newest state: the same state again changed nothing since.
    if (latest?.contentHash === contentHash) return { status: 'unchanged' as const };
    // A late capture never rewrites a day older than the newest one with the state of now.
    const latestDay = latest ? latest.day.toISOString().slice(0, 10) : null;
    const writeDay = historyDayKey(burst.lastWriteAt);
    const day = latestDay && latestDay > writeDay ? latestDay : writeDay;
    const sizeBytes = Buffer.byteLength(json, 'utf8');
    const oversized = sizeBytes > maxBytes;
    const data = {
      takenAt: new Date(),
      lastWriteAt: burst.lastWriteAt,
      contentHash,
      payload: oversized ? Prisma.DbNull : (payload as unknown as Prisma.InputJsonObject),
      sizeBytes,
      oversized,
      // Changes of an earlier day only captured now: that day's end state is not kept on its own.
      partial: historyDayKey(burst.firstWriteAt) < day,
    };
    await transaction.projectHistorySnapshot.upsert({
      where: { projectId_day: { projectId, day: new Date(`${day}T00:00:00.000Z`) } },
      create: { projectId, day: new Date(`${day}T00:00:00.000Z`), ...data },
      update: data,
    });
    if (oversized) logEvent('warn', 'project.history.oversized', { projectId, sizeBytes });
    return { status: oversized ? ('oversized' as const) : ('captured' as const), day };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 });
}

type Burst = { firstWriteAt: Date; lastWriteAt: Date; timer: NodeJS.Timeout };
const bursts = new Map<string, Burst>();

/** A successful write to the project: its state is captured once the burst of writes settles. */
export function noteProjectWrite(projectId: string, at = new Date(), capture: typeof captureProjectHistory = captureProjectHistory) {
  const current = bursts.get(projectId);
  if (current) clearTimeout(current.timer);
  const firstWriteAt = current?.firstWriteAt ?? at;
  const wait = Math.max(0, Math.min(HISTORY_CAPTURE_DELAY_MS, HISTORY_CAPTURE_MAX_WAIT_MS - (at.getTime() - firstWriteAt.getTime())));
  const timer = setTimeout(() => {
    bursts.delete(projectId);
    void capture(projectId, { firstWriteAt, lastWriteAt: at }).catch((error) =>
      logEvent('error', 'project.history.capture_failed', { projectId, message: error instanceof Error ? error.message : String(error) }));
  }, wait);
  timer.unref();
  bursts.set(projectId, { firstWriteAt, lastWriteAt: at, timer });
}

export function pendingHistoryCaptures() {
  return bursts.size;
}

/**
 * Projects changed by something that is not a request — the schedule
 * recalculation on start, automation — are caught by their journals: a
 * project whose newest journal entry is newer than its last capture is captured.
 */
export async function sweepProjectHistory(client: PrismaClient = defaultPrisma) {
  const projects = await client.project.findMany({ select: { id: true, updatedAt: true } });
  let captured = 0;
  for (const project of projects) {
    if (bursts.has(project.id)) continue;
    const [audit, command, latest] = await Promise.all([
      client.auditEvent.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      client.wbsCommand.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      client.projectHistorySnapshot.findFirst({ where: { projectId: project.id }, orderBy: { takenAt: 'desc' }, select: { takenAt: true } }),
    ]);
    const newest = [project.updatedAt, audit?.createdAt, command?.createdAt].filter((value): value is Date => Boolean(value)).sort((left, right) => right.getTime() - left.getTime())[0];
    if (!newest || (latest && latest.takenAt >= newest)) continue;
    try {
      const result = await captureProjectHistory(project.id, { firstWriteAt: newest, lastWriteAt: newest }, client);
      if (result.status === 'captured' || result.status === 'oversized') captured += 1;
    } catch (error) {
      logEvent('error', 'project.history.sweep_failed', { projectId: project.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { projects: projects.length, captured };
}

export function startProjectHistorySweep(client: PrismaClient = defaultPrisma) {
  const run = () => void sweepProjectHistory(client).catch((error) =>
    logEvent('error', 'project.history.sweep_failed', { message: error instanceof Error ? error.message : String(error) }));
  const first = setTimeout(run, 60_000);
  first.unref();
  const interval = setInterval(run, HISTORY_SWEEP_INTERVAL_MS);
  interval.unref();
  return () => {
    clearTimeout(first);
    clearInterval(interval);
  };
}
