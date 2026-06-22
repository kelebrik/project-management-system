import { prisma } from '../../db.js';

export async function deleteProjectCascade(projectId: string) {
  await prisma.$transaction(async (tx) => {
    const projectRaidItems = await tx.raidItem.findMany({
      where: { projectId },
      select: { id: true },
    });
    const projectRaidItemIds = projectRaidItems.map((item) => item.id);
    await tx.project.updateMany({
      where: { parentId: projectId },
      data: { parentId: null },
    });
    if (projectRaidItemIds.length > 0) {
      await tx.raidItem.updateMany({
        where: { linkedRiskId: { in: projectRaidItemIds } },
        data: { linkedRiskId: null },
      });
      await tx.raidItemStatusUpdate.deleteMany({
        where: { raidItemId: { in: projectRaidItemIds } },
      });
    }
    await tx.wbsDependency.deleteMany({ where: { projectId } });
    await tx.wbsItem.updateMany({
      where: { projectId },
      data: { parentId: null },
    });
    await tx.issueStatusUpdate.deleteMany({ where: { issue: { projectId } } });
    await tx.issueJiraLink.deleteMany({ where: { issue: { projectId } } });
    await tx.issue.deleteMany({ where: { projectId } });
    await tx.jiraWorkSectionIssue.deleteMany({
      where: { section: { projectId } },
    });
    await tx.jiraWorkSection.deleteMany({ where: { projectId } });
    await tx.jiraIssueSnapshot.deleteMany({ where: { projectId } });
    await tx.task.deleteMany({ where: { projectId } });
    await tx.milestone.deleteMany({ where: { projectId } });
    await tx.executiveOverview.deleteMany({ where: { projectId } });
    await tx.projectArtifact.deleteMany({ where: { projectId } });
    await tx.raidItem.deleteMany({ where: { projectId } });
    await tx.changeRequest.deleteMany({ where: { projectId } });
    await tx.projectCalendarOverride.deleteMany({ where: { projectId } });
    await tx.wbsCommand.deleteMany({ where: { projectId } });
    await tx.wbsBaselineItem.deleteMany({
      where: { baseline: { projectId } },
    });
    await tx.wbsBaseline.deleteMany({ where: { projectId } });
    await tx.wbsItem.deleteMany({ where: { projectId } });
    await tx.jiraIntegration.deleteMany({ where: { projectId } });
    await tx.project.delete({ where: { id: projectId } });
  });
}
