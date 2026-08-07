import { Prisma } from '@prisma/client';
import { createUserSchema, updateUserSchema } from '@pms/shared';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import type { AdminRoutesContext } from './types.js';

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function registerAdminUserRoutes(router: Router, context: AdminRoutesContext) {
  const { requireAdmin, currentUser, wouldRemoveLastAdmin, userResponse } = context;

  router.get('/users', requireAdmin, async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
      select: userSelect,
    });
    res.json(users.map(userResponse));
  });

  router.post('/users', requireAdmin, async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const user = await prisma.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          role: parsed.data.role,
          isActive: parsed.data.isActive,
        },
        select: userSelect,
      });
      await recordAuditEvent({
        req,
        actor: currentUser(req),
        action: 'user.create',
        objectType: 'User',
        objectId: user.id,
        afterValue: userResponse(user),
      });
      res.status(201).json(userResponse(user));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        return;
      }
      throw error;
    }
  });

  router.patch('/users/:userId', requireAdmin, async (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    if (!userId) {
      res.status(400).json({ error: 'Пользователь не указан' });
      return;
    }

    if (await wouldRemoveLastAdmin(userId, parsed.data)) {
      res.status(400).json({ error: 'Нельзя отключить или понизить последнего администратора' });
      return;
    }

    try {
      const before = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const user = await prisma.user.update({
        where: { id: userId },
        data: parsed.data,
        select: userSelect,
      });
      await recordAuditEvent({
        req,
        actor: currentUser(req),
        action: 'user.update',
        objectType: 'User',
        objectId: user.id,
        beforeValue: before,
        afterValue: userResponse(user),
      });
      res.json(userResponse(user));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ error: 'Пользователь с таким email уже существует' });
        return;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: 'Пользователь не найден' });
        return;
      }
      throw error;
    }
  });
}
