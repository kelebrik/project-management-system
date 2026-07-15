import type { Prisma } from '@prisma/client';
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

export async function readableProjectWhere(req: Request): Promise<Prisma.ProjectWhereInput> {
  const user = currentUser(req);
  const requestedId = requestedBusinessUnitId(req) ?? (await defaultBusinessUnitId());
  if (user) {
    return requestedId ? { businessUnitId: requestedId } : {};
  }
  const defaultId = await defaultBusinessUnitId();
  return defaultId ? { businessUnitId: defaultId } : { id: { equals: '__none__' } };
}

export async function userCanReadProject(req: Request, projectId: string) {
  const user = currentUser(req);
  if (user) {
    return Boolean(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }));
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
  return true;
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
