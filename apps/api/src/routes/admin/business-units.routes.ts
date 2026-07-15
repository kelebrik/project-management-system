import { Prisma } from '@prisma/client';
import type { Request, Response, Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import {
  businessUnitMembershipSchema,
  businessUnitSchema,
  rolePermissionSchema,
} from './schemas.js';
import {
  businessUnitRoleHasPermission,
  businessUnitRolesWithPermission,
} from '../../server/business-unit-permissions.js';
import type { AdminRoutesContext } from './types.js';

const unitInclude = {
  memberships: {
    include: {
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
    orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
  },
  _count: { select: { projects: true } },
} satisfies Prisma.BusinessUnitInclude;

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function canManageBusinessUnit(user: ReturnType<AdminRoutesContext['currentUser']>, businessUnitId: string) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  const membership = await prisma.businessUnitMembership.findUnique({
    where: { businessUnitId_userId: { businessUnitId, userId: user.id } },
    select: { role: true },
  });
  return membership
    ? businessUnitRoleHasPermission(membership.role, 'MEMBERS_MANAGE')
    : false;
}

async function requireBusinessUnitManager(
  req: Request,
  res: Response,
  businessUnitId: string,
  currentUser: AdminRoutesContext['currentUser'],
) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  if (!(await canManageBusinessUnit(user, businessUnitId))) {
    res.status(403).json({ error: 'Управлять участниками может администратор этого бизнес-юнита' });
    return null;
  }
  return user;
}

export function registerBusinessUnitAdminRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser } = context;

  router.get('/admin/business-units', async (req, res) => {
    const actor = currentUser(req);
    if (!actor) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const managerRoles = await businessUnitRolesWithPermission('MEMBERS_MANAGE');
    const units = await prisma.businessUnit.findMany({
      where: actor.role === 'ADMIN'
        ? undefined
        : { memberships: { some: { userId: actor.id, role: { in: managerRoles } } } },
      include: unitInclude,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json(units);
  });

  router.get('/admin/business-unit-users', async (req, res) => {
    const actor = currentUser(req);
    if (!actor) {
      res.status(401).json({ error: 'Требуется вход в систему' });
      return;
    }
    const managerRoles = await businessUnitRolesWithPermission('MEMBERS_MANAGE');
    if (actor.role !== 'ADMIN' && !(await prisma.businessUnitMembership.findFirst({
      where: { userId: actor.id, role: { in: managerRoles } },
      select: { id: true },
    }))) {
      res.status(403).json({ error: 'Недостаточно прав' });
      return;
    }
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, isActive: true },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    res.json(users);
  });

  router.get('/admin/business-unit-role-permissions', requireAdmin, async (_req, res) => {
    const permissions = await prisma.businessUnitRolePermission.findMany({
      orderBy: [{ role: 'asc' }, { permission: 'asc' }],
    });
    res.json(permissions);
  });

  router.patch('/admin/business-unit-role-permissions/:permissionId', requireAdmin, async (req, res) => {
    const permissionId = param(req.params.permissionId);
    const parsed = rolePermissionSchema.safeParse(req.body);
    if (!permissionId || !parsed.success) {
      res.status(400).json({ error: parsed.success ? 'Право не указано' : parsed.error.flatten() });
      return;
    }
    const before = await prisma.businessUnitRolePermission.findUnique({ where: { id: permissionId } });
    if (!before) {
      res.status(404).json({ error: 'Право не найдено' });
      return;
    }
    const updated = await prisma.businessUnitRolePermission.update({
      where: { id: permissionId },
      data: { enabled: parsed.data.enabled },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'business_unit.role_permission.update',
      objectType: 'BusinessUnitRolePermission',
      objectId: updated.id,
      beforeValue: before,
      afterValue: updated,
    });
    res.json(updated);
  });

  router.post('/admin/business-units', requireAdmin, async (req, res) => {
    const parsed = businessUnitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const actor = currentUser(req);
      const unit = await prisma.businessUnit.create({
        data: {
          ...parsed.data,
          memberships: actor
            ? { create: { userId: actor.id, role: 'ADMIN' } }
            : undefined,
        },
        include: unitInclude,
      });
      await recordAuditEvent({
        req,
        actor,
        action: 'business_unit.create',
        objectType: 'BusinessUnit',
        objectId: unit.id,
        afterValue: unit,
      });
      res.status(201).json(unit);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ error: 'Бизнес-юнит с таким кодом уже существует' });
        return;
      }
      throw error;
    }
  });

  router.post('/admin/business-units/:businessUnitId/memberships', async (req, res) => {
    const businessUnitId = param(req.params.businessUnitId);
    const parsed = businessUnitMembershipSchema.safeParse(req.body);
    if (!businessUnitId || !parsed.success) {
      res.status(400).json({ error: parsed.success ? 'Бизнес-юнит не указан' : parsed.error.flatten() });
      return;
    }
    const actor = await requireBusinessUnitManager(req, res, businessUnitId, currentUser);
    if (!actor) return;
    const [unit, user, existing] = await Promise.all([
      prisma.businessUnit.findUnique({ where: { id: businessUnitId }, select: { id: true } }),
      prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, isActive: true } }),
      prisma.businessUnitMembership.findUnique({
        where: { businessUnitId_userId: { businessUnitId, userId: parsed.data.userId } },
      }),
    ]);
    if (!unit || !user) {
      res.status(404).json({ error: !unit ? 'Бизнес-юнит не найден' : 'Пользователь не найден' });
      return;
    }
    if (!user.isActive) {
      res.status(400).json({ error: 'Нельзя назначить отключенного пользователя' });
      return;
    }
    const managerRoles = await businessUnitRolesWithPermission('MEMBERS_MANAGE');
    if (
      existing &&
      managerRoles.includes(existing.role) &&
      !managerRoles.includes(parsed.data.role)
    ) {
      const managerCount = await prisma.businessUnitMembership.count({
        where: { businessUnitId, role: { in: managerRoles } },
      });
      if (managerCount <= 1) {
        res.status(400).json({ error: 'В бизнес-юните должен остаться хотя бы один управляющий участниками' });
        return;
      }
    }
    const membership = await prisma.businessUnitMembership.upsert({
      where: { businessUnitId_userId: { businessUnitId, userId: parsed.data.userId } },
      create: { businessUnitId, ...parsed.data },
      update: { role: parsed.data.role },
      include: { user: { select: { id: true, name: true, email: true, role: true, isActive: true } } },
    });
    await recordAuditEvent({
      req,
      actor,
      action: 'business_unit.membership.upsert',
      objectType: 'BusinessUnitMembership',
      objectId: membership.id,
      afterValue: membership,
    });
    res.json(membership);
  });

  router.delete('/admin/business-unit-memberships/:membershipId', async (req, res) => {
    const membershipId = param(req.params.membershipId);
    if (!membershipId) {
      res.status(400).json({ error: 'Участник не указан' });
      return;
    }
    const before = await prisma.businessUnitMembership.findUnique({ where: { id: membershipId } });
    if (!before) {
      res.status(404).json({ error: 'Участник бизнес-юнита не найден' });
      return;
    }
    const actor = await requireBusinessUnitManager(req, res, before.businessUnitId, currentUser);
    if (!actor) return;
    const managerRoles = await businessUnitRolesWithPermission('MEMBERS_MANAGE');
    const managerCount =
      managerRoles.includes(before.role)
        ? await prisma.businessUnitMembership.count({
            where: { businessUnitId: before.businessUnitId, role: { in: managerRoles } },
          })
        : 2;
    if (managerCount <= 1) {
      res.status(400).json({ error: 'В бизнес-юните должен остаться хотя бы один управляющий участниками' });
      return;
    }
    await prisma.businessUnitMembership.delete({ where: { id: membershipId } });
    await recordAuditEvent({
      req,
      actor,
      action: 'business_unit.membership.delete',
      objectType: 'BusinessUnitMembership',
      objectId: membershipId,
      beforeValue: before,
    });
    res.status(204).end();
  });
}
