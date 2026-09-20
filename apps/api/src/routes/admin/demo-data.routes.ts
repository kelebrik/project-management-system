import type { Router } from 'express';
import { prisma } from '../../db.js';
import { isPublicDemoMode } from '../../server/auth.js';
import { completeDemoProject } from '../../demo/complete.js';
import { recordAuditEvent } from '../../services/audit.js';
import type { AdminRoutesContext } from './types.js';

export function registerDemoDataRoutes(router: Router, { requireAdmin, currentUser }: AdminRoutesContext) {
  router.post('/admin/demo-data/projects/:projectId', requireAdmin, async (req, res) => {
    if (!isPublicDemoMode()) {
      res.status(403).json({ error: 'Наполнение доступно только в демонстрационном режиме' });
      return;
    }
    const projectId = String(req.params.projectId);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { res.status(404).json({ error: 'Проект не найден' }); return; }
    await completeDemoProject(prisma, project);
    await recordAuditEvent({ req, actor: currentUser(req), action: 'project.demo.populate',
      objectType: 'Project', objectId: projectId, projectId,
      metadata: { fixtureVersion: 4, synthetic: true } });
    const [phases, goals, milestones, risks, questions, tickets] = await Promise.all([
      prisma.wbsItem.count({ where: { projectId, type: 'PHASE' } }),
      prisma.wbsItem.count({ where: { projectId, type: 'GOAL' } }),
      prisma.wbsItem.count({ where: { projectId, type: 'MILESTONE' } }),
      prisma.raidItem.count({ where: { projectId } }), prisma.issue.count({ where: { projectId } }),
      prisma.jiraIssueSnapshot.count({ where: { projectId, retiredAt: null } }),
    ]);
    res.json({ projectId, phases, goals, milestones, risks, questions, tickets });
  });
}
