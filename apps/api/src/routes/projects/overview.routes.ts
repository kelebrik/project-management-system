import type { Router } from 'express';
import { prisma } from '../../db.js';
import { recordAuditEvent } from '../../services/audit.js';
import {
  exportFilePart,
  generateExecutiveSummary,
  getExecutiveOverviewForExport,
  getProjectForOverviewGeneration,
  overviewStatusLabel,
  renderExecutiveOverviewHtml,
} from '../../services/executive-overview.js';
import { calculateProjectCriticalPath } from '../../services/wbs-critical-path.js';
import { closedIssuesInclude, projectDetailsInclude } from './includes.js';
import { overviewTransitionSchema } from './schemas.js';
import type { ProjectsRoutesContext } from './types.js';

export function registerProjectOverviewRoutes(
  router: Router,
  { currentUser }: ProjectsRoutesContext,
) {
  router.get('/projects/:projectId/overview', async (req, res) => {
    const [project, criticalPath, closedIssues] = await Promise.all([
      prisma.project.findUnique({
        where: { id: req.params.projectId },
        include: projectDetailsInclude,
      }),
      calculateProjectCriticalPath(req.params.projectId),
      prisma.issue.findMany({
        ...closedIssuesInclude,
        where: {
          ...closedIssuesInclude.where,
          projectId: req.params.projectId,
        },
      }),
    ]);

    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    res.json({ ...project, closedIssues, criticalPath });
  });

  router.post('/projects/:projectId/executive-overviews/generate', async (req, res) => {
    const project = await getProjectForOverviewGeneration(req.params.projectId);

    if (!project) {
      res.status(404).json({ error: 'Проект не найден' });
      return;
    }

    const latestVersion = project.overviews[0]?.version ?? 0;
    const generated = generateExecutiveSummary(project);
    const overview = await prisma.executiveOverview.create({
      data: {
        projectId: project.id,
        version: latestVersion + 1,
        status: 'GENERATED',
        generatedAt: new Date(),
        executiveSummary: generated.executiveSummary,
        kpis: generated.kpis,
        qualityGates: generated.qualityGates,
        risks: generated.risks,
        nextSteps: generated.nextSteps,
        decisions: generated.decisions,
        evidence: generated.evidence,
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'overview.generate',
      objectType: 'ExecutiveOverview',
      objectId: overview.id,
      projectId: project.id,
      afterValue: { version: overview.version, status: overview.status },
    });

    res.status(201).json(overview);
  });

  router.post('/executive-overviews/:overviewId/status', async (req, res) => {
    const parsed = overviewTransitionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const overview = await prisma.executiveOverview.findUnique({
      where: { id: req.params.overviewId },
    });

    if (!overview) {
      res.status(404).json({ error: 'Executive overview not found' });
      return;
    }

    if (overview.status === 'PUBLISHED') {
      res.status(400).json({ error: 'Published overview cannot change workflow status' });
      return;
    }

    const updated = await prisma.executiveOverview.update({
      where: { id: overview.id },
      data:
        parsed.data.status === 'PM_REVIEW'
          ? {
              status: 'PM_REVIEW',
              reviewRequestedAt: new Date(),
            }
          : {
              status: 'APPROVED',
              approvedAt: new Date(),
              approvedBy: parsed.data.approvedBy || 'Проектный офис',
            },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'overview.status',
      objectType: 'ExecutiveOverview',
      objectId: updated.id,
      projectId: updated.projectId,
      beforeValue: { version: overview.version, status: overview.status },
      afterValue: { version: updated.version, status: updated.status },
    });

    res.json(updated);
  });

  router.post('/executive-overviews/:overviewId/publish', async (req, res) => {
    const overview = await prisma.executiveOverview.findUnique({
      where: { id: req.params.overviewId },
    });

    if (!overview) {
      res.status(404).json({ error: 'Executive overview not found' });
      return;
    }

    if (overview.status !== 'APPROVED') {
      res.status(400).json({ error: 'Executive overview must be approved before publication' });
      return;
    }

    const published = await prisma.executiveOverview.update({
      where: { id: overview.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await recordAuditEvent({
      req,
      actor: currentUser(req),
      action: 'overview.publish',
      objectType: 'ExecutiveOverview',
      objectId: published.id,
      projectId: published.projectId,
      beforeValue: { version: overview.version, status: overview.status },
      afterValue: { version: published.version, status: published.status },
    });

    res.json(published);
  });

  router.get('/executive-overviews/:overviewId/export.json', async (req, res) => {
    const overview = await getExecutiveOverviewForExport(req.params.overviewId);

    if (!overview) {
      res.status(404).json({ error: 'Executive overview not found' });
      return;
    }

    const fileName = `executive-overview-${exportFilePart(overview.project.code)}-v${overview.version}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.json({
      exportedAt: new Date().toISOString(),
      project: overview.project,
      overview: {
        id: overview.id,
        version: overview.version,
        status: overview.status,
        statusLabel: overviewStatusLabel(overview.status),
        generatedAt: overview.generatedAt,
        reviewRequestedAt: overview.reviewRequestedAt,
        approvedAt: overview.approvedAt,
        approvedBy: overview.approvedBy,
        publishedAt: overview.publishedAt,
        executiveSummary: overview.executiveSummary,
        kpis: overview.kpis,
        qualityGates: overview.qualityGates,
        risks: overview.risks,
        nextSteps: overview.nextSteps,
        decisions: overview.decisions,
        evidence: overview.evidence,
      },
    });
  });

  router.get('/executive-overviews/:overviewId/export.html', async (req, res) => {
    const overview = await getExecutiveOverviewForExport(req.params.overviewId);

    if (!overview) {
      res.status(404).json({ error: 'Executive overview not found' });
      return;
    }

    const fileName = `executive-overview-${exportFilePart(overview.project.code)}-v${overview.version}.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(renderExecutiveOverviewHtml(overview));
  });
}
