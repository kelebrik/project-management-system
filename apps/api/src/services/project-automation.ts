import { createHash } from 'node:crypto';
import type { Issue, JiraIssueSnapshot, Milestone, RaidItem, WbsDependency, WbsItem } from '@prisma/client';
import type { AutomationInsight, ScenarioPatch, ScenarioResult } from '@pms/shared';
import { calculateWbsScheduleUpdates, applyScheduleUpdates } from './wbs-schedule/calculate.js';
import type { WbsScheduleCalendarOverride, WbsScheduleItem } from './wbs-schedule/types.js';
import { calculateWbsCriticalPath } from './wbs-critical-path/calculate.js';

export const automationDay = (date: Date | null | undefined) => date?.toISOString().slice(0, 10) ?? null;
const finished = (status: string) => ['DONE', 'CANCELLED', 'CLOSED', 'VALIDATED', 'RESOLVED', 'MITIGATED'].includes(status.toUpperCase());
const wbsHref = (code: string, id: string) => `/${encodeURIComponent(code)}/wbs?focusWbs=${encodeURIComponent(id)}`;

/** Same priority as the scheduler: resolved predecessor1..6, otherwise dependency rows. */
export function predecessorGraph(items: WbsScheduleItem[], dependencies: WbsDependency[]) {
  const dependenciesBySuccessor = new Map<string, string[]>();
  for (const dependency of dependencies) dependenciesBySuccessor.set(dependency.successorId, [...(dependenciesBySuccessor.get(dependency.successorId) ?? []), dependency.predecessorId]);
  const byCode = new Map(items.map((item) => [item.code, item]));
  const ids = new Set(items.map((item) => item.id));
  const predecessors = new Map<string, string[]>();
  const warnings = new Map<string, string[]>();
  for (const item of items) {
    const codes = [item.predecessor1, item.predecessor2, item.predecessor3, item.predecessor4, item.predecessor5, item.predecessor6].filter((code): code is string => Boolean(code));
    const resolved = codes.flatMap((code) => byCode.has(code) ? [byCode.get(code)!.id] : []);
    const refs = resolved.length ? resolved : dependenciesBySuccessor.get(item.id) ?? [];
    predecessors.set(item.id, [...new Set(refs.filter((id) => ids.has(id)))]);
    warnings.set(item.id, [
      ...codes.filter((code) => !byCode.has(code)).map((code) => `Не найден предшественник ${code}`),
      ...refs.filter((id) => !ids.has(id)).map(() => 'Не найдена работа из зависимости'),
    ]);
  }
  return { predecessors, warnings };
}

const jiraStatuses: Record<string, string> = {
  'open': 'NOT_STARTED', 'to do': 'NOT_STARTED', 'backlog': 'NOT_STARTED', 'открыт': 'NOT_STARTED',
  'in progress': 'IN_PROGRESS', 'в работе': 'IN_PROGRESS',
  'in review': 'IN_REVIEW', 'на проверке': 'IN_REVIEW',
  'blocked': 'BLOCKED', 'заблокирован': 'BLOCKED',
  'done': 'DONE', 'closed': 'DONE', 'resolved': 'DONE', 'готово': 'DONE', 'закрыт': 'DONE',
  'cancelled': 'CANCELLED', 'canceled': 'CANCELLED', 'отменен': 'CANCELLED',
};

export function projectInsights(input: {
  code: string; items: WbsItem[]; dependencies: WbsDependency[]; issues: Issue[];
  risks: RaidItem[]; milestones: Milestone[]; snapshots: JiraIssueSnapshot[];
}, now = new Date()): AutomationInsight {
  const { code, items, dependencies, issues, risks, snapshots } = input;
  const byId = new Map(items.map((item) => [item.id, item]));
  const { predecessors, warnings } = predecessorGraph(items, dependencies);
  const childrenByParent = new Map<string, WbsItem[]>();
  for (const item of items) if (item.parentId) childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
  const issueManagedIds = new Set(issues.map((issue) => issue.workPackageId));
  const link = (item: WbsItem) => ({ id: item.id, code: item.code, title: item.title, href: wbsHref(code, item.id) });
  const readiness: AutomationInsight['readiness'] = items.filter((item) => ['GOAL', 'MILESTONE'].includes(item.type)).map((checkpoint) => {
    const scope = new Set<string>();
    const active = new Set<string>();
    const notices = new Set<string>();
    const visit = (id: string) => {
      if (active.has(id)) { notices.add('Цикл зависимостей: готовность не подтверждена'); return; }
      if (scope.has(id)) return;
      scope.add(id); active.add(id);
      for (const notice of warnings.get(id) ?? []) notices.add(notice);
      for (const predecessor of predecessors.get(id) ?? []) visit(predecessor);
      // Completion of an aggregate includes its children.
      if (byId.get(id)?.type === 'PHASE' || byId.get(id)?.type === 'WORK_PACKAGE') {
        for (const child of (childrenByParent.get(id) ?? [])) visit(child.id);
      }
      active.delete(id);
    };
    visit(checkpoint.id);
    if (scope.size === 1) notices.add('Предшественники не заданы: проверьте полноту связей');
    const ancestors = new Set(scope);
    for (const id of scope) {
      let parent = byId.get(id)?.parentId;
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) { seen.add(parent); ancestors.add(parent); parent = byId.get(parent)?.parentId; }
    }
    const linkedIssues = issues.filter((issue) => (issue.workPackageId && scope.has(issue.workPackageId)) || (issue.phaseId && ancestors.has(issue.phaseId)));
    const riskIds = new Set(linkedIssues.map((issue) => issue.riskId).filter(Boolean));
    const linkedRisks = risks.filter((risk) => riskIds.has(risk.id) && !finished(risk.status));
    if (risks.some((risk) => !finished(risk.status) && (risk.predecessor || risk.successor))) notices.add('Текстовые связи рисков не определяют зависимость от вехи');
    const blockers = [
      ...linkedIssues.filter((issue) => !finished(issue.status)).map((issue) => ({ id: issue.id, title: issue.title, href: `/${encodeURIComponent(code)}/issues#issue-item-${encodeURIComponent(issue.id)}` })),
      ...linkedRisks.map((risk) => ({ id: risk.id, title: risk.title, href: `/${encodeURIComponent(code)}/risks` })),
    ];
    const remaining = items.filter((item) => item.id !== checkpoint.id && scope.has(item.id) && !finished(item.status)).map(link);
    return { ...link(checkpoint), dueDate: automationDay(checkpoint.forecastDueDate ?? checkpoint.dueDate),
      state: finished(checkpoint.status) ? 'complete' : remaining.length || blockers.length ? 'blocked' : notices.size ? 'unknown' : 'ready',
      remaining, blockers, warnings: [...notices] };
  });
  for (const milestone of input.milestones) {
    if (items.some((item) => ['GOAL', 'MILESTONE'].includes(item.type) && item.code === milestone.code)) continue;
    readiness.push({ id: milestone.id, code: milestone.code ?? '', title: milestone.title, href: `/${encodeURIComponent(code)}/schedule`, dueDate: automationDay(milestone.dueDate), state: 'unknown', remaining: [], blockers: [], warnings: ['Веха вне WBS: связи с работами не заданы'] });
  }
  const snapshotByKey = new Map(snapshots.filter((snapshot) => !snapshot.retiredAt).map((snapshot) => [snapshot.issueKey.toUpperCase(), snapshot]));
  const reconciliation = items.filter((item) => item.jiraTicketKey?.trim()).map((item) => {
    const jiraKey = item.jiraTicketKey!.trim().toUpperCase();
    const snapshot = snapshotByKey.get(jiraKey);
    const proposed = snapshot ? jiraStatuses[snapshot.status.trim().toLowerCase().replaceAll('ё', 'е')] ?? null : null;
    const notices: string[] = [];
    if (!snapshot) notices.push('Нет активного снимка Jira');
    else {
      if (!proposed) notices.push(`Статус «${snapshot.status}» не сопоставлен`);
      if (now.getTime() - snapshot.syncedAt.getTime() > 24 * 60 * 60 * 1000) notices.push('Снимок старше суток: обновите данные Jira');
      if (snapshot.projectionUnversionedSince) notices.push('История снимка неполная');
    }
    if (childrenByParent.has(item.id) || issueManagedIds.has(item.id)) notices.push('Состояние этой работы управляется дочерними работами или открытым вопросом');
    return { ...link(item), jiraKey, jiraStatus: snapshot?.status ?? null, syncedAt: snapshot?.syncedAt.toISOString() ?? null,
      currentStatus: item.status, proposedStatus: proposed !== item.status ? proposed : null,
      currentOwner: item.owner, proposedOwner: snapshot?.assignee && snapshot.assignee !== item.owner ? snapshot.assignee : null,
      expectedUpdatedAt: item.updatedAt.toISOString(), expectedJiraUpdatedAt: snapshot?.updatedAt.toISOString() ?? null,
      warnings: notices, actionable: Boolean(snapshot && notices.length === 0) };
  }).filter((row) => row.proposedOwner || row.proposedStatus || row.warnings.length);
  return { generatedAt: now.toISOString(), readiness, reconciliation };
}

export function scheduleScenario(code: string, items: WbsItem[], dependencies: WbsDependency[], calendars: WbsScheduleCalendarOverride[], patches: ScenarioPatch[]): ScenarioResult {
  const graph = predecessorGraph(items, dependencies);
  const active = new Set<string>(); const seen = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error('В графике есть цикл зависимостей. Исправьте связи перед расчетом.');
    if (seen.has(id)) return;
    active.add(id);
    for (const previous of graph.predecessors.get(id) ?? []) visit(previous);
    active.delete(id); seen.add(id);
  };
  items.forEach((item) => visit(item.id));
  const warnings = [...new Set([...graph.warnings.values()].flat())];

  const merge = (base: WbsItem[], updates: ReturnType<typeof calculateWbsScheduleUpdates>) => {
    const resolved = applyScheduleUpdates(base, updates);
    return base.map((item, index) => ({ ...item, ...resolved[index] }));
  };
  const baseline = merge(items, calculateWbsScheduleUpdates(items, dependencies, calendars));
  const byId = new Map(baseline.map((item) => [item.id, item]));
  for (const patch of patches) {
    const item = byId.get(patch.id);
    if (!item) throw new Error('Работа сценария не найдена в проекте');
    if (['GOAL', 'MILESTONE', 'PHASE'].includes(item.type) || item.status === 'CANCELLED' || baseline.some((child) => child.parentId === item.id)) throw new Error('Изменяйте сроки конечных работ: даты вех и групп рассчитываются по зависимостям');
  }
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  const overridden = baseline.map((item) => {
    const patch = patchById.get(item.id);
    return patch ? { ...item,
      ...(patch.startDate ? { startDate: new Date(patch.startDate) } : {}),
      ...(patch.dueDate ? { dueDate: new Date(patch.dueDate) } : {}),
      ...(patch.workDays !== undefined ? { workDays: patch.workDays } : {}),
    } : item;
  });
  const scenarioOptions = {
    startNotBeforeById: new Map(patches.filter((patch) => patch.startDate).map((patch) => [patch.id, new Date(patch.startDate!)])),
    // A start-only scenario shifts work, preserving its duration. Due-date edits resize it.
    changedItems: patches.map(({ id, ...patch }) => ({ itemId: id, changedFields: patch.dueDate ? Object.keys(patch) : ['workDays'] })),
  };
  const after = merge(overridden, calculateWbsScheduleUpdates(overridden, dependencies, calendars, scenarioOptions));
  for (const patch of patches) {
    const actual = after.find((item) => item.id === patch.id)!;
    if ((patch.startDate && automationDay(actual.startDate) !== patch.startDate) || (patch.dueDate && automationDay(actual.dueDate) !== patch.dueDate)) warnings.push(`${actual.code}: даты скорректированы по зависимостям и календарю`);
  }
  const undated = after.filter((item) => item.status !== 'CANCELLED' && (!item.startDate || !item.dueDate));
  if (undated.length) warnings.push(`Без рассчитанных дат: ${undated.length} работ (${undated.slice(0, 5).map((item) => item.code).join(', ')}${undated.length > 5 ? ', …' : ''}) — не отображаются на диаграмме`);
  const residual = calculateWbsScheduleUpdates(after, dependencies, calendars, scenarioOptions);
  if (residual.length) warnings.push('Расчет не достиг устойчивого состояния: результат требует проверки');
  const beforeCritical = calculateWbsCriticalPath(baseline, dependencies, calendars);
  const afterCritical = calculateWbsCriticalPath(after, dependencies, calendars);
  return {
    fingerprint: createHash('sha256').update(JSON.stringify({ items: items.map(({ id, code, type, parentId, wbsLevel, sortOrder, status, startDate, dueDate, forecastStartDate, forecastDueDate, workDays, calendarDays, calendarCode, leadLagDays, predecessor1, predecessor2, predecessor3, predecessor4, predecessor5, predecessor6 }) => ({ id, code, type, parentId, wbsLevel, sortOrder, status, startDate, dueDate, forecastStartDate, forecastDueDate, workDays, calendarDays, calendarCode, leadLagDays, predecessor1, predecessor2, predecessor3, predecessor4, predecessor5, predecessor6 })), dependencies: dependencies.map(({ predecessorId, successorId, type, lagDays }) => ({ predecessorId, successorId, type, lagDays })), calendars })).digest('hex'),
    generatedAt: new Date().toISOString(), beforeFinish: automationDay(beforeCritical.projectFinishDate), afterFinish: automationDay(afterCritical.projectFinishDate),
    beforeCriticalIds: beforeCritical.criticalItemIds, afterCriticalIds: afterCritical.criticalItemIds,
    schedule: {
      items: after.map((item) => ({ id: item.id, startDate: automationDay(item.startDate), dueDate: automationDay(item.dueDate) })),
      criticalDependencyIds: afterCritical.criticalDependencyIds,
      floatById: afterCritical.items.map(({ itemId, totalFloatWorkDays, isNearCritical }) => ({ itemId, totalFloatWorkDays, isNearCritical })),
    },
    warnings: [...new Set([...warnings, ...beforeCritical.warnings, ...afterCritical.warnings])],
    changes: after.flatMap((item) => {
      const before = byId.get(item.id)!;
      const values = { beforeStart: automationDay(before.startDate), afterStart: automationDay(item.startDate), beforeFinish: automationDay(before.dueDate), afterFinish: automationDay(item.dueDate) };
      return values.beforeStart === values.afterStart && values.beforeFinish === values.afterFinish ? [] : [{ id: item.id, code: item.code, title: item.title, href: wbsHref(code, item.id), ...values, checkpoint: ['GOAL', 'MILESTONE'].includes(item.type) }];
    }),
  };
}
