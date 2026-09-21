import { completeDemoData } from '../apps/api/src/demo/complete.js';
import { fillProjectSections } from '../apps/api/src/demo/sections.js';
import { Prisma, PrismaClient } from '@prisma/client';
import { isPublicDemoMode } from '../apps/api/src/server/deployment-profile.js';

// This seed upserts fixed project codes (ERP, BU2-*, BU3-*, TEST-*) with a
// populated update block, so running it against an installation that happens to
// use one of those codes would overwrite real rows. Refuse anywhere but the
// cloud demo: seeding a corporate database is never the intended outcome.
//
// The check matches what `completeDemoData` demands further down, so an
// incomplete configuration fails here instead of part way through the upserts.
// To seed locally:
//   DEPLOYMENT_PROFILE=cloud PUBLIC_DEMO_MODE=true SEED_DEMO_DATA=true npm run prisma:seed
if (!isPublicDemoMode() || process.env.SEED_DEMO_DATA !== 'true') {
  throw new Error(
    'Demo seed requires DEPLOYMENT_PROFILE=cloud, PUBLIC_DEMO_MODE=true and SEED_DEMO_DATA=true. ' +
      `Received DEPLOYMENT_PROFILE=${process.env.DEPLOYMENT_PROFILE ?? '<unset>'}, ` +
      `PUBLIC_DEMO_MODE=${process.env.PUBLIC_DEMO_MODE ?? '<unset>'}, ` +
      `SEED_DEMO_DATA=${process.env.SEED_DEMO_DATA ?? '<unset>'}.`,
  );
}

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
      name: 'Second test project',
      sponsor: 'CIO',
      projectManager: 'Petrov P.P.',
      rag: 'AMBER' as const,
      progress: 35,
      scheduleVariance: 5,
      sortOrder: 20,
      budgetPlanned: '18000000.00',
      budgetForecast: '19200000.00',
      startDate: '2026-06-01T00:00:00.000Z',
      targetDate: '2026-10-15T00:00:00.000Z',
      summary: 'Test project with moderate schedule risks and a scope that is still being refined.',
    },
    {
      code: 'TEST-003',
      name: 'Third test project',
      sponsor: 'COO',
      projectManager: 'Sidorova M.M.',
      rag: 'GREEN' as const,
      progress: 72,
      scheduleVariance: -3,
      sortOrder: 30,
      budgetPlanned: '24000000.00',
      budgetForecast: '23100000.00',
      startDate: '2026-03-10T00:00:00.000Z',
      targetDate: '2026-07-30T00:00:00.000Z',
      summary: 'Test project running ahead of baseline and suitable for checking the Green status.',
    },
    {
      code: 'TEST-004',
      name: 'Fourth test project',
      sponsor: 'CFO',
      projectManager: 'Kuznetsov I.I.',
      rag: 'RED' as const,
      progress: 18,
      scheduleVariance: 21,
      sortOrder: 40,
      budgetPlanned: '32000000.00',
      budgetForecast: '38900000.00',
      startDate: '2026-04-20T00:00:00.000Z',
      targetDate: '2026-12-20T00:00:00.000Z',
      summary: 'Test project in critical status for checking status switching and the executive overview.',
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
      projectManager: 'Ivanov A.A.',
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
        'The project keeps its business goal but requires a decision on the external API SLA and the temporary data exchange environment.',
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
            title: 'Agree the API workaround',
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
            title: 'Prepare the decision for the steering committee',
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
            title: 'ERP-1842: API SLA not confirmed',
            severity: 'CRITICAL',
            status: 'Open',
            owner: 'Vendor',
            impact: '+12 days to UAT, +4.2M to forecast',
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
            title: 'No access to the test environment',
            severity: 'HIGH',
            status: 'Open',
            owner: 'IT Ops',
            impact: 'Risk of delaying the HR environment integration tests',
            dueDate: new Date('2026-05-16T00:00:00.000Z'),
          },
          {
            source: 'JIRA',
            title: 'ERP-1901: reference data migration blocked',
            severity: 'HIGH',
            status: 'Open',
            owner: 'Data Lead',
            impact: 'May block the UAT start',
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
            summary: 'API SLA not confirmed by the vendor',
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
            summary: 'HR integration tests',
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
            summary: 'Reference data migration blocked',
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
            title: 'Architecture board',
            dueDate: new Date('2026-05-15T00:00:00.000Z'),
            status: 'Done',
            owner: 'PMO',
            description: 'Confirmation of the architecture decision and the integration principles.',
          },
          {
            title: 'UAT start',
            dueDate: new Date('2026-05-22T00:00:00.000Z'),
            status: 'At Risk',
            owner: 'QA Lead',
            description: 'The user acceptance testing start depends on the API SLA decision.',
          },
          {
            title: 'Go/No-Go',
            dueDate: new Date('2026-05-30T00:00:00.000Z'),
            status: 'Planned',
            owner: 'Sponsor',
            description: 'Decision on readiness for the next phase.',
          },
        ],
      },
      overviews: {
        create: {
          version: 1,
          status: 'GENERATED',
          generatedAt: new Date('2026-05-13T11:45:00.000Z'),
          executiveSummary:
            'ERP rollout is At Risk: the planned business outcome still holds, but a decision on the temporary data exchange environment is required because the external API SLA is not confirmed.',
          decisions: [
            {
              title: 'Approve the data exchange workaround',
              impactIfApproved: 'Keeps UAT in May with a +12 day variance',
              impactIfDelayed: 'Delay grows to 20+ days',
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
    { unit: additionalUnits[0], code: 'BU2-CRM', name: 'CRM transformation', sponsor: 'CCO', manager: 'Anna Orlova', status: 'ACTIVE' as const, rag: 'GREEN' as const, start: '2026-05-01', target: '2026-11-30', progress: 48, variance: 0, budget: '42000000.00', forecast: '41500000.00', summary: 'Demo project for the customer domain with a stable schedule.' },
    { unit: additionalUnits[0], code: 'BU2-DATA', name: 'Issue list', sponsor: 'CFO', manager: 'Elena Volkova', status: 'ON_HOLD' as const, rag: 'RED' as const, start: '2026-02-15', target: '2027-01-31', progress: 22, variance: 34, budget: '68000000.00', forecast: '79000000.00', summary: 'The project is on hold until the source data quality decision is made.' },
    { unit: additionalUnits[1], code: 'BU3-DEVICE', name: 'Device platform', sponsor: 'CTO', manager: 'Mikhail Sokolov', status: 'ACTIVE' as const, rag: 'AMBER' as const, start: '2026-07-01', target: '2026-12-15', progress: 61, variance: 9, budget: '51000000.00', forecast: '54800000.00', summary: 'Development of the device platform and the integration API.' },
    { unit: additionalUnits[1], code: 'BU3-OPS', name: 'Operational analytics', sponsor: 'COO', manager: 'Olga Lebedeva', status: 'DRAFT' as const, rag: 'GREEN' as const, start: '2026-10-01', target: '2027-03-31', progress: 5, variance: 0, budget: '19000000.00', forecast: '19000000.00', summary: 'Preparation of the operating model and the metric set.' },
  ].map((item) => prisma.project.upsert({ where: { code: item.code }, update: { businessUnitId: item.unit.id, portfolio: item.unit.name, sponsor: item.sponsor, projectManager: item.manager, status: item.status, rag: item.rag, startDate: new Date(item.start), initialTargetDate: new Date(item.target), targetDate: new Date(item.target), progress: item.progress, scheduleVariance: item.variance, budgetPlanned: item.budget, budgetForecast: item.forecast, summary: item.summary, parentId: null }, create: { businessUnitId: item.unit.id, code: item.code, name: item.name, portfolio: item.unit.name, sponsor: item.sponsor, projectManager: item.manager, status: item.status, rag: item.rag, startDate: new Date(item.start), initialTargetDate: new Date(item.target), targetDate: new Date(item.target), progress: item.progress, scheduleVariance: item.variance, budgetPlanned: item.budget, budgetForecast: item.forecast, summary: item.summary } })));

  // TEST-001 is created by the project hierarchy migration rather than by this
  // seed, but it belongs to the same demo fixture and needs the same sections.
  const migrationProject = await prisma.project.findUnique({ where: { code: 'TEST-001' } });
  const seededProjects = [...extraTestProjects, project, ...additionalProjects, ...(migrationProject ? [migrationProject] : [])];

  // Rich deterministic fixture for public review: all WBS statuses, dates,
  // dependencies, milestones/goals, RAID variants and issue states.
  for (const demoProject of seededProjects) {
    const existingWbsCount = await prisma.wbsItem.count({ where: { projectId: demoProject.id } });
    if (existingWbsCount > 0) continue;
    const phase = await prisma.wbsItem.create({ data: { projectId: demoProject.id, code: '1', title: 'Demo delivery phase', type: 'PHASE', status: 'IN_PROGRESS', owner: demoProject.projectManager, startDate: new Date('2026-08-03'), dueDate: new Date('2026-11-30'), wbsLevel: 1, sortOrder: 1 } });
    const workPackage = await prisma.wbsItem.create({ data: { projectId: demoProject.id, parentId: phase.id, code: '1.1', title: 'Demo work package', type: 'WORK_PACKAGE', status: 'AT_RISK', owner: 'Project team', startDate: new Date('2026-08-03'), dueDate: new Date('2026-11-30'), wbsLevel: 2, sortOrder: 2 } });
    const statuses = ['DONE', 'IN_PROGRESS', 'IN_REVIEW', 'AT_RISK', 'BLOCKED', 'NOT_STARTED', 'CANCELLED'] as const;
    const dates = ['2026-08-14', '2026-09-12', '2026-09-16', '2026-09-10', '2026-10-02', '2026-10-20', '2026-09-01'];
    const tasks = [];
    for (let i = 0; i < statuses.length; i += 1) {
      tasks.push(await prisma.wbsItem.create({ data: { projectId: demoProject.id, parentId: workPackage.id, code: '1.1.' + (i + 1), title: 'Demo task ' + statuses[i], type: i === 2 ? 'DELIVERABLE' : 'TASK', status: statuses[i], owner: ['Ivanov', 'Petrov', 'Sidorova'][i % 3], startDate: new Date(dates[i]), dueDate: new Date(dates[i]), wbsLevel: 3, sortOrder: 10 + i, predecessor1: i > 0 ? '1.1.' + i : null, progress: statuses[i] === 'DONE' ? 100 : statuses[i] === 'IN_PROGRESS' ? 55 : 0, effortPercent: 50 + (i % 3) * 25, priority: ['Low', 'Medium', 'High', 'Critical', 'High', 'Medium', 'Low'][i] } }));
    }
    await prisma.wbsItem.createMany({ data: [
      { projectId: demoProject.id, parentId: phase.id, code: '1.2', title: 'Goal: launch readiness', type: 'GOAL', status: 'NOT_STARTED', owner: demoProject.projectManager, startDate: new Date('2026-10-01'), dueDate: new Date('2026-11-30'), wbsLevel: 2, sortOrder: 30 },
      { projectId: demoProject.id, parentId: phase.id, code: '1.3', title: 'Milestone: architecture approved', type: 'MILESTONE', status: 'DONE', owner: 'Architecture', startDate: new Date('2026-08-28'), dueDate: new Date('2026-08-28'), wbsLevel: 2, sortOrder: 31 },
      { projectId: demoProject.id, parentId: phase.id, code: '1.4', title: 'Milestone: UAT start', type: 'MILESTONE', status: 'AT_RISK', owner: 'QA Lead', startDate: new Date('2026-09-22'), dueDate: new Date('2026-09-22'), wbsLevel: 2, sortOrder: 32 },
      { projectId: demoProject.id, parentId: phase.id, code: '1.5', title: 'Goal: pilot closure', type: 'GOAL', status: 'DONE', owner: 'Sponsor', startDate: new Date('2026-07-01'), dueDate: new Date('2026-08-31'), wbsLevel: 2, sortOrder: 33 },
    ] });
    for (let i = 1; i < tasks.length; i += 1) await prisma.wbsDependency.create({ data: { projectId: demoProject.id, predecessorId: tasks[i - 1].id, successorId: tasks[i].id, type: i % 3 === 0 ? 'SS' : i % 3 === 1 ? 'FS' : 'FF', lagDays: i - 2 } });
    // Additional phases make the demo useful for hierarchy, Gantt and dependency reviews.
    for (let p = 2; p <= 4; p += 1) {
      const phaseDates = [['2026-10-01', '2026-11-28'], ['2026-11-01', '2026-12-28'], ['2026-12-01', '2027-01-28']][p - 2];
      const extraPhase = await prisma.wbsItem.create({ data: { projectId: demoProject.id, code: `${p}`, title: ['Build and integration', 'Validation and pilot', 'Release and handover'][p - 2], type: 'PHASE', status: p === 2 ? 'IN_PROGRESS' : 'NOT_STARTED', owner: demoProject.projectManager, startDate: new Date(phaseDates[0]), dueDate: new Date(phaseDates[1]), wbsLevel: 1, sortOrder: p * 100 } });
      for (let w = 1; w <= 2; w += 1) {
        const extraPackage = await prisma.wbsItem.create({ data: { projectId: demoProject.id, parentId: extraPhase.id, code: `${p}.${w}`, title: `${extraPhase.title} package ${w}`, type: 'WORK_PACKAGE', status: w === 1 ? 'IN_PROGRESS' : 'NOT_STARTED', owner: 'Project team', startDate: extraPhase.startDate, dueDate: extraPhase.dueDate, wbsLevel: 2, sortOrder: p * 100 + w } });
        for (let t = 1; t <= 4; t += 1) await prisma.wbsItem.create({ data: { projectId: demoProject.id, parentId: extraPackage.id, code: `${p}.${w}.${t}`, title: `${extraPhase.title} task ${w}.${t}`, type: t === 4 ? 'DELIVERABLE' : 'TASK', status: t === 1 ? 'DONE' : t === 2 ? 'IN_PROGRESS' : 'NOT_STARTED', owner: ['Ivanov', 'Petrov', 'Sidorova', 'Kuznetsov'][t - 1], startDate: extraPhase.startDate, dueDate: extraPhase.dueDate, wbsLevel: 3, sortOrder: p * 100 + w * 10 + t, progress: t === 1 ? 100 : t === 2 ? 45 : 0, effortPercent: 50 + t * 10, priority: t === 4 ? 'Critical' : 'Medium' } });
      }
    }
    for (const [type, title, status, score, dueDate] of [['RISK', 'High delivery risk', 'OPEN', 20, '2026-09-20'], ['RISK', 'Data quality risk', 'IN_PROGRESS', 12, '2026-10-05'], ['DEPENDENCY', 'Dependency on an external API', 'BREACHED', 25, '2026-09-10'], ['ASSUMPTION', 'Assumption about team availability', 'MITIGATED', 4, '2026-08-20'], ['ASSUMPTION', 'Assumption about test data', 'VALIDATED', 2, '2026-09-01']] as const) await prisma.raidItem.create({ data: { projectId: demoProject.id, type, title, description: 'Demo record for checking all variants', owner: demoProject.projectManager, status, probability: Math.min(score, 5), impact: Math.min(score, 5), riskScore: score, dueDate: new Date(dueDate), decisionRequired: score >= 15, mitigationPlan: 'Control plan' } });
    for (const [source, title, severity, status, dueDate] of [['INTERNAL', 'Critical schedule issue', 'CRITICAL', 'Open', '2026-09-12'], ['JIRA', 'Integration issue', 'HIGH', 'In Progress', '2026-09-25'], ['INTERNAL', 'Issue owner needs to be confirmed', 'MEDIUM', 'Resolved', '2026-08-20'], ['JIRA', 'Closed pilot issue', 'LOW', 'Closed', '2026-08-31']] as const) await prisma.issue.create({ data: { projectId: demoProject.id, source, title, severity, status, owner: demoProject.projectManager, impact: 'Impact on the demo dataset', decisionRequired: severity === 'CRITICAL', dueDate: new Date(dueDate) } });
  }

  // Every project menu section gets demo content. Idempotent: deterministic IDs,
  // upserts only, and existing rows are preserved. No Jira request is made here.
  for (const demoProject of seededProjects) {
    await fillProjectSections(prisma, await prisma.project.findUniqueOrThrow({ where: { id: demoProject.id } }));
  }

  if (process.env.SEED_DEMO_DATA === 'true') await completeDemoData(prisma);

  console.log(`Seeded projects ${seededProjects.map((item) => item.code).join(', ')}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
