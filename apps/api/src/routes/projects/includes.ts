import type { Prisma } from '@prisma/client';

export const projectInclude = {
  businessUnit: { select: { id: true, code: true, name: true } },
  jiraIntegration: true,
  jiraAnalyticsSettings: true,
  wbsItems: {
    where: { type: { in: ['GOAL', 'TASK', 'DELIVERABLE'] } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  },
  raidItems: {
    where: {
      type: { in: ['DEPENDENCY', 'RISK'] },
      riskScore: { gte: 15 },
      status: { notIn: ['CLOSED', 'VALIDATED'] },
    },
    orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
    include: {
      statusUpdates: {
        orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    },
  },
  targetDateChanges: {
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  },
  _count: {
    select: {
      wbsItems: true,
      tasks: true,
      issues: true,
      jiraSnapshots: { where: { retiredAt: null } },
    },
  },
} satisfies Prisma.ProjectInclude;

/**
 * The project list: the same as projectInclude, but its work rows carry only
 * what the list's readers use (portfolio goals, project progress, people's
 * load). An open project loads its full rows separately, so the list stays a
 * fraction of the size on a large portfolio.
 */
export const projectListInclude = {
  ...projectInclude,
  wbsItems: {
    where: projectInclude.wbsItems.where,
    orderBy: projectInclude.wbsItems.orderBy,
    select: {
      id: true,
      parentId: true,
      code: true,
      title: true,
      type: true,
      status: true,
      owner: true,
      priority: true,
      startDate: true,
      dueDate: true,
      baselineDueDate: true,
      forecastDueDate: true,
      calendarCode: true,
      effortPercent: true,
      workDays: true,
      planWorkDays: true,
      progress: true,
    },
  },
} satisfies Prisma.ProjectInclude;

export const projectDetailsInclude = {
  businessUnit: { select: { id: true, code: true, name: true } },
  jiraIntegration: true,
  jiraAnalyticsSettings: true,
  targetDateChanges: {
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
    },
  },
  jiraWorkSections: {
    orderBy: { sortOrder: 'asc' },
    include: {
      issues: {
        orderBy: { syncedAt: 'desc' },
        include: {
          snapshot: true,
        },
      },
    },
  },
  tasks: { orderBy: { updatedAt: 'desc' } },
  issues: {
    where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
    orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
    include: {
      threadLinks: { orderBy: { createdAt: 'asc' } },
      jiraLinks: { orderBy: { createdAt: 'asc' } },
      statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
    },
  },
  overviews: { orderBy: { version: 'desc' }, take: 8 },
  milestones: { orderBy: { dueDate: 'asc' } },
  wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
  wbsDependencies: {
    orderBy: { createdAt: 'asc' },
    include: {
      predecessor: { select: { id: true, code: true, title: true } },
      successor: { select: { id: true, code: true, title: true } },
    },
  },
  calendarOverrides: { orderBy: [{ calendarCode: 'asc' }, { date: 'asc' }] },
  artifacts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  raidItems: {
    orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
    include: {
      statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
    },
  },
  changeRequests: { orderBy: [{ updatedAt: 'desc' }] },
} satisfies Prisma.ProjectInclude;

export const closedIssuesInclude = {
  where: { status: { in: ['Done', 'Closed', 'Resolved'] } },
  orderBy: [{ updatedAt: 'desc' }],
  include: {
    threadLinks: { orderBy: { createdAt: 'asc' } },
    jiraLinks: { orderBy: { createdAt: 'asc' } },
    statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
  },
} satisfies Prisma.IssueFindManyArgs;
