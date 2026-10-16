import {
  PUBLIC_DEMO_USER_ID,
  globalViewFields,
  mergeProjectView,
  projectOnlyViewFields,
  projectViewStateSchema,
  readProjectViewState,
  type ProjectViewState,
} from '@pms/shared';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db.js';
import { currentUser } from '../server/auth.js';
import { userCanReadProject } from '../server/business-units.js';

// Room for the personal Jira dashboard (up to 30 widgets) next to the column settings.
const MAX_STATE_BYTES = 100_000;

/**
 * A person's view of a project: their record of it, with the layout they keep
 * the same in every project on top; null when they have arranged neither.
 */
export async function loadProjectViewState(userId: string | undefined, projectId: string): Promise<ProjectViewState | null> {
  if (!userId || userId === PUBLIC_DEMO_USER_ID) return null;
  const [row, defaults] = await Promise.all([
    prisma.userProjectViewState.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { state: true } }),
    prisma.userViewDefaults.findUnique({ where: { userId }, select: { state: true } }),
  ]);
  return mergeProjectView(row ? readProjectViewState(row.state) : null, defaults ? readProjectViewState(defaults.state) : null);
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
    // The layout kept everywhere goes to the person's defaults, the rest to their record of this project:
    // both in one transaction, the person's lock taken before the project's, as every writer here does.
    const state = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`view-defaults:${user.id}`}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`project-view:${user.id}:${projectId}`}))`;
      const [current, defaults] = await Promise.all([
        tx.userProjectViewState.findUnique({ where: { userId_projectId: { userId: user.id, projectId } }, select: { state: true } }),
        tx.userViewDefaults.findUnique({ where: { userId: user.id }, select: { state: true } }),
      ]);
      const nextProject = { ...readProjectViewState(current?.state), ...projectOnlyViewFields(patch.data) };
      const nextDefaults = { ...globalViewFields(readProjectViewState(defaults?.state)), ...globalViewFields(patch.data) };
      if (JSON.stringify(nextProject).length > MAX_STATE_BYTES || JSON.stringify(nextDefaults).length > MAX_STATE_BYTES) return null;
      if (Object.keys(projectOnlyViewFields(patch.data)).length > 0) {
        await tx.userProjectViewState.upsert({
          where: { userId_projectId: { userId: user.id, projectId } },
          create: { userId: user.id, projectId, state: nextProject as Prisma.InputJsonObject },
          update: { state: nextProject as Prisma.InputJsonObject },
        });
      }
      if (Object.keys(globalViewFields(patch.data)).length > 0) {
        await tx.userViewDefaults.upsert({
          where: { userId: user.id },
          create: { userId: user.id, state: nextDefaults as Prisma.InputJsonObject },
          update: { state: nextDefaults as Prisma.InputJsonObject },
        });
      }
      return mergeProjectView(nextProject, nextDefaults) ?? {};
    });
    if (!state) {
      res.status(413).json({ error: 'Настройки вида слишком большие' });
      return;
    }
    res.json({ state });
  });

  return router;
}
