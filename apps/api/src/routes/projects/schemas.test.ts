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
