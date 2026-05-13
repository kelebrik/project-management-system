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
