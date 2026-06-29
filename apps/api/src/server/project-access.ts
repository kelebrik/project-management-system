import type { Request, Response } from 'express';
import type { ProjectAccessLevel } from '@prisma/client';
import { prisma } from '../db.js';
import { currentUser } from './auth.js';

const writeLevels: ProjectAccessLevel[] = ['EDIT', 'ADMIN'];
const adminLevels: ProjectAccessLevel[] = ['ADMIN'];

export async function userProjectAccessLevel(userId: string, projectId: string) {
  const access = await prisma.projectAccess.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
    select: { level: true },
  });
  return access?.level ?? null;
}

export async function userCanWriteProject(userId: string, projectId: string) {
  const level = await userProjectAccessLevel(userId, projectId);
  return Boolean(level && writeLevels.includes(level));
}

export async function userCanAdminProject(userId: string, projectId: string) {
  const level = await userProjectAccessLevel(userId, projectId);
  return Boolean(level && adminLevels.includes(level));
}

export async function userProjectAccessLevelMap(userId: string, projectIds?: string[]) {
  const accesses = await prisma.projectAccess.findMany({
    where: {
      userId,
      ...(projectIds ? { projectId: { in: projectIds } } : {}),
    },
    select: {
      projectId: true,
      level: true,
    },
  });
  return new Map(accesses.map((access) => [access.projectId, access.level]));
}

export async function ensureProjectWriteAccess(projectId: string, req: Request, res: Response) {
  const user = currentUser(req);
  if (!user) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return false;
  }
  if (user.role === 'ADMIN') {
    return true;
  }
  if (await userCanWriteProject(user.id, projectId)) {
    return true;
  }
  res.status(403).json({ error: 'Нет доступа на изменение этого проекта' });
  return false;
}

async function projectIdForEntityPath(pathname: string) {
  const [path] = pathname.split('?');
  const matchers: Array<{
    pattern: RegExp;
    resolve: (id: string) => Promise<string | null>;
  }> = [
    {
      pattern: /^\/project-artifacts\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.projectArtifact.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/raid-items\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.raidItem.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/change-requests\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.changeRequest.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/milestones\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.milestone.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/wbs-items\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.wbsItem.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/wbs-dependencies\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.wbsDependency.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/open-issues\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.issue.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/tasks\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.task.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
    {
      pattern: /^\/executive-overviews\/([^/]+)/,
      resolve: async (id) =>
        (
          await prisma.executiveOverview.findUnique({
            where: { id },
            select: { projectId: true },
          })
        )?.projectId ?? null,
    },
  ];

  for (const matcher of matchers) {
    const match = path.match(matcher.pattern);
    if (match?.[1]) {
      return matcher.resolve(match[1]);
    }
  }

  return null;
}

export async function projectIdForWritePath(pathname: string) {
  const [path] = pathname.split('?');
  const projectMatch = path.match(/^\/projects\/([^/]+)/);
  if (projectMatch?.[1]) {
    return projectMatch[1];
  }
  return projectIdForEntityPath(path);
}
