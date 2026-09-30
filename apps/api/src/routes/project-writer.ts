import { PUBLIC_DEMO_USER_ID } from '@pms/shared';
import type { Request, Response } from 'express';
import { prisma } from '../db.js';
import { currentUser, isPublicDemoMode } from '../server/auth.js';
import { readableProjectWhere } from '../server/business-units.js';
import { userCanWriteProject } from '../server/project-access.js';

export type ProjectWriter = { user: NonNullable<ReturnType<typeof currentUser>>; project: { id: string; status: string }; demo: boolean };

/**
 * A signed-in user who may change this open project: an administrator, the
 * public demo visitor, or someone with edit access. Answers the request itself
 * (401, 404, 423 closed, 403) and returns null otherwise.
 */
export async function projectWriter(req: Request, res: Response, projectId: string): Promise<ProjectWriter | null> {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return null;
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, status: true } });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return null;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({ error: 'Проект закрыт и доступен только для чтения' });
    return null;
  }
  const demo = isPublicDemoMode() && user.id === PUBLIC_DEMO_USER_ID;
  if (!demo && user.role !== 'ADMIN' && !(await userCanWriteProject(user.id, project.id))) {
    res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
    return null;
  }
  return { user, project, demo };
}

/** The project if the request may read it, else null. */
export async function readableProject(req: Request, projectId: string) {
  return prisma.project.findFirst({ where: { id: projectId, ...(await readableProjectWhere(req)) }, select: { id: true, status: true } });
}
