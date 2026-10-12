import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWbsBulkUpdate } from './wbs-bulk-write.js';

test('one statement sets the listed columns of the project rows, values as typed arrays', () => {
  const sql = buildWbsBulkUpdate('p1', [
    { id: 'a', code: '1', dueDate: new Date('2026-10-05T00:00:00.000Z') },
    { id: 'b', code: '2', dueDate: null },
  ], ['code', 'dueDate']);
  assert.match(sql.text, /^UPDATE "WbsItem" AS w SET "code" = v\."code"::text, "dueDate" = v\."dueDate"::timestamp\(3\), "updatedAt" = CURRENT_TIMESTAMP\(3\)/);
  assert.match(sql.text, /FROM unnest\(\$1::text\[\],\$2::text\[\],\$3::text\[\]\) AS v\("id", "code", "dueDate"\)/);
  assert.match(sql.text, /WHERE w\."id" = v\."id" AND w\."projectId" = \$4$/);
  assert.deepEqual(sql.values, [['a', 'b'], ['1', '2'], ['2026-10-05T00:00:00.000', null], 'p1']);
});

test('a repeated row, an empty column list or an unknown column is refused before any SQL', () => {
  assert.throws(() => buildWbsBulkUpdate('p1', [{ id: 'a' }, { id: 'a' }], ['code']), /repeats a row/);
  assert.throws(() => buildWbsBulkUpdate('p1', [{ id: 'a' }], []), /sets no column/);
  assert.throws(() => buildWbsBulkUpdate('p1', [{ id: 'a' }], ['title' as never]), /Unknown Structure column/);
});
