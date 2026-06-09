import { prisma } from '../db.js';

const JIRA_WORK_SECTION_COUNT = 5;

export function defaultJiraWorkSectionTitle(sortOrder: number) {
  return `Раздел ${sortOrder + 1}`;
}

export async function ensureDefaultJiraWorkSections(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return [];

  const existing = await prisma.jiraWorkSection.findMany({
    where: { projectId },
    select: { sortOrder: true },
  });
  const existingOrders = new Set(existing.map((section) => section.sortOrder));
  const missingSections = Array.from({ length: JIRA_WORK_SECTION_COUNT }, (_, index) => index)
    .filter((sortOrder) => !existingOrders.has(sortOrder))
    .map((sortOrder) => ({
      projectId,
      sortOrder,
      title: defaultJiraWorkSectionTitle(sortOrder),
      jql: '',
    }));

  if (missingSections.length > 0) {
    await prisma.jiraWorkSection.createMany({
      data: missingSections,
      skipDuplicates: true,
    });
  }

  return prisma.jiraWorkSection.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
    include: {
      issues: {
        orderBy: { syncedAt: 'desc' },
        include: { snapshot: true },
      },
    },
  });
}
