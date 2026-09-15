import multer from 'multer';
import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import { cleanStagedArtifactFiles, lockArtifactProject, referencedArtifactFiles } from '../../services/artifact-table.js';
import type { ProjectsRoutesContext } from './types.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1, fields: 0, parts: 2 } }).single('file');
export function registerArtifactFileRoutes(router: Router, { currentUser, ensureProjectWritable }: ProjectsRoutesContext) {
  const path = '/projects/:projectId/artifact-table/files';
  router.post(path, (req, res, next) => upload(req, res, error => {
    if (error) { res.status(error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'ARTIFACT_FILE_INVALID' }); return; }
    next();
  }), async (req, res) => {
    if (!(await ensureProjectWritable(req.params.projectId, res))) return;
    const uploaded = req.file;
    if (!uploaded?.size) { res.status(400).json({ error: 'ARTIFACT_FILE_EMPTY' }); return; }
    const name = Buffer.from(uploaded.originalname, 'latin1').toString('utf8').replace(/[\x00-\x1f\x7f/\\"]/gu, '_').slice(0, 255);
    if (!name.trim()) { res.status(400).json({ error: 'ARTIFACT_FILE_INVALID' }); return; }
    const file = await prisma.$transaction(async tx => {
      await lockArtifactProject(tx, req.params.projectId);
      await cleanStagedArtifactFiles(tx, req.params.projectId);
      const usage = await tx.projectArtifactFile.aggregate({ where: { projectId: req.params.projectId }, _sum: { size: true } });
      if ((usage._sum.size ?? 0) + uploaded.size > 30 * 1024 * 1024) return null;
      return tx.projectArtifactFile.create({ data: { projectId: req.params.projectId, name, data: new Uint8Array(uploaded.buffer), size: uploaded.size }, select: { id: true, name: true } });
    });
    if (!file) { res.status(413).json({ error: 'ARTIFACT_STORAGE_LIMIT' }); return; }
    await recordAuditEvent({ req, actor: currentUser(req), action: 'project.artifact_file.create', objectType: 'ProjectArtifactFile', objectId: file.id, projectId: req.params.projectId, afterValue: { name, bytes: uploaded.size } });
    res.status(201).json(file);
  });
  router.delete(`${path}/:fileId`, async (req, res) => {
    if (!(await ensureProjectWritable(req.params.projectId, res))) return;
    const result = await prisma.$transaction(async tx => {
      await lockArtifactProject(tx, req.params.projectId);
      const table = await tx.projectArtifactTable.findUnique({ where: { projectId: req.params.projectId }, select: { rows: true } });
      if (table && referencedArtifactFiles(table.rows).includes(req.params.fileId)) return false;
      await tx.projectArtifactFile.deleteMany({ where: { id: req.params.fileId, projectId: req.params.projectId } });
      return true;
    });
    if (!result) { res.status(409).json({ error: 'ARTIFACT_FILE_REFERENCED' }); return; }
    await recordAuditEvent({ req, actor: currentUser(req), action: 'project.artifact_file.delete', objectType: 'ProjectArtifactFile', objectId: req.params.fileId, projectId: req.params.projectId });
    res.sendStatus(204);
  });
  router.get(`${path}/:fileId`, async (req, res) => {
    const file = await prisma.projectArtifactFile.findFirst({ where: { id: req.params.fileId, projectId: req.params.projectId }, select: { data: true, name: true } });
    if (!file) { res.sendStatus(404); return; }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g, '%27')}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(Buffer.from(file.data));
  });
}
