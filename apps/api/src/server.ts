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
    res.status(503).json({
      ok: false,
      database: 'unavailable',
      jiraConfigured: isJiraConfigured(),
    });
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
      parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
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
      artifacts: { orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }] },
      raidItems: { orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }] },
      changeRequests: { orderBy: [{ updatedAt: 'desc' }] },
    },
  });

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  res.json(project);
});

const artifactSchema = z.object({
  title: z.string().trim().min(3),
  type: z.string().trim().min(1),
  owner: z.string().trim().min(1),
  status: z.enum(['Draft', 'In Review', 'Approved', 'Baseline', 'Archived']).default('Draft'),
  url: z.string().trim().url().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

app.post('/api/projects/:projectId/artifacts', async (req, res) => {
  const parsed = artifactSchema.safeParse(req.body);
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

  const artifact = await prisma.projectArtifact.create({
    data: {
      projectId: project.id,
      ...parsed.data,
      url: parsed.data.url || null,
      description: parsed.data.description || null,
    },
  });

  res.status(201).json(artifact);
});

app.patch('/api/project-artifacts/:artifactId', async (req, res) => {
  const parsed = artifactSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const artifact = await prisma.projectArtifact.findUnique({
    where: { id: req.params.artifactId },
  });

  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }

  const updated = await prisma.projectArtifact.update({
    where: { id: artifact.id },
    data: {
      ...parsed.data,
      url: parsed.data.url === undefined ? undefined : parsed.data.url || null,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
    },
  });

  res.json(updated);
});

app.delete('/api/project-artifacts/:artifactId', async (req, res) => {
  const artifact = await prisma.projectArtifact.findUnique({
    where: { id: req.params.artifactId },
  });

  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }

  await prisma.projectArtifact.delete({
    where: { id: artifact.id },
  });

  res.status(204).send();
});

const raidItemSchema = z.object({
  type: z.enum(['RISK', 'ASSUMPTION', 'DEPENDENCY']),
  title: z.string().trim().min(3),
  description: z.string().trim().min(3),
  owner: z.string().trim().optional().default(''),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'MITIGATED', 'VALIDATED', 'BREACHED', 'CLOSED']).default('OPEN'),
  probability: z.coerce.number().int().min(0).max(5).default(0),
  impact: z.coerce.number().int().min(0).max(5).default(0),
  mitigationPlan: z.string().trim().optional().nullable(),
  contingencyPlan: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  residualRisk: z.coerce.number().int().min(0).max(25).default(0),
  validationDate: z.string().trim().optional().nullable(),
  linkedRiskId: z.string().trim().optional().nullable(),
  dependencyType: z.string().trim().optional().nullable(),
  predecessor: z.string().trim().optional().nullable(),
  successor: z.string().trim().optional().nullable(),
  supplier: z.string().trim().optional().nullable(),
  decisionRequired: z.boolean().default(false),
  escalationLevel: z.string().trim().min(1).default('Project'),
  scheduleImpactDays: z.coerce.number().int().default(0),
  budgetImpact: z.coerce.number().default(0),
});

function calculatedRiskScore(probability: number, impact: number) {
  return probability * impact;
}

function raidPayload(data: z.infer<typeof raidItemSchema>) {
  return {
    ...data,
    owner: data.owner || 'Unassigned',
    riskScore: calculatedRiskScore(data.probability, data.impact),
    mitigationPlan: data.mitigationPlan || null,
    contingencyPlan: data.contingencyPlan || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    validationDate: data.validationDate ? new Date(data.validationDate) : null,
    linkedRiskId: data.linkedRiskId || null,
    dependencyType: data.dependencyType || null,
    predecessor: data.predecessor || null,
    successor: data.successor || null,
    supplier: data.supplier || null,
    budgetImpact: data.budgetImpact,
  };
}

async function validateRaidItem(projectId: string, data: z.infer<typeof raidItemSchema>, itemId?: string) {
  const score = calculatedRiskScore(data.probability, data.impact);
  if (data.type === 'RISK' && score >= 15 && !data.owner.trim()) {
    return 'High risk must have an owner';
  }
  if (data.type === 'RISK' && score >= 15 && !data.mitigationPlan?.trim()) {
    return 'High risk must have a mitigation plan';
  }
  if (data.linkedRiskId) {
    const linked = await prisma.raidItem.findUnique({ where: { id: data.linkedRiskId } });
    if (!linked || linked.projectId !== projectId || linked.type !== 'RISK' || linked.id === itemId) {
      return 'Linked risk must be a risk from the same project';
    }
  }
  return null;
}

app.post('/api/projects/:projectId/raid-items', async (req, res) => {
  const parsed = raidItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const validationError = await validateRaidItem(project.id, parsed.data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const raidItem = await prisma.raidItem.create({
    data: {
      projectId: project.id,
      ...raidPayload(parsed.data),
    },
  });

  res.status(201).json(raidItem);
});

app.patch('/api/raid-items/:itemId', async (req, res) => {
  const parsed = raidItemSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'RAID item not found' });
    return;
  }

  const merged = {
    type: parsed.data.type ?? existing.type,
    title: parsed.data.title ?? existing.title,
    description: parsed.data.description ?? existing.description,
    owner: parsed.data.owner ?? existing.owner,
    status: parsed.data.status ?? existing.status,
    probability: parsed.data.probability ?? existing.probability,
    impact: parsed.data.impact ?? existing.impact,
    mitigationPlan: parsed.data.mitigationPlan === undefined ? existing.mitigationPlan : parsed.data.mitigationPlan,
    contingencyPlan:
      parsed.data.contingencyPlan === undefined ? existing.contingencyPlan : parsed.data.contingencyPlan,
    dueDate: parsed.data.dueDate === undefined ? existing.dueDate?.toISOString().slice(0, 10) : parsed.data.dueDate,
    residualRisk: parsed.data.residualRisk ?? existing.residualRisk,
    validationDate:
      parsed.data.validationDate === undefined
        ? existing.validationDate?.toISOString().slice(0, 10)
        : parsed.data.validationDate,
    linkedRiskId: parsed.data.linkedRiskId === undefined ? existing.linkedRiskId : parsed.data.linkedRiskId,
    dependencyType: parsed.data.dependencyType === undefined ? existing.dependencyType : parsed.data.dependencyType,
    predecessor: parsed.data.predecessor === undefined ? existing.predecessor : parsed.data.predecessor,
    successor: parsed.data.successor === undefined ? existing.successor : parsed.data.successor,
    supplier: parsed.data.supplier === undefined ? existing.supplier : parsed.data.supplier,
    decisionRequired: parsed.data.decisionRequired ?? existing.decisionRequired,
    escalationLevel: parsed.data.escalationLevel ?? existing.escalationLevel,
    scheduleImpactDays: parsed.data.scheduleImpactDays ?? existing.scheduleImpactDays,
    budgetImpact: parsed.data.budgetImpact ?? Number(existing.budgetImpact),
  };

  const validationError = await validateRaidItem(existing.projectId, merged, existing.id);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

  const updated = await prisma.raidItem.update({
    where: { id: existing.id },
    data: raidPayload(merged),
  });

  res.json(updated);
});

app.delete('/api/raid-items/:itemId', async (req, res) => {
  const existing = await prisma.raidItem.findUnique({ where: { id: req.params.itemId } });
  if (!existing) {
    res.status(404).json({ error: 'RAID item not found' });
    return;
  }

  await prisma.raidItem.delete({ where: { id: existing.id } });
  res.status(204).send();
});

const changeRequestSchema = z.object({
  type: z.enum(['SCOPE', 'BUDGET', 'SCHEDULE', 'RESOURCE']),
  title: z.string().trim().min(3),
  description: z.string().trim().min(3),
  owner: z.string().trim().min(1),
  status: z.enum(['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED']).default('DRAFT'),
  impactAnalysis: z.string().trim().min(3),
  affectedBaseline: z.string().trim().min(1),
  implementationPlan: z.string().trim().optional().nullable(),
  scheduleImpactDays: z.coerce.number().int().default(0),
  budgetImpact: z.coerce.number().default(0),
  scopeImpact: z.string().trim().optional().nullable(),
  approvalRoute: z.string().trim().min(1).default('PMO -> Sponsor'),
  decisionRequired: z.boolean().default(false),
  dueDate: z.string().trim().optional().nullable(),
});

function changeRequestPayload(data: z.infer<typeof changeRequestSchema>) {
  return {
    ...data,
    implementationPlan: data.implementationPlan || null,
    scopeImpact: data.scopeImpact || null,
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    budgetImpact: data.budgetImpact,
    approvedAt: data.status === 'APPROVED' ? new Date() : undefined,
  };
}

app.post('/api/projects/:projectId/change-requests', async (req, res) => {
  const parsed = changeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const changeRequest = await prisma.changeRequest.create({
    data: {
      projectId: project.id,
      ...changeRequestPayload(parsed.data),
    },
  });

  res.status(201).json(changeRequest);
});

app.patch('/api/change-requests/:requestId', async (req, res) => {
  const parsed = changeRequestSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.changeRequest.findUnique({ where: { id: req.params.requestId } });
  if (!existing) {
    res.status(404).json({ error: 'Change request not found' });
    return;
  }

  const nextStatus = parsed.data.status ?? existing.status;
  const updated = await prisma.changeRequest.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      implementationPlan:
        parsed.data.implementationPlan === undefined ? undefined : parsed.data.implementationPlan || null,
      scopeImpact: parsed.data.scopeImpact === undefined ? undefined : parsed.data.scopeImpact || null,
      dueDate: parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      budgetImpact: parsed.data.budgetImpact,
      approvedAt:
        nextStatus === 'APPROVED' && existing.status !== 'APPROVED'
          ? new Date()
          : parsed.data.status && nextStatus !== 'APPROVED'
            ? null
            : undefined,
    },
  });

  if (nextStatus === 'APPROVED' && existing.status !== 'APPROVED') {
    await prisma.project.update({
      where: { id: existing.projectId },
      data: {
        scheduleVariance: { increment: updated.scheduleImpactDays },
        budgetForecast: { increment: updated.budgetImpact },
      },
    });
  }

  res.json(updated);
});

app.delete('/api/change-requests/:requestId', async (req, res) => {
  const existing = await prisma.changeRequest.findUnique({ where: { id: req.params.requestId } });
  if (!existing) {
    res.status(404).json({ error: 'Change request not found' });
    return;
  }

  await prisma.changeRequest.delete({ where: { id: existing.id } });
  res.status(204).send();
});

const milestoneSchema = z.object({
  code: z.string().trim().optional().nullable(),
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
      code: parsed.data.code || null,
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
  type: z.enum(['PHASE', 'WORK_PACKAGE', 'DELIVERABLE', 'MILESTONE', 'TASK']).default('TASK'),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'BLOCKED', 'DONE', 'CANCELLED']).default('NOT_STARTED'),
  owner: z.string().trim().min(1),
  startDate: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  baselineStartDate: z.string().trim().optional().nullable(),
  baselineDueDate: z.string().trim().optional().nullable(),
  forecastStartDate: z.string().trim().optional().nullable(),
  forecastDueDate: z.string().trim().optional().nullable(),
  wbsLevel: z.coerce.number().int().optional().nullable(),
  predecessor1: z.string().trim().optional().nullable(),
  predecessor2: z.string().trim().optional().nullable(),
  predecessor3: z.string().trim().optional().nullable(),
  leadLagDays: z.coerce.number().int().default(0),
  workDays: z.coerce.number().int().optional().nullable(),
  calendarDays: z.coerce.number().int().optional().nullable(),
  excelStartDate: z.string().trim().optional().nullable(),
  excelEndDate: z.string().trim().optional().nullable(),
  planWorkDays: z.coerce.number().int().optional().nullable(),
  planCalendarDays: z.coerce.number().int().optional().nullable(),
  templateColor: z.string().trim().optional().nullable(),
  priority: z.string().trim().optional().nullable(),
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
      baselineStartDate: parsed.data.baselineStartDate
        ? new Date(parsed.data.baselineStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      baselineDueDate: parsed.data.baselineDueDate
        ? new Date(parsed.data.baselineDueDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      forecastStartDate: parsed.data.forecastStartDate
        ? new Date(parsed.data.forecastStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      forecastDueDate: parsed.data.forecastDueDate
        ? new Date(parsed.data.forecastDueDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      wbsLevel: parsed.data.wbsLevel ?? null,
      predecessor1: parsed.data.predecessor1 || null,
      predecessor2: parsed.data.predecessor2 || null,
      predecessor3: parsed.data.predecessor3 || null,
      leadLagDays: parsed.data.leadLagDays,
      workDays: parsed.data.workDays ?? null,
      calendarDays: parsed.data.calendarDays ?? null,
      excelStartDate: parsed.data.excelStartDate
        ? new Date(parsed.data.excelStartDate)
        : parsed.data.startDate
          ? new Date(parsed.data.startDate)
          : null,
      excelEndDate: parsed.data.excelEndDate
        ? new Date(parsed.data.excelEndDate)
        : parsed.data.dueDate
          ? new Date(parsed.data.dueDate)
          : null,
      planWorkDays: parsed.data.planWorkDays ?? null,
      planCalendarDays: parsed.data.planCalendarDays ?? null,
      templateColor: parsed.data.templateColor || null,
      priority: parsed.data.priority || null,
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
  const nextJiraUrl = parsed.data.jiraTicketUrl === undefined ? existing.jiraTicketUrl : parsed.data.jiraTicketUrl;
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
      parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
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
        parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      baselineStartDate:
        parsed.data.baselineStartDate === undefined
          ? undefined
          : parsed.data.baselineStartDate
            ? new Date(parsed.data.baselineStartDate)
            : null,
      baselineDueDate:
        parsed.data.baselineDueDate === undefined
          ? undefined
          : parsed.data.baselineDueDate
            ? new Date(parsed.data.baselineDueDate)
            : null,
      forecastStartDate:
        parsed.data.forecastStartDate === undefined
          ? undefined
          : parsed.data.forecastStartDate
            ? new Date(parsed.data.forecastStartDate)
            : null,
      forecastDueDate:
        parsed.data.forecastDueDate === undefined
          ? undefined
          : parsed.data.forecastDueDate
            ? new Date(parsed.data.forecastDueDate)
            : null,
      wbsLevel: parsed.data.wbsLevel === undefined ? undefined : parsed.data.wbsLevel ?? null,
      predecessor1: parsed.data.predecessor1 === undefined ? undefined : parsed.data.predecessor1 || null,
      predecessor2: parsed.data.predecessor2 === undefined ? undefined : parsed.data.predecessor2 || null,
      predecessor3: parsed.data.predecessor3 === undefined ? undefined : parsed.data.predecessor3 || null,
      leadLagDays: parsed.data.leadLagDays,
      workDays: parsed.data.workDays === undefined ? undefined : parsed.data.workDays ?? null,
      calendarDays: parsed.data.calendarDays === undefined ? undefined : parsed.data.calendarDays ?? null,
      excelStartDate:
        parsed.data.excelStartDate === undefined
          ? undefined
          : parsed.data.excelStartDate
            ? new Date(parsed.data.excelStartDate)
            : null,
      excelEndDate:
        parsed.data.excelEndDate === undefined
          ? undefined
          : parsed.data.excelEndDate
            ? new Date(parsed.data.excelEndDate)
            : null,
      planWorkDays: parsed.data.planWorkDays === undefined ? undefined : parsed.data.planWorkDays ?? null,
      planCalendarDays:
        parsed.data.planCalendarDays === undefined ? undefined : parsed.data.planCalendarDays ?? null,
      templateColor: parsed.data.templateColor === undefined ? undefined : parsed.data.templateColor || null,
      priority: parsed.data.priority === undefined ? undefined : parsed.data.priority || null,
      plannedCost: parsed.data.plannedCost,
      forecastCost: parsed.data.forecastCost,
      progress: parsed.data.progress,
      jiraTicketKey: parsed.data.jiraTicketKey === undefined ? undefined : parsed.data.jiraTicketKey || null,
      jiraTicketUrl: parsed.data.jiraTicketUrl === undefined ? undefined : parsed.data.jiraTicketUrl || null,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
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

const wbsDependencySchema = z.object({
  predecessorId: z.string().trim().min(1),
  successorId: z.string().trim().min(1),
  type: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
  lagDays: z.coerce.number().int().default(0),
});

async function wouldCreateDependencyCycle(projectId: string, predecessorId: string, successorId: string) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: { projectId },
    select: { predecessorId: true, successorId: true },
  });
  const graph = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const next = graph.get(dependency.predecessorId) ?? [];
    next.push(dependency.successorId);
    graph.set(dependency.predecessorId, next);
  }
  graph.set(predecessorId, [...(graph.get(predecessorId) ?? []), successorId]);

  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === predecessorId) return true;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

app.post('/api/projects/:projectId/wbs-dependencies', async (req, res) => {
  const parsed = wbsDependencySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (parsed.data.predecessorId === parsed.data.successorId) {
    res.status(400).json({ error: 'Dependency cannot link item to itself' });
    return;
  }

  const items = await prisma.wbsItem.findMany({
    where: {
      projectId: req.params.projectId,
      id: { in: [parsed.data.predecessorId, parsed.data.successorId] },
    },
  });
  if (items.length !== 2) {
    res.status(400).json({ error: 'Both WBS items must belong to the project' });
    return;
  }

  if (await wouldCreateDependencyCycle(req.params.projectId, parsed.data.predecessorId, parsed.data.successorId)) {
    res.status(400).json({ error: 'Dependency would create a cycle' });
    return;
  }

  const dependency = await prisma.wbsDependency.upsert({
    where: {
      projectId_predecessorId_successorId_type: {
        projectId: req.params.projectId,
        predecessorId: parsed.data.predecessorId,
        successorId: parsed.data.successorId,
        type: parsed.data.type,
      },
    },
    create: {
      projectId: req.params.projectId,
      ...parsed.data,
    },
    update: {
      lagDays: parsed.data.lagDays,
    },
    include: {
      predecessor: { select: { id: true, code: true, title: true } },
      successor: { select: { id: true, code: true, title: true } },
    },
  });

  res.status(201).json(dependency);
});

app.delete('/api/wbs-dependencies/:dependencyId', async (req, res) => {
  const dependency = await prisma.wbsDependency.findUnique({
    where: { id: req.params.dependencyId },
  });

  if (!dependency) {
    res.status(404).json({ error: 'WBS dependency not found' });
    return;
  }

  await prisma.wbsDependency.delete({ where: { id: dependency.id } });
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
      ? [
          {
            jiraKey: parsed.data.jiraTicketKey,
            jiraUrl: parsed.data.jiraTicketUrl,
          },
        ]
      : []),
  ].filter((link, index, allLinks) => allLinks.findIndex((candidate) => candidate.jiraKey === link.jiraKey) === index);

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
        parsed.data.dueDate === undefined ? undefined : parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
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

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function daysSince(value: Date | null | undefined) {
  if (!value) return null;
  return Math.floor((Date.now() - value.getTime()) / 86_400_000);
}

function severityRank(severity: string) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[severity] ?? 0;
}

function raidSeverity(score: number) {
  if (score >= 20) return 'CRITICAL';
  if (score >= 15) return 'HIGH';
  if (score >= 8) return 'MEDIUM';
  return 'LOW';
}

function overviewTone(value: 'green' | 'amber' | 'red' | 'neutral') {
  return value;
}

function generateExecutiveSummary(project: Awaited<ReturnType<typeof getProjectForOverviewGeneration>>) {
  if (!project) {
    throw new Error('Project not found');
  }

  const budgetPlanned = Number(project.budgetPlanned);
  const budgetForecast = Number(project.budgetForecast);
  const budgetVariance = budgetPlanned === 0 ? 0 : (budgetForecast / budgetPlanned - 1) * 100;
  const criticalIssues = project.issues.filter((issue) => issue.severity === 'CRITICAL');
  const decisionIssues = project.issues.filter((issue) => issue.decisionRequired);
  const activeRaidItems = project.raidItems.filter((item) => !['CLOSED', 'VALIDATED'].includes(item.status));
  const highRaidItems = activeRaidItems.filter((item) => item.type === 'RISK' && item.riskScore >= 15);
  const decisionChangeRequests = project.changeRequests.filter((request) => request.decisionRequired);
  const pendingChangeRequests = project.changeRequests.filter((request) =>
    ['SUBMITTED', 'IN_REVIEW'].includes(request.status),
  );
  const topIssue = [...project.issues].sort(
    (left, right) => severityRank(right.severity) - severityRank(left.severity),
  )[0];
  const nextMilestone = project.milestones.find((milestone) => milestone.status !== 'Done');
  const completedWbs = project.wbsItems.filter((item) => item.status === 'DONE').length;
  const blockedWbs = project.wbsItems.filter((item) => item.status === 'BLOCKED').length;
  const atRiskWbs = project.wbsItems.filter((item) => item.status === 'AT_RISK').length;
  const missingWbsDates = project.wbsItems.filter((item) => !item.startDate || !item.dueDate).length;
  const overdueMilestones = project.milestones.filter(
    (milestone) => milestone.status !== 'Done' && milestone.dueDate.getTime() < Date.now(),
  ).length;
  const jiraSyncAge = daysSince(project.jiraIntegration?.lastSyncedAt);
  const staleJiraIssues = project.jiraSnapshots.filter((issue) => daysSince(issue.updatedAt) !== null && Number(daysSince(issue.updatedAt)) > 7);
  const artifactBaselineCount = project.artifacts.filter((artifact) =>
    ['Approved', 'Baseline'].includes(artifact.status),
  ).length;
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
    activeRaidItems.length > 0
      ? `В RAID активно ${activeRaidItems.length} записей, high risks: ${highRaidItems.length}.`
      : 'Активных RAID записей нет.',
    pendingChangeRequests.length > 0
      ? `На согласовании ${pendingChangeRequests.length} change request(s).`
      : 'Change requests на согласовании отсутствуют.',
    decisionIssues.length + decisionChangeRequests.length > 0
      ? `Для руководства требуется ${decisionIssues.length + decisionChangeRequests.length} решение(й).`
      : 'Новых решений от руководства сейчас не требуется.',
  ].join(' ');

  const kpis = [
    {
      label: 'Health',
      value: project.rag,
      secondary: project.rag === 'RED' ? 'Critical' : project.rag === 'AMBER' ? 'At risk' : 'On track',
      tone: overviewTone(project.rag === 'RED' ? 'red' : project.rag === 'AMBER' ? 'amber' : 'green'),
      source: `Project ${project.code} passport`,
    },
    {
      label: 'Progress',
      value: `${project.progress}%`,
      secondary: `${completedWbs}/${project.wbsItems.length || 0} WBS done`,
      tone: overviewTone(project.progress >= 80 ? 'green' : project.progress >= 45 ? 'amber' : 'neutral'),
      source: 'WBS baseline',
    },
    {
      label: 'Schedule',
      value: `${project.scheduleVariance > 0 ? '+' : ''}${project.scheduleVariance} дней`,
      secondary: overdueMilestones > 0 ? `${overdueMilestones} overdue milestones` : 'baseline variance',
      tone: overviewTone(project.scheduleVariance > 10 || overdueMilestones > 0 ? 'red' : project.scheduleVariance > 0 ? 'amber' : 'green'),
      source: 'Project schedule',
    },
    {
      label: 'Budget',
      value: `${budgetVariance >= 0 ? '+' : ''}${budgetVariance.toFixed(1)}%`,
      secondary: money(project.budgetForecast),
      tone: overviewTone(budgetVariance > 10 ? 'red' : budgetVariance > 0 ? 'amber' : 'green'),
      source: 'Finance forecast',
    },
    {
      label: 'Open Issues',
      value: String(project.issues.length),
      secondary: `${criticalIssues.length} critical / ${decisionIssues.length} decisions`,
      tone: overviewTone(criticalIssues.length > 0 ? 'red' : decisionIssues.length > 0 ? 'amber' : 'green'),
      source: 'Open Issues List',
    },
    {
      label: 'RAID / CR',
      value: `${activeRaidItems.length}/${pendingChangeRequests.length}`,
      secondary: `${highRaidItems.length} high risks / ${decisionChangeRequests.length} CR decisions`,
      tone: overviewTone(highRaidItems.length > 0 ? 'red' : pendingChangeRequests.length > 0 ? 'amber' : 'green'),
      source: 'RAID + Change Control',
    },
  ];

  const qualityGates = [
    {
      name: 'Project data freshness',
      status: !project.jiraIntegration ? 'WARN' : jiraSyncAge === null || jiraSyncAge > 3 ? 'WARN' : 'OK',
      detail: !project.jiraIntegration
        ? 'Jira integration is not configured'
        : jiraSyncAge === null
          ? 'Jira has not been synchronized yet'
          : `Jira sync age: ${jiraSyncAge} day(s)`,
      source: 'Jira integration',
    },
    {
      name: 'Plan completeness',
      status: project.wbsItems.length === 0 || missingWbsDates > 0 ? 'WARN' : 'OK',
      detail:
        missingWbsDates > 0
          ? `${missingWbsDates} WBS item(s) do not have both start and due dates`
          : `${project.wbsItems.length} WBS item(s) have schedule data`,
      source: 'WBS',
    },
    {
      name: 'Blockers control',
      status: criticalIssues.length > 0 || blockedWbs > 0 ? 'BLOCKED' : decisionIssues.length > 0 || atRiskWbs > 0 ? 'WARN' : 'OK',
      detail: `${criticalIssues.length} critical issue(s), ${blockedWbs} blocked WBS item(s), ${decisionIssues.length} decision(s) required`,
      source: 'Open Issues + WBS',
    },
    {
      name: 'Management evidence',
      status: artifactBaselineCount > 0 ? 'OK' : 'WARN',
      detail: `${artifactBaselineCount} approved/baseline artifact(s) in project registry`,
      source: 'Artifacts registry',
    },
    {
      name: 'RAID discipline',
      status: highRaidItems.some((item) => !item.mitigationPlan) ? 'BLOCKED' : highRaidItems.length > 0 ? 'WARN' : 'OK',
      detail: `${highRaidItems.length} high risk(s), ${pendingChangeRequests.length} pending CR(s)`,
      source: 'RAID + Change Control',
    },
  ];

  const risks = [
    ...project.issues.slice(0, 5).map((issue) => ({
      title: issue.title,
      severity: issue.severity,
      owner: issue.owner,
      impact: issue.impact,
      dueDate: isoDate(issue.dueDate),
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => link.jiraKey).join(', ')
          : 'Internal RAID',
    })),
    ...activeRaidItems
      .filter((item) => item.type === 'RISK')
      .slice(0, Math.max(0, 5 - Math.min(project.issues.length, 5)))
      .map((item) => ({
        title: item.title,
        severity: raidSeverity(item.riskScore),
        owner: item.owner,
        impact: `${item.description} Schedule: ${item.scheduleImpactDays} days, budget: ${money(item.budgetImpact)}. Mitigation: ${
          item.mitigationPlan ?? 'not defined'
        }`,
        dueDate: isoDate(item.dueDate),
        source: `RAID score ${item.riskScore}`,
      })),
    ...project.wbsItems
      .filter((item) => item.status === 'BLOCKED' || item.status === 'AT_RISK')
      .slice(0, Math.max(0, 5 - Math.min(project.issues.length + highRaidItems.length, 5)))
      .map((item) => ({
        title: `${item.code} ${item.title}`,
        severity: item.status === 'BLOCKED' ? 'HIGH' : 'MEDIUM',
        owner: item.owner,
        impact: item.description ?? 'WBS item requires management attention',
        dueDate: isoDate(item.dueDate),
        source: 'WBS',
      })),
  ];

  const nextSteps = [
    ...decisionIssues.slice(0, 3).map((issue) => ({
      title: `Resolve management decision: ${issue.title}`,
      owner: issue.owner,
      dueDate: isoDate(issue.dueDate),
      source: 'Open Issues List',
    })),
    ...decisionChangeRequests.slice(0, 3).map((request) => ({
      title: `Approve change request: ${request.title}`,
      owner: request.owner,
      dueDate: isoDate(request.dueDate),
      source: `CR ${request.type}`,
    })),
    ...project.milestones
      .filter((milestone) => milestone.status !== 'Done')
      .slice(0, 3)
      .map((milestone) => ({
        title: `Prepare milestone: ${milestone.title}`,
        owner: milestone.owner,
        dueDate: isoDate(milestone.dueDate),
        source: 'Milestones',
      })),
    ...staleJiraIssues.slice(0, 2).map((issue) => ({
      title: `Refresh Jira status: ${issue.issueKey}`,
      owner: issue.assignee ?? 'Project team',
      dueDate: isoDate(issue.updatedAt),
      source: 'Jira snapshot',
    })),
  ].slice(0, 6);

  const decisions = decisionIssues.slice(0, 5).map((issue) => ({
    title: issue.title,
    impactIfApproved: issue.impact,
    impactIfDelayed: `Сохраняется риск по владельцу ${issue.owner}; срок решения: ${
      isoDate(issue.dueDate) ?? 'не задан'
    }`,
    deadline: isoDate(issue.dueDate),
    source: issue.jiraLinks.length > 0 ? issue.jiraLinks.map((link) => link.jiraKey).join(', ') : 'Internal RAID',
  }));

  decisions.push(
    ...decisionChangeRequests.slice(0, 5 - decisions.length).map((request) => ({
      title: request.title,
      impactIfApproved: `${request.impactAnalysis}. Forecast impact: ${money(request.budgetImpact)}, schedule ${request.scheduleImpactDays} days.`,
      impactIfDelayed: `Baseline ${request.affectedBaseline} remains blocked; owner ${request.owner}.`,
      deadline: isoDate(request.dueDate),
      source: `Change Request / ${request.type}`,
    })),
  );

  const evidence = [
    {
      metric: 'Project health',
      source: `Project ${project.code} / RAG ${project.rag}`,
    },
    {
      metric: 'Schedule variance',
      source: `Project plan snapshot / ${project.scheduleVariance} days`,
    },
    {
      metric: 'Budget forecast',
      source: `Finance forecast / ${money(project.budgetForecast)}`,
    },
    {
      metric: 'WBS',
      source: `${project.wbsItems.length} items / ${project.wbsItems.filter((item) => item.status === 'DONE').length} done`,
    },
    {
      metric: 'Open issues',
      source: `${project.issues.length} open issues in unified list`,
    },
    {
      metric: 'Jira snapshot',
      source: `${project.jiraSnapshots.length} synchronized Jira issues`,
    },
    {
      metric: 'Milestones',
      source: `${project.milestones.length} project milestones`,
    },
    {
      metric: 'Artifacts',
      source: `${project.artifacts.length} project artifacts / ${artifactBaselineCount} approved or baseline`,
    },
    {
      metric: 'RAID',
      source: `${activeRaidItems.length} active RAID items / ${highRaidItems.length} high risks`,
    },
    {
      metric: 'Change requests',
      source: `${project.changeRequests.length} CRs / ${pendingChangeRequests.length} pending approval`,
    },
    ...project.issues.slice(0, 3).map((issue) => ({
      metric: issue.title,
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => `${link.jiraKey}: ${link.jiraUrl}`).join('; ')
          : `${issue.source} issue owned by ${issue.owner}`,
    })),
  ];

  return { executiveSummary, kpis, qualityGates, risks, nextSteps, decisions, evidence };
}

async function getProjectForOverviewGeneration(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jiraIntegration: true,
      issues: {
        where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
        orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
        include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
      },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
      milestones: { orderBy: { dueDate: 'asc' } },
      wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      wbsDependencies: {
        orderBy: { createdAt: 'asc' },
        include: {
          predecessor: { select: { id: true, code: true, title: true } },
          successor: { select: { id: true, code: true, title: true } },
        },
      },
      artifacts: { orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }] },
      raidItems: { orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }] },
      changeRequests: { orderBy: [{ updatedAt: 'desc' }] },
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
      kpis: generated.kpis,
      qualityGates: generated.qualityGates,
      risks: generated.risks,
      nextSteps: generated.nextSteps,
      decisions: generated.decisions,
      evidence: generated.evidence,
    },
  });

  res.status(201).json(overview);
});

const overviewTransitionSchema = z.object({
  status: z.enum(['PM_REVIEW', 'APPROVED']),
  approvedBy: z.string().trim().optional().nullable(),
});

app.post('/api/executive-overviews/:overviewId/status', async (req, res) => {
  const parsed = overviewTransitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const overview = await prisma.executiveOverview.findUnique({
    where: { id: req.params.overviewId },
  });

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  if (overview.status === 'PUBLISHED') {
    res.status(400).json({ error: 'Published overview cannot change workflow status' });
    return;
  }

  const updated = await prisma.executiveOverview.update({
    where: { id: overview.id },
    data:
      parsed.data.status === 'PM_REVIEW'
        ? {
            status: 'PM_REVIEW',
            reviewRequestedAt: new Date(),
          }
        : {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedBy: parsed.data.approvedBy || 'PMO',
          },
  });

  res.json(updated);
});

app.post('/api/executive-overviews/:overviewId/publish', async (req, res) => {
  const overview = await prisma.executiveOverview.findUnique({
    where: { id: req.params.overviewId },
  });

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  if (overview.status !== 'APPROVED') {
    res.status(400).json({ error: 'Executive overview must be approved before publication' });
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
    res.status(502).json({
      error: error instanceof Error ? error.message : 'Jira sync failed',
    });
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
