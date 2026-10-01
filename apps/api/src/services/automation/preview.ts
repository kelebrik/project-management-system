import { automationParamsSchemas, type AutomationTemplate, type NotificationParams } from '@pms/shared';
import { prisma } from '../../db.js';
import { missingCheckIns, weekStartOf } from '../my-work.js';
import { loadExhaustedFloat, loadReconciliation } from './engine.js';
import { blockerEvents, cutText, jiraDoneEvents, listed, rowRef, shiftEvents } from './templates.js';
import { automationTimeZone, localMoment } from './time.js';

export const PREVIEW_DAYS = 28;
const DAY_MS = 86_400_000;

/**
 * How a preview was made: from the recorded history, approximately (today's
 * open work against past check-ins), or only from the state now, because the
 * past state was never stored.
 */
export type PreviewMode = 'HISTORY' | 'APPROXIMATE' | 'CURRENT_ONLY';
export type RulePreview = { mode: PreviewMode; days: number; items: Array<{ at: string | null; params: NotificationParams }>; total: number };

const MAX_ITEMS = 50;

/** What a rule would have said over the last four weeks, from what the system recorded; it writes nothing. */
export async function previewRule(project: { id: string; code: string }, template: AutomationTemplate, params: unknown, now = new Date()): Promise<RulePreview> {
  const from = new Date(now.getTime() - PREVIEW_DAYS * DAY_MS);
  const zone = automationTimeZone();
  const done = (mode: PreviewMode, items: RulePreview['items']) => ({ mode, days: PREVIEW_DAYS, items: items.slice(0, MAX_ITEMS), total: items.length });

  if (template === 'MILESTONE_SHIFT') {
    const { minDays } = automationParamsSchemas.MILESTONE_SHIFT.parse(params ?? {});
    const shifts = await prisma.scheduleShift.findMany({ where: { projectId: project.id, kind: 'SHIFT', createdAt: { gt: from } }, orderBy: { createdAt: 'desc' }, take: 2000 });
    return done(
      'HISTORY',
      shiftEvents(shifts, minDays, (at) => localMoment(at, zone).date).map(({ shift }) => ({
        at: shift.createdAt.toISOString(),
        params: {
          kind: 'MILESTONE_SHIFTED',
          projectCode: project.code,
          row: rowRef({ id: shift.checkpointId!, code: shift.checkpointCode, title: shift.checkpointTitle }),
          days: shift.deltaDays ?? 0,
          newDate: shift.newDate ? shift.newDate.toISOString().slice(0, 10) : null,
        },
      })),
    );
  }

  if (template === 'CHECK_IN_BLOCKER') {
    const checkIns = await prisma.workCheckIn.findMany({
      where: { projectId: project.id, updatedAt: { gt: from } },
      orderBy: { updatedAt: 'desc' },
      take: 2000,
      include: { wbsItem: { select: { id: true, code: true, title: true } } },
    });
    const byId = new Map(checkIns.map((checkIn) => [checkIn.id, checkIn]));
    return done(
      'HISTORY',
      blockerEvents(checkIns).map(({ checkIn }) => {
        const full = byId.get(checkIn.id)!;
        return {
          at: full.updatedAt.toISOString(),
          params: { kind: 'CHECK_IN_BLOCKER', projectCode: project.code, row: rowRef(full.wbsItem), person: full.personName, blocker: cutText(full.blocker.trim()), offTrack: full.confidence === 'OFF_TRACK' },
        };
      }),
    );
  }

  if (template === 'MISSING_CHECK_IN') {
    // Who owned open work in a past week is not stored: today's owners stand in for them.
    const currentWeek = weekStartOf(now, zone);
    const owners = await prisma.wbsItem.findMany({
      where: { projectId: project.id, type: { in: ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] }, status: { notIn: ['DONE', 'CANCELLED'] }, owner: { not: '' }, children: { none: {} } },
      select: { owner: true, startDate: true },
    });
    const items: RulePreview['items'] = [];
    for (let back = 1; back <= PREVIEW_DAYS / 7; back += 1) {
      const weekStart = new Date(currentWeek.getTime() - back * 7 * DAY_MS);
      const weekEnd = new Date(weekStart.getTime() + 6 * DAY_MS);
      const checkIns = await prisma.workCheckIn.findMany({ where: { projectId: project.id, weekStart }, select: { personName: true } });
      const people = missingCheckIns(
        owners.filter((row) => row.startDate && row.startDate <= weekEnd).map((row) => row.owner.trim()),
        checkIns.map((row) => row.personName),
      );
      if (people.length === 0) continue;
      const { rows, more } = listed(people);
      const week = weekStart.toISOString().slice(0, 10);
      items.push({ at: `${week}T09:00:00.000Z`, params: { kind: 'CHECK_IN_MISSING_SUMMARY', projectCode: project.code, weekStart: week, people: rows, more } });
    }
    return done('APPROXIMATE', items);
  }

  if (template === 'FLOAT_EXHAUSTED') {
    const rows = (await loadExhaustedFloat(prisma, project.id)).map(rowRef);
    if (rows.length === 0) return done('CURRENT_ONLY', []);
    const { rows: named, more } = listed(rows);
    return done('CURRENT_ONLY', [{ at: null, params: { kind: 'FLOAT_EXHAUSTED', projectCode: project.code, rows: named, more } }]);
  }

  const rows = jiraDoneEvents(await loadReconciliation(prisma, project, now)).map(({ row }) => rowRef(row));
  if (rows.length === 0) return done('CURRENT_ONLY', []);
  const { rows: named, more } = listed(rows);
  return done('CURRENT_ONLY', [{ at: null, params: { kind: 'JIRA_DONE', projectCode: project.code, rows: named, more } }]);
}
