import assert from 'node:assert/strict';
import test from 'node:test';
import { planWbsImport, type ImportExistingRow } from './wbs-import.js';

const row = (id: string, code: string, parentId: string | null, extra: Partial<ImportExistingRow> = {}): ImportExistingRow => ({
  id,
  code,
  parentId,
  title: `Работа ${code}`,
  type: parentId ? 'TASK' : 'PHASE',
  status: 'NOT_STARTED',
  owner: '',
  startDate: null,
  dueDate: null,
  workDays: null,
  progress: 0,
  priority: null,
  comment: null,
  calendarCode: 'RU_CN',
  predecessor1: null,
  predecessor2: null,
  predecessor3: null,
  predecessor4: null,
  predecessor5: null,
  predecessor6: null,
  ...extra,
});

const existing = [row('p1', '1', null), row('t11', '1.1', 'p1', { owner: 'Петров', startDate: new Date('2026-10-01T00:00:00Z') }), row('t12', '1.3', 'p1'), row('p2', '2', null)];

test('a table updates the rows it names, adds new ones in code order, and reports what changes', () => {
  const plan = planWbsImport(
    existing,
    [
      { code: '1.1', owner: 'Сидоров', startDate: '2026-10-01', predecessors: [] },
      { code: '1.2', title: 'Новая', workDays: 3, predecessors: ['1.1'] },
      { code: '1.2.1', title: 'Вложенная' },
      { code: '3', title: 'Новая фаза', type: 'PHASE' },
      { code: '1.3', title: 'Работа 1.3', comment: '  ' },
    ],
    new Set(),
  );
  assert.deepEqual(plan.summary.errors, []);
  assert.deepEqual(plan.summary.updates, [{ code: '1.1', changes: [{ field: 'owner', from: 'Петров', to: 'Сидоров' }] }]);
  assert.equal(plan.summary.unchanged, 1);
  assert.deepEqual(plan.updates, [{ id: 't11', code: '1.1', values: { owner: 'Сидоров' } }]);
  assert.deepEqual(
    plan.creates.map((create) => [create.code, create.parentId, create.parentCode, create.calendarCode]),
    [['1.2', 'p1', '1', 'RU_CN'], ['1.2.1', null, '1.2', 'RU_CN'], ['3', null, null, 'RU_CN']],
  );
  assert.deepEqual(plan.order, [{ id: 'p1' }, { id: 't11' }, { code: '1.2' }, { code: '1.2.1' }, { id: 't12' }, { id: 'p2' }, { code: '3' }]);
});

test('an id from an export wins over the code, and a new row cannot take a code the table gives to a named row', () => {
  const plan = planWbsImport(existing, [{ id: 't12', code: '1.2', title: 'Переименована' }, { code: '1.3', title: 'Новая' }], new Set());
  assert.deepEqual(plan.summary.errors, [{ code: '1.3', kind: 'CODE_TAKEN' }]);
  assert.deepEqual(plan.summary.warnings, [{ code: '1.2', kind: 'CODE_KEPT', field: 'code', detail: '1.3' }]);
  assert.deepEqual(plan.creates, []);
});

test('missing parents, predecessors, titles, unknown ids and repeated rows stop the import', () => {
  const plan = planWbsImport(
    existing,
    [
      { code: '5.1', title: 'Сирота' },
      { code: '1.4', predecessors: ['9', '1.4'] },
      { code: '1.1', title: 'Раз' },
      { code: '1.1', title: 'Два' },
      { id: 'gone', code: '1.1' },
    ],
    new Set(),
  );
  assert.deepEqual(
    plan.summary.errors.map((error) => [error.code, error.kind, error.detail]).sort(),
    [
      ['1.1', 'DUPLICATE_ROW', undefined],
      ['1.1', 'UNKNOWN_ID', 'gone'],
      ['1.4', 'PREDECESSOR_MISSING', '9'],
      ['1.4', 'PREDECESSOR_SELF', undefined],
      ['1.4', 'TITLE_REQUIRED', undefined],
      ['5.1', 'PARENT_MISSING', '5'],
    ],
  );
  assert.deepEqual(plan.creates, []);
});

test('types of existing rows and fields an open issue manages are kept, with a warning', () => {
  const plan = planWbsImport(existing, [{ code: '1.1', type: 'MILESTONE', title: 'Другое имя', progress: 50 }], new Set(['t11']));
  assert.deepEqual(plan.summary.warnings.map((warning) => [warning.kind, warning.field]), [['TYPE_KEPT', 'type'], ['MANAGED_BY_ISSUE', 'title']]);
  assert.deepEqual(plan.updates[0].values, { progress: 50 });
});

test('a row named by id cannot depend on itself under the code the file gives it', () => {
  const plan = planWbsImport(existing, [{ id: 't12', code: '1.9', predecessors: ['1.3'] }], new Set());
  assert.deepEqual(plan.summary.errors.map((error) => error.kind), ['PREDECESSOR_SELF']);
});
