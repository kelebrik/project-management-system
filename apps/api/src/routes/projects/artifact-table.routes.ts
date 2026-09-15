import { Prisma } from '@prisma/client';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import type { ProjectsRoutesContext } from './types.js';
import { lockArtifactProject, referencedArtifactFiles } from '../../services/artifact-table.js';
import { artifactTableSchema } from './artifact-table-schema.js';

export function registerArtifactTableRoutes(router: Router, { currentUser, ensureProjectWritable }: ProjectsRoutesContext) {
  const path = '/projects/:projectId/artifact-table';
  router.get(path, async (req, res) => {
    const record = await prisma.projectArtifactTable.findUnique({ where: { projectId: req.params.projectId } });
    if (record) { res.json(record); return; }
    // Keep existing catalog entries visible; conversion is persisted on explicit Save.
    const legacy = await prisma.projectArtifact.findMany({ where: { projectId: req.params.projectId }, orderBy: [{ createdAt: 'desc' }, { sortOrder: 'asc' }] });
    res.json(legacy.length ? {
      revision: 0,
      columns: [{ id: 'date', title: '' }, { id: 'title', title: '' }, { id: 'details', title: '' }, { id: 'links', title: '' }],
      defaultTitles: true,
      rows: legacy.map(item => ({ id: item.id, date: item.createdAt.toISOString().slice(0, 10), cells: { title: item.title, details: [item.type, item.owner, item.status, item.description].filter(Boolean).join('\n'), links: item.url ?? '' }, files: {} })),
    } : null);
  });
  router.put(path, async (req, res) => {
    const parsed = artifactTableSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
    const project = await ensureProjectWritable(req.params.projectId, res);
    if (!project) return;
    const { columns, rows, revision } = parsed.data;
    const fileIds = [...new Set(rows.flatMap(row => Object.values(row.files).flat().map(file => file.id)))];
    try {
      const result = await prisma.$transaction(async tx => {
        await lockArtifactProject(tx, project.id);
        const before = await tx.projectArtifactTable.findUnique({ where: { projectId: project.id } });
        if ((before?.revision ?? 0) !== revision) return { conflict: true as const, table: before };
        const validFiles = await tx.projectArtifactFile.findMany({ where: { projectId: project.id, id: { in: fileIds } }, select: { id: true, name: true } });
        if (validFiles.length !== fileIds.length) return { invalidFiles: true as const };
        // Use authoritative filenames, never caller-provided labels for stored files.
        for (const row of rows) for (const cell of Object.values(row.files)) for (const file of cell) file.name = validFiles.find(value => value.id === file.id)!.name;
        if (before) await tx.projectArtifactTable.updateMany({ where: { projectId: project.id, revision }, data: { columns, rows, revision: { increment: 1 } } });
        else await tx.projectArtifactTable.create({ data: { projectId: project.id, columns, rows } });
        const table = await tx.projectArtifactTable.findUniqueOrThrow({ where: { projectId: project.id } });
        // Blob removal and table update are atomic: rollback restores both.
        const removed = before ? referencedArtifactFiles(before.rows).filter(id => !fileIds.includes(id)) : [];
        await tx.projectArtifactFile.deleteMany({ where: { projectId: project.id, id: { in: removed } } });
        return { table };
      });
      if ('conflict' in result) { res.status(409).json({ error: 'ARTIFACT_TABLE_CONFLICT', current: result.table }); return; }
      if ('invalidFiles' in result) { res.status(400).json({ error: 'Invalid project attachment' }); return; }
      const saved = result.table;
      await recordAuditEvent({ req, actor: currentUser(req), action: 'project.artifact_table.update', objectType: 'ProjectArtifactTable', objectId: saved.id, projectId: project.id, afterValue: { revision: saved.revision, columns: columns.length, rows: rows.length } });
      res.json(saved);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') { res.status(409).json({ error: 'ARTIFACT_TABLE_CONFLICT' }); return; }
      throw error;
    }
  });
}
