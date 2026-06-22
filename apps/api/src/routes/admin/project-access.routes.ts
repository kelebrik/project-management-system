import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { projectAccessGrantSchema, projectAccessPatchSchema } from './schemas.js';
import type { AdminRoutesContext } from './types.js';

const projectAccessInclude = {
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
    },
  },
  project: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
} as const;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function registerProjectAccessRoutes(router: Router, context: AdminRoutesContext) {
  const { currentUser, requireAdmin } = context;

  router.get('/admin/project-access', requireAdmin, async (_req, res) => {
    const accesses = await prisma.projectAccess.findMany({
      include: projectAccessInclude,
      orderBy: [
        { project: { code: 'asc' } },
        { level: 'desc' },
        { user: { name: 'asc' } },
      ],
    });
    res.json(accesses);
  });

  router.post('/admin/project-access', requireAdmin, async (req, res) => {
    const parsed = projectAccessGrantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const [userCount, projectCount] = await Promise.all([
      prisma.user.count({ where: { id: { in: parsed.data.userIds }, isActive: true } }),
      prisma.project.count({ where: { id: { in: parsed.data.projectIds } } }),
    ]);
    if (userCount !== new Set(parsed.data.userIds).size) {
      res.status(400).json({ error: 'Один или несколько пользователей не найдены или отключены' });
      return;
    }
    if (projectCount !== new Set(parsed.data.projectIds).size) {
      res.status(400).json({ error: 'Один или несколько проектов не найдены' });
      return;
    }

    const actor = currentUser(req);
    await prisma.$transaction(
      parsed.data.projectIds.flatMap((projectId) =>
        parsed.data.userIds.map((userId) =>
          prisma.projectAccess.upsert({
            where: {
              projectId_userId: {
                projectId,
                userId,
              },
            },
            create: {
              projectId,
              userId,
              level: parsed.data.level,
              grantedById: actor?.id ?? null,
            },
            update: {
              level: parsed.data.level,
              grantedById: actor?.id ?? null,
            },
          }),
        ),
      ),
    );

    await recordAuditEvent({
      req,
      actor,
      action: 'project_access.grant',
      objectType: 'ProjectAccess',
      afterValue: parsed.data,
      metadata: {
        userCount: parsed.data.userIds.length,
        projectCount: parsed.data.projectIds.length,
      },
    });

    const accesses = await prisma.projectAccess.findMany({
      include: projectAccessInclude,
      orderBy: [
        { project: { code: 'asc' } },
        { level: 'desc' },
        { user: { name: 'asc' } },
      ],
    });
    res.status(201).json(accesses);
  });

  router.patch('/admin/project-access/:accessId', requireAdmin, async (req, res) => {
    const accessId = routeParam(req.params.accessId);
    if (!accessId) {
      res.status(400).json({ error: 'Доступ не указан' });
      return;
    }
    const parsed = projectAccessPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const access = await prisma.projectAccess.findUnique({
      where: { id: accessId },
      include: projectAccessInclude,
    });
    if (!access) {
      res.status(404).json({ error: 'Доступ не найден' });
      return;
    }

    const updated = await prisma.projectAccess.update({
      where: { id: access.id },
      data: {
        level: parsed.data.level,
        grantedById: currentUser(req)?.id ?? null,
      },
      include: projectAccessInclude,
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project_access.update',
      objectType: 'ProjectAccess',
      objectId: access.id,
      projectId: access.projectId,
      beforeValue: access,
      afterValue: updated,
    });
    res.json(updated);
  });

  router.delete('/admin/project-access/:accessId', requireAdmin, async (req, res) => {
    const accessId = routeParam(req.params.accessId);
    if (!accessId) {
      res.status(400).json({ error: 'Доступ не указан' });
      return;
    }
    const access = await prisma.projectAccess.findUnique({
      where: { id: accessId },
      include: projectAccessInclude,
    });
    if (!access) {
      res.status(404).json({ error: 'Доступ не найден' });
      return;
    }

    try {
      await prisma.projectAccess.delete({ where: { id: access.id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Доступ не найден' });
        return;
      }
      throw error;
    }
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project_access.delete',
      objectType: 'ProjectAccess',
      objectId: access.id,
      projectId: access.projectId,
      beforeValue: access,
    });
    res.status(204).send();
  });
}
