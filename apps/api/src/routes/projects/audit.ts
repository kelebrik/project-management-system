import { prisma } from '../../db.js';
import type { StructureDb } from '../../services/wbs-structure-write.js';

export async function projectAuditSnapshot(projectId: string, db: StructureDb = prisma) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      jiraIntegration: true,
      targetDateChanges: {
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
        },
      },
      _count: {
        select: {
          tasks: true,
          issues: true,
          jiraSnapshots: { where: { retiredAt: null } },
          milestones: true,
          wbsItems: true,
          wbsDependencies: true,
          wbsBaselines: true,
          artifacts: true,
          raidItems: true,
          changeRequests: true,
          calendarOverrides: true,
        },
      },
    },
  });
}
