import { prisma } from '../db.js';
import { buildWbsRenumberPlan, type WbsOrderingItem } from './wbs-ordering.js';

export type IssueLinkedWbsPlanItem = WbsOrderingItem & {
  type: string;
};

export type IssueLinkedWbsReference = {
  title: string;
  phaseId: string | null;
  workPackageId: string | null;
};

export class WbsIssueLinkViolationError extends Error {}

export function invalidIssueLinkedWbsPlan(
  items: IssueLinkedWbsPlanItem[],
  linkedIssues: IssueLinkedWbsReference[],
) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const rowsById = new Map(
    buildWbsRenumberPlan(items).normalizedRows.map((row) => [row.id, row]),
  );
  return linkedIssues.find((issue) => {
    const phase = issue.phaseId ? itemsById.get(issue.phaseId) : null;
    const workPackage = issue.workPackageId ? itemsById.get(issue.workPackageId) : null;
    const workPackageRow = issue.workPackageId ? rowsById.get(issue.workPackageId) : null;
    return (issue.phaseId && phase?.type !== 'PHASE')
      || (issue.workPackageId && (
        workPackage?.type !== 'WORK_PACKAGE'
        || workPackageRow?.parentId !== issue.phaseId
      ));
  });
}

export async function assertProjectIssueLinkedWbsPlan(
  projectId: string,
  orderedItems: IssueLinkedWbsPlanItem[],
) {
  const linkedIssues = await prisma.issue.findMany({
    where: {
      projectId,
      status: { notIn: ['Done', 'Closed', 'Resolved'] },
      OR: [
        { phaseId: { not: null } },
        { workPackageId: { not: null } },
      ],
    },
    select: { title: true, phaseId: true, workPackageId: true },
  });
  const invalidIssue = invalidIssueLinkedWbsPlan(orderedItems, linkedIssues);
  if (invalidIssue) {
    throw new WbsIssueLinkViolationError(
      `Изменение нарушает связь пакета работ с открытым вопросом «${invalidIssue.title}»; измените фазу в реестре вопросов`,
    );
  }
}
