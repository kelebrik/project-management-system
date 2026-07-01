import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { businessRequirementsSchema } from './schemas.js';
import type { ProjectsRoutesContext } from './types.js';

const defaultBusinessRequirements = {
  columns: [
    { id: 'col_1', title: 'ID' },
    { id: 'col_2', title: 'Бизнес-требование' },
    { id: 'col_3', title: 'Приоритет' },
    { id: 'col_4', title: 'Статус' },
    { id: 'col_5', title: 'Комментарий' },
  ],
  rows: [],
};

function businessRequirementsResponse(record: {
  id: string;
  projectId: string;
  columns: Prisma.JsonValue;
  rows: Prisma.JsonValue;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    projectId: record.projectId,
    columns: record.columns,
    rows: record.rows,
    updatedAt: record.updatedAt,
  };
}

export function registerProjectBusinessRequirementsRoutes(
  router: Router,
  { currentUser, ensureProjectWritable }: ProjectsRoutesContext,
) {
  router.get('/projects/:projectId/business-requirements', async (req, res) => {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      select: { id: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    const record = await prisma.projectBusinessRequirements.findUnique({
      where: { projectId: project.id },
    });
    if (!record) {
      res.json({
        id: '',
        projectId: project.id,
        columns: defaultBusinessRequirements.columns,
        rows: defaultBusinessRequirements.rows,
        updatedAt: new Date(0),
      });
      return;
    }

    res.json(businessRequirementsResponse(record));
  });

  router.put('/projects/:projectId/business-requirements', async (req, res) => {
    const parsed = businessRequirementsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const project = await ensureProjectWritable(req.params.projectId, res);
    if (!project) {
      return;
    }

    const before = await prisma.projectBusinessRequirements.findUnique({
      where: { projectId: project.id },
    });
    const updated = await prisma.projectBusinessRequirements.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        columns: parsed.data.columns,
        rows: parsed.data.rows,
      },
      update: {
        columns: parsed.data.columns,
        rows: parsed.data.rows,
      },
    });

    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'project.business_requirements.update',
      objectType: 'ProjectBusinessRequirements',
      objectId: updated.id,
      projectId: project.id,
      beforeValue: before
        ? { columns: before.columns, rows: before.rows }
        : null,
      afterValue: { columns: updated.columns, rows: updated.rows },
    });

    res.json(businessRequirementsResponse(updated));
  });
}
