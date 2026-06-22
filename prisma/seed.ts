import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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
          parentId: null,
          name: item.name,
          portfolio: 'Project Management',
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
          code: item.code,
          name: item.name,
          portfolio: 'Project Management',
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
      parentId: null,
      sortOrder: 10,
    },
    create: {
      parentId: null,
      code: 'ERP',
      name: 'ERP rollout',
      portfolio: 'Digital Transformation',
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
          baseUrl: 'https://example.atlassian.net',
          boardUrl: 'https://example.atlassian.net/jira/software/projects/ERP/boards/12',
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
            jiraTicketUrl: 'https://example.atlassian.net/browse/ERP-1842',
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
            jiraTicketUrl: 'https://example.atlassian.net/browse/ERP-1842',
            jiraLinks: {
              create: [
                {
                  jiraKey: 'ERP-1842',
                  jiraUrl: 'https://example.atlassian.net/browse/ERP-1842',
                },
                {
                  jiraKey: 'ERP-1843',
                  jiraUrl: 'https://example.atlassian.net/browse/ERP-1843',
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
            jiraTicketUrl: 'https://example.atlassian.net/browse/ERP-1901',
            jiraLinks: {
              create: [
                {
                  jiraKey: 'ERP-1901',
                  jiraUrl: 'https://example.atlassian.net/browse/ERP-1901',
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
            issueUrl: 'https://example.atlassian.net/browse/ERP-1842',
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
            issueUrl: 'https://example.atlassian.net/browse/ERP-1877',
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
            issueUrl: 'https://example.atlassian.net/browse/ERP-1901',
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

  console.log(
    `Seeded projects ${[...extraTestProjects.map((item) => item.code), project.code].join(', ')}`,
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
