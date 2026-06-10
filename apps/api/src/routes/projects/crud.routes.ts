import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { getProjectWbsSnapshot } from '../../services/wbs.js';
import { recordWbsCommand } from '../../services/wbs-audit.js';
import { copyLatestWbsBaselineToProject } from '../../services/wbs-baseline.js';
import { recalculateProjectWbsSchedule } from '../../services/wbs-schedule.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import { userProjectAccessLevelMap } from '../../server/project-access.js';
import { projectAuditSnapshot } from './audit.js';
import { deleteProjectCascade } from './cascade.js';
import { createDefaultProjectStructure } from './default-structure.js';
import { sanitizeProjectUiState, wouldCreateProjectCycle } from './helpers.js';
import { projectDetailsInclude, projectInclude } from './includes.js';
import {
  createProjectSchema,
  projectTargetDateChangeSchema,
  projectUiStatePatchSchema,
  updateProjectSchema,
} from './schemas.js';
import type { ProjectsRoutesContext } from './types.js';

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function findActiveProjectGoal(projectId: string) {
  const goals = await prisma.wbsItem.findMany({
    where: {
      projectId,
      type: 'GOAL',
      status: { not: 'CANCELLED' },
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  return goals.find((item) => item.status !== 'DONE') ?? goals.at(-1) ?? null;
}

export function registerProjectCrudRoutes(
  router: Router,
  { requireAdmin, currentUser, ensureProjectWritable }: ProjectsRoutesContext,
) {
  router.get('/projects', async (req, res) => {
    const projects = await prisma.project.findMany({
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      include: projectInclude,
    });

    const user = currentUser(req);
    if (!user) {
      res.json(projects.map((project) => ({ ...project, currentUserAccessLevel: null })));
      return;
    }
    if (user.role === 'ADMIN') {
      res.json(projects.map((project) => ({ ...project, currentUserAccessLevel: 'ADMIN' })));
      return;
    }

    const accessByProjectId = await userProjectAccessLevelMap(
      user.id,
      projects.map((project) => project.id),
    );
    res.json(
      projects
        .filter((project) => accessByProjectId.has(project.id))
        .map((project) => ({
          ...project,
          currentUserAccessLevel: accessByProjectId.get(project.id) ?? null,
        })),
    );
  });

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
          initialTargetDate: new Date(projectData.targetDate),
          targetDate: new Date(projectData.targetDate),
          budgetPlanned: projectData.budgetPlanned,
          budgetForecast: projectData.budgetForecast,
          uiState: sanitizeProjectUiState(projectData.uiState),
        },
        include: projectInclude,
      });
      const actor = currentUser(req);

      if (actor && actor.role !== 'ADMIN') {
        await prisma.projectAccess.upsert({
          where: {
            projectId_userId: {
              projectId: project.id,
              userId: actor.id,
            },
          },
          create: {
            projectId: project.id,
            userId: actor.id,
            level: 'EDIT',
            grantedById: actor.id,
          },
          update: {
            level: 'EDIT',
            grantedById: actor.id,
          },
        });
      }

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

  router.patch('/projects/:projectId/ui-state', async (req, res) => {
    const parsed = projectUiStatePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      select: { id: true, status: true, uiState: true },
    });

    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    if (project.status === 'CLOSED') {
      res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
      return;
    }

    const beforeUiState = sanitizeProjectUiState(project.uiState) as Record<string, unknown>;
    const nextUiState: Record<string, unknown> = { ...beforeUiState };

    if (Object.prototype.hasOwnProperty.call(parsed.data, 'milestoneLabelLayout')) {
      if (parsed.data.milestoneLabelLayout === null) {
        delete nextUiState.milestoneLabelLayout;
      } else {
        nextUiState.milestoneLabelLayout = parsed.data.milestoneLabelLayout;
      }
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { uiState: nextUiState as Prisma.InputJsonObject },
      select: { id: true, uiState: true },
    });

    const changedFields = Object.keys(parsed.data);
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project.ui_state.update',
      objectType: 'Project',
      objectId: project.id,
      projectId: project.id,
      beforeValue: { uiState: beforeUiState },
      afterValue: { uiState: updated.uiState },
      metadata: { changedFields },
    });
    await emitWebhookEvent({
      eventType: 'project.ui_state.updated',
      projectId: project.id,
      payload: { uiState: updated.uiState, changedFields },
    }).catch(() => undefined);

    res.json({ uiState: updated.uiState });
  });

  router.patch('/projects/:projectId', async (req, res) => {
    const parsed = updateProjectSchema.safeParse(req.body);
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

  router.patch('/projects/:projectId/target-date', async (req, res) => {
    const parsed = projectTargetDateChangeSchema.safeParse(req.body);
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

    const nextTargetDate = new Date(parsed.data.targetDate);
    if (Number.isNaN(nextTargetDate.getTime())) {
      res.status(400).json({ error: 'Некорректная дата цели проекта' });
      return;
    }

    const activeGoal = await findActiveProjectGoal(project.id);
    const previousTargetDate = activeGoal?.dueDate ?? project.targetDate;
    const changed = dateKey(previousTargetDate) !== dateKey(nextTargetDate);

    if (!changed) {
      const unchanged = await prisma.project.findUnique({
        where: { id: project.id },
        include: projectDetailsInclude,
      });
      res.json(unchanged);
      return;
    }

    const beforeSnapshot = await projectAuditSnapshot(project.id);
    await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: project.id },
        data: {
          initialTargetDate: project.initialTargetDate ?? previousTargetDate,
          targetDate: nextTargetDate,
        },
      });
      if (activeGoal) {
        await tx.wbsItem.update({
          where: { id: activeGoal.id },
          data: {
            startDate: nextTargetDate,
            dueDate: nextTargetDate,
            forecastStartDate: nextTargetDate,
            forecastDueDate: nextTargetDate,
            workDays: 0,
            calendarDays: 1,
          },
        });
      }
      await tx.projectTargetDateChange.create({
        data: {
          projectId: project.id,
          previousDate: previousTargetDate,
          newDate: nextTargetDate,
          reason: parsed.data.reason,
          approvedBy: parsed.data.approvedBy || null,
          createdById: currentUser(req)?.id ?? null,
        },
      });
    });

    if (activeGoal) {
      await recalculateProjectWbsSchedule(project.id, {
        changedItemId: activeGoal.id,
        changedFields: ['startDate', 'dueDate', 'forecastStartDate', 'forecastDueDate'],
      });
    }

    const updated = await prisma.project.findUnique({
      where: { id: project.id },
      include: projectDetailsInclude,
    });
    const afterSnapshot = await projectAuditSnapshot(project.id);
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project.target_date.update',
      objectType: 'Project',
      objectId: project.id,
      projectId: project.id,
      beforeValue: beforeSnapshot ?? project,
      afterValue: afterSnapshot ?? updated,
      metadata: {
        previousDate: previousTargetDate.toISOString(),
        newDate: nextTargetDate.toISOString(),
        activeGoalId: activeGoal?.id ?? null,
        reason: parsed.data.reason,
        approvedBy: parsed.data.approvedBy || null,
      },
    });
    await emitWebhookEvent({
      eventType: 'project.target_date.updated',
      projectId: project.id,
      payload: {
        before: beforeSnapshot ?? project,
        after: afterSnapshot ?? updated,
        previousDate: previousTargetDate.toISOString(),
        newDate: nextTargetDate.toISOString(),
      },
    }).catch(() => undefined);

    res.json(updated);
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
}
