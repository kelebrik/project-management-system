import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { businessUnitMembershipSchema, businessUnitSchema } from './schemas.js';
import type { AdminRoutesContext } from './types.js';

const unitInclude = {
  memberships: {
    include: {
      user: { select: { id: true, name: true, email: true, isActive: true } },
    },
    orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
  },
  _count: { select: { projects: true } },
} satisfies Prisma.BusinessUnitInclude;

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function registerBusinessUnitAdminRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser } = context;

  router.get('/admin/business-units', requireAdmin, async (_req, res) => {
    const units = await prisma.businessUnit.findMany({
      include: unitInclude,
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json(units);
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

  router.post('/admin/business-units/:businessUnitId/memberships', requireAdmin, async (req, res) => {
    const businessUnitId = param(req.params.businessUnitId);
    const parsed = businessUnitMembershipSchema.safeParse(req.body);
    if (!businessUnitId || !parsed.success) {
      res.status(400).json({ error: parsed.success ? 'Бизнес-юнит не указан' : parsed.error.flatten() });
      return;
    }
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
    if (existing?.role === 'ADMIN' && parsed.data.role !== 'ADMIN') {
      const adminCount = await prisma.businessUnitMembership.count({
        where: { businessUnitId, role: 'ADMIN' },
      });
      if (adminCount <= 1) {
        res.status(400).json({ error: 'В бизнес-юните должен остаться хотя бы один администратор' });
        return;
      }
    }
    const membership = await prisma.businessUnitMembership.upsert({
      where: { businessUnitId_userId: { businessUnitId, userId: parsed.data.userId } },
      create: { businessUnitId, ...parsed.data },
      update: { role: parsed.data.role },
      include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'business_unit.membership.upsert',
      objectType: 'BusinessUnitMembership',
      objectId: membership.id,
      afterValue: membership,
    });
    res.json(membership);
  });

  router.delete('/admin/business-unit-memberships/:membershipId', requireAdmin, async (req, res) => {
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
    const adminCount =
      before.role === 'ADMIN'
        ? await prisma.businessUnitMembership.count({
            where: { businessUnitId: before.businessUnitId, role: 'ADMIN' },
          })
        : 2;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'В бизнес-юните должен остаться хотя бы один администратор' });
      return;
    }
    await prisma.businessUnitMembership.delete({ where: { id: membershipId } });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'business_unit.membership.delete',
      objectType: 'BusinessUnitMembership',
      objectId: membershipId,
      beforeValue: before,
    });
    res.status(204).end();
  });
}
