import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { projectBusinessUnitMoveSchema } from './schemas.js';
import type { AdminRoutesContext } from './types.js';

type ProjectNode = {
  id: string;
  parentId: string | null;
  businessUnitId: string;
};

export class ProjectMoveError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type MoveTransaction = Pick<
  Prisma.TransactionClient,
  'businessUnit' | 'project' | 'projectAccess'
>;

export function collectProjectSubtreeIds(projects: ProjectNode[], rootId: string) {
  const children = new Map<string, string[]>();
  projects.forEach((project) => {
    if (!project.parentId) return;
    children.set(project.parentId, [...(children.get(project.parentId) ?? []), project.id]);
  });
  const result: string[] = [];
  const queue = [rootId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const projectId = queue.shift()!;
    if (visited.has(projectId)) continue;
    visited.add(projectId);
    result.push(projectId);
    queue.push(...(children.get(projectId) ?? []));
  }
  return result;
}

async function serializableMove<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.floor(Math.random() * 35)));
    }
  }
  throw new Error('Не удалось перенести проект');
}

export async function moveProjectSubtreeInTransaction(
  tx: MoveTransaction,
  projectId: string,
  targetBusinessUnitId: string,
) {
  const [targetBusinessUnit, projects] = await Promise.all([
    tx.businessUnit.findUnique({
      where: { id: targetBusinessUnitId },
      select: { id: true, name: true, isActive: true },
    }),
    tx.project.findMany({
      select: { id: true, parentId: true, businessUnitId: true, code: true, name: true },
    }),
  ]);
  if (!targetBusinessUnit) {
    throw new ProjectMoveError('Целевой бизнес-юнит не найден', 404);
  }
  if (!targetBusinessUnit.isActive) {
    throw new ProjectMoveError('Целевой бизнес-юнит отключен', 422);
  }
  const root = projects.find((project) => project.id === projectId);
  if (!root) throw new ProjectMoveError('Проект не найден', 404);
  if (root.businessUnitId === targetBusinessUnit.id) {
    throw new ProjectMoveError('Проект уже находится в выбранном бизнес-юните', 400);
  }

  const movedProjectIds = collectProjectSubtreeIds(projects, root.id);
  const movedProjects = projects.filter((project) => movedProjectIds.includes(project.id));
  if (movedProjects.some((project) => project.businessUnitId !== root.businessUnitId)) {
    throw new ProjectMoveError('Иерархия проекта уже пересекает границы бизнес-юнитов', 409);
  }

  const deletedAccess = await tx.projectAccess.deleteMany({
    where: { projectId: { in: movedProjectIds } },
  });
  await tx.project.updateMany({
    where: { id: { in: movedProjectIds } },
    data: { businessUnitId: targetBusinessUnit.id },
  });
  await tx.project.update({ where: { id: root.id }, data: { parentId: null } });

  return {
    projectId: root.id,
    projectCode: root.code,
    projectName: root.name,
    sourceBusinessUnitId: root.businessUnitId,
    targetBusinessUnitId: targetBusinessUnit.id,
    targetBusinessUnitName: targetBusinessUnit.name,
    movedProjectIds,
    deletedAccessCount: deletedAccess.count,
  };
}

export function registerProjectBusinessUnitRoutes(
  router: Router,
  context: AdminRoutesContext,
) {
  const { requireAdmin, currentUser } = context;

  router.patch('/admin/projects/:projectId/business-unit', requireAdmin, async (req, res) => {
    const parsed = projectBusinessUnitMoveSchema.safeParse(req.body);
    const rawProjectId = req.params.projectId;
    const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
    if (!projectId || !parsed.success) {
      res.status(400).json({ error: parsed.success ? 'Проект не указан' : parsed.error.flatten() });
      return;
    }

    try {
      const result = await serializableMove(() =>
        prisma.$transaction(
          (tx) => moveProjectSubtreeInTransaction(tx, projectId, parsed.data.businessUnitId),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );

      await recordAuditEvent({
        req,
        actor: currentUser(req),
        action: 'project.business_unit.move',
        objectType: 'Project',
        objectId: result.projectId,
        projectId: result.projectId,
        beforeValue: { businessUnitId: result.sourceBusinessUnitId },
        afterValue: { businessUnitId: result.targetBusinessUnitId, parentId: null },
        metadata: {
          movedProjectIds: result.movedProjectIds,
          deletedAccessCount: result.deletedAccessCount,
        },
      });
      res.json(result);
    } catch (error) {
      if (error instanceof ProjectMoveError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}
