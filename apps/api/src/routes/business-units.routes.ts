import { Router } from 'express';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { defaultBusinessUnitId } from '../server/business-units.js';
import { businessUnitRolesWithPermission } from '../server/business-unit-permissions.js';

export function createBusinessUnitsRouter() {
  const router = Router();

  router.get('/business-units', async (req, res) => {
    const user = currentUser(req);
    const fallbackId = await defaultBusinessUnitId();
    const managerRoles = await businessUnitRolesWithPermission('MEMBERS_MANAGE');
    const units = await prisma.businessUnit.findMany({
      where: {
        isActive: true,
        ...(user ? {} : { id: fallbackId ?? '__none__' }),
      },
      include: {
        memberships: user
          ? { where: { userId: user.id }, select: { role: true } }
          : false,
        _count: { select: { projects: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json(
      units.map((unit) => ({
        id: unit.id,
        code: unit.code,
        name: unit.name,
        isDefault: unit.isDefault,
        role: user?.role === 'ADMIN' ? 'ADMIN' : unit.memberships?.[0]?.role ?? 'GUEST',
        canManage:
          user?.role === 'ADMIN' ||
          Boolean(unit.memberships?.[0]?.role && managerRoles.includes(unit.memberships[0].role)),
        projectCount: unit._count.projects,
      })),
    );
  });

  return router;
}
