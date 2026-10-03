import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectSchema } from './schemas.js';

const project = {
  parentId: null,
  code: 'NEW-1',
  name: 'Новый проект',
  portfolio: 'SberDevices',
  sponsor: 'Спонсор',
  projectManager: 'РП',
  status: 'ACTIVE',
  rag: 'GREEN',
  startDate: '2026-07-21',
  targetDate: '2026-12-31',
  budgetPlanned: 0,
  budgetForecast: 0,
  scheduleVariance: 0,
  progress: 0,
  summary: 'Новый проект',
  sortOrder: 0,
};

test('create project accepts unique current structure selections', () => {
  const result = createProjectSchema.safeParse({
    ...project,
    copyCurrentStructureFrom: [
      { projectId: 'project-a', phaseIds: ['phase-a1', 'phase-a2'] },
      { projectId: 'project-b', phaseIds: null },
    ],
  });
  assert.equal(result.success, true);
});

test('create project accepts an omitted portfolio because it is derived from the business unit', () => {
  const { portfolio: _portfolio, ...projectWithoutPortfolio } = project;
  const result = createProjectSchema.safeParse(projectWithoutPortfolio);
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.portfolio, '');
});

test('create project rejects duplicate source projects', () => {
  const result = createProjectSchema.safeParse({
    ...project,
    copyCurrentStructureFrom: [
      { projectId: 'project-a', phaseIds: ['phase-a1'] },
      { projectId: 'project-a', phaseIds: ['phase-a2'] },
    ],
  });
  assert.equal(result.success, false);
});

test('a new project needs no sponsor or summary; they can be added later', () => {
  const { sponsor: _sponsor, summary: _summary, ...minimal } = project;
  const result = createProjectSchema.safeParse(minimal);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sponsor, '');
    assert.equal(result.data.summary, '');
  }
});

test('a new project takes real calendar dates, and the finish is not before the start', () => {
  assert.equal(createProjectSchema.safeParse({ ...project, startDate: '2026-02-30' }).success, false);
  assert.equal(createProjectSchema.safeParse({ ...project, startDate: '21.07.2026' }).success, false);
  const reversed = createProjectSchema.safeParse({ ...project, startDate: '2027-01-10', targetDate: '2026-12-31' });
  assert.equal(reversed.success, false);
  if (!reversed.success) assert.deepEqual(reversed.error.issues[0].path, ['targetDate']);
  assert.equal(createProjectSchema.safeParse({ ...project, targetDate: project.startDate }).success, true);
});
