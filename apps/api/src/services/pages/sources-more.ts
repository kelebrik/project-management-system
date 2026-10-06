import { isJiraCancelledStatus, isJiraCriticalPriority, isJiraUnresolvedResolution, readJiraIssueAttributes } from '@pms/shared';
import { prisma } from '../../db.js';
import { moscowToday } from '../jira-portfolio.js';
import { PAGE_SOURCE_ROW_LIMIT, pageDay, type PageSourceAdapter, type PageSourceContext } from './sources.js';

/**
 * Adapters of "My page" beyond the first ones: issues, change requests,
 * lessons, people's workload, weekly check-ins and Jira issues. Same rules:
 * one query per source for all projects of the scope, the words computed here.
 * Jira is never asked — its rows are the projects' own snapshots, and its days
 * are Moscow days, as in the Jira widgets.
 */

const DAY_MS = 86_400_000;
const CLOSED_ISSUE = new Set(['Done', 'Closed', 'Resolved']);
const WAITING_CHANGE = new Set(['SUBMITTED', 'IN_REVIEW']);
const MOSCOW_OFFSET_MS = 3 * 3_600_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const moscowDay = (value: Date | null | undefined) => (value ? new Date(value.getTime() + MOSCOW_OFFSET_MS).toISOString().slice(0, 10) : null);

function refs(context: PageSourceContext) {
  const byId = new Map(context.projects.map((project) => [project.id, project]));
  return {
    ids: context.projects.map((project) => project.id),
    values: (projectId: string) => {
      const project = byId.get(projectId)!;
      return { project: project.code, projectName: project.name, portfolio: project.portfolio };
    },
    href: (projectId: string, section: string) => `/${encodeURIComponent(byId.get(projectId)!.code)}/${section}`,
  };
}

/** Issues of the projects ("Вопросы"); open until done, closed or resolved, as on the issues page. */
export const issues: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ref = refs(context);
  const items = await prisma.issue.findMany({
    where: { projectId: { in: ref.ids } },
    select: { id: true, projectId: true, title: true, category: true, severity: true, readiness: true, status: true, owner: true, decisionRequired: true, dueDate: true, createdAt: true, phase: { select: { title: true } } },
    orderBy: { id: 'asc' },
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  return items.map((item) => {
    const open = !CLOSED_ISSUE.has(item.status);
    const due = pageDay(item.dueDate);
    const overdue = open && due !== null && due < context.today;
    return {
      id: item.id,
      projectId: item.projectId,
      href: ref.href(item.projectId, 'issues'),
      values: {
        ...ref.values(item.projectId),
        title: item.title, category: item.category, severity: item.severity, readiness: item.readiness, status: item.status, owner: item.owner.trim() || null,
        phase: item.phase?.title ?? null, open, decisionRequired: item.decisionRequired, overdue, overdueDays: overdue ? daysBetween(due!, context.today) : null,
        dueDate: due, createdAt: pageDay(item.createdAt),
      },
    };
  });
};

export const changes: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ref = refs(context);
  const items = await prisma.changeRequest.findMany({
    where: { projectId: { in: ref.ids } },
    select: { id: true, projectId: true, title: true, type: true, status: true, owner: true, scheduleImpactDays: true, budgetImpact: true, dueDate: true, createdAt: true, approvedAt: true },
    orderBy: { id: 'asc' },
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  return items.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    href: ref.href(item.projectId, 'changes'),
    values: {
      ...ref.values(item.projectId),
      title: item.title, type: item.type, status: item.status, owner: item.owner.trim() || null, waiting: WAITING_CHANGE.has(item.status),
      scheduleImpactDays: item.scheduleImpactDays, budgetImpact: Number(item.budgetImpact), dueDate: pageDay(item.dueDate), createdAt: pageDay(item.createdAt), approvedAt: pageDay(item.approvedAt),
    },
  }));
};

export const lessons: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ref = refs(context);
  const items = await prisma.lesson.findMany({
    where: { projectId: { in: ref.ids } },
    select: { id: true, projectId: true, title: true, category: true, sourceKind: true, recommendation: true, createdByName: true, createdAt: true },
    orderBy: { id: 'asc' },
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  return items.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    href: '/development/lessons',
    values: { ...ref.values(item.projectId), title: item.title, category: item.category, sourceKind: item.sourceKind, recommendation: item.recommendation || null, author: item.createdByName, createdAt: pageDay(item.createdAt) },
  }));
};

/**
 * People with a share in the scope's projects today. Their planned total
 * counts shares on every open project, also those outside the page, as the
 * Workload page does; a person is overloaded when that total is above what
 * they have (their capacity).
 */
export const workload: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ref = refs(context);
  const today = new Date(`${context.today}T00:00:00.000Z`);
  const active = { startsOn: { lte: today }, OR: [{ endsOn: null }, { endsOn: { gte: today } }] };
  const inScope = await prisma.projectAllocation.findMany({
    where: { projectId: { in: ref.ids }, employee: { isActive: true }, ...active },
    select: { employeeId: true },
    distinct: ['employeeId'],
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  const people = inScope.map((row) => row.employeeId);
  if (people.length === 0) return [];
  const [employees, shares, leaves] = await Promise.all([
    prisma.leaveEmployee.findMany({ where: { id: { in: people } }, select: { id: true, name: true, department: true, capacityPercent: true } }),
    prisma.projectAllocation.findMany({ where: { employeeId: { in: people }, project: { status: { not: 'CLOSED' } }, ...active }, select: { employeeId: true, projectId: true, percent: true, project: { select: { code: true } } } }),
    prisma.leave.findMany({ where: { employeeId: { in: people }, startDate: { lte: today }, endDate: { gte: today } }, select: { employeeId: true } }),
  ]);
  const scopeIds = new Set(ref.ids);
  const onLeave = new Set(leaves.map((leave) => leave.employeeId));
  return employees.map((employee) => {
    const own = shares.filter((share) => share.employeeId === employee.id);
    const planned = own.reduce((sum, share) => sum + share.percent, 0);
    const scoped = own.filter((share) => scopeIds.has(share.projectId));
    return {
      id: employee.id,
      projectId: scoped[0]?.projectId ?? ref.ids[0],
      href: '/operations/workload',
      values: {
        project: null,
        person: employee.name, department: employee.department || null, capacity: employee.capacityPercent, planned,
        inScope: scoped.reduce((sum, share) => sum + share.percent, 0), free: employee.capacityPercent - planned,
        overloaded: planned > employee.capacityPercent, onLeave: onLeave.has(employee.id),
        projects: [...new Set(scoped.map((share) => share.project.code))],
      },
    };
  });
};

export const checkins: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ref = refs(context);
  const items = await prisma.workCheckIn.findMany({
    where: { projectId: { in: ref.ids } },
    select: { id: true, projectId: true, personName: true, weekStart: true, confidence: true, done: true, blocker: true, wbsItem: { select: { code: true, title: true } } },
    orderBy: [{ weekStart: 'desc' }, { id: 'asc' }],
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  return items.map((item) => ({
    id: item.id,
    projectId: item.projectId,
    href: '/development/my-work',
    values: {
      ...ref.values(item.projectId),
      title: `${item.wbsItem.code} ${item.wbsItem.title}`, person: item.personName, confidence: item.confidence, done: item.done || null, blocker: item.blocker || null,
      hasBlocker: item.blocker.trim().length > 0, weekStart: pageDay(item.weekStart),
    },
  }));
};

/**
 * Jira issues from the projects' own snapshots. Open means no resolution
 * and not cancelled; cancelled issues are left out, as in the Jira widgets.
 */
export const jira: PageSourceAdapter = async (context) => {
  if (context.projects.length === 0) return [];
  const ref = refs(context);
  const today = moscowToday(context.now);
  const items = await prisma.jiraIssueSnapshot.findMany({
    where: { projectId: { in: ref.ids }, retiredAt: null },
    select: { id: true, projectId: true, issueKey: true, issueUrl: true, summary: true, status: true, priority: true, assignee: true, issueType: true, labels: true, sprint: true, resolution: true, resolutionAt: true, issueCreatedAt: true, attributes: true },
    orderBy: { id: 'asc' },
    take: PAGE_SOURCE_ROW_LIMIT + 1,
  });
  return items.flatMap((item) => {
    if (isJiraCancelledStatus(item.status)) return [];
    const attributes = readJiraIssueAttributes(item.attributes);
    const open = isJiraUnresolvedResolution(item.resolution);
    const created = moscowDay(item.issueCreatedAt);
    const due = attributes?.dueDate ?? null;
    return [{
      id: item.id,
      projectId: item.projectId,
      href: item.issueUrl || ref.href(item.projectId, 'jira-work'),
      values: {
        ...ref.values(item.projectId),
        issueKey: item.issueKey, summary: item.summary, status: item.status, statusCategory: attributes?.statusCategoryKey ?? null, issueType: item.issueType,
        priority: item.priority, assignee: item.assignee?.trim() || null, sprint: item.sprint, labels: item.labels, components: attributes?.components ?? [], epic: attributes?.epicKey ?? null,
        open, critical: isJiraCriticalPriority(item.priority), overdue: open && due !== null && due < today, storyPoints: attributes?.storyPoints ?? null,
        ageDays: created ? Math.max(0, daysBetween(created, open ? today : moscowDay(item.resolutionAt) ?? today)) : null,
        dueDate: due, createdAt: created, resolvedAt: open ? null : moscowDay(item.resolutionAt),
      },
    }];
  });
};
