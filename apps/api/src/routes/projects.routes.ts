import { Prisma } from '@prisma/client';
import { projectSchema } from '@pms/shared';
import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import {
  exportFilePart,
  generateExecutiveSummary,
  getExecutiveOverviewForExport,
  getProjectForOverviewGeneration,
  overviewStatusLabel,
  renderExecutiveOverviewHtml,
} from '../services/executive-overview.js';
import { getProjectWbsSnapshot, renumberProjectWbs } from '../services/wbs.js';
import { recordWbsCommand } from '../services/wbs-audit.js';
import { copyLatestWbsBaselineToProject } from '../services/wbs-baseline.js';
import { calculateProjectCriticalPath } from '../services/wbs-critical-path.js';
import { recalculateProjectWbsSchedule } from '../services/wbs-schedule.js';
import { emitWebhookEvent } from '../services/webhooks.js';

type ProjectsRoutesContext = {
  requireAdmin: RequestHandler;
  currentUser: (req: Request) => any;
  ensureProjectWritable: (projectId: string, res: Response) => Promise<any | null>;
  ensureEntityProjectWritable: (projectId: string, res: Response) => Promise<boolean>;
};

export function createProjectsRouter({
  requireAdmin,
  currentUser,
  ensureProjectWritable,
  ensureEntityProjectWritable,
}: ProjectsRoutesContext) {
  const router = Router();

router.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    include: projectInclude,
  });

  res.json(projects);
});

const projectInclude = {
  jiraIntegration: true,
  _count: {
    select: { tasks: true, issues: true, jiraSnapshots: true },
  },
} satisfies Prisma.ProjectInclude;

const projectDetailsInclude = {
  jiraIntegration: true,
  tasks: { orderBy: { updatedAt: 'desc' } },
  issues: {
    where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
    orderBy: [{ severity: 'desc' }, { updatedAt: 'desc' }],
    include: {
      jiraLinks: { orderBy: { createdAt: 'asc' } },
      statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
    },
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

const createProjectSchema = projectSchema.extend({
  copyBaselineFromProjectId: z.string().trim().optional().nullable(),
});

const closedIssuesInclude = {
  where: { status: { in: ['Done', 'Closed', 'Resolved'] } },
  orderBy: [{ updatedAt: 'desc' }],
  include: {
    jiraLinks: { orderBy: { createdAt: 'asc' } },
    statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
  },
} satisfies Prisma.IssueFindManyArgs;

const defaultProjectWbsItems = [
  { code: '1', title: 'Инициация проекта', type: 'PHASE', status: 'IN_PROGRESS', owner: 'РП', startOffset: 0, duration: 14, level: 1 },
  { code: '1.1', title: 'Паспорт проекта', type: 'TASK', status: 'DONE', owner: 'РП', startOffset: 0, duration: 4, level: 2 },
  { code: '1.2', title: 'Команда и роли', type: 'TASK', status: 'DONE', owner: 'Проектный офис', startOffset: 4, duration: 3, level: 2 },
  { code: '1.3', title: 'Старт проекта', type: 'MILESTONE', status: 'DONE', owner: 'Спонсор', startOffset: 7, duration: 0, level: 2 },
  { code: '2', title: 'Планирование', type: 'PHASE', status: 'IN_PROGRESS', owner: 'РП', startOffset: 8, duration: 22, level: 1 },
  { code: '2.1', title: 'Декомпозиция структуры', type: 'TASK', status: 'IN_PROGRESS', owner: 'РП', startOffset: 8, duration: 6, level: 2 },
  { code: '2.1.1', title: 'Уточнение зависимостей', type: 'TASK', status: 'NOT_STARTED', owner: 'Технический лидер', startOffset: 14, duration: 5, level: 3 },
  { code: '2.2', title: 'Базовый план согласован', type: 'MILESTONE', status: 'NOT_STARTED', owner: 'Спонсор', startOffset: 21, duration: 0, level: 2 },
  { code: '3', title: 'Исполнение', type: 'PHASE', status: 'NOT_STARTED', owner: 'Лидер поставки', startOffset: 22, duration: 30, level: 1 },
  { code: '3.1', title: 'Первый пакет работ', type: 'TASK', status: 'NOT_STARTED', owner: 'Лидер команды', startOffset: 22, duration: 10, level: 2 },
] as const;

function addDays(value: Date, days: number) {
  const result = new Date(value);
  result.setDate(result.getDate() + days);
  return result;
}

async function createDefaultProjectStructure(projectId: string, projectStartDate: Date) {
  const createdByCode = new Map<string, { id: string }>();
  for (const [index, item] of defaultProjectWbsItems.entries()) {
    const parentCode = item.code.split('.').slice(0, -1).join('.');
    const startDate = addDays(projectStartDate, item.startOffset);
    const dueDate = addDays(startDate, item.duration);
    const created = await prisma.wbsItem.create({
      data: {
        projectId,
        parentId: createdByCode.get(parentCode)?.id ?? null,
        code: item.code,
        title: item.title,
        type: item.type,
        status: item.status,
        owner: item.owner,
        startDate,
        dueDate,
        forecastStartDate: startDate,
        forecastDueDate: dueDate,
        wbsLevel: item.level,
        workDays: item.duration === 0 ? 0 : item.duration + 1,
        calendarDays: item.duration === 0 ? 0 : item.duration + 1,
        calendarCode: index % 3 === 0 ? 'CN' : 'RU',
        progress: item.status === 'DONE' ? 100 : item.status === 'IN_PROGRESS' ? 35 : 0,
        closedAt: item.status === 'DONE' ? dueDate : null,
        sortOrder: (index + 1) * 10,
      },
      select: { id: true },
    });
    createdByCode.set(item.code, created);
  }

  const dependencies = [
    ['1.1', '1.2'],
    ['1.2', '1.3'],
    ['1.3', '2.1'],
    ['2.1', '2.1.1'],
    ['2.1.1', '2.2'],
    ['2.2', '3.1'],
  ];
  for (const [predecessorCode, successorCode] of dependencies) {
    const predecessor = createdByCode.get(predecessorCode);
    const successor = createdByCode.get(successorCode);
    if (!predecessor || !successor) continue;
    await prisma.wbsDependency.create({
      data: {
        projectId,
        predecessorId: predecessor.id,
        successorId: successor.id,
        type: 'FS',
        lagDays: 0,
      },
    });
  }

  await renumberProjectWbs(projectId);
  await recalculateProjectWbsSchedule(projectId);
}

function sanitizeProjectUiState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

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

async function deleteProjectCascade(projectId: string) {
  await prisma.$transaction(async (tx) => {
    const projectRaidItems = await tx.raidItem.findMany({
      where: { projectId },
      select: { id: true },
    });
    const projectRaidItemIds = projectRaidItems.map((item) => item.id);
    await tx.project.updateMany({
      where: { parentId: projectId },
      data: { parentId: null },
    });
    if (projectRaidItemIds.length > 0) {
      await tx.raidItem.updateMany({
        where: { linkedRiskId: { in: projectRaidItemIds } },
        data: { linkedRiskId: null },
      });
      await tx.raidItemStatusUpdate.deleteMany({
        where: { raidItemId: { in: projectRaidItemIds } },
      });
    }
    await tx.wbsDependency.deleteMany({ where: { projectId } });
    await tx.wbsItem.updateMany({
      where: { projectId },
      data: { parentId: null },
    });
    await tx.issueStatusUpdate.deleteMany({ where: { issue: { projectId } } });
    await tx.issueJiraLink.deleteMany({ where: { issue: { projectId } } });
    await tx.issue.deleteMany({ where: { projectId } });
    await tx.jiraIssueSnapshot.deleteMany({ where: { projectId } });
    await tx.task.deleteMany({ where: { projectId } });
    await tx.milestone.deleteMany({ where: { projectId } });
    await tx.executiveOverview.deleteMany({ where: { projectId } });
    await tx.projectArtifact.deleteMany({ where: { projectId } });
    await tx.raidItem.deleteMany({ where: { projectId } });
    await tx.changeRequest.deleteMany({ where: { projectId } });
    await tx.projectCalendarOverride.deleteMany({ where: { projectId } });
    await tx.wbsCommand.deleteMany({ where: { projectId } });
    await tx.wbsBaselineItem.deleteMany({
      where: { baseline: { projectId } },
    });
    await tx.wbsBaseline.deleteMany({ where: { projectId } });
    await tx.wbsItem.deleteMany({ where: { projectId } });
    await tx.jiraIntegration.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
}

async function projectAuditSnapshot(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jiraIntegration: true,
      _count: {
        select: {
          tasks: true,
          issues: true,
          jiraSnapshots: true,
          milestones: true,
          wbsItems: true,
          wbsDependencies: true,
          wbsBaselines: true,
          artifacts: true,
          raidItems: true,
          changeRequests: true,
          calendarOverrides: true,
        },
      },
    },
  });
}

router.post('/projects', async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { copyBaselineFromProjectId, ...projectData } = parsed.data;

  if (projectData.parentId) {
    const parent = await prisma.project.findUnique({
      where: { id: projectData.parentId },
    });
    if (!parent) {
      res.status(400).json({ error: 'Родительский проект не найден' });
      return;
    }
  }

  if (copyBaselineFromProjectId) {
    const sourceProject = await prisma.project.findUnique({
      where: { id: copyBaselineFromProjectId },
      select: {
        id: true,
        _count: {
          select: {
            wbsBaselines: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });
    if (!sourceProject) {
      res.status(400).json({ error: 'Проект-источник базового плана не найден' });
      return;
    }
    if (sourceProject._count.wbsBaselines === 0) {
      res.status(400).json({ error: 'У выбранного проекта нет активного базового плана' });
      return;
    }
  }

  try {
    const project = await prisma.project.create({
      data: {
        ...projectData,
        parentId: projectData.parentId || null,
        startDate: new Date(projectData.startDate),
        targetDate: new Date(projectData.targetDate),
        budgetPlanned: projectData.budgetPlanned,
        budgetForecast: projectData.budgetForecast,
        uiState: sanitizeProjectUiState(projectData.uiState),
      },
      include: projectInclude,
    });

    let copiedBaseline: Awaited<ReturnType<typeof copyLatestWbsBaselineToProject>> | null = null;
    if (copyBaselineFromProjectId) {
      copiedBaseline = await copyLatestWbsBaselineToProject({
        sourceProjectId: copyBaselineFromProjectId,
        targetProjectId: project.id,
        createdById: currentUser(req)?.id ?? null,
      });
      await recalculateProjectWbsSchedule(project.id);
      const snapshot = await getProjectWbsSnapshot(project.id);
      await recordWbsCommand({
        projectId: project.id,
        type: 'BASELINE',
        payload: {
          action: 'copy-baseline-from-project',
          sourceProjectId: copyBaselineFromProjectId,
          sourceBaselineId: copiedBaseline.sourceBaselineId,
          sourceVersion: copiedBaseline.sourceVersion,
          copiedBaselineId: copiedBaseline.copiedBaseline.id,
          itemCount: copiedBaseline.itemCount,
          dependencyCount: copiedBaseline.dependencyCount,
        },
        afterSnapshot: snapshot,
      });
    } else {
      await createDefaultProjectStructure(project.id, project.startDate);
    }

    const afterSnapshot = await projectAuditSnapshot(project.id);
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project.create',
      objectType: 'Project',
      objectId: project.id,
      projectId: project.id,
      afterValue: afterSnapshot ?? project,
      metadata: copiedBaseline
        ? {
            copiedBaselineFromProjectId: copyBaselineFromProjectId,
            sourceBaselineId: copiedBaseline.sourceBaselineId,
            copiedBaselineId: copiedBaseline.copiedBaseline.id,
            itemCount: copiedBaseline.itemCount,
            dependencyCount: copiedBaseline.dependencyCount,
          }
        : { defaultStructureCreated: true },
    });
    await emitWebhookEvent({
      eventType: 'project.created',
      projectId: project.id,
      payload: { project: afterSnapshot ?? project, copiedBaseline },
    }).catch(() => undefined);

    res.status(201).json({ ...project, copiedBaseline });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({ error: 'Код проекта уже существует' });
      return;
    }
    if (error instanceof Error && error.message.includes('базового плана')) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

router.patch('/projects/:projectId', async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  if (project.status === 'CLOSED') {
    res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
    return;
  }

  if (parsed.data.parentId === project.id) {
    res.status(400).json({ error: 'Проект не может быть своим родителем' });
    return;
  }

  if (parsed.data.parentId) {
    const parent = await prisma.project.findUnique({
      where: { id: parsed.data.parentId },
    });
    if (!parent) {
      res.status(400).json({ error: 'Родительский проект не найден' });
      return;
    }
  }

  const nextParentId = parsed.data.parentId === undefined ? project.parentId : parsed.data.parentId;
  if (await wouldCreateProjectCycle(project.id, nextParentId)) {
    res.status(400).json({ error: 'Проект нельзя перенести под свой дочерний проект' });
    return;
  }

  try {
    const beforeSnapshot = await projectAuditSnapshot(project.id);
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        ...parsed.data,
        parentId: parsed.data.parentId === undefined ? undefined : parsed.data.parentId || null,
        startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
        targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
        budgetPlanned: parsed.data.budgetPlanned,
        budgetForecast: parsed.data.budgetForecast,
        uiState:
          parsed.data.uiState === undefined
            ? undefined
            : sanitizeProjectUiState(parsed.data.uiState),
      },
    });

    const afterSnapshot = await projectAuditSnapshot(project.id);
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project.update',
      objectType: 'Project',
      objectId: project.id,
      projectId: project.id,
      beforeValue: beforeSnapshot ?? project,
      afterValue: afterSnapshot ?? updated,
      metadata: { changedFields: Object.keys(parsed.data) },
    });
    await emitWebhookEvent({
      eventType: 'project.updated',
      projectId: project.id,
      payload: {
        before: beforeSnapshot ?? project,
        after: afterSnapshot ?? updated,
        changedFields: Object.keys(parsed.data),
      },
    }).catch(() => undefined);

    res.json(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      res.status(409).json({ error: 'Код проекта уже существует' });
      return;
    }
    throw error;
  }
});

router.post('/projects/:projectId/close', requireAdmin, async (req, res) => {
  const projectId = Array.isArray(req.params.projectId)
    ? req.params.projectId[0]
    : req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Проект не указан' });
    return;
  }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }
  if (project.status === 'CLOSED') {
    res.json(project);
    return;
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: { status: 'CLOSED' },
    include: projectInclude,
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'project.close',
    objectType: 'Project',
    objectId: project.id,
    projectId: project.id,
    beforeValue: project,
    afterValue: updated,
  });
  await emitWebhookEvent({
    eventType: 'project.closed',
    projectId: project.id,
    payload: { before: project, after: updated },
  }).catch(() => undefined);
  res.json(updated);
});

router.delete('/projects/:projectId', requireAdmin, async (req, res) => {
  const projectId = Array.isArray(req.params.projectId)
    ? req.params.projectId[0]
    : req.params.projectId;
  if (!projectId) {
    res.status(400).json({ error: 'Проект не указан' });
    return;
  }
  const project = await ensureProjectWritable(projectId, res);
  if (!project) {
    return;
  }

  const beforeSnapshot = await projectAuditSnapshot(project.id);
  await deleteProjectCascade(project.id);
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'project.delete',
    objectType: 'Project',
    objectId: project.id,
    projectId: project.id,
    beforeValue: beforeSnapshot ?? project,
  });
  await emitWebhookEvent({
    eventType: 'project.deleted',
    projectId: project.id,
    payload: { before: beforeSnapshot ?? project },
  }).catch(() => undefined);
  res.status(204).send();
});

router.get('/projects/:projectId/overview', async (req, res) => {
  const [project, criticalPath, closedIssues] = await Promise.all([
    prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: projectDetailsInclude,
    }),
    calculateProjectCriticalPath(req.params.projectId),
    prisma.issue.findMany({
      ...closedIssuesInclude,
      where: {
        ...closedIssuesInclude.where,
        projectId: req.params.projectId,
      },
    }),
  ]);

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  res.json({ ...project, closedIssues, criticalPath });
});

router.post('/projects/:projectId/executive-overviews/generate', async (req, res) => {
  const project = await getProjectForOverviewGeneration(req.params.projectId);

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
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
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'overview.generate',
    objectType: 'ExecutiveOverview',
    objectId: overview.id,
    projectId: project.id,
    afterValue: { version: overview.version, status: overview.status },
  });

  res.status(201).json(overview);
});

const overviewTransitionSchema = z.object({
  status: z.enum(['PM_REVIEW', 'APPROVED']),
  approvedBy: z.string().trim().optional().nullable(),
});

router.post('/executive-overviews/:overviewId/status', async (req, res) => {
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
            approvedBy: parsed.data.approvedBy || 'Проектный офис',
          },
  });
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'overview.status',
    objectType: 'ExecutiveOverview',
    objectId: updated.id,
    projectId: updated.projectId,
    beforeValue: { version: overview.version, status: overview.status },
    afterValue: { version: updated.version, status: updated.status },
  });

  res.json(updated);
});

router.post('/executive-overviews/:overviewId/publish', async (req, res) => {
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
  await recordAuditEvent({
    req,
    actor: currentUser(req),
    action: 'overview.publish',
    objectType: 'ExecutiveOverview',
    objectId: published.id,
    projectId: published.projectId,
    beforeValue: { version: overview.version, status: overview.status },
    afterValue: { version: published.version, status: published.status },
  });

  res.json(published);
});

router.get('/executive-overviews/:overviewId/export.json', async (req, res) => {
  const overview = await getExecutiveOverviewForExport(req.params.overviewId);

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  const fileName = `executive-overview-${exportFilePart(overview.project.code)}-v${overview.version}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.json({
    exportedAt: new Date().toISOString(),
    project: overview.project,
    overview: {
      id: overview.id,
      version: overview.version,
      status: overview.status,
      statusLabel: overviewStatusLabel(overview.status),
      generatedAt: overview.generatedAt,
      reviewRequestedAt: overview.reviewRequestedAt,
      approvedAt: overview.approvedAt,
      approvedBy: overview.approvedBy,
      publishedAt: overview.publishedAt,
      executiveSummary: overview.executiveSummary,
      kpis: overview.kpis,
      qualityGates: overview.qualityGates,
      risks: overview.risks,
      nextSteps: overview.nextSteps,
      decisions: overview.decisions,
      evidence: overview.evidence,
    },
  });
});

router.get('/executive-overviews/:overviewId/export.html', async (req, res) => {
  const overview = await getExecutiveOverviewForExport(req.params.overviewId);

  if (!overview) {
    res.status(404).json({ error: 'Executive overview not found' });
    return;
  }

  const fileName = `executive-overview-${exportFilePart(overview.project.code)}-v${overview.version}.html`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(renderExecutiveOverviewHtml(overview));
});

const calendarOverrideSchema = z.object({
  calendarCode: z.enum(['RU', 'CN']),
  date: z.string().trim().min(1),
  isWorkingDay: z.boolean(),
  description: z.string().trim().optional().nullable(),
});

router.put('/projects/:projectId/calendar-overrides', async (req, res) => {
  const parsed = calendarOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
    select: { id: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return;
  }

  const date = new Date(parsed.data.date);
  date.setUTCHours(0, 0, 0, 0);

  const override = await prisma.projectCalendarOverride.upsert({
    where: {
      projectId_calendarCode_date: {
        projectId: project.id,
        calendarCode: parsed.data.calendarCode,
        date,
      },
    },
    create: {
      projectId: project.id,
      calendarCode: parsed.data.calendarCode,
      date,
      isWorkingDay: parsed.data.isWorkingDay,
      description: parsed.data.description || null,
    },
    update: {
      isWorkingDay: parsed.data.isWorkingDay,
      description: parsed.data.description || null,
    },
  });

  await recalculateProjectWbsSchedule(project.id);

  res.json(override);
});

router.delete('/projects/:projectId/calendar-overrides', async (req, res) => {
  const parsed = z
    .object({
      calendarCode: z.enum(['RU', 'CN']),
      date: z.string().trim().min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const date = new Date(parsed.data.date);
  date.setUTCHours(0, 0, 0, 0);
  const project = await ensureProjectWritable(req.params.projectId, res);
  if (!project) {
    return;
  }

  await prisma.projectCalendarOverride.deleteMany({
    where: {
      projectId: project.id,
      calendarCode: parsed.data.calendarCode,
      date,
    },
  });

  await recalculateProjectWbsSchedule(project.id);

  res.status(204).send();
});

const artifactSchema = z.object({
  title: z.string().trim().min(3),
  type: z.string().trim().min(1),
  owner: z.string().trim().optional().default(''),
  status: z.enum(['Draft', 'In Review', 'Approved', 'Baseline', 'Archived']).default('Draft'),
  url: z.string().trim().url().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().default(0),
});

router.post('/projects/:projectId/artifacts', async (req, res) => {
  const parsed = artifactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await ensureProjectWritable(req.params.projectId, res);

  if (!project) {
    return;
  }

  const artifact = await prisma.projectArtifact.create({
    data: {
      projectId: project.id,
      ...parsed.data,
      url: parsed.data.url || null,
      description: parsed.data.description || null,
      owner: parsed.data.owner || 'Не назначен',
    },
  });

  await emitWebhookEvent({
    eventType: 'artifact.created',
    projectId: project.id,
    payload: { artifact },
  }).catch(() => undefined);
  res.status(201).json(artifact);
});

router.patch('/project-artifacts/:artifactId', async (req, res) => {
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
  if (!(await ensureEntityProjectWritable(artifact.projectId, res))) {
    return;
  }

  const updated = await prisma.projectArtifact.update({
    where: { id: artifact.id },
    data: {
      ...parsed.data,
      url: parsed.data.url === undefined ? undefined : parsed.data.url || null,
      description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
      owner: parsed.data.owner === undefined ? undefined : parsed.data.owner || 'Не назначен',
    },
  });

  await emitWebhookEvent({
    eventType: 'artifact.updated',
    projectId: artifact.projectId,
    payload: { before: artifact, after: updated },
  }).catch(() => undefined);
  res.json(updated);
});

router.delete('/project-artifacts/:artifactId', async (req, res) => {
  const artifact = await prisma.projectArtifact.findUnique({
    where: { id: req.params.artifactId },
  });

  if (!artifact) {
    res.status(404).json({ error: 'Artifact not found' });
    return;
  }
  if (!(await ensureEntityProjectWritable(artifact.projectId, res))) {
    return;
  }

  await prisma.projectArtifact.delete({
    where: { id: artifact.id },
  });

  await emitWebhookEvent({
    eventType: 'artifact.deleted',
    projectId: artifact.projectId,
    payload: { before: artifact },
  }).catch(() => undefined);
  res.status(204).send();
});

router.post('/projects/:projectId/artifacts/reorder', async (req, res) => {
  const parsed = z
    .object({
      orderedIds: z.array(z.string().trim().min(1)).min(1),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const artifacts = await prisma.projectArtifact.findMany({
    where: { projectId: req.params.projectId },
    select: { id: true },
  });
  if (!(await ensureEntityProjectWritable(req.params.projectId, res))) {
    return;
  }
  const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
  const orderedIds = parsed.data.orderedIds.filter((id) => artifactIds.has(id));

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.projectArtifact.update({
        where: { id },
        data: { sortOrder: index + 1 },
      }),
    ),
  );

  res.json({ ok: true });
});

const milestoneSchema = z.object({
  code: z.string().trim().optional().nullable(),
  title: z.string().trim().min(3),
  dueDate: z.string().trim().min(1),
  status: z.enum(['Planned', 'In Progress', 'At Risk', 'Done', 'Cancelled']).default('Planned'),
  owner: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
});

router.post('/projects/:projectId/milestones', async (req, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const project = await prisma.project.findUnique({
    where: { id: req.params.projectId },
  });

  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
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

router.patch('/milestones/:milestoneId', async (req, res) => {
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



  return router;
}
