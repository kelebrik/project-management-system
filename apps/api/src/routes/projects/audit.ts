import { prisma } from '../../db.js';

export async function projectAuditSnapshot(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jiraIntegration: true,
      _count: {
        select: {
          tasks: true,
          issues: true,
          jiraSnapshots: true,
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
