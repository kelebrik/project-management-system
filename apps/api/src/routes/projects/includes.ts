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
      tasks: true,
      issues: true,
      jiraSnapshots: { where: { retiredAt: null } },
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
          snapshot: {
            include: {
              statusTransitions: { orderBy: { transitionedAt: 'asc' } },
              developmentActivities: { orderBy: { activityAt: 'desc' } },
            },
          },
        },
      },
    },
  },
  tasks: { orderBy: { updatedAt: 'desc' } },
  issues: {
    where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
    orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
    include: {
      jiraLinks: { orderBy: { createdAt: 'asc' } },
      statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
    },
  },
  jiraSnapshots: {
    where: { retiredAt: null },
    orderBy: { updatedAt: 'desc' },
    include: {
      statusTransitions: { orderBy: { transitionedAt: 'asc' } },
      developmentActivities: { orderBy: { activityAt: 'desc' } },
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
    jiraLinks: { orderBy: { createdAt: 'asc' } },
    statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
  },
} satisfies Prisma.IssueFindManyArgs;
