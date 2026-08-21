import { Prisma } from '@prisma/client';
import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { recordAuditEvent } from '../services/audit.js';
import { readableProjectWhere, userCanReadProject } from '../server/business-units.js';

const savedViewSchema = z.object({
  projectId: z.string().trim().optional().nullable(),
  viewType: z.string().trim().min(1),
  name: z.string().trim().min(1),
  config: z.unknown(),
  isShared: z.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

const savedViewPatchSchema = savedViewSchema.partial();
const retiredJiraAnalyticsViewType = 'jira-analytics-dashboard';

type SavedViewsContext = {
  currentUser: (req: Request) => any;
  requireAuth: RequestHandler;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stringParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createSavedViewsRouter({ currentUser, requireAuth }: SavedViewsContext) {
  const router = Router();

  router.get('/saved-views', async (req, res) => {
    const user = currentUser(req);
    const viewType = typeof req.query.viewType === 'string' ? req.query.viewType : undefined;
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const projectScope = await readableProjectWhere(req);
    const filters: Prisma.SavedViewWhereInput[] = [
      { viewType: { not: retiredJiraAnalyticsViewType } },
    ];
    if (viewType) filters.push({ viewType });
    if (projectId) filters.push({ OR: [{ projectId }, { projectId: null }] });
    filters.push({ OR: [{ projectId: null }, { project: projectScope }] });
    filters.push(user ? { OR: [{ ownerId: user.id }, { isShared: true }] } : { isShared: true });
    const where: Prisma.SavedViewWhereInput = filters.length > 0 ? { AND: filters } : {};
    const views = await prisma.savedView.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json(views);
  });

  router.post('/saved-views', requireAuth, async (req, res) => {
    const parsed = savedViewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (parsed.data.viewType === retiredJiraAnalyticsViewType) {
      res.status(400).json({ error: 'Для аналитики Jira используется общая конфигурация проекта' });
      return;
    }
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    if (parsed.data.projectId && !(await userCanReadProject(req, parsed.data.projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const view = await prisma.savedView.create({
      data: {
        ownerId: user.id,
        projectId: parsed.data.projectId || null,
        viewType: parsed.data.viewType,
        name: parsed.data.name,
        config: toJson(parsed.data.config),
        isShared: parsed.data.isShared,
        sortOrder: parsed.data.sortOrder,
      },
    });
    await recordAuditEvent({
      req,
      actor: user,
      action: 'saved_view.create',
      objectType: 'SavedView',
      objectId: view.id,
      projectId: view.projectId,
      afterValue: view,
    });
    res.status(201).json(view);
  });

  router.patch('/saved-views/:viewId', requireAuth, async (req, res) => {
    const parsed = savedViewPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = currentUser(req);
    const viewId = stringParam(req.params.viewId);
    if (!viewId) {
      res.status(400).json({ error: 'Не указан идентификатор представления' });
      return;
    }
    const before = await prisma.savedView.findUnique({ where: { id: viewId } });
    if (!before) {
      res.status(404).json({ error: 'Представление не найдено' });
      return;
    }
    if (
      before.viewType === retiredJiraAnalyticsViewType ||
      parsed.data.viewType === retiredJiraAnalyticsViewType
    ) {
      res.status(400).json({ error: 'Для аналитики Jira используется общая конфигурация проекта' });
      return;
    }
    if (user?.role !== 'ADMIN' && before.ownerId !== user?.id) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    if (parsed.data.projectId && !(await userCanReadProject(req, parsed.data.projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const view = await prisma.savedView.update({
      where: { id: before.id },
      data: {
        projectId: parsed.data.projectId === undefined ? undefined : parsed.data.projectId || null,
        viewType: parsed.data.viewType,
        name: parsed.data.name,
        config: parsed.data.config === undefined ? undefined : toJson(parsed.data.config),
        isShared: parsed.data.isShared,
        sortOrder: parsed.data.sortOrder,
        lastUsedAt: parsed.data.config === undefined ? new Date() : undefined,
      },
    });
    await recordAuditEvent({
      req,
      actor: user,
      action: 'saved_view.update',
      objectType: 'SavedView',
      objectId: view.id,
      projectId: view.projectId,
      beforeValue: before,
      afterValue: view,
    });
    res.json(view);
  });

  router.post('/saved-views/:viewId/use', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const viewId = stringParam(req.params.viewId);
    if (!viewId) {
      res.status(400).json({ error: 'Не указан идентификатор представления' });
      return;
    }
    const before = await prisma.savedView.findUnique({ where: { id: viewId } });
    if (!before) {
      res.status(404).json({ error: 'Представление не найдено' });
      return;
    }
    if (before.viewType === retiredJiraAnalyticsViewType) {
      res.status(404).json({ error: 'Представление не найдено' });
      return;
    }
    if (!before.isShared && before.ownerId !== user?.id) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const view = await prisma.savedView.update({
      where: { id: before.id },
      data: { lastUsedAt: new Date() },
    });
    res.json(view);
  });

  router.delete('/saved-views/:viewId', requireAuth, async (req, res) => {
    const user = currentUser(req);
    const viewId = stringParam(req.params.viewId);
    if (!viewId) {
      res.status(400).json({ error: 'Не указан идентификатор представления' });
      return;
    }
    const before = await prisma.savedView.findUnique({ where: { id: viewId } });
    if (!before) {
      res.status(404).json({ error: 'Представление не найдено' });
      return;
    }
    if (user?.role !== 'ADMIN' && before.ownerId !== user?.id) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    await prisma.savedView.delete({ where: { id: before.id } });
    await recordAuditEvent({
      req,
      actor: user,
      action: 'saved_view.delete',
      objectType: 'SavedView',
      objectId: before.id,
      projectId: before.projectId,
      beforeValue: before,
    });
    res.status(204).send();
  });

  return router;
}
