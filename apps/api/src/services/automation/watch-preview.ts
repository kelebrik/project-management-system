import { automationParamsSchemas, type AutomationTemplate, type NotificationParams } from '@pms/shared';
import { prisma } from '../../db.js';
import { listed, rowRef, cutText } from './templates.js';
import { localMoment } from './time.js';
import { dueSoonWork, incompleteRisks, milestonesAtRisk, overdueIssues, pendingChanges, waitingDecisions } from './watch-templates.js';

export const WATCH_TEMPLATES: readonly AutomationTemplate[] = ['DECISION_WAITING', 'RISK_INCOMPLETE', 'ISSUE_OVERDUE', 'WORK_DUE_SOON', 'MILESTONE_AT_RISK', 'CHANGE_REQUEST_PENDING'];

const item = (row: { id: string; title: string }) => ({ id: row.id, title: cutText(row.title) });

/** What a watching rule would say today; its past is not stored, so nothing older is shown. */
export async function previewWatchRule(project: { id: string; code: string }, template: AutomationTemplate, params: unknown, now: Date, zone: string) {
  const today = localMoment(now, zone).date;
  const out: Array<{ at: string | null; params: NotificationParams }> = [];
  const say = (value: NotificationParams) => out.push({ at: null, params: value });
  const code = project.code;
  if (template === 'DECISION_WAITING') {
    const { days } = automationParamsSchemas.DECISION_WAITING.parse(params ?? {});
    const rows = await prisma.decision.findMany({ where: { projectId: project.id, status: 'PENDING_APPROVAL' }, select: { id: true, title: true, status: true, approverUserId: true, approverName: true, requestedAt: true, createdAt: true } });
    for (const { decision, waited } of waitingDecisions(rows, today, days)) say({ kind: 'DECISION_WAITING', projectCode: code, item: item(decision), days: waited, approver: decision.approverName });
  } else if (template === 'RISK_INCOMPLETE') {
    const risks = incompleteRisks(await prisma.raidItem.findMany({ where: { projectId: project.id, type: 'RISK' }, select: { id: true, title: true, type: true, status: true, owner: true, dueDate: true } }));
    if (risks.length > 0) {
      const { rows, more } = listed(risks.map(item));
      say({ kind: 'RISK_INCOMPLETE', projectCode: code, items: rows, more });
    }
  } else if (template === 'ISSUE_OVERDUE') {
    const { graceDays } = automationParamsSchemas.ISSUE_OVERDUE.parse(params ?? {});
    const rows = await prisma.issue.findMany({ where: { projectId: project.id, dueDate: { not: null } }, select: { id: true, title: true, status: true, owner: true, dueDate: true } });
    for (const { issue, due, late } of overdueIssues(rows, today, graceDays)) say({ kind: 'ISSUE_OVERDUE', projectCode: code, item: item(issue), dueDate: due, days: late });
  } else if (template === 'WORK_DUE_SOON') {
    const { days } = automationParamsSchemas.WORK_DUE_SOON.parse(params ?? {});
    const rows = await prisma.wbsItem.findMany({ where: { projectId: project.id, type: { in: ['TASK', 'WORK_PACKAGE', 'DELIVERABLE'] }, children: { none: {} } }, select: { id: true, code: true, title: true, status: true, owner: true, dueDate: true } });
    const soon = dueSoonWork(rows, today, days).map(({ row }) => rowRef(row));
    if (soon.length > 0) {
      const { rows: named, more } = listed(soon);
      say({ kind: 'WORK_DUE_SOON_SUMMARY', projectCode: code, rows: named, more });
    }
  } else if (template === 'MILESTONE_AT_RISK') {
    const { days, minProgress } = automationParamsSchemas.MILESTONE_AT_RISK.parse(params ?? {});
    const [items, links] = await Promise.all([
      prisma.wbsItem.findMany({ where: { projectId: project.id }, select: { id: true, parentId: true, code: true, title: true, type: true, status: true, progress: true, dueDate: true } }),
      prisma.wbsDependency.findMany({ where: { projectId: project.id }, select: { predecessorId: true, successorId: true } }),
    ]);
    const byId = new Map(items.map((row) => [row.id, row]));
    const feedersOf = (id: string) =>
      [...new Set([...items.filter((row) => row.parentId === id).map((row) => row.id), ...links.filter((link) => link.successorId === id).map((link) => link.predecessorId)])].flatMap((key) => (byId.has(key) ? [byId.get(key)!] : []));
    for (const { milestone, due, lagging } of milestonesAtRisk(items, feedersOf, today, days, minProgress)) say({ kind: 'MILESTONE_AT_RISK', projectCode: code, row: rowRef(milestone), dueDate: due, lagging });
  } else if (template === 'CHANGE_REQUEST_PENDING') {
    const { days } = automationParamsSchemas.CHANGE_REQUEST_PENDING.parse(params ?? {});
    const rows = await prisma.changeRequest.findMany({ where: { projectId: project.id }, select: { id: true, title: true, status: true, updatedAt: true } });
    for (const { change, idle } of pendingChanges(rows, today, days)) say({ kind: 'CHANGE_REQUEST_PENDING', projectCode: code, item: item(change), status: change.status, days: idle });
  }
  return out;
}
