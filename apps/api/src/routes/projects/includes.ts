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

export const portfolioRoadmapProjectSelect = {
  id: true,
  code: true,
  name: true,
  portfolio: true,
  projectManager: true,
  status: true,
  rag: true,
  sortOrder: true,
  businessUnit: { select: { id: true, code: true, name: true } },
  wbsItems: {
    where: {
      OR: [
        { startDate: { not: null } },
        { dueDate: { not: null } },
        { forecastStartDate: { not: null } },
        { forecastDueDate: { not: null } },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      parentId: true,
      code: true,
      title: true,
      type: true,
      status: true,
      startDate: true,
      dueDate: true,
      forecastStartDate: true,
      forecastDueDate: true,
      progress: true,
    },
  },
} satisfies Prisma.ProjectSelect;

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
