import { createHash } from 'node:crypto';
import type { Prisma, Project } from '@prisma/client';

export const owners = ['Анна Орлова', 'Елена Волкова', 'Михаил Соколов', 'Ольга Лебедева', 'Мария Новикова', 'Дмитрий Егоров'];
export const dateAt = (day: number, base: Date) => new Date(base.getTime() + day * 86_400_000);
export const demoId = (projectId: string, key: string) => `demo2-${createHash('sha256').update(`${projectId}:${key}`).digest('hex').slice(0, 32)}`;

// Additive: these IDs belong only to this fixture. Never replace the user's WBS.
export async function fillProject(tx: Prisma.TransactionClient, project: Project, base: Date) {
  const id = (key: string) => demoId(project.id, key);
  const existing = await tx.wbsItem.findMany({ where: { projectId: project.id }, select: { id: true, code: true } });
  const codes = new Set(existing.map((row) => row.code));
  const nextRoot = () => {
    let n = 1;
    while ([...codes].some((code) => code === String(n) || code.startsWith(`${n}.`))) n++;
    codes.add(String(n));
    return String(n);
  };
  const phases = ['Проектирование', 'Разработка', 'Испытания и пилот', 'Ввод в эксплуатацию'];
  const goals = ['Релиз заводской прошивки', 'Первая ОТА готова', 'Пилот принят заказчиком', 'Целевой SLA достигнут'];
  const goalLabels = ['MP', 'ota', 'pilot', 'sla'];
  const taskNames = ['Согласовать требования', 'Реализовать интеграцию', 'Проверить нагрузку', 'Устранить замечания', 'Подготовить эксплуатацию'];
  const statuses = ['IN_PROGRESS', 'IN_REVIEW', 'AT_RISK', 'BLOCKED', 'CANCELLED'] as const;
  for (let phaseIndex = 0; phaseIndex < 4; phaseIndex++) {
    const root = existing.find((row) => row.id === id(`phase-${phaseIndex}`))?.code ?? nextRoot();
    const start = dateAt(-70 + phaseIndex * 35, base);
    const due = dateAt(-35 + phaseIndex * 35, base);
    const phase = await tx.wbsItem.upsert({
      where: { id: id(`phase-${phaseIndex}`) }, update: {},
      create: { id: id(`phase-${phaseIndex}`), projectId: project.id, code: root,
        title: phases[phaseIndex], type: 'PHASE', owner: owners[phaseIndex],
        status: phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'IN_PROGRESS' : 'NOT_STARTED',
        startDate: start, dueDate: due, baselineStartDate: start, baselineDueDate: due,
        progress: phaseIndex === 0 ? 100 : phaseIndex === 1 ? 50 : 0,
        wbsLevel: 1, sortOrder: Number(root) * 100, description: `Демонстрационный этап: ${phases[phaseIndex]}` },
    });
    const childCode = (suffix: string) => `${phase.code}.${suffix}`;
    await tx.wbsItem.upsert({
      where: { id: id(`goal-${phaseIndex}`) }, update: {},
      create: { id: id(`goal-${phaseIndex}`), projectId: project.id, parentId: phase.id,
        code: childCode('1'), title: goals[phaseIndex], type: 'GOAL',
        status: phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'AT_RISK' : 'NOT_STARTED',
        owner: owners[phaseIndex], startDate: due, dueDate: due,
        baselineStartDate: due, baselineDueDate: due, forecastDueDate: dateAt(phaseIndex === 1 ? 7 : 0, due),
        jiraGoalLabels: [goalLabels[phaseIndex]], progress: phaseIndex === 0 ? 100 : 0,
        priority: 'High', wbsLevel: 2, sortOrder: phase.sortOrder + 1 },
    });
    for (let m = 0; m < 3; m++) {
      const when = dateAt(m * 10 + 5, start);
      const title = `${phases[phaseIndex]}: ${['решение согласовано', 'результат проверен', 'этап принят'][m]}`;
      await tx.milestone.upsert({ where: { id: id(`register-milestone-${phaseIndex}-${m}`) }, update: {}, create: {
        id: id(`register-milestone-${phaseIndex}-${m}`), projectId: project.id,
        code: childCode(String(m + 2)), title, dueDate: when,
        status: phaseIndex === 0 ? 'Done' : phaseIndex === 1 ? 'At Risk' : 'Planned',
        owner: owners[(phaseIndex + m) % owners.length], description: 'Демо: контрольная точка этапа проекта.',
      } });
      await tx.wbsItem.upsert({
        where: { id: id(`milestone-${phaseIndex}-${m}`) }, update: {},
        create: { id: id(`milestone-${phaseIndex}-${m}`), projectId: project.id, parentId: phase.id,
          code: childCode(String(m + 2)), title, type: 'MILESTONE', owner: owners[(phaseIndex + m) % owners.length],
          startDate: when, dueDate: when, baselineStartDate: when, baselineDueDate: when,
          forecastDueDate: dateAt(phaseIndex === 1 ? m + 2 : 0, when),
          status: phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? 'AT_RISK' : 'NOT_STARTED',
          progress: phaseIndex === 0 ? 100 : 0, wbsLevel: 2, sortOrder: phase.sortOrder + m + 2 },
      });
    }
    const wp = await tx.wbsItem.upsert({
      where: { id: id(`package-${phaseIndex}`) }, update: {},
      create: { id: id(`package-${phaseIndex}`), projectId: project.id, parentId: phase.id,
        code: childCode('5'), title: `Работы: ${phases[phaseIndex]}`, type: 'WORK_PACKAGE', owner: owners[phaseIndex],
        startDate: start, dueDate: due, status: phase.status, wbsLevel: 2, sortOrder: phase.sortOrder + 5 },
    });
    for (let t = 0; t < 5; t++) {
      const status = phaseIndex === 0 ? 'DONE' : phaseIndex === 1 ? statuses[t] : 'NOT_STARTED';
      const from = dateAt(t * 5, start), to = dateAt(t * 5 + 4, start);
      await tx.wbsItem.upsert({
        where: { id: id(`task-${phaseIndex}-${t}`) }, update: {},
        create: { id: id(`task-${phaseIndex}-${t}`), projectId: project.id, parentId: wp.id,
          code: `${wp.code}.${t + 1}`, title: `${taskNames[t]} — ${phases[phaseIndex]}`,
          type: t === 4 ? 'DELIVERABLE' : 'TASK', status, owner: owners[(phaseIndex + t) % owners.length],
          priority: ['Low', 'Medium', 'High', 'Critical'][t % 4],
          startDate: from, dueDate: to, baselineStartDate: from, baselineDueDate: to,
          forecastStartDate: from, forecastDueDate: dateAt(status === 'AT_RISK' || status === 'BLOCKED' ? 8 : 0, to),
          progress: status === 'DONE' ? 100 : status === 'IN_PROGRESS' ? 55 : status === 'IN_REVIEW' ? 85 : 0,
          effortPercent: 100, plannedCost: 120000 * (t + 1), forecastCost: 130000 * (t + 1),
          wbsLevel: 3, sortOrder: phase.sortOrder + 10 + t,
          comment: `Демо: ${owners[(phaseIndex + t) % owners.length]} подготовит результат и статус к контрольной дате.` },
      });
      if (t > 0) await tx.wbsDependency.upsert({
        where: { projectId_predecessorId_successorId_type: { projectId: project.id,
          predecessorId: id(`task-${phaseIndex}-${t - 1}`), successorId: id(`task-${phaseIndex}-${t}`), type: 'FS' } },
        update: {}, create: { projectId: project.id, predecessorId: id(`task-${phaseIndex}-${t - 1}`), successorId: id(`task-${phaseIndex}-${t}`), type: 'FS', lagDays: 0 },
      });
    }
  }
  for (let r = 0; r < 6; r++) {
    const probability = [5, 4, 3, 2, 1, 4][r], impact = [5, 4, 3, 2, 2, 5][r];
    const risk = await tx.raidItem.upsert({ where: { id: id(`risk-${r}`) }, update: {}, create: {
      id: id(`risk-${r}`), projectId: project.id, type: r < 4 ? 'RISK' : r === 4 ? 'ASSUMPTION' : 'DEPENDENCY',
      title: ['Срыв поставки компонентов', 'Дефекты на нагрузочных испытаниях', 'Недостаток тестовых данных', 'Недоступность эксперта', 'Доступность пилотной площадки', 'Задержка внешнего API'][r],
      description: 'Демонстрационный сценарий: возможное влияние на срок и стоимость проекта.',
      owner: owners[r], status: (['OPEN', 'IN_PROGRESS', 'MITIGATED', 'CLOSED', 'VALIDATED', 'BREACHED'] as const)[r],
      probability, impact, riskScore: probability * impact, residualRisk: Math.max(1, probability * impact - 8),
      dueDate: dateAt([-8, 5, 15, -12, 25, -2][r], base), decisionRequired: r < 2,
      mitigationPlan: 'Еженедельный контроль; резерв поставщика; дополнительная проверка качества.',
      contingencyPlan: 'Активировать резервный план и согласовать перенос контрольной точки.',
      escalationLevel: r < 2 ? 'Steering' : 'Project', scheduleImpactDays: r < 2 ? 10 : 3,
      budgetImpact: r < 2 ? 1500000 : 150000,
    } });
    await tx.raidItemStatusUpdate.upsert({ where: { id: id(`risk-update-${r}`) }, update: {}, create: {
      id: id(`risk-update-${r}`), raidItemId: risk.id, statusAt: dateAt(-2, base),
      text: 'Владелец подтвердил план реагирования. Следующая проверка на проектном комитете.',
    } });
  }
  for (let q = 0; q < 8; q++) {
    const issue = await tx.issue.upsert({ where: { id: id(`issue-${q}`) }, update: {}, create: {
      id: id(`issue-${q}`), projectId: project.id, phaseId: id(`phase-${q % 4}`),
      riskId: q < 2 ? id(`risk-${q}`) : null, source: 'INTERNAL',
      category: q < 4 ? 'Проблемы реализации' : 'Управленческие решения',
      title: ['Не подтверждена дата поставки', 'Ошибки при пиковой нагрузке', 'Согласовать формат API', 'Недоступен тестовый стенд', 'Утвердить бюджет резерва', 'Назначить владельца эксплуатации', 'Согласование дизайна завершено', 'Доступы предоставлены'][q],
      severity: (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const)[q % 4],
      status: ['Open', 'In Progress', 'Open', 'In Progress', 'Open', 'In Progress', 'Resolved', 'Closed'][q],
      readiness: q > 5 ? 'GREEN' : q % 2 ? 'AMBER' : 'RED', owner: owners[q % owners.length],
      impact: 'Влияет на готовность ближайшей цели: нужен согласованный план действий и ответственный.',
      decisionRequired: q < 6, dueDate: dateAt([-5, 3, 14, -2, 7, 21, -10, -15][q], base),
      initialDueDate: dateAt([-8, 0, 14, -5, 7, 21, -12, -15][q], base),
      closedDelayDays: q > 5 ? q - 5 : null,
    } });
    await tx.issueStatusUpdate.upsert({ where: { id: id(`issue-update-${q}`) }, update: {}, create: {
      id: id(`issue-update-${q}`), issueId: issue.id, statusAt: dateAt(-1, base),
      text: q > 5 ? 'Результат принят, вопрос закрыт на встрече команды.' : 'Вопрос разобран командой. Владелец готовит решение к указанному сроку.',
    } });
  }
  const requirements = await tx.projectBusinessRequirements.findUnique({ where: { projectId: project.id } });
  // Fill blank placeholders in place; preserve existing row IDs, populated values and column IDs.
  const columns = (requirements?.columns ?? [
    { id: 'id', title: 'ID' }, { id: 'requirement', title: 'Бизнес-требование' },
    { id: 'priority', title: 'Приоритет' }, { id: 'status', title: 'Статус' }, { id: 'comment', title: 'Комментарий' },
  ]) as Array<{ id: string; title: string }>;
  const rows = (requirements?.rows ?? []) as Array<{ id: string; cells: Record<string, string> }>;
  const additions = Array.from({ length: 6 }, (_, n) => ({ id: id(`requirement-${n}`), cells: Object.fromEntries(columns.map((col) => {
    const title = `${col.id} ${col.title}`.toLowerCase();
    const requirement = ['Вход через единую учётную запись', 'Доступность сервиса 99,9%', 'Время ответа не более 500 мс', 'Контроль ролей и прав', 'Экспорт отчёта для комитета', 'Сохранность истории изменений'][n];
    const value = /приоритет|priority/.test(title) ? ['Высокий', 'Средний', 'Низкий'][n % 3]
      : /статус|status/.test(title) ? ['Согласовано', 'В работе', 'На проверке'][n % 3]
      : /комментар|comment/.test(title) ? `Критерий приёмки согласует ${owners[n]}. Проверка в пилоте.`
      : /требован|requirement/.test(title) ? requirement
      : /(^|\s)id($|\s)|идентификатор/.test(title) ? `BR-${n + 1}`
      : `Демо: ${col.title} — ${requirement}`;
    return [col.id, value];
  })) }));
  const filled = rows.map((row, index) => Object.values(row.cells).some((cell) => String(cell ?? '').trim())
    ? row : { ...row, cells: { ...row.cells, ...additions[index % additions.length].cells } });
  const known = new Set(filled.map((row) => row.id));
  const combined = [...filled, ...additions.filter((row) => !known.has(row.id))];
  await tx.projectBusinessRequirements.upsert({ where: { projectId: project.id }, update: { rows: combined },
    create: { projectId: project.id, columns, rows: combined } });
  for (let a = 0; a < 3; a++) {
    await tx.projectArtifact.upsert({ where: { id: id(`artifact-${a}`) }, update: {}, create: {
      id: id(`artifact-${a}`), projectId: project.id, title: ['Устав проекта', 'Протокол архитектурного совета', 'План приёмочных испытаний'][a],
      type: 'Document', owner: owners[a], status: ['Approved', 'In Review', 'Draft'][a],
      description: 'Демо-документ: цели, критерии приёмки и зона ответственности согласованы командой.', sortOrder: a,
    } });
    await tx.task.upsert({ where: { id: id(`action-${a}`) }, update: {}, create: {
      id: id(`action-${a}`), projectId: project.id, title: ['Подготовить решение по риску поставки', 'Утвердить критерии пилота', 'Согласовать окно запуска'][a],
      owner: owners[a], status: ['Open', 'In Progress', 'Done'][a], priority: ['High', 'Medium', 'Low'][a], dueDate: dateAt(a * 5 - 2, base),
    } });
  }
}
