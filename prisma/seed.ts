import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const defaultBusinessUnit = await prisma.businessUnit.upsert({
    where: { code: 'main' },
    update: { isDefault: true, isActive: true },
    create: {
      id: 'business-unit-default',
      code: 'main',
      name: 'TV&Box',
      isDefault: true,
    },
  });
  await prisma.project.updateMany({
    where: {
      businessUnitId: defaultBusinessUnit.id,
      portfolio: { not: defaultBusinessUnit.name },
    },
    data: { portfolio: defaultBusinessUnit.name },
  });
  const businessUnitRolePermissions = [
    { role: 'ADMIN', permission: 'PROJECT_VIEW', enabled: true },
    { role: 'ADMIN', permission: 'PROJECT_CREATE', enabled: true },
    { role: 'ADMIN', permission: 'PROJECT_ADMIN', enabled: true },
    { role: 'ADMIN', permission: 'MEMBERS_MANAGE', enabled: true },
    { role: 'VIEWER', permission: 'PROJECT_VIEW', enabled: true },
    { role: 'VIEWER', permission: 'PROJECT_CREATE', enabled: true },
    { role: 'VIEWER', permission: 'PROJECT_ADMIN', enabled: false },
    { role: 'VIEWER', permission: 'MEMBERS_MANAGE', enabled: false },
  ] satisfies Prisma.BusinessUnitRolePermissionCreateManyInput[];
  await prisma.businessUnitRolePermission.createMany({
    data: businessUnitRolePermissions,
    skipDuplicates: true,
  });
  const demoProjects = [
    {
      code: 'TEST-002',
      name: 'Второй тестовый проект',
      sponsor: 'CIO',
      projectManager: 'Петров П.П.',
      rag: 'AMBER' as const,
      progress: 35,
      scheduleVariance: 5,
      sortOrder: 20,
      budgetPlanned: '18000000.00',
      budgetForecast: '19200000.00',
      startDate: '2026-06-01T00:00:00.000Z',
      targetDate: '2026-10-15T00:00:00.000Z',
      summary: 'Тестовый проект с умеренными рисками по срокам и уточняемым объемом работ.',
    },
    {
      code: 'TEST-003',
      name: 'Третий тестовый проект',
      sponsor: 'COO',
      projectManager: 'Сидорова М.М.',
      rag: 'GREEN' as const,
      progress: 72,
      scheduleVariance: -3,
      sortOrder: 30,
      budgetPlanned: '24000000.00',
      budgetForecast: '23100000.00',
      startDate: '2026-03-10T00:00:00.000Z',
      targetDate: '2026-07-30T00:00:00.000Z',
      summary: 'Тестовый проект идет лучше baseline и подходит для проверки статуса Green.',
    },
    {
      code: 'TEST-004',
      name: 'Четвертый тестовый проект',
      sponsor: 'CFO',
      projectManager: 'Кузнецов И.И.',
      rag: 'RED' as const,
      progress: 18,
      scheduleVariance: 21,
      sortOrder: 40,
      budgetPlanned: '32000000.00',
      budgetForecast: '38900000.00',
      startDate: '2026-04-20T00:00:00.000Z',
      targetDate: '2026-12-20T00:00:00.000Z',
      summary: 'Тестовый проект в критическом статусе для проверки переключения и executive overview.',
    },
  ];

  const extraTestProjects = await Promise.all(
    demoProjects.map((item) =>
      prisma.project.upsert({
        where: { code: item.code },
        update: {
          businessUnitId: defaultBusinessUnit.id,
          parentId: null,
          name: item.name,
          portfolio: defaultBusinessUnit.name,
          sponsor: item.sponsor,
          projectManager: item.projectManager,
          status: 'ACTIVE',
          rag: item.rag,
          progress: item.progress,
          scheduleVariance: item.scheduleVariance,
          budgetPlanned: item.budgetPlanned,
          budgetForecast: item.budgetForecast,
          startDate: new Date(item.startDate),
          initialTargetDate: new Date(item.targetDate),
          targetDate: new Date(item.targetDate),
          summary: item.summary,
          sortOrder: item.sortOrder,
        },
        create: {
          businessUnitId: defaultBusinessUnit.id,
          code: item.code,
          name: item.name,
          portfolio: defaultBusinessUnit.name,
          sponsor: item.sponsor,
          projectManager: item.projectManager,
          status: 'ACTIVE',
          rag: item.rag,
          startDate: new Date(item.startDate),
          initialTargetDate: new Date(item.targetDate),
          targetDate: new Date(item.targetDate),
          budgetPlanned: item.budgetPlanned,
          budgetForecast: item.budgetForecast,
          scheduleVariance: item.scheduleVariance,
          progress: item.progress,
          summary: item.summary,
          sortOrder: item.sortOrder,
        },
      }),
    ),
  );

  const project = await prisma.project.upsert({
    where: { code: 'ERP' },
    update: {
      businessUnitId: defaultBusinessUnit.id,
      parentId: null,
      portfolio: defaultBusinessUnit.name,
      sortOrder: 10,
    },
    create: {
      businessUnitId: defaultBusinessUnit.id,
      parentId: null,
      code: 'ERP',
      name: 'ERP rollout',
      portfolio: defaultBusinessUnit.name,
      sponsor: 'CFO',
      projectManager: 'Иванов А.А.',
      rag: 'AMBER',
      startDate: new Date('2026-02-01T00:00:00.000Z'),
      initialTargetDate: new Date('2026-09-30T00:00:00.000Z'),
      targetDate: new Date('2026-09-30T00:00:00.000Z'),
      budgetPlanned: '120000000.00',
      budgetForecast: '127000000.00',
      scheduleVariance: 12,
      progress: 65,
      sortOrder: 10,
      summary:
        'Проект сохраняет бизнес-цель, но требует решения по SLA внешнего API и временному контуру обмена данными.',
      jiraIntegration: {
        create: {
          baseUrl: 'https://jira.example',
          boardUrl: 'https://jira.example/jira/software/projects/ERP/boards/12',
          projectKey: 'ERP',
          issuesJql: 'project = ERP ORDER BY updated DESC',
          openIssuesJql:
            'project = ERP AND statusCategory != Done AND priority in (High, Highest) ORDER BY updated DESC',
          syncStatus: 'SEEDED',
          lastSyncedAt: new Date('2026-05-13T11:40:00.000Z'),
        },
      },
      tasks: {
        create: [
          {
            title: 'Согласовать workaround API',
            owner: 'Sponsor',
            status: 'Open',
            priority: 'High',
            dueDate: new Date('2026-05-17T00:00:00.000Z'),
            jiraTicketKey: 'ERP-1842',
            jiraTicketUrl: 'https://jira.example/browse/ERP-1842',
            jiraStatus: 'Blocked',
            jiraAssignee: 'Vendor',
            jiraPriority: 'High',
            jiraUpdatedAt: new Date('2026-05-13T08:20:00.000Z'),
          },
          {
            title: 'Подготовить решение для steering committee',
            owner: 'PMO',
            status: 'In Progress',
            priority: 'High',
            dueDate: new Date('2026-05-15T00:00:00.000Z'),
          },
        ],
      },
      issues: {
        create: [
          {
            source: 'JIRA',
            title: 'ERP-1842: API SLA не подтвержден',
            severity: 'CRITICAL',
            status: 'Open',
            owner: 'Vendor',
            impact: '+12 дней к UAT, +4.2 млн к forecast',
            decisionRequired: true,
            dueDate: new Date('2026-05-17T00:00:00.000Z'),
            jiraTicketKey: 'ERP-1842',
            jiraTicketUrl: 'https://jira.example/browse/ERP-1842',
            jiraLinks: {
              create: [
                {
                  jiraKey: 'ERP-1842',
                  jiraUrl: 'https://jira.example/browse/ERP-1842',
                },
                {
                  jiraKey: 'ERP-1843',
                  jiraUrl: 'https://jira.example/browse/ERP-1843',
                },
              ],
            },
          },
          {
            source: 'INTERNAL',
            title: 'Нет доступа к тестовому контуру',
            severity: 'HIGH',
            status: 'Open',
            owner: 'IT Ops',
            impact: 'Риск задержки интеграционных тестов HR-контура',
            dueDate: new Date('2026-05-16T00:00:00.000Z'),
          },
          {
            source: 'JIRA',
            title: 'ERP-1901: миграция справочников blocked',
            severity: 'HIGH',
            status: 'Open',
            owner: 'Data Lead',
            impact: 'Может заблокировать старт UAT',
            decisionRequired: true,
            jiraTicketKey: 'ERP-1901',
            jiraTicketUrl: 'https://jira.example/browse/ERP-1901',
            jiraLinks: {
              create: [
                {
                  jiraKey: 'ERP-1901',
                  jiraUrl: 'https://jira.example/browse/ERP-1901',
                },
              ],
            },
          },
        ],
      },
      jiraSnapshots: {
        create: [
          {
            issueKey: 'ERP-1842',
            issueUrl: 'https://jira.example/browse/ERP-1842',
            summary: 'API SLA не подтвержден поставщиком',
            status: 'Blocked',
            priority: 'High',
            assignee: 'Vendor',
            issueType: 'Bug',
            sprint: 'ERP Sprint 18',
            updatedAt: new Date('2026-05-13T08:20:00.000Z'),
          },
          {
            issueKey: 'ERP-1877',
            issueUrl: 'https://jira.example/browse/ERP-1877',
            summary: 'Интеграционные тесты HR',
            status: 'In Dev',
            priority: 'Medium',
            assignee: 'QA Lead',
            issueType: 'Task',
            sprint: 'ERP Sprint 18',
            updatedAt: new Date('2026-05-12T16:05:00.000Z'),
          },
          {
            issueKey: 'ERP-1901',
            issueUrl: 'https://jira.example/browse/ERP-1901',
            summary: 'Миграция справочников заблокирована',
            status: 'Open',
            priority: 'High',
            assignee: 'Data Lead',
            issueType: 'Task',
            sprint: 'ERP Sprint 18',
            updatedAt: new Date('2026-05-13T09:10:00.000Z'),
          },
        ],
      },
      milestones: {
        create: [
          {
            title: 'Архитектурный комитет',
            dueDate: new Date('2026-05-15T00:00:00.000Z'),
            status: 'Done',
            owner: 'PMO',
            description: 'Подтверждение архитектурного решения и интеграционных принципов.',
          },
          {
            title: 'UAT старт',
            dueDate: new Date('2026-05-22T00:00:00.000Z'),
            status: 'At Risk',
            owner: 'QA Lead',
            description: 'Старт пользовательского тестирования зависит от решения по API SLA.',
          },
          {
            title: 'Go/No-Go',
            dueDate: new Date('2026-05-30T00:00:00.000Z'),
            status: 'Planned',
            owner: 'Sponsor',
            description: 'Решение по готовности к следующей фазе.',
          },
        ],
      },
      overviews: {
        create: {
          version: 1,
          status: 'GENERATED',
          generatedAt: new Date('2026-05-13T11:45:00.000Z'),
          executiveSummary:
            'ERP rollout находится в статусе At Risk: плановый бизнес-результат сохраняется, но требуется решение по временному контуру обмена данными из-за неподтвержденного SLA внешнего API.',
          decisions: [
            {
              title: 'Утвердить workaround обмена данными',
              impactIfApproved: 'Сохраняет UAT в мае с отклонением +12 дней',
              impactIfDelayed: 'Рост задержки до 20+ дней',
              deadline: '2026-05-17',
            },
          ],
          evidence: [
            { metric: 'Schedule variance', source: 'Gantt snapshot #223' },
            { metric: 'Budget forecast', source: 'Finance actuals 2026-05-12' },
            { metric: 'Critical blocker', source: 'Jira ERP-1842' },
          ],
        },
      },
    },
  });

  const additionalUnits = await Promise.all([
    { code: 'bu-2', name: 'BU_2' }, { code: 'bu-3', name: 'BU_3' },
  ].map((unit) => prisma.businessUnit.upsert({ where: { code: unit.code }, update: {}, create: { code: unit.code, name: unit.name } })));
  const additionalProjects = await Promise.all([
    { unit: additionalUnits[0], code: 'BU2-CRM', name: 'CRM трансформация', sponsor: 'CCO', manager: 'Анна Орлова', status: 'ACTIVE' as const, rag: 'GREEN' as const, start: '2026-05-01', target: '2026-11-30', progress: 48, variance: 0, budget: '42000000.00', forecast: '41500000.00', summary: 'Демо-проект клиентского контура с устойчивым графиком.' },
    { unit: additionalUnits[0], code: 'BU2-DATA', name: 'Единая витрина данных', sponsor: 'CFO', manager: 'Елена Волкова', status: 'ON_HOLD' as const, rag: 'RED' as const, start: '2026-02-15', target: '2027-01-31', progress: 22, variance: 34, budget: '68000000.00', forecast: '79000000.00', summary: 'Проект остановлен до решения по качеству исходных данных.' },
    { unit: additionalUnits[1], code: 'BU3-DEVICE', name: 'Платформа устройств', sponsor: 'CTO', manager: 'Михаил Соколов', status: 'ACTIVE' as const, rag: 'AMBER' as const, start: '2026-07-01', target: '2026-12-15', progress: 61, variance: 9, budget: '51000000.00', forecast: '54800000.00', summary: 'Развитие платформы устройств и интеграционного API.' },
    { unit: additionalUnits[1], code: 'BU3-OPS', name: 'Операционная аналитика', sponsor: 'COO', manager: 'Ольга Лебедева', status: 'DRAFT' as const, rag: 'GREEN' as const, start: '2026-10-01', target: '2027-03-31', progress: 5, variance: 0, budget: '19000000.00', forecast: '19000000.00', summary: 'Подготовка операционной модели и набора метрик.' },
  ].map((item) => prisma.project.upsert({ where: { code: item.code }, update: { businessUnitId: item.unit.id, portfolio: item.unit.name, sponsor: item.sponsor, projectManager: item.manager, status: item.status, rag: item.rag, startDate: new Date(item.start), initialTargetDate: new Date(item.target), targetDate: new Date(item.target), progress: item.progress, scheduleVariance: item.variance, budgetPlanned: item.budget, budgetForecast: item.forecast, summary: item.summary, parentId: null }, create: { businessUnitId: item.unit.id, code: item.code, name: item.name, portfolio: item.unit.name, sponsor: item.sponsor, projectManager: item.manager, status: item.status, rag: item.rag, startDate: new Date(item.start), initialTargetDate: new Date(item.target), targetDate: new Date(item.target), progress: item.progress, scheduleVariance: item.variance, budgetPlanned: item.budget, budgetForecast: item.forecast, summary: item.summary } })));

  // Rich deterministic fixture for public review: all WBS statuses, dates,
  // dependencies, milestones/goals, RAID variants and issue states.
  for (const demoProject of [...extraTestProjects, project, ...additionalProjects]) {
    const existingWbsCount = await prisma.wbsItem.count({ where: { projectId: demoProject.id } });
    if (existingWbsCount > 0) continue;
    const phase = await prisma.wbsItem.create({ data: { projectId: demoProject.id, code: '1', title: 'Демо-фаза реализации', type: 'PHASE', status: 'IN_PROGRESS', owner: demoProject.projectManager, startDate: new Date('2026-08-03'), dueDate: new Date('2026-11-30'), wbsLevel: 1, sortOrder: 1 } });
    const workPackage = await prisma.wbsItem.create({ data: { projectId: demoProject.id, parentId: phase.id, code: '1.1', title: 'Пакет работ демонстрации', type: 'WORK_PACKAGE', status: 'AT_RISK', owner: 'Команда проекта', startDate: new Date('2026-08-03'), dueDate: new Date('2026-11-30'), wbsLevel: 2, sortOrder: 2 } });
    const statuses = ['DONE', 'IN_PROGRESS', 'IN_REVIEW', 'AT_RISK', 'BLOCKED', 'NOT_STARTED', 'CANCELLED'] as const;
    const dates = ['2026-08-14', '2026-09-12', '2026-09-16', '2026-09-10', '2026-10-02', '2026-10-20', '2026-09-01'];
    const tasks = [];
    for (let i = 0; i < statuses.length; i += 1) {
      tasks.push(await prisma.wbsItem.create({ data: { projectId: demoProject.id, parentId: workPackage.id, code: '1.1.' + (i + 1), title: 'Демо-задача ' + statuses[i], type: i === 2 ? 'DELIVERABLE' : 'TASK', status: statuses[i], owner: ['Иванов', 'Петров', 'Сидорова'][i % 3], startDate: new Date(dates[i]), dueDate: new Date(dates[i]), wbsLevel: 3, sortOrder: 10 + i, predecessor1: i > 0 ? '1.1.' + i : null, progress: statuses[i] === 'DONE' ? 100 : statuses[i] === 'IN_PROGRESS' ? 55 : 0, effortPercent: 50 + (i % 3) * 25, priority: ['Low', 'Medium', 'High', 'Critical', 'High', 'Medium', 'Low'][i] } }));
    }
    await prisma.wbsItem.createMany({ data: [
      { projectId: demoProject.id, parentId: phase.id, code: '1.2', title: 'Цель: готовность к запуску', type: 'GOAL', status: 'NOT_STARTED', owner: demoProject.projectManager, startDate: new Date('2026-10-01'), dueDate: new Date('2026-11-30'), wbsLevel: 2, sortOrder: 30 },
      { projectId: demoProject.id, parentId: phase.id, code: '1.3', title: 'Веха: архитектура утверждена', type: 'MILESTONE', status: 'DONE', owner: 'Архитектура', startDate: new Date('2026-08-28'), dueDate: new Date('2026-08-28'), wbsLevel: 2, sortOrder: 31 },
      { projectId: demoProject.id, parentId: phase.id, code: '1.4', title: 'Веха: UAT старт', type: 'MILESTONE', status: 'AT_RISK', owner: 'QA Lead', startDate: new Date('2026-09-22'), dueDate: new Date('2026-09-22'), wbsLevel: 2, sortOrder: 32 },
      { projectId: demoProject.id, parentId: phase.id, code: '1.5', title: 'Цель: закрытие пилота', type: 'GOAL', status: 'DONE', owner: 'Sponsor', startDate: new Date('2026-07-01'), dueDate: new Date('2026-08-31'), wbsLevel: 2, sortOrder: 33 },
    ] });
    for (let i = 1; i < tasks.length; i += 1) await prisma.wbsDependency.create({ data: { projectId: demoProject.id, predecessorId: tasks[i - 1].id, successorId: tasks[i].id, type: i % 3 === 0 ? 'SS' : i % 3 === 1 ? 'FS' : 'FF', lagDays: i - 2 } });
    for (const [type, title, status, score, dueDate] of [['RISK', 'Высокий риск поставки', 'OPEN', 20, '2026-09-20'], ['RISK', 'Риск качества данных', 'IN_PROGRESS', 12, '2026-10-05'], ['DEPENDENCY', 'Зависимость от внешнего API', 'BREACHED', 25, '2026-09-10'], ['ASSUMPTION', 'Допущение по доступности команды', 'MITIGATED', 4, '2026-08-20'], ['ASSUMPTION', 'Допущение по тестовым данным', 'VALIDATED', 2, '2026-09-01']] as const) await prisma.raidItem.create({ data: { projectId: demoProject.id, type, title, description: 'Демо-запись для проверки всех вариантов', owner: demoProject.projectManager, status, probability: Math.min(score, 5), impact: Math.min(score, 5), riskScore: score, dueDate: new Date(dueDate), decisionRequired: score >= 15, mitigationPlan: 'Контрольный план' } });
    for (const [source, title, severity, status, dueDate] of [['INTERNAL', 'Критический вопрос по сроку', 'CRITICAL', 'Open', '2026-09-12'], ['JIRA', 'Вопрос по интеграции', 'HIGH', 'In Progress', '2026-09-25'], ['INTERNAL', 'Нужно подтвердить владельца', 'MEDIUM', 'Resolved', '2026-08-20'], ['JIRA', 'Закрытый вопрос пилота', 'LOW', 'Closed', '2026-08-31']] as const) await prisma.issue.create({ data: { projectId: demoProject.id, source, title, severity, status, owner: demoProject.projectManager, impact: 'Влияние на демонстрационную выборку', decisionRequired: severity === 'CRITICAL', dueDate: new Date(dueDate) } });
  }

  console.log(
    `Seeded projects ${[...extraTestProjects.map((item) => item.code), project.code, ...additionalProjects.map((item) => item.code)].join(', ')}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
