import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { prisma } from './db.js';
import { fetchJiraIssues, isJiraConfigured } from './jira.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);
const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

app.use(express.json());
app.use(
  cors({
    origin: webOrigin === '*' ? true : webOrigin.split(',').map((origin) => origin.trim()),
  }),
);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`select 1`;
    res.json({ ok: true, database: 'ok', jiraConfigured: isJiraConfigured() });
  } catch {
    res.status(503).json({ ok: false, database: 'unavailable', jiraConfigured: isJiraConfigured() });
  }
});

app.get('/api/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    include: {
      jiraIntegration: true,
      _count: {
        select: { tasks: true, issues: true, jiraSnapshots: true },
      },
    },
  });

  res.json(projects);
});

const projectSchema = z.object({
  parentId: z.string().trim().optional().nullable(),
  code: z.string().trim().min(2),
  name: z.string().trim().min(3),
  portfolio: z.string().trim().min(1),
  sponsor: z.string().trim().min(1),
  projectManager: z.string().trim().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED']).default('ACTIVE'),
  rag: z.enum(['GREEN', 'AMBER', 'RED']).default('GREEN'),
  startDate: z.string().trim().min(1),
  targetDate: z.string().trim().min(1),
  budgetPlanned: z.coerce.number().nonnegative(),
  budgetForecast: z.coerce.number().nonnegative(),
  scheduleVariance: z.coerce.number().int().default(0),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  summary: z.string().trim().min(3),
  sortOrder: z.coerce.number().int().default(0),
});

async function wouldCreateProjectCycle(projectId: string, nextParentId: string | null | undefined) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === projectId) {
      return true;
    }
    const parent = await prisma.project.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

app.post('/api/projects', async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.parentId) {
    const parent = await prisma.project.findUnique({
      where: { id: parsed.data.parentId },
    });
    if (!parent) {
      res.status(400).json({ error: 'Parent project not found' });
      return;
    }
  }

  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      parentId: parsed.data.parentId || null,
      startDate: new Date(parsed.data.startDate),
      targetDate: new Date(parsed.data.targetDate),
      budgetPlanned: parsed.data.budgetPlanned,
      budgetForecast: parsed.data.budgetForecast,
    },
    include: {
      jiraIntegration: true,
      _count: {
        select: { tasks: true, issues: true, jiraSnapshots: true },
      },
    },
  });

  res.status(201).json(project);
});

app.patch('/api/projects/:projectId', async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  if (parsed.data.parentId === project.id) {
    res.status(400).json({ error: 'Project cannot be its own parent' });
    return;
  }

  if (parsed.data.parentId) {
    const parent = await prisma.project.findUnique({
      where: { id: parsed.data.parentId },
    });
    if (!parent) {
      res.status(400).json({ error: 'Parent project not found' });
      return;
    }
  }

  const nextParentId = parsed.data.parentId === undefined ? project.parentId : parsed.data.parentId;
  if (await wouldCreateProjectCycle(project.id, nextParentId)) {
    res.status(400).json({ error: 'Project cannot be moved under its own child' });
    return;
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      ...parsed.data,
      parentId:
        parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
      targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
      budgetPlanned: parsed.data.budgetPlanned,
      budgetForecast: parsed.data.budgetForecast,
    },
  });

  res.json(updated);
});

app.get('/api/projects/:projectId/overview', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      jiraIntegration: true,
      tasks: { orderBy: { updatedAt: 'desc' } },
      issues: {
        where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
        orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
        include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
      },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
      overviews: { orderBy: { version: 'desc' }, take: 1 },
      milestones: { orderBy: { dueDate: 'asc' } },
      wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
    },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(project);
});

const milestoneSchema = z.object({
  title: z.string().trim().min(3),
  dueDate: z.string().trim().min(1),
  status: z.enum(['Planned', 'In Progress', 'At Risk', 'Done', 'Cancelled']).default('Planned'),
  owner: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
});

app.post('/api/projects/:projectId/milestones', async (req, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const milestone = await prisma.milestone.create({
    data: {
      projectId: project.id,
      title: parsed.data.title,
      dueDate: new Date(parsed.data.dueDate),
      status: parsed.data.status,
      owner: parsed.data.owner,
      description: parsed.data.description,
    },
  });

  res.status(201).json(milestone);
});

app.patch('/api/milestones/:milestoneId', async (req, res) => {
  const parsed = milestoneSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id: req.params.milestoneId },
  });

  if (!milestone) {
    res.status(404).json({ error: 'Milestone not found' });
    return;
  }

  const updated = await prisma.milestone.update({
    where: { id: milestone.id },
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    },
  });

  res.json(updated);
});

const wbsItemSchema = z.object({
  parentId: z.string().trim().optional().nullable(),
  code: z.string().trim().min(1),
  title: z.string().trim().min(3),
  type: z.enum(['PHASE', 'WORK_PACKAGE', 'DELIVERABLE', 'TASK']).default('TASK'),
  status: z
    .enum(['NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'BLOCKED', 'DONE', 'CANCELLED'])
    .default('NOT_STARTED'),
  owner: z.string().trim().min(1),
  startDate: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  plannedCost: z.coerce.number().nonnegative().default(0),
  forecastCost: z.coerce.number().nonnegative().default(0),
  progress: z.coerce.number().int().min(0).max(100).default(0),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z.string().trim().url().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

async function validateWbsProjectAndParent(
  projectId: string,
  parentId: string | null | undefined,
  jiraTicketUrl: string | null | undefined,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    return { error: 'Project not found' as const };
  }

  if (parentId) {
    const parent = await prisma.wbsItem.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.projectId !== project.id) {
      return { error: 'Parent WBS item not found in this project' as const };
    }
  }

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && jiraTicketUrl && !jiraTicketUrl.startsWith(jiraBaseUrl)) {
    return { error: `Jira URL must start with ${jiraBaseUrl}` as const };
  }

  return { project };
}

async function wouldCreateWbsCycle(itemId: string, nextParentId: string | null | undefined) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === itemId) {
      return true;
    }
    const parent = await prisma.wbsItem.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

app.post('/api/projects/:projectId/wbs-items', async (req, res) => {
  const parsed = wbsItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const validation = await validateWbsProjectAndParent(
    req.params.projectId,
    parsed.data.parentId,
    parsed.data.jiraTicketUrl,
  );
  if ('error' in validation) {
    res.status(validation.error === 'Project not found' ? 404 : 400).json({ error: validation.error });
    return;
  }

  const item = await prisma.wbsItem.create({
    data: {
      projectId: validation.project.id,
      parentId: parsed.data.parentId || null,
      code: parsed.data.code,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      owner: parsed.data.owner,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey: parsed.data.jiraTicketKey || null,
      jiraTicketUrl: parsed.data.jiraTicketUrl || null,
      description: parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    },
  });

  res.status(201).json(item);
});

app.patch('/api/wbs-items/:itemId', async (req, res) => {
  const parsed = wbsItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!existing) {
    res.status(404).json({ error: 'WBS item not found' });
    return;
  }

  if (parsed.data.parentId === existing.id) {
    res.status(400).json({ error: 'WBS item cannot be its own parent' });
    return;
  }

  const nextParentId = parsed.data.parentId === undefined ? existing.parentId : parsed.data.parentId;
  const nextJiraUrl =
    parsed.data.jiraTicketUrl === undefined ? existing.jiraTicketUrl : parsed.data.jiraTicketUrl;
  const validation = await validateWbsProjectAndParent(existing.projectId, nextParentId, nextJiraUrl);
  if ('error' in validation) {
    res.status(validation.error === 'Project not found' ? 404 : 400).json({ error: validation.error });
    return;
  }

  if (await wouldCreateWbsCycle(existing.id, nextParentId)) {
    res.status(400).json({ error: 'WBS item cannot be moved under its own child' });
    return;
  }

  const updated = await prisma.wbsItem.update({
    where: { id: existing.id },
    data: {
      parentId:
        parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
      code: parsed.data.code,
      title: parsed.data.title,
      type: parsed.data.type,
      status: parsed.data.status,
      owner: parsed.data.owner,
      startDate:
        parsed.data.startDate === undefined
          ? undefined
          : parsed.data.startDate
            ? new Date(parsed.data.startDate)
            : null,
      dueDate:
        parsed.data.dueDate === undefined
          ? undefined
          : parsed.data.dueDate
            ? new Date(parsed.data.dueDate)
            : null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey:
        parsed.data.jiraTicketKey === undefined ? undefined : parsed.data.jiraTicketKey || null,
      jiraTicketUrl:
        parsed.data.jiraTicketUrl === undefined ? undefined : parsed.data.jiraTicketUrl || null,
      description:
        parsed.data.description === undefined ? undefined : parsed.data.description || null,
      sortOrder: parsed.data.sortOrder,
    },
  });

  res.json(updated);
});

app.delete('/api/wbs-items/:itemId', async (req, res) => {
  const existing = await prisma.wbsItem.findUnique({
    where: { id: req.params.itemId },
  });

  if (!existing) {
    res.status(404).json({ error: 'WBS item not found' });
    return;
  }

  await prisma.wbsItem.delete({
    where: { id: existing.id },
  });

  res.status(204).send();
});

app.get('/api/projects/:projectId/open-issues', async (req, res) => {
  const issues = await prisma.issue.findMany({
    where: {
      projectId: req.params.projectId,
      status: { notIn: ['Done', 'Closed', 'Resolved'] },
    },
    orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  });

  res.json(issues);
});

const jiraIntegrationSchema = z.object({
  baseUrl: z.string().trim().url(),
  boardUrl: z.string().trim().url(),
  projectKey: z.string().trim().min(1),
  issuesJql: z.string().trim().min(1),
  openIssuesJql: z.string().trim().min(1),
});

app.put('/api/projects/:projectId/jira-integration', async (req, res) => {
  const parsed = jiraIntegrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const integration = await prisma.jiraIntegration.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      ...parsed.data,
      syncStatus: 'CONFIGURED',
    },
    update: {
      ...parsed.data,
      syncStatus: 'CONFIGURED',
    },
  });

  res.json(integration);
});

const createIssueSchema = z.object({
  title: z.string().trim().min(3),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  owner: z.string().trim().min(1),
  impact: z.string().trim().min(3),
  decisionRequired: z.boolean().default(false),
  dueDate: z.string().trim().optional().nullable(),
  jiraTicketKey: z.string().trim().optional().nullable(),
  jiraTicketUrl: z.string().trim().url().optional().nullable(),
  jiraLinks: z
    .array(
      z.object({
        jiraKey: z.string().trim().min(1),
        jiraUrl: z.string().trim().url(),
      }),
    )
    .optional()
    .default([]),
});

app.post('/api/projects/:projectId/open-issues', async (req, res) => {
  const parsed = createIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const jiraLinks = [
    ...parsed.data.jiraLinks,
    ...(parsed.data.jiraTicketKey && parsed.data.jiraTicketUrl
      ? [{ jiraKey: parsed.data.jiraTicketKey, jiraUrl: parsed.data.jiraTicketUrl }]
      : []),
  ].filter(
    (link, index, allLinks) =>
      allLinks.findIndex((candidate) => candidate.jiraKey === link.jiraKey) === index,
  );

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  const invalidLink = jiraLinks.find((link) => jiraBaseUrl && !link.jiraUrl.startsWith(jiraBaseUrl));
  if (jiraBaseUrl && invalidLink) {
    res.status(400).json({ error: `Jira URL must start with ${jiraBaseUrl}` });
    return;
  }

  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      source: jiraLinks.length > 0 ? 'JIRA' : 'INTERNAL',
      title: parsed.data.title,
      severity: parsed.data.severity,
      status: 'Open',
      owner: parsed.data.owner,
      impact: parsed.data.impact,
      decisionRequired: parsed.data.decisionRequired,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      jiraTicketKey: jiraLinks[0]?.jiraKey,
      jiraTicketUrl: jiraLinks[0]?.jiraUrl,
      jiraLinks: {
        create: jiraLinks.map((link) => ({
          jiraKey: link.jiraKey,
          jiraUrl: link.jiraUrl,
        })),
      },
    },
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  });

  res.status(201).json(issue);
});

const updateIssueSchema = z.object({
  title: z.string().trim().min(3).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['Open', 'In Progress', 'Blocked', 'Resolved', 'Closed']).optional(),
  owner: z.string().trim().min(1).optional(),
  impact: z.string().trim().min(3).optional(),
  decisionRequired: z.boolean().optional(),
  dueDate: z.string().trim().optional().nullable(),
});

app.patch('/api/open-issues/:issueId', async (req, res) => {
  const parsed = updateIssueSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
  });

  if (!issue) {
    res.status(404).json({ error: 'Issue not found' });
    return;
  }

  const updated = await prisma.issue.update({
    where: { id: issue.id },
    data: {
      ...parsed.data,
      dueDate:
        parsed.data.dueDate === undefined
          ? undefined
          : parsed.data.dueDate
            ? new Date(parsed.data.dueDate)
            : null,
    },
    include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
  });

  res.json(updated);
});

const issueJiraLinkSchema = z.object({
  jiraKey: z.string().trim().min(1),
  jiraUrl: z.string().trim().url(),
});

app.post('/api/open-issues/:issueId/jira-links', async (req, res) => {
  const parsed = issueJiraLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const issue = await prisma.issue.findUnique({
    where: { id: req.params.issueId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!issue) {
    res.status(404).json({ error: 'Issue not found' });
    return;
  }

  const jiraBaseUrl = issue.project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && !parsed.data.jiraUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `Jira URL must start with ${jiraBaseUrl}` });
    return;
  }

  const link = await prisma.issueJiraLink.upsert({
    where: {
      issueId_jiraKey: {
        issueId: issue.id,
        jiraKey: parsed.data.jiraKey,
      },
    },
    create: {
      issueId: issue.id,
      jiraKey: parsed.data.jiraKey,
      jiraUrl: parsed.data.jiraUrl,
    },
    update: {
      jiraUrl: parsed.data.jiraUrl,
    },
  });

  if (!issue.jiraTicketKey || !issue.jiraTicketUrl) {
    await prisma.issue.update({
      where: { id: issue.id },
      data: {
        source: 'JIRA',
        jiraTicketKey: parsed.data.jiraKey,
        jiraTicketUrl: parsed.data.jiraUrl,
      },
    });
  }

  res.status(201).json(link);
});

app.delete('/api/open-issues/:issueId/jira-links/:linkId', async (req, res) => {
  const link = await prisma.issueJiraLink.findUnique({
    where: { id: req.params.linkId },
  });

  if (!link || link.issueId !== req.params.issueId) {
    res.status(404).json({ error: 'Jira link not found' });
    return;
  }

  await prisma.issueJiraLink.delete({
    where: { id: link.id },
  });

  const remainingLinks = await prisma.issueJiraLink.findMany({
    where: { issueId: req.params.issueId },
    orderBy: { createdAt: 'asc' },
  });

  await prisma.issue.update({
    where: { id: req.params.issueId },
    data: {
      source: remainingLinks.length > 0 ? 'JIRA' : 'INTERNAL',
      jiraTicketKey: remainingLinks[0]?.jiraKey ?? null,
      jiraTicketUrl: remainingLinks[0]?.jiraUrl ?? null,
    },
  });

  res.status(204).send();
});

const updateTaskJiraSchema = z.object({
  jiraTicketKey: z.string().trim().min(1).optional().nullable(),
  jiraTicketUrl: z.string().trim().url().optional().nullable(),
});

app.patch('/api/tasks/:taskId/jira-link', async (req, res) => {
  const parsed = updateTaskJiraSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const task = await prisma.task.findUnique({
    where: { id: req.params.taskId },
    include: { project: { include: { jiraIntegration: true } } },
  });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const jiraBaseUrl = task.project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && parsed.data.jiraTicketUrl && !parsed.data.jiraTicketUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `Jira URL must start with ${jiraBaseUrl}` });
    return;
  }

  const updated = await prisma.task.update({
    where: { id: req.params.taskId },
    data: parsed.data,
  });

  res.json(updated);
});

function money(value: unknown) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function generateExecutiveSummary(project: Awaited<ReturnType<typeof getProjectForOverviewGeneration>>) {
  if (!project) {
    throw new Error('Project not found');
  }

  const budgetVariance = (Number(project.budgetForecast) / Number(project.budgetPlanned) - 1) * 100;
  const criticalIssues = project.issues.filter((issue) => issue.severity === 'CRITICAL');
  const decisionIssues = project.issues.filter((issue) => issue.decisionRequired);
  const topIssue = project.issues[0];
  const nextMilestone = project.milestones.find((milestone) => milestone.status !== 'Done');
  const scheduleText =
    project.scheduleVariance > 0
      ? `отклонение по срокам +${project.scheduleVariance} дней`
      : project.scheduleVariance < 0
        ? `опережение графика ${Math.abs(project.scheduleVariance)} дней`
        : 'отклонений по срокам нет';

  const executiveSummary = [
    `${project.name} находится в статусе ${project.rag}.`,
    `Готовность составляет ${project.progress}%, ${scheduleText}.`,
    `Бюджетный forecast: ${money(project.budgetForecast)} (${budgetVariance >= 0 ? '+' : ''}${budgetVariance.toFixed(1)}% к плану).`,
    criticalIssues.length > 0
      ? `Критических открытых проблем: ${criticalIssues.length}; ключевая проблема: ${topIssue?.title}.`
      : topIssue
        ? `Ключевая открытая проблема: ${topIssue.title}.`
        : 'Критических открытых проблем не зафиксировано.',
    nextMilestone
      ? `Ближайшая веха: ${nextMilestone.title}, срок ${nextMilestone.dueDate.toISOString().slice(0, 10)}, статус ${nextMilestone.status}.`
      : 'Ближайшие вехи не заданы.',
    decisionIssues.length > 0
      ? `Для руководства требуется ${decisionIssues.length} решение(й).`
      : 'Новых решений от руководства сейчас не требуется.',
  ].join(' ');

  const decisions = decisionIssues.slice(0, 5).map((issue) => ({
    title: issue.title,
    impactIfApproved: issue.impact,
    impactIfDelayed: `Сохраняется риск по владельцу ${issue.owner}; срок решения: ${
      issue.dueDate ? issue.dueDate.toISOString().slice(0, 10) : 'не задан'
    }`,
    deadline: issue.dueDate ? issue.dueDate.toISOString().slice(0, 10) : null,
    source: issue.jiraLinks.length > 0 ? issue.jiraLinks.map((link) => link.jiraKey).join(', ') : 'Internal RAID',
  }));

  const evidence = [
    { metric: 'Project health', source: `Project ${project.code} / RAG ${project.rag}` },
    { metric: 'Schedule variance', source: `Project plan snapshot / ${project.scheduleVariance} days` },
    { metric: 'Budget forecast', source: `Finance forecast / ${money(project.budgetForecast)}` },
    {
      metric: 'WBS',
      source: `${project.wbsItems.length} items / ${project.wbsItems.filter((item) => item.status === 'DONE').length} done`,
    },
    { metric: 'Open issues', source: `${project.issues.length} open issues in unified list` },
    { metric: 'Jira snapshot', source: `${project.jiraSnapshots.length} synchronized Jira issues` },
    { metric: 'Milestones', source: `${project.milestones.length} project milestones` },
    ...project.issues.slice(0, 3).map((issue) => ({
      metric: issue.title,
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => `${link.jiraKey}: ${link.jiraUrl}`).join('; ')
          : `${issue.source} issue owned by ${issue.owner}`,
    })),
  ];

  return { executiveSummary, decisions, evidence };
}

async function getProjectForOverviewGeneration(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      issues: {
        where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
        orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
        include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
      },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
      milestones: { orderBy: { dueDate: 'asc' } },
      wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      overviews: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
}

app.post('/api/projects/:projectId/executive-overviews/generate', async (req, res) => {
  const project = await getProjectForOverviewGeneration(req.params.projectId);

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const latestVersion = project.overviews[0]?.version ?? 0;
  const generated = generateExecutiveSummary(project);
  const overview = await prisma.executiveOverview.create({
    data: {
      projectId: project.id,
      version: latestVersion + 1,
      status: 'GENERATED',
      generatedAt: new Date(),
      executiveSummary: generated.executiveSummary,
      decisions: generated.decisions,
      evidence: generated.evidence,
    },
  });

  res.status(201).json(overview);
});

app.post('/api/executive-overviews/:overviewId/publish', async (req, res) => {
  const overview = await prisma.executiveOverview.findUnique({
    where: { id: req.params.overviewId },
  });

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  const published = await prisma.executiveOverview.update({
    where: { id: overview.id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  res.json(published);
});

app.post('/api/projects/:projectId/jira/sync', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: { jiraIntegration: true },
  });

  if (!project?.jiraIntegration) {
    res.status(404).json({ error: 'Jira integration is not configured for this project' });
    return;
  }

  if (!isJiraConfigured()) {
    res.status(400).json({
      error: 'Jira environment variables are not configured',
      required: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN'],
    });
    return;
  }

  try {
    const issues = await fetchJiraIssues(project.jiraIntegration.issuesJql);
    await prisma.$transaction([
      ...issues.map((issue) =>
        prisma.jiraIssueSnapshot.upsert({
          where: {
            projectId_issueKey: {
              projectId: project.id,
              issueKey: issue.key,
            },
          },
          update: {
            issueUrl: issue.url,
            summary: issue.summary,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            issueType: issue.issueType,
            sprint: issue.sprint,
            updatedAt: issue.updatedAt,
            syncedAt: new Date(),
          },
          create: {
            projectId: project.id,
            issueKey: issue.key,
            issueUrl: issue.url,
            summary: issue.summary,
            status: issue.status,
            priority: issue.priority,
            assignee: issue.assignee,
            issueType: issue.issueType,
            sprint: issue.sprint,
            updatedAt: issue.updatedAt,
          },
        }),
      ),
      prisma.jiraIntegration.update({
        where: { id: project.jiraIntegration.id },
        data: { syncStatus: 'OK', lastSyncedAt: new Date() },
      }),
    ]);

    res.json({ synced: issues.length });
  } catch (error) {
    await prisma.jiraIntegration.update({
      where: { id: project.jiraIntegration.id },
      data: { syncStatus: 'ERROR' },
    });
    res.status(502).json({ error: error instanceof Error ? error.message : 'Jira sync failed' });
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, '../../web/dist');

app.use(express.static(webDist));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(webDist, 'index.html'));
});

app.listen(port, () => {
  console.log(`API listening on ${port}`);
});
