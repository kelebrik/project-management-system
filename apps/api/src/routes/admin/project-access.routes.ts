import { Prisma, type ProjectAccessLevel } from '@prisma/client';
import type { Request, Response, Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import {
  defaultBusinessUnitId,
  requestedBusinessUnitId,
} from '../../server/business-units.js';
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
      businessUnitId: true,
    },
  },
} as const;

function routeParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function businessUnitAdminCanManageAccess(
  currentLevel: ProjectAccessLevel | null,
  nextLevel: ProjectAccessLevel | null,
) {
  return (
    (currentLevel === null || currentLevel === 'EDIT') &&
    (nextLevel === null || nextLevel === 'EDIT')
  );
}

async function selectedBusinessUnitId(req: Request) {
  return requestedBusinessUnitId(req) ?? (await defaultBusinessUnitId());
}

async function canAdminBusinessUnit(
  actor: ReturnType<AdminRoutesContext['currentUser']>,
  businessUnitId: string,
) {
  if (!actor) return false;
  if (actor.role === 'ADMIN') return true;
  return Boolean(await prisma.businessUnitMembership.findUnique({
    where: { businessUnitId_userId: { businessUnitId, userId: actor.id } },
    select: { id: true, role: true },
  }).then((membership) => membership?.role === 'ADMIN'));
}

async function requireSelectedBusinessUnitAdmin(
  req: Request,
  res: Response,
  currentUser: AdminRoutesContext['currentUser'],
) {
  const actor = currentUser(req);
  if (!actor) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  const businessUnitId = await selectedBusinessUnitId(req);
  if (!businessUnitId || !(await canAdminBusinessUnit(actor, businessUnitId))) {
    res.status(403).json({ error: 'Нет прав администратора выбранного бизнес-юнита' });
    return null;
  }
  return { actor, businessUnitId };
}

async function scopedAccesses(businessUnitId: string, systemAdmin: boolean) {
  return prisma.projectAccess.findMany({
    where: {
      project: { businessUnitId },
      ...(systemAdmin ? {} : { level: 'EDIT' }),
    },
    include: projectAccessInclude,
    orderBy: [
      { project: { code: 'asc' } },
      { level: 'desc' },
      { user: { name: 'asc' } },
    ],
  });
}

async function ensureProjectsInBusinessUnit(projectIds: string[], businessUnitId: string) {
  const projectCount = await prisma.project.count({
    where: { id: { in: projectIds }, businessUnitId },
  });
  return projectCount === new Set(projectIds).size;
}

function projectAccessCandidateWhere(
  actorRole: string,
  businessUnitId: string,
): Prisma.UserWhereInput {
  return {
    isActive: true,
    ...(actorRole === 'ADMIN'
      ? {}
      : {
          role: { not: 'ADMIN' },
          businessUnitMemberships: {
            none: { businessUnitId, role: 'ADMIN' },
          },
        }),
  };
}

export function registerProjectAccessRoutes(router: Router, context: AdminRoutesContext) {
  const { currentUser } = context;

  router.get('/admin/project-access-users', async (req, res) => {
    const scope = await requireSelectedBusinessUnitAdmin(req, res, currentUser);
    if (!scope) return;
    const users = await prisma.user.findMany({
      where: projectAccessCandidateWhere(scope.actor.role, scope.businessUnitId),
      select: { id: true, email: true, name: true, role: true, isActive: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    res.json(users);
  });

  router.get('/admin/project-access', async (req, res) => {
    const scope = await requireSelectedBusinessUnitAdmin(req, res, currentUser);
    if (!scope) return;
    res.json(await scopedAccesses(scope.businessUnitId, scope.actor.role === 'ADMIN'));
  });

  router.post('/admin/project-access', async (req, res) => {
    const scope = await requireSelectedBusinessUnitAdmin(req, res, currentUser);
    if (!scope) return;
    const parsed = projectAccessGrantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    if (
      scope.actor.role !== 'ADMIN' &&
      !businessUnitAdminCanManageAccess(null, parsed.data.level)
    ) {
      res.status(403).json({ error: 'Администратор БЮ может выдавать только право изменения' });
      return;
    }

    const [userCount, projectsInScope] = await Promise.all([
      prisma.user.count({
        where: {
          id: { in: parsed.data.userIds },
          ...projectAccessCandidateWhere(scope.actor.role, scope.businessUnitId),
        },
      }),
      ensureProjectsInBusinessUnit(parsed.data.projectIds, scope.businessUnitId),
    ]);
    if (userCount !== new Set(parsed.data.userIds).size) {
      res.status(scope.actor.role === 'ADMIN' ? 400 : 403).json({
        error: scope.actor.role === 'ADMIN'
          ? 'Один или несколько пользователей не найдены или отключены'
          : 'Администратор БЮ может выдавать доступ только обычным пользователям',
      });
      return;
    }
    if (!projectsInScope) {
      res.status(403).json({ error: 'Можно управлять доступами только в выбранном бизнес-юните' });
      return;
    }
    if (scope.actor.role !== 'ADMIN') {
      const protectedAccess = await prisma.projectAccess.findFirst({
        where: {
          projectId: { in: parsed.data.projectIds },
          userId: { in: parsed.data.userIds },
          level: 'ADMIN',
        },
        select: { id: true },
      });
      if (protectedAccess) {
        res.status(403).json({ error: 'Нельзя изменять доступ уровня администратора' });
        return;
      }
    }

    await prisma.$transaction(
      parsed.data.projectIds.flatMap((projectId) =>
        parsed.data.userIds.map((userId) =>
          prisma.projectAccess.upsert({
            where: { projectId_userId: { projectId, userId } },
            create: {
              projectId,
              userId,
              level: parsed.data.level,
              grantedById: scope.actor.id,
            },
            update: {
              level: parsed.data.level,
              grantedById: scope.actor.id,
            },
          }),
        ),
      ),
    );

    await recordAuditEvent({
      req,
      actor: scope.actor,
      action: 'project_access.grant',
      objectType: 'ProjectAccess',
      afterValue: parsed.data,
      metadata: {
        businessUnitId: scope.businessUnitId,
        userCount: parsed.data.userIds.length,
        projectCount: parsed.data.projectIds.length,
      },
    });
    res.status(201).json(
      await scopedAccesses(scope.businessUnitId, scope.actor.role === 'ADMIN'),
    );
  });

  router.patch('/admin/project-access/:accessId', async (req, res) => {
    const accessId = routeParam(req.params.accessId);
    const parsed = projectAccessPatchSchema.safeParse(req.body);
    if (!accessId || !parsed.success) {
      res.status(400).json({ error: parsed.success ? 'Доступ не указан' : parsed.error.flatten() });
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
    const actor = currentUser(req);
    if (!actor) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    if (!(await canAdminBusinessUnit(actor, access.project.businessUnitId))) {
      res.status(403).json({ error: 'Нет прав администратора бизнес-юнита проекта' });
      return;
    }
    const selectedId = await selectedBusinessUnitId(req);
    if (selectedId !== access.project.businessUnitId) {
      res.status(403).json({ error: 'Доступ относится к другому выбранному бизнес-юниту' });
      return;
    }
    if (
      actor.role !== 'ADMIN' &&
      !businessUnitAdminCanManageAccess(access.level, parsed.data.level)
    ) {
      res.status(403).json({ error: 'Администратор БЮ не может управлять уровнем ADMIN' });
      return;
    }

    const updated = await prisma.projectAccess.update({
      where: { id: access.id },
      data: { level: parsed.data.level, grantedById: actor.id },
      include: projectAccessInclude,
    });
    await recordAuditEvent({
      req,
      actor,
      action: 'project_access.update',
      objectType: 'ProjectAccess',
      objectId: access.id,
      projectId: access.projectId,
      beforeValue: access,
      afterValue: updated,
    });
    res.json(updated);
  });

  router.delete('/admin/project-access/:accessId', async (req, res) => {
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
    const actor = currentUser(req);
    if (!actor) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    if (!(await canAdminBusinessUnit(actor, access.project.businessUnitId))) {
      res.status(403).json({ error: 'Нет прав администратора бизнес-юнита проекта' });
      return;
    }
    const selectedId = await selectedBusinessUnitId(req);
    if (selectedId !== access.project.businessUnitId) {
      res.status(403).json({ error: 'Доступ относится к другому выбранному бизнес-юниту' });
      return;
    }
    if (
      actor.role !== 'ADMIN' &&
      !businessUnitAdminCanManageAccess(access.level, null)
    ) {
      res.status(403).json({ error: 'Администратор БЮ не может удалять уровень ADMIN' });
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
      actor,
      action: 'project_access.delete',
      objectType: 'ProjectAccess',
      objectId: access.id,
      projectId: access.projectId,
      beforeValue: access,
    });
    res.status(204).send();
  });
}
