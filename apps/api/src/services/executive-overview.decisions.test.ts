import assert from 'node:assert/strict';
import test from 'node:test';

import { generateExecutiveSummary } from './executive-overview.js';

type GeneratedProject = Parameters<typeof generateExecutiveSummary>[0];

function projectWithIssues(issues: Array<{ severity: string; readiness: string }>) {
  return {
    scheduleVariance: 0,
    budgetPlanned: '0',
    budgetForecast: '0',
    issues: issues.map((issue, index) => ({
      id: `issue-${index}`,
      title: `Вопрос ${index}`,
      status: 'Open',
      owner: 'Owner',
      dueDate: null,
      impact: 'Влияние',
      jiraLinks: [],
      ...issue,
    })),
    raidItems: [],
    wbsItems: [],
    artifacts: [],
    jiraSnapshots: [],
    jiraIntegration: null,
    artifactTable: null,
    code: 'TEST-001',
    name: 'Тестовый проект',
    progress: 0,
    rag: 'GREEN',
  } as unknown as GeneratedProject;
}

/** Titles of the questions the generated summary puts forward as decisions. */
function decisionTitles(project: GeneratedProject) {
  return generateExecutiveSummary(project).decisions.map((decision) => decision.title);
}

// The dashboard computes this rule in the browser and the summary computes it
// here; this pins the server side so the two cannot drift apart unnoticed.
test('the generated summary raises critical questions off green and high ones in red', () => {
  assert.deepEqual(
    decisionTitles(
      projectWithIssues([
        { severity: 'CRITICAL', readiness: 'RED' },
        { severity: 'CRITICAL', readiness: 'AMBER' },
        { severity: 'HIGH', readiness: 'RED' },
      ]),
    ),
    ['Вопрос 0', 'Вопрос 1', 'Вопрос 2'],
  );
});

test('the generated summary ignores questions the rule does not cover', () => {
  assert.deepEqual(
    decisionTitles(
      projectWithIssues([
        { severity: 'CRITICAL', readiness: 'GREEN' },
        { severity: 'HIGH', readiness: 'AMBER' },
        { severity: 'HIGH', readiness: 'GREEN' },
        { severity: 'MEDIUM', readiness: 'RED' },
        { severity: 'LOW', readiness: 'RED' },
      ]),
    ),
    [],
  );
});
