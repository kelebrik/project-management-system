import type { Router } from 'express';
import { prisma } from '../../db.js';
import { emitWebhookEvent } from '../../services/webhooks.js';
import { artifactSchema, reorderArtifactsSchema } from './schemas.js';
import type { ProjectsRoutesContext } from './types.js';

export function registerProjectArtifactsRoutes(
  router: Router,
  { ensureProjectWritable, ensureEntityProjectWritable }: ProjectsRoutesContext,
) {
  router.post('/projects/:projectId/artifacts', async (req, res) => {
    const parsed = artifactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const project = await ensureProjectWritable(req.params.projectId, res);
    if (!project) {
      return;
    }

    const artifact = await prisma.projectArtifact.create({
      data: {
        projectId: project.id,
        ...parsed.data,
        url: parsed.data.url || null,
        description: parsed.data.description || null,
        owner: parsed.data.owner || 'Не назначен',
      },
    });

    await emitWebhookEvent({
      eventType: 'artifact.created',
      projectId: project.id,
      payload: { artifact },
    }).catch(() => undefined);
    res.status(201).json(artifact);
  });

  router.patch('/project-artifacts/:artifactId', async (req, res) => {
    const parsed = artifactSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const artifact = await prisma.projectArtifact.findUnique({
      where: { id: req.params.artifactId },
    });

    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }
    if (!(await ensureEntityProjectWritable(artifact.projectId, res))) {
      return;
    }

    const updated = await prisma.projectArtifact.update({
      where: { id: artifact.id },
      data: {
        ...parsed.data,
        url: parsed.data.url === undefined ? undefined : parsed.data.url || null,
        description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
        owner: parsed.data.owner === undefined ? undefined : parsed.data.owner || 'Не назначен',
      },
    });

    await emitWebhookEvent({
      eventType: 'artifact.updated',
      projectId: artifact.projectId,
      payload: { before: artifact, after: updated },
    }).catch(() => undefined);
    res.json(updated);
  });

  router.delete('/project-artifacts/:artifactId', async (req, res) => {
    const artifact = await prisma.projectArtifact.findUnique({
      where: { id: req.params.artifactId },
    });

    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found' });
      return;
    }
    if (!(await ensureEntityProjectWritable(artifact.projectId, res))) {
      return;
    }

    await prisma.projectArtifact.delete({
      where: { id: artifact.id },
    });

    await emitWebhookEvent({
      eventType: 'artifact.deleted',
      projectId: artifact.projectId,
      payload: { before: artifact },
    }).catch(() => undefined);
    res.status(204).send();
  });

  router.post('/projects/:projectId/artifacts/reorder', async (req, res) => {
    const parsed = reorderArtifactsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const artifacts = await prisma.projectArtifact.findMany({
      where: { projectId: req.params.projectId },
      select: { id: true },
    });
    if (!(await ensureEntityProjectWritable(req.params.projectId, res))) {
      return;
    }
    const artifactIds = new Set(artifacts.map((artifact) => artifact.id));
    const orderedIds = parsed.data.orderedIds.filter((id) => artifactIds.has(id));

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.projectArtifact.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    res.json({ ok: true });
  });
}
