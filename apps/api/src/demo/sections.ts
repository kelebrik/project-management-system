import { createHash } from 'node:crypto';
import type { Prisma, Project } from '@prisma/client';
import { dateAt, owners } from './project.js';

// Guarantees every project menu section holds demo content for a seeded project.
// Deterministic IDs and upserts keep repeated seeding idempotent, and existing
// user rows are never replaced. Jira rows are synthetic records written to this
// application's database only: this fixture makes no Jira request.
export const SECTION_MINIMUM = 4;

const seedId = (projectId: string, key: string) =>
  `seed-${createHash('sha256').update(`${projectId}:${key}`).digest('hex').slice(0, 32)}`;
// A fixed anchor keeps the unique calendar-override dates stable across runs.
const anchor = new Date('2026-09-01T00:00:00.000Z');
const jiraKeyPrefix = (code: string) => code.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'DEMO';

type SeedKey = (key: string) => string;

export async function fillProjectSections(tx: Prisma.TransactionClient, project: Project) {
  const id: SeedKey = (key) => seedId(project.id, key);
  await fillJiraWork(tx, project, id);
  await fillCharter(tx, project, id);
  await fillRequirements(tx, project, id);
  await fillRegisters(tx, project, id);
  await fillChangesAndCalendar(tx, project, id);
  await fillArtifactsAndSchedule(tx, project, id);
  await fillOverview(tx, project, id);
  await fillBaseline(tx, project, id);
}

const jiraSections = ['Development', 'Testing', 'Release', 'Operations readiness'];
const jiraIssues = [
  { summary: 'Agree the integration contract with the vendor', issueType: 'Story', priority: 'Medium', status: 'Done' },
  { summary: 'Fix the reference data import failure', issueType: 'Bug', priority: 'High', status: 'In Progress' },
  { summary: 'Automate the regression suite for the release', issueType: 'Task', priority: 'Medium', status: 'In Progress' },
  { summary: 'Confirm the response time budget under peak load', issueType: 'Task', priority: 'High', status: 'Open' },
  { summary: 'Remove the blocker on the pilot environment', issueType: 'Bug', priority: 'Critical', status: 'Blocked' },
  { summary: 'Publish the operations runbook', issueType: 'Story', priority: 'Low', status: 'Done' },
];

async function fillJiraWork(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  const key = jiraKeyPrefix(project.code);
  await tx.jiraIntegration.upsert({
    where: { projectId: project.id },
    update: {},
    create: {
      projectId: project.id, baseUrl: 'https://jira.example',
      boardUrl: `https://jira.example/jira/software/projects/${key}/boards/1`,
      projectKey: key, issuesJql: `project = ${key} ORDER BY updated DESC`,
      openIssuesJql: `project = ${key} AND statusCategory != Done ORDER BY updated DESC`,
      syncStatus: 'SEEDED', lastSyncedAt: anchor,
    },
  });
  const sections = [];
  for (const [index, title] of jiraSections.entries()) {
    sections.push(await tx.jiraWorkSection.upsert({
      where: { projectId_sortOrder: { projectId: project.id, sortOrder: index } },
      update: {}, create: { projectId: project.id, sortOrder: index, title, jql: '' },
    }));
  }
  for (const [n, item] of jiraIssues.entries()) {
    const issueKey = `${key}-${9001 + n}`;
    const resolved = item.status === 'Done';
    const snapshot = await tx.jiraIssueSnapshot.upsert({
      where: { projectId_issueKey: { projectId: project.id, issueKey } },
      update: {},
      create: {
        id: id(`jira-snapshot-${n}`), projectId: project.id, issueKey,
        issueUrl: `https://jira.example/browse/${issueKey}`, summary: `${item.summary} (seed)`,
        issueType: item.issueType, priority: item.priority, status: item.status,
        assignee: owners[n % owners.length], reporter: project.projectManager,
        labels: ['seed-fixture', 'demo'], resolution: resolved ? 'Done' : null,
        resolutionAt: resolved ? dateAt(-4 + n, anchor) : null,
        issueCreatedAt: dateAt(-30 + n * 3, anchor), sprint: 'Seed Sprint 1',
        updatedAt: dateAt(-1, anchor), syncedAt: anchor,
      },
    });
    await tx.jiraWorkSectionIssue.upsert({
      where: { sectionId_snapshotId: { sectionId: sections[n % sections.length].id, snapshotId: snapshot.id } },
      update: {}, create: { sectionId: sections[n % sections.length].id, snapshotId: snapshot.id },
    });
  }
}

async function fillCharter(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  const uiState = project.uiState && typeof project.uiState === 'object' && !Array.isArray(project.uiState)
    ? project.uiState as Prisma.JsonObject : {};
  const rows = Array.isArray(uiState.passportRows)
    ? uiState.passportRows.filter((row): row is Prisma.JsonObject =>
      row !== null && typeof row === 'object' && !Array.isArray(row)) : [];
  const fields: Array<[string, string]> = [
    ['Sponsor', project.sponsor], ['Project manager', project.projectManager],
    ['Business goal', 'Deliver the agreed scope without changing the approved business outcome.'],
    ['Project scope', 'Design, development, integration testing, pilot and handover to operations.'],
    ['Success criteria', 'All goals accepted, no open critical defects, agreed service levels met.'],
    ['Constraints', 'Approved budget and a dedicated team of six specialists.'],
    ['Key stakeholders', 'Steering committee, PMO, delivery team, operations.'],
    ['Reporting cadence', 'Weekly status report and a monthly steering committee review.'],
  ];
  // Preserve rows the user already filled in; add only the missing charter fields.
  fields.forEach(([field, description], index) => {
    const existing = rows.findIndex((row) => row.field === field);
    if (existing < 0) rows.push({ id: id(`passport-${index}`), field, description });
    else if (!rows[existing].description) rows[existing] = { ...rows[existing], description };
  });
  await tx.project.update({ where: { id: project.id }, data: { uiState: { ...uiState, passportRows: rows } } });
}

const requirementColumns = [
  { id: 'id', title: 'ID' }, { id: 'requirement', title: 'Business requirement' },
  { id: 'priority', title: 'Priority' }, { id: 'status', title: 'Status' }, { id: 'comment', title: 'Comment' },
];
const requirementTitles = [
  'Single sign-on for all internal users', 'Service availability of 99.9% during business hours',
  'Response time within 500 ms for the top ten operations', 'Role-based access control with an approval route',
  'Committee report export in a shareable format', 'Full change history retained for twelve months',
];

async function fillRequirements(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  const record = await tx.projectBusinessRequirements.findUnique({ where: { projectId: project.id } });
  const columns = (record?.columns ?? requirementColumns) as Array<{ id: string; title: string }>;
  const rows = (record?.rows ?? []) as Array<{ id: string; cells: Record<string, string> }>;
  const additions = requirementTitles.map((requirement, n) => ({
    id: id(`requirement-${n}`),
    cells: Object.fromEntries(columns.map((column) => {
      const title = `${column.id} ${column.title}`.toLowerCase();
      const value = /priority/.test(title) ? ['High', 'Medium', 'Low'][n % 3]
        : /status/.test(title) ? ['Agreed', 'In progress', 'In review'][n % 3]
          : /comment/.test(title) ? `Acceptance criteria agreed by ${owners[n % owners.length]}.`
            : /requirement/.test(title) ? requirement
              : /(^|\s)id($|\s)/.test(title) ? `BR-${n + 1}`
                : `Seed: ${column.title} — ${requirement}`;
      return [column.id, value];
    })),
  }));
  const known = new Set(rows.map((row) => row.id));
  const combined = [...rows, ...additions.filter((row) => !known.has(row.id))];
  await tx.projectBusinessRequirements.upsert({
    where: { projectId: project.id }, update: { rows: combined },
    create: { projectId: project.id, columns, rows: combined },
  });
}

const openIssues = [
  { title: 'Confirm the owner of the operations handover', severity: 'HIGH', status: 'Open', category: 'Management decisions' },
  { title: 'Approve the contingency budget for the pilot', severity: 'CRITICAL', status: 'Open', category: 'Management decisions' },
  { title: 'Agree the acceptance criteria for the integration', severity: 'MEDIUM', status: 'In Progress', category: 'Delivery problems' },
  { title: 'Close the findings from the architecture review', severity: 'LOW', status: 'Resolved', category: 'Delivery problems' },
] as const;
const raidItems = [
  { type: 'RISK', title: 'Key supplier misses the agreed delivery window', status: 'OPEN', probability: 4, impact: 5 },
  { type: 'RISK', title: 'Peak load defects delay the pilot acceptance', status: 'IN_PROGRESS', probability: 3, impact: 4 },
  { type: 'DEPENDENCY', title: 'External identity provider upgrade is required first', status: 'BREACHED', probability: 5, impact: 4 },
  { type: 'ASSUMPTION', title: 'The pilot site stays available for the whole window', status: 'VALIDATED', probability: 2, impact: 3 },
] as const;

// Top up only what is missing so richer projects are left untouched.
async function fillRegisters(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  const issueDeficit = SECTION_MINIMUM - await tx.issue.count({ where: { projectId: project.id } });
  for (let n = 0; n < issueDeficit; n += 1) {
    const item = openIssues[n];
    const issue = await tx.issue.upsert({
      where: { id: id(`issue-${n}`) }, update: {},
      create: {
        id: id(`issue-${n}`), projectId: project.id, source: 'INTERNAL', category: item.category,
        title: item.title, severity: item.severity, status: item.status, owner: owners[n % owners.length],
        readiness: item.status === 'Resolved' ? 'GREEN' : item.severity === 'CRITICAL' ? 'RED' : 'AMBER',
        impact: 'Affects readiness of the nearest checkpoint: an owner and an agreed action plan are required.',
        decisionRequired: item.severity === 'CRITICAL', dueDate: dateAt(n * 7 - 5, anchor),
        initialDueDate: dateAt(n * 7 - 8, anchor),
      },
    });
    await tx.issueStatusUpdate.upsert({
      where: { id: id(`issue-update-${n}`) }, update: {},
      create: { id: id(`issue-update-${n}`), issueId: issue.id, statusAt: dateAt(-1, anchor),
        text: 'The team reviewed the question and the owner is preparing a decision by the stated due date.' },
    });
  }
  const raidDeficit = SECTION_MINIMUM - await tx.raidItem.count({ where: { projectId: project.id } });
  for (let n = 0; n < raidDeficit; n += 1) {
    const item = raidItems[n];
    const risk = await tx.raidItem.upsert({
      where: { id: id(`raid-${n}`) }, update: {},
      create: {
        id: id(`raid-${n}`), projectId: project.id, type: item.type, title: item.title,
        description: 'Seed scenario describing a possible impact on the project schedule and cost.',
        owner: owners[n % owners.length], status: item.status, probability: item.probability, impact: item.impact,
        riskScore: item.probability * item.impact, residualRisk: Math.max(1, item.probability * item.impact - 6),
        dueDate: dateAt(n * 9 - 6, anchor), decisionRequired: item.probability * item.impact >= 16,
        mitigationPlan: 'Weekly monitoring, a backup supplier and an additional quality check.',
        contingencyPlan: 'Activate the fallback plan and agree to move the affected checkpoint.',
        escalationLevel: item.probability * item.impact >= 16 ? 'Steering' : 'Project',
        scheduleImpactDays: item.impact * 2, budgetImpact: item.impact * 250000,
      },
    });
    await tx.raidItemStatusUpdate.upsert({
      where: { id: id(`raid-update-${n}`) }, update: {},
      create: { id: id(`raid-update-${n}`), raidItemId: risk.id, statusAt: dateAt(-2, anchor),
        text: 'The owner confirmed the response plan. The next review is at the project steering committee.' },
    });
  }
}

const changeRequests = [
  { type: 'SCHEDULE', title: 'Move the pilot start by one week', status: 'IN_REVIEW', scheduleImpactDays: 7, budgetImpact: 0 },
  { type: 'BUDGET', title: 'Release contingency for an additional quality check', status: 'APPROVED', scheduleImpactDays: 0, budgetImpact: 450000 },
  { type: 'SCOPE', title: 'Extend the service level report with availability trends', status: 'SUBMITTED', scheduleImpactDays: 3, budgetImpact: 120000 },
  { type: 'RESOURCE', title: 'Add a second integration engineer for the pilot', status: 'IMPLEMENTED', scheduleImpactDays: 0, budgetImpact: 780000 },
] as const;

async function fillChangesAndCalendar(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  for (const [n, item] of changeRequests.entries()) {
    await tx.changeRequest.upsert({
      where: { id: id(`change-${n}`) }, update: {},
      create: {
        id: id(`change-${n}`), projectId: project.id, type: item.type, title: item.title,
        description: 'Seed request to change the agreed plan, recorded for the change management review.',
        owner: owners[n % owners.length], status: item.status,
        impactAnalysis: `Planned estimate: schedule ${item.scheduleImpactDays > 0 ? `+${item.scheduleImpactDays} days` : 'unchanged'}, budget ${item.budgetImpact > 0 ? `+${item.budgetImpact.toLocaleString('en-US')}` : 'unchanged'}. The business outcome is preserved.`,
        affectedBaseline: 'Seed baseline v1', implementationPlan: 'Refine the scope, agree the resources and run the acceptance check.',
        scheduleImpactDays: item.scheduleImpactDays, budgetImpact: item.budgetImpact,
        scopeImpact: 'Recorded against the approved scope statement.',
        decisionRequired: item.status === 'IN_REVIEW' || item.status === 'SUBMITTED',
        dueDate: dateAt(n * 6 + 2, anchor), approvedAt: item.status === 'APPROVED' || item.status === 'IMPLEMENTED' ? dateAt(-5, anchor) : null,
      },
    });
    await tx.projectCalendarOverride.upsert({
      where: { projectId_calendarCode_date: { projectId: project.id, calendarCode: 'RU', date: dateAt(30 + n * 2, anchor) } },
      update: {},
      create: {
        projectId: project.id, calendarCode: 'RU', date: dateAt(30 + n * 2, anchor), isWorkingDay: n % 2 === 1,
        description: n % 2 === 1 ? 'Seed: agreed additional testing window' : 'Seed: team training day',
      },
    });
  }
}

const artifacts = [
  { title: 'Project charter', type: 'Document', status: 'Approved' },
  { title: 'Architecture board minutes', type: 'Minutes', status: 'Approved' },
  { title: 'Acceptance test plan', type: 'Plan', status: 'In Review' },
  { title: 'Operations handover runbook', type: 'Runbook', status: 'Draft' },
];
const scheduleMilestones = [
  { title: 'Architecture approved', status: 'Done', day: -20 },
  { title: 'Integration complete', status: 'At Risk', day: 10 },
  { title: 'Pilot acceptance', status: 'Planned', day: 35 },
  { title: 'Handover to operations', status: 'Planned', day: 60 },
];
const actions = [
  { title: 'Prepare the decision on the supply risk', status: 'Open', priority: 'High' },
  { title: 'Approve the pilot acceptance criteria', status: 'In Progress', priority: 'High' },
  { title: 'Agree the release window with operations', status: 'In Progress', priority: 'Medium' },
  { title: 'Publish the weekly status report', status: 'Done', priority: 'Low' },
];

async function fillArtifactsAndSchedule(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  for (const [n, item] of artifacts.entries()) {
    await tx.projectArtifact.upsert({
      where: { id: id(`artifact-${n}`) }, update: {},
      create: {
        id: id(`artifact-${n}`), projectId: project.id, title: item.title, type: item.type,
        owner: owners[n % owners.length], status: item.status, sortOrder: n,
        url: `https://wiki.example/${project.code.toLowerCase()}/${item.title.toLowerCase().replace(/\s+/g, '-')}`,
        description: 'Seed document: goals, acceptance criteria and the area of responsibility agreed by the team.',
      },
    });
  }
  for (const [n, item] of scheduleMilestones.entries()) {
    await tx.milestone.upsert({
      where: { id: id(`milestone-${n}`) }, update: {},
      create: {
        id: id(`milestone-${n}`), projectId: project.id, code: `M${n + 1}`, title: item.title,
        dueDate: dateAt(item.day, anchor), status: item.status, owner: owners[n % owners.length],
        description: 'Seed checkpoint used to review readiness of the next project phase.',
      },
    });
  }
  for (const [n, item] of actions.entries()) {
    await tx.task.upsert({
      where: { id: id(`action-${n}`) }, update: {},
      create: {
        id: id(`action-${n}`), projectId: project.id, title: item.title, owner: owners[n % owners.length],
        status: item.status, priority: item.priority, dueDate: dateAt(n * 5 - 3, anchor),
      },
    });
  }
}

async function fillOverview(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  if (await tx.executiveOverview.findUnique({ where: { id: id('overview') } })) return;
  const latest = await tx.executiveOverview.aggregate({ where: { projectId: project.id }, _max: { version: true } });
  const planned = Number(project.budgetPlanned), forecast = Number(project.budgetForecast);
  await tx.executiveOverview.create({
    data: {
      id: id('overview'), projectId: project.id, version: (latest._max.version ?? 0) + 1,
      status: 'GENERATED', generatedAt: anchor,
      executiveSummary: `Seed overview of “${project.name}”: the business outcome still holds. Delivery is ${project.progress}% complete and the forecast is ${forecast >= planned ? 'above' : 'below'} the approved budget.`,
      kpis: [
        { name: 'Delivery progress', value: `${project.progress}%`, target: '100%' },
        { name: 'Schedule variance', value: `${project.scheduleVariance} days`, target: '0 days' },
        { name: 'Budget planned', value: planned.toLocaleString('en-US'), target: planned.toLocaleString('en-US') },
        { name: 'Budget forecast', value: forecast.toLocaleString('en-US'), target: planned.toLocaleString('en-US') },
      ],
      qualityGates: [
        { title: 'Acceptance criteria agreed', status: 'GREEN' }, { title: 'Integration testing passed', status: 'AMBER' },
        { title: 'Security review complete', status: 'AMBER' }, { title: 'Operations readiness confirmed', status: 'RED' },
      ],
      risks: raidItems.map((item, n) => ({
        title: item.title, score: item.probability * item.impact, owner: owners[n % owners.length],
        mitigation: 'Weekly monitoring with an agreed fallback plan.',
      })),
      nextSteps: actions.map((item, n) => ({
        title: item.title, owner: owners[n % owners.length], dueDate: dateAt(n * 5 + 3, anchor).toISOString(),
      })),
      decisions: changeRequests.map((item, n) => ({
        title: item.title, owner: owners[n % owners.length],
        impactIfApproved: `Schedule +${item.scheduleImpactDays} days, budget +${item.budgetImpact.toLocaleString('en-US')}`,
        impactIfDelayed: 'The affected checkpoint moves and the variance grows.',
        deadline: dateAt(n * 6 + 2, anchor).toISOString(),
      })),
      evidence: [
        { metric: 'Delivery progress', source: 'Seed WBS snapshot' },
        { metric: 'Schedule variance', source: 'Seed baseline v1 comparison' },
        { metric: 'Budget forecast', source: 'Seed finance actuals' },
        { metric: 'Open critical items', source: 'Seed RAID and open issue registers' },
        { metric: 'Data origin', source: 'Local seed data, not production reporting' },
      ],
    },
  });
}

async function fillBaseline(tx: Prisma.TransactionClient, project: Project, id: SeedKey) {
  if (await tx.wbsBaseline.count({ where: { projectId: project.id } }) > 0) return;
  const rows = await tx.wbsItem.findMany({ where: { projectId: project.id }, orderBy: { sortOrder: 'asc' } });
  if (rows.length < SECTION_MINIMUM) return;
  const codes = new Map(rows.map((row) => [row.id, row.code]));
  await tx.wbsBaseline.create({
    data: {
      id: id('baseline'), projectId: project.id, version: 1, title: 'Seed: approved initial plan', status: 'ACTIVE',
      items: {
        create: rows.map((row) => ({
          sourceWbsItemId: row.id, code: row.code, parentCode: row.parentId ? codes.get(row.parentId) : null,
          title: row.title, type: row.type, status: row.status, owner: row.owner,
          startDate: row.baselineStartDate ?? row.startDate, dueDate: row.baselineDueDate ?? row.dueDate,
          wbsLevel: row.wbsLevel, calendarCode: row.calendarCode, effortPercent: row.effortPercent,
          progress: row.progress, sortOrder: row.sortOrder,
        })),
      },
    },
  });
}
