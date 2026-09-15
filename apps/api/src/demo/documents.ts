import type { Prisma, Project } from '@prisma/client';
import { dateAt, demoId, owners } from './project.js';

export async function fillDocuments(tx: Prisma.TransactionClient, project: Project, base: Date) {
  const id = (key: string) => demoId(project.id, key);
  project = await tx.project.findUniqueOrThrow({ where: { id: project.id } });
  const uiState = project.uiState && typeof project.uiState === 'object' && !Array.isArray(project.uiState)
    ? project.uiState as Prisma.JsonObject : {};
  const passport = Array.isArray(uiState.passportRows)
    ? uiState.passportRows.filter((row): row is Prisma.JsonObject => row !== null && typeof row === 'object' && !Array.isArray(row)) : [];
  // The compared values are placeholders stored by other modules, not display strings: keep them verbatim.
  const manager = !project.projectManager || ['Не назначен', 'Руководитель проекта'].includes(project.projectManager)
    ? owners[1] : project.projectManager;
  const sponsor = !project.sponsor || ['Не назначен', 'Спонсор'].includes(project.sponsor) ? owners[0] : project.sponsor;
  const examples = [
    ['Name', project.name], ['Code', project.code], ['Project manager', manager], ['Sponsor', sponsor],
    ['Business goal', 'Cut the product release cycle by 20% and keep service availability at 99.9%.'],
    ['Project scope', 'Design, development, integration testing, pilot and handover to operations.'],
    ['Success criteria', 'Four goals accepted; critical defects fixed; API response time within 500 ms.'],
    ['Constraints', 'Work within the agreed budget; a dedicated team of six specialists.'],
    ['Customer', 'Demo product team'],
  ];
  const rows = [...passport];
  examples.forEach(([field, description], i) => {
    const index = rows.findIndex(row => row.field === field);
    if (index < 0 && !rows.some(row => row.id === id(`passport-${i}`))) rows.push({ id: id(`passport-${i}`), field, description });
    else if (index >= 0 && !rows[index].description) rows[index] = { ...rows[index], description };
  });
  await tx.project.update({ where: { id: project.id }, data: {
    projectManager: manager, sponsor, uiState: { ...uiState, passportRows: rows },
    ...(Number(project.budgetPlanned) === 0 ? { budgetPlanned: Number(project.budgetForecast) / 1.06 || 5000000 } : {}),
    ...(Number(project.budgetForecast) === 0 ? { budgetForecast: Number(project.budgetPlanned) * 1.06 || 5300000 } : {}),
  } });
  for (let i = 0; i < 3; i++) {
    await tx.changeRequest.upsert({ where: { id: id(`change-${i}`) }, update: {}, create: {
      id: id(`change-${i}`), projectId: project.id, type: (['SCHEDULE', 'BUDGET', 'SCOPE'] as const)[i],
      title: ['Move the pilot by one week', 'Contingency for an additional check', 'Extend the SLA report'][i],
      description: 'Demo request to change the agreed plan.', owner: owners[i],
      status: (['IN_REVIEW', 'APPROVED', 'IMPLEMENTED'] as const)[i],
      impactAnalysis: 'Planned estimate: schedule +7 days, budget +150k RUB; the main business outcome is preserved.',
      affectedBaseline: 'Demo baseline', implementationPlan: 'Refine the scope, agree the resources, run the acceptance check.',
      scheduleImpactDays: i === 0 ? 7 : 0, budgetImpact: i === 1 ? 150000 : 0,
      scopeImpact: 'Additional service resilience check.', dueDate: dateAt(i * 4 + 1, base),
      approvedAt: i > 0 ? dateAt(-3, base) : null, decisionRequired: i === 0,
    } });
    await tx.projectCalendarOverride.upsert({
      where: { projectId_calendarCode_date: { projectId: project.id, calendarCode: 'RU', date: dateAt(14 + i, base) } },
      update: {}, create: { projectId: project.id, calendarCode: 'RU', date: dateAt(14 + i, base),
        isWorkingDay: i !== 0, description: i === 0 ? 'Demo: team training' : 'Demo: agreed testing window' },
    });
  }
  if (await tx.wbsBaseline.count({ where: { projectId: project.id } }) === 0) {
    const rows = await tx.wbsItem.findMany({ where: { projectId: project.id } });
    const codes = new Map(rows.map((row) => [row.id, row.code]));
    await tx.wbsBaseline.create({ data: {
      id: id('baseline'), projectId: project.id, version: 1, title: 'Demo: initial plan', status: 'ACTIVE',
      items: { create: rows.map((row) => ({
        sourceWbsItemId: row.id, code: row.code, parentCode: row.parentId ? codes.get(row.parentId) : null,
        title: row.title, type: row.type, status: row.status, owner: row.owner,
        startDate: row.baselineStartDate ?? row.startDate, dueDate: row.baselineDueDate ?? row.dueDate,
        wbsLevel: row.wbsLevel, calendarCode: row.calendarCode, effortPercent: row.effortPercent,
        progress: row.progress, sortOrder: row.sortOrder,
      })) },
    } });
  }
  const reportId = id('overview');
  if (!await tx.executiveOverview.findUnique({ where: { id: reportId } })) {
    const latest = await tx.executiveOverview.aggregate({ where: { projectId: project.id }, _max: { version: true } });
    await tx.executiveOverview.create({ data: {
      id: reportId, projectId: project.id, version: (latest._max.version ?? 0) + 1, status: 'GENERATED', generatedAt: base,
      executiveSummary: `Demo overview of “${project.name}”: design is complete, delivery is in progress. The pilot needs a decision on two critical issues.`,
      kpis: [{ name: 'Pilot readiness', value: '55%', target: '100%' }],
      risks: [{ title: 'Component delivery failure', score: 25, owner: owners[0], mitigation: 'Prepare a backup supplier' }],
      qualityGates: [{ title: 'Acceptance criteria agreed', status: 'AMBER' }],
      nextSteps: [{ title: 'Complete the API review', owner: owners[1], dueDate: dateAt(7, base).toISOString() }],
      decisions: [{ title: 'Approve the supply contingency', owner: project.sponsor, deadline: dateAt(5, base).toISOString() }],
      evidence: [{ metric: 'Demo scenario', source: 'Local demo data, not production reporting' }],
    } });
  }
}
