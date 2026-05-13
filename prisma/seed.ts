import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.upsert({
    where: { code: 'ERP' },
    update: {},
    create: {
      code: 'ERP',
      name: 'ERP rollout',
      portfolio: 'Digital Transformation',
      sponsor: 'CFO',
      projectManager: 'Иванов А.А.',
      rag: 'AMBER',
      startDate: new Date('2026-02-01T00:00:00.000Z'),
      targetDate: new Date('2026-09-30T00:00:00.000Z'),
      budgetPlanned: '120000000.00',
      budgetForecast: '127000000.00',
      scheduleVariance: 12,
      progress: 65,
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

  const wbsCount = await prisma.wbsItem.count({
    where: { projectId: project.id },
  });

  if (wbsCount === 0) {
    const initiation = await prisma.wbsItem.create({
      data: {
        projectId: project.id,
        code: '1',
        title: 'Project initiation',
        type: 'PHASE',
        status: 'DONE',
        owner: 'PMO',
        startDate: new Date('2026-02-01T00:00:00.000Z'),
        dueDate: new Date('2026-02-15T00:00:00.000Z'),
        plannedCost: '6000000.00',
        forecastCost: '5800000.00',
        progress: 100,
        sortOrder: 10,
        description: 'Charter, governance, baseline scope and delivery model.',
      },
    });

    const delivery = await prisma.wbsItem.create({
      data: {
        projectId: project.id,
        code: '2',
        title: 'Solution delivery',
        type: 'PHASE',
        status: 'IN_PROGRESS',
        owner: 'Delivery Lead',
        startDate: new Date('2026-02-16T00:00:00.000Z'),
        dueDate: new Date('2026-06-30T00:00:00.000Z'),
        plannedCost: '68000000.00',
        forecastCost: '72500000.00',
        progress: 62,
        sortOrder: 20,
        description: 'Configuration, integrations, migration and testing work packages.',
      },
    });

    const readiness = await prisma.wbsItem.create({
      data: {
        projectId: project.id,
        code: '3',
        title: 'Go-live readiness',
        type: 'PHASE',
        status: 'AT_RISK',
        owner: 'PM',
        startDate: new Date('2026-07-01T00:00:00.000Z'),
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        plannedCost: '46000000.00',
        forecastCost: '48700000.00',
        progress: 18,
        sortOrder: 30,
        description: 'UAT completion, cutover, training and go-live governance.',
      },
    });

    await prisma.wbsItem.createMany({
      data: [
        {
          projectId: project.id,
          parentId: initiation.id,
          code: '1.1',
          title: 'Project charter approved',
          type: 'DELIVERABLE',
          status: 'DONE',
          owner: 'Sponsor',
          startDate: new Date('2026-02-01T00:00:00.000Z'),
          dueDate: new Date('2026-02-07T00:00:00.000Z'),
          plannedCost: '1500000.00',
          forecastCost: '1400000.00',
          progress: 100,
          sortOrder: 11,
          description: 'Scope, success criteria and governance model signed off.',
        },
        {
          projectId: project.id,
          parentId: delivery.id,
          code: '2.1',
          title: 'Integration work package',
          type: 'WORK_PACKAGE',
          status: 'BLOCKED',
          owner: 'Integration Lead',
          startDate: new Date('2026-03-01T00:00:00.000Z'),
          dueDate: new Date('2026-05-20T00:00:00.000Z'),
          plannedCost: '18000000.00',
          forecastCost: '22200000.00',
          progress: 58,
          jiraTicketKey: 'ERP-1842',
          jiraTicketUrl: 'https://example.atlassian.net/browse/ERP-1842',
          sortOrder: 21,
          description: 'External API integration and workaround for unconfirmed SLA.',
        },
        {
          projectId: project.id,
          parentId: delivery.id,
          code: '2.2',
          title: 'Data migration package',
          type: 'WORK_PACKAGE',
          status: 'AT_RISK',
          owner: 'Data Lead',
          startDate: new Date('2026-03-15T00:00:00.000Z'),
          dueDate: new Date('2026-05-24T00:00:00.000Z'),
          plannedCost: '16000000.00',
          forecastCost: '17100000.00',
          progress: 64,
          jiraTicketKey: 'ERP-1901',
          jiraTicketUrl: 'https://example.atlassian.net/browse/ERP-1901',
          sortOrder: 22,
          description: 'Reference data migration and reconciliation.',
        },
        {
          projectId: project.id,
          parentId: readiness.id,
          code: '3.1',
          title: 'UAT completion',
          type: 'DELIVERABLE',
          status: 'AT_RISK',
          owner: 'QA Lead',
          startDate: new Date('2026-05-22T00:00:00.000Z'),
          dueDate: new Date('2026-06-14T00:00:00.000Z'),
          plannedCost: '9000000.00',
          forecastCost: '9800000.00',
          progress: 12,
          sortOrder: 31,
          description: 'User acceptance testing completion with signed defects triage.',
        },
      ],
    });
  }

  console.log(`Seeded project ${project.code}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
