import assert from 'node:assert/strict';
import test from 'node:test';
import type { ScenarioResult } from '@pms/shared';
import type { WbsTreeItem } from './domainTypes';
import { createScenarioGantt } from './scenarioGanttModel';

test('scenario uses complete schedule for parent and unchanged rows without mutating working plan', () => {
  const tree = [
    { id: 'phase', code: '1', title: 'Phase', type: 'PHASE', status: 'IN_PROGRESS', startDate: '2026-09-01', dueDate: '2026-09-10', forecastStartDate: '2028-01-01', forecastDueDate: '2028-01-20', children: [] },
    { id: 'task', code: '1.1', title: 'Task', type: 'TASK', status: 'IN_PROGRESS', startDate: '2026-09-01', dueDate: '2026-09-10', forecastStartDate: '2028-01-01', forecastDueDate: '2028-01-20', children: [] },
  ] as unknown as WbsTreeItem[];
  const original = structuredClone(tree);
  const result: ScenarioResult = {
    fingerprint: 'test', generatedAt: '', beforeFinish: '2026-09-10', afterFinish: '2026-10-01', beforeCriticalIds: [], afterCriticalIds: ['task'], warnings: [], changes: [],
    schedule: { items: tree.map((item) => ({ id: item.id, startDate: '2026-09-15', dueDate: '2026-10-01' })), criticalDependencyIds: [], floatById: [{ itemId: 'task', totalFloatWorkDays: 0, isNearCritical: false }] },
  };
  const model = createScenarioGantt(tree, [], null, result);
  assert.equal(model.items.length, 2);
  assert.ok(model.items.every(({ forecastRange }) => forecastRange === null));
  assert.ok(model.end!.getFullYear() < 2028);
  assert.ok(model.items.every(({ item }) => item.dueDate === '2026-10-01'));
  assert.equal(model.items.find(({ item }) => item.id === 'task')?.critical, true);
  assert.equal(model.items.find(({ item }) => item.id === 'task')?.totalFloatWorkDays, 0);
  assert.deepEqual(tree, original);
});
