import assert from 'node:assert/strict';
import test from 'node:test';
import { wbsBulkUpdateSchema } from './schemas.js';

test('wbsBulkUpdateSchema accepts multiple partial row patches', () => {
  const result = wbsBulkUpdateSchema.safeParse({
    items: [
      { id: 'item-1', patch: { title: 'Updated title' } },
      { id: 'item-2', patch: { progress: 75, scheduleDriver: 'dates' } },
    ],
    renumber: true,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.items.length, 2);
    assert.equal(result.data.renumber, true);
  }
});

test('wbsBulkUpdateSchema rejects empty and oversized batches', () => {
  assert.equal(wbsBulkUpdateSchema.safeParse({ items: [] }).success, false);
  assert.equal(
    wbsBulkUpdateSchema.safeParse({
      items: Array.from({ length: 501 }, (_, index) => ({
        id: `item-${index}`,
        patch: { title: 'Updated' },
      })),
    }).success,
    false,
  );
});
