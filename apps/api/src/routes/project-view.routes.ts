import { PUBLIC_DEMO_USER_ID, projectViewStateSchema, readProjectViewState, type ProjectViewState } from '@pms/shared';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';

const MAX_STATE_BYTES = 20_000;

/** The stored personal view of a project, or null when this person has not arranged it yet. */
export async function loadProjectViewState(userId: string | undefined, projectId: string): Promise<ProjectViewState | null> {
  if (!userId || userId === PUBLIC_DEMO_USER_ID) return null;
  const row = await prisma.userProjectViewState.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { state: true } });
  return row ? readProjectViewState(row.state) : null;
}

/**
 * A person's own view of a project (see UserProjectViewState). Registered
 * before the write checks: arranging columns is not a change to the project,
 * so someone who may only read it, or a closed project, keeps their layout too.
 */
export function createProjectViewRouter() {
  const router = Router();

  router.get('/projects/:projectId/my-view', async (req, res) => {
    const projectId = String(req.params.projectId);
    if (!(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    res.json({ state: await loadProjectViewState(currentUser(req)?.id, projectId) });
  });

  router.patch('/projects/:projectId/my-view', async (req, res) => {
    const projectId = String(req.params.projectId);
    const user = currentUser(req);
    if (!user || !(await userCanReadProject(req, projectId))) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }
    const patch = projectViewStateSchema.safeParse(req.body ?? {});
    if (!patch.success) {
      res.status(400).json({ error: 'Некорректные настройки вида' });
      return;
    }
    // The public demo identity is not a person in the database; its browser keeps the view.
    if (user.id === PUBLIC_DEMO_USER_ID) {
      res.json({ state: patch.data });
      return;
    }
    const state = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`project-view:${user.id}:${projectId}`}))`;
      const current = await tx.userProjectViewState.findUnique({ where: { userId_projectId: { userId: user.id, projectId } }, select: { state: true } });
      const next = { ...readProjectViewState(current?.state), ...patch.data };
      if (JSON.stringify(next).length > MAX_STATE_BYTES) return null;
      await tx.userProjectViewState.upsert({
        where: { userId_projectId: { userId: user.id, projectId } },
        create: { userId: user.id, projectId, state: next as Prisma.InputJsonObject },
        update: { state: next as Prisma.InputJsonObject },
      });
      return next;
    });
    if (!state) {
      res.status(413).json({ error: 'Настройки вида слишком большие' });
      return;
    }
    res.json({ state });
  });

  return router;
}
