import type { Prisma, UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { currentUser } from './auth.js';
import { projectIdForWritePath } from './project-access.js';

export const BUSINESS_UNIT_HEADER = 'x-business-unit-id';

export function requestedBusinessUnitId(req: Request) {
  const value = req.header(BUSINESS_UNIT_HEADER)?.trim();
  return value || null;
}

export async function defaultBusinessUnitId() {
  const unit = await prisma.businessUnit.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return unit?.id ?? null;
}

export async function ensureDefaultBusinessUnitMembership(userId: string, userRole: UserRole) {
  const businessUnitId = await defaultBusinessUnitId();
  if (!businessUnitId) return null;
  const role =
    userRole === 'ADMIN'
      ? 'ADMIN'
      : userRole === 'PROJECT_MANAGER'
        ? 'PROJECT_MANAGER'
        : 'VIEWER';
  return prisma.businessUnitMembership.upsert({
    where: { businessUnitId_userId: { businessUnitId, userId } },
    create: { businessUnitId, userId, role },
    update: {},
  });
}

export async function readableProjectWhere(req: Request): Promise<Prisma.ProjectWhereInput> {
  const user = currentUser(req);
  const requestedId = requestedBusinessUnitId(req) ?? (await defaultBusinessUnitId());
  if (user?.role === 'ADMIN') {
    return requestedId ? { businessUnitId: requestedId } : {};
  }
  if (!user) {
    const defaultId = await defaultBusinessUnitId();
    return defaultId ? { businessUnitId: defaultId } : { id: { equals: '__none__' } };
  }

  const access = {
    OR: [
      { businessUnit: { memberships: { some: { userId: user.id } } } },
      { projectAccesses: { some: { userId: user.id } } },
    ],
  } satisfies Prisma.ProjectWhereInput;
  return requestedId ? { AND: [{ businessUnitId: requestedId }, access] } : access;
}

export async function userCanReadProject(req: Request, projectId: string) {
  const user = currentUser(req);
  if (user?.role === 'ADMIN') {
    return Boolean(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }));
  }
  if (user) {
    const explicitAccess = await prisma.projectAccess.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
      select: { id: true },
    });
    if (explicitAccess) return true;
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...(await readableProjectWhere(req)) },
    select: { id: true },
  });
  return Boolean(project);
}

export async function userCanCreateInBusinessUnit(req: Request, businessUnitId: string) {
  const user = currentUser(req);
  if (!user) return false;
  const unit = await prisma.businessUnit.findUnique({
    where: { id: businessUnitId },
    select: { isActive: true },
  });
  if (!unit?.isActive) return false;
  if (user.role === 'ADMIN') return true;
  const membership = await prisma.businessUnitMembership.findUnique({
    where: { businessUnitId_userId: { businessUnitId, userId: user.id } },
    select: { role: true },
  });
  return membership?.role === 'ADMIN' || membership?.role === 'PROJECT_MANAGER';
}

export async function businessUnitReadMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!['GET', 'HEAD'].includes(req.method.toUpperCase())) {
    next();
    return;
  }
  const projectId = await projectIdForWritePath(req.path);
  if (!projectId || (await userCanReadProject(req, projectId))) {
    next();
    return;
  }
  res.status(404).json({ error: 'Проект не найден' });
}
