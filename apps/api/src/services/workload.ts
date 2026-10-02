import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { Request } from 'express';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { userProjectAccessLevelMap } from '../server/project-access.js';
import { buildWbsPredecessorRefs, wbsDateLinks } from './wbs-schedule/predecessors.js';

/** Work that someone does: leaf items of these types. Phases, goals and milestones are not work. */
const WORK_TYPES = ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] as const;
/** Issue statuses that no longer manage their work package. */
const CLOSED_ISSUE_STATUSES = ['Done', 'Closed', 'Resolved'];

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateText(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** Projects the current user may change: the same rule the write middleware applies to WBS items. */
export async function editableProjectIds(req: Request, projectIds: string[]) {
  const user = currentUser(req);
  if (!user || projectIds.length === 0) return [];
  if (user.role === 'ADMIN' || (isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID)) return projectIds;
  const levels = await userProjectAccessLevelMap(user.id, projectIds);
  return projectIds.filter((id) => ['EDIT', 'ADMIN'].includes(levels.get(id) ?? ''));
}

type ScheduleLink = { code: string; title: string; type: string; lagDays: number };

/**
 * Which dates of each item its predecessors set, and by which links: start-to-start
 * and finish-to-start fix the start, finish-to-finish and start-to-finish the finish.
 */
async function scheduleLocks(projectIds: string[]) {
  const [items, dependencies] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        id: true, projectId: true, code: true, title: true, leadLagDays: true,
        predecessor1: true, predecessor2: true, predecessor3: true,
        predecessor4: true, predecessor5: true, predecessor6: true,
      },
    }),
    prisma.wbsDependency.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, predecessorId: true, successorId: true, type: true, lagDays: true },
    }),
  ]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const locks = new Map<string, { startLinks: ScheduleLink[]; finishLinks: ScheduleLink[] }>();
  // Codes are unique within a project only, so each project is resolved on its own.
  for (const projectId of projectIds) {
    const refs = buildWbsPredecessorRefs(
      items.filter((item) => item.projectId === projectId),
      dependencies.filter((dependency) => dependency.projectId === projectId),
    );
    for (const [itemId, itemRefs] of refs) {
      const links = wbsDateLinks(itemRefs);
      const describe = (ref: (typeof itemRefs)[number]): ScheduleLink => {
        const predecessor = byId.get(ref.predecessorId);
        return { code: predecessor?.code ?? '', title: predecessor?.title ?? '', type: ref.type, lagDays: ref.lagDays };
      };
      locks.set(itemId, { startLinks: links.start.map(describe), finishLinks: links.finish.map(describe) });
    }
  }
  return locks;
}

/**
 * The work of the period across the projects the user may read: leaf work with
 * an owner and dates, which of its dates links set, whether an open issue
 * manages it, the projects the user may change, the people directory, leaves
 * and the working-day calendar. The workload page and the AI rebalancing read
 * the same data.
 */
const CALENDAR_MARGIN_DAYS = 120;
const shiftDays = (day: string, days: number) => {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return dateText(date);
};

export async function loadWorkload(req: Request, range: { from: string; to: string }) {
  const projectScope = { status: { not: 'CLOSED' as const }, ...(await readableProjectWhere(req)) };
  const [items, employees, leaves, calendarDays] = await Promise.all([
    prisma.wbsItem.findMany({
      where: {
        project: projectScope,
        type: { in: [...WORK_TYPES] },
        status: { not: 'CANCELLED' },
        owner: { not: '' },
        // Leaf work only: a package with its own tasks is covered by them.
        children: { none: {} },
        startDate: { not: null, lte: toDate(range.to) },
        dueDate: { not: null, gte: toDate(range.from) },
      },
      select: {
        id: true,
        projectId: true,
        code: true,
        title: true,
        owner: true,
        type: true,
        status: true,
        startDate: true,
        dueDate: true,
        updatedAt: true,
        calendarCode: true,
        project: { select: { id: true, code: true, name: true } },
      },
      orderBy: [{ startDate: 'asc' }],
    }),
    prisma.leaveEmployee.findMany({
      where: { isActive: true },
      select: { id: true, name: true, department: true },
    }),
    prisma.leave.findMany({
      where: { startDate: { lte: toDate(range.to) }, endDate: { gte: toDate(range.from) } },
      select: { id: true, employeeId: true, typeId: true, startDate: true, endDate: true },
    }),
    prisma.leaveCalendarDay.findMany({ orderBy: { date: 'asc' } }),
  ]);
  const projects = new Map<string, { id: string; code: string; name: string }>();
  // A blank owner names nobody.
  const shown = items.filter((item) => item.owner.trim() && item.startDate && item.dueDate && item.startDate <= item.dueDate);
  const projectIds = [...new Set(shown.map((item) => item.projectId))];
  // Days a project's calendar sets apart, with room around the period for drags past its edges.
  const calendarFrom = shiftDays(range.from, -CALENDAR_MARGIN_DAYS);
  const calendarTo = shiftDays(range.to, CALENDAR_MARGIN_DAYS);
  const [locks, issueLinks, editable, calendarOverrides, openProjects] = await Promise.all([
    scheduleLocks(projectIds),
    prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        status: { notIn: CLOSED_ISSUE_STATUSES },
        workPackageId: { in: shown.map((item) => item.id) },
      },
      select: { workPackageId: true },
    }),
    editableProjectIds(req, projectIds),
    prisma.projectCalendarOverride.findMany({
      where: { projectId: { in: projectIds }, date: { gte: toDate(calendarFrom), lte: toDate(calendarTo) } },
      select: { projectId: true, calendarCode: true, date: true, isWorkingDay: true },
      orderBy: [{ date: 'asc' }],
    }),
    prisma.project.findMany({ where: projectScope, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
  ]);
  // Every open project the user may add work to, not only those with work shown.
  const editableOpen = new Set(await editableProjectIds(req, openProjects.map((project) => project.id)));
  const projectCalendars: Record<string, Array<{ calendarCode: string; date: string; isWorkingDay: boolean }>> = {};
  for (const override of calendarOverrides) {
    (projectCalendars[override.projectId] ??= []).push({ calendarCode: override.calendarCode, date: dateText(override.date), isWorkingDay: override.isWorkingDay });
  }
  const managedByIssue = new Set(issueLinks.map((issue) => issue.workPackageId));
  const work = shown
    .map((item) => {
      projects.set(item.project.id, item.project);
      const lock = locks.get(item.id);
      return {
        id: item.id,
        projectId: item.projectId,
        code: item.code,
        title: item.title,
        owner: item.owner.trim(),
        type: item.type,
        status: item.status,
        startDate: dateText(item.startDate!),
        dueDate: dateText(item.dueDate!),
        updatedAt: item.updatedAt.toISOString(),
        startLocked: (lock?.startLinks.length ?? 0) > 0,
        finishLocked: (lock?.finishLinks.length ?? 0) > 0,
        startLinks: lock?.startLinks ?? [],
        finishLinks: lock?.finishLinks ?? [],
        lockedByIssue: managedByIssue.has(item.id),
        calendarCode: item.calendarCode,
      };
    });
  return {
    projects: [...projects.values()].sort((left, right) => left.code.localeCompare(right.code, 'ru')),
    items: work,
    editableProjectIds: editable,
    editableProjects: openProjects.filter((project) => editableOpen.has(project.id)),
    projectCalendars,
    employees,
    leaves: leaves.map((leave) => ({
      ...leave,
      startDate: dateText(leave.startDate),
      endDate: dateText(leave.endDate),
    })),
    calendarDays: calendarDays.map((day) => ({
      date: dateText(day.date),
      isWorkingDay: day.isWorkingDay,
      description: day.description,
    })),
  };
}

export type WorkloadSnapshot = Awaited<ReturnType<typeof loadWorkload>>;

/**
 * Where a new piece of work can go in one project from the Workload page: its
 * phases and work packages (not those an open issue manages), each with the
 * calendar a child would take, the calendar of a new top-level row, and the
 * days the project's calendar sets apart around the period.
 */
export async function loadAppendTargets(projectId: string, range: { from: string; to: string }) {
  const [rows, managed, overrides] = await Promise.all([
    prisma.wbsItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, code: true, title: true, type: true, wbsLevel: true, calendarCode: true, status: true },
    }),
    prisma.issue.findMany({ where: { projectId, status: { notIn: CLOSED_ISSUE_STATUSES }, workPackageId: { not: null } }, select: { workPackageId: true } }),
    prisma.projectCalendarOverride.findMany({
      where: { projectId, date: { gte: toDate(shiftDays(range.from, -CALENDAR_MARGIN_DAYS)), lte: toDate(shiftDays(range.to, CALENDAR_MARGIN_DAYS)) } },
      select: { calendarCode: true, date: true, isWorkingDay: true },
      orderBy: [{ date: 'asc' }],
    }),
  ]);
  const managedIds = new Set(managed.map((issue) => issue.workPackageId));
  return {
    projectId,
    defaultCalendarCode: rows[0]?.calendarCode ?? 'RU',
    parents: rows
      .filter((row) => (row.type === 'PHASE' || row.type === 'WORK_PACKAGE') && row.status !== 'CANCELLED' && !managedIds.has(row.id))
      .map((row) => ({ id: row.id, code: row.code, title: row.title, type: row.type, level: row.wbsLevel ?? row.code.split('.').length, calendarCode: row.calendarCode })),
    calendar: overrides.map((override) => ({ calendarCode: override.calendarCode, date: dateText(override.date), isWorkingDay: override.isWorkingDay })),
  };
}
