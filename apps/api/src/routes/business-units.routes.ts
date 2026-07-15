import { Router } from 'express';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { defaultBusinessUnitId } from '../server/business-units.js';

export function createBusinessUnitsRouter() {
  const router = Router();

  router.get('/business-units', async (req, res) => {
    const user = currentUser(req);
    const fallbackId = await defaultBusinessUnitId();
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
          unit.memberships?.[0]?.role === 'ADMIN',
        projectCount: unit._count.projects,
      })),
    );
  });

  return router;
}
