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
    orderBy: { updatedAt: 'desc' },
    include: {
      jiraIntegration: true,
      _count: {
        select: { tasks: true, issues: true, jiraSnapshots: true },
      },
    },
  });

  res.json(projects);
});

app.get('/api/projects/:projectId/overview', async (req, res) => {
  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    include: {
      jiraIntegration: true,
      tasks: { orderBy: { updatedAt: 'desc' } },
      issues: { orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }] },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
      overviews: { orderBy: { version: 'desc' }, take: 1 },
    },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(project);
});

app.get('/api/projects/:projectId/open-issues', async (req, res) => {
  const issues = await prisma.issue.findMany({
    where: {
      projectId: req.params.projectId,
      status: { notIn: ['Done', 'Closed', 'Resolved'] },
    },
    orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
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

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && parsed.data.jiraTicketUrl && !parsed.data.jiraTicketUrl.startsWith(jiraBaseUrl)) {
    res.status(400).json({ error: `Jira URL must start with ${jiraBaseUrl}` });
    return;
  }

  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      source: parsed.data.jiraTicketUrl ? 'JIRA' : 'INTERNAL',
      title: parsed.data.title,
      severity: parsed.data.severity,
      status: 'Open',
      owner: parsed.data.owner,
      impact: parsed.data.impact,
      decisionRequired: parsed.data.decisionRequired,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      jiraTicketKey: parsed.data.jiraTicketKey,
      jiraTicketUrl: parsed.data.jiraTicketUrl,
    },
  });

  res.status(201).json(issue);
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
    source: issue.jiraTicketUrl ?? 'Internal RAID',
  }));

  const evidence = [
    { metric: 'Project health', source: `Project ${project.code} / RAG ${project.rag}` },
    { metric: 'Schedule variance', source: `Project plan snapshot / ${project.scheduleVariance} days` },
    { metric: 'Budget forecast', source: `Finance forecast / ${money(project.budgetForecast)}` },
    { metric: 'Open issues', source: `${project.issues.length} open issues in unified list` },
    { metric: 'Jira snapshot', source: `${project.jiraSnapshots.length} synchronized Jira issues` },
    ...project.issues.slice(0, 3).map((issue) => ({
      metric: issue.title,
      source: issue.jiraTicketUrl ?? `${issue.source} issue owned by ${issue.owner}`,
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
      },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
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
