import assert from 'node:assert/strict';
import test from 'node:test';
import { raidItemSchema } from '@pms/shared';
import { z } from 'zod';

import { patchSchema } from './patch-schema.js';
import { updateProjectSchema } from './projects/schemas.js';

test('a change carries only the fields it sends, never the defaults of the others', () => {
  const schema = patchSchema(z.object({ title: z.string(), isShared: z.boolean().default(false), sortOrder: z.coerce.number().default(0) }));
  assert.deepEqual(schema.parse({ title: 'План' }), { title: 'План' });
  assert.deepEqual(schema.parse({ sortOrder: '5' }), { sortOrder: 5 });
  assert.equal(schema.safeParse({ isShared: 'yes' }).success, false);
});

test('saving a project interface setting does not reset its status, RAG, progress or variance', () => {
  assert.deepEqual(updateProjectSchema.parse({ uiState: { wbsColumnOrder: ['level'] } }), { uiState: { wbsColumnOrder: ['level'] } });
  assert.deepEqual(updateProjectSchema.parse({ rag: 'RED' }), { rag: 'RED' });
  assert.equal(updateProjectSchema.safeParse({ status: 'UNKNOWN' }).success, false);
});

test('changing one field of a risk does not send it back to OPEN with zero probability and impact', () => {
  assert.deepEqual(patchSchema(raidItemSchema).parse({ title: 'Поставщик задерживает платы' }), { title: 'Поставщик задерживает платы' });
});
