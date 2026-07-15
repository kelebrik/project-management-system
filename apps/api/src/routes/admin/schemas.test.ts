import assert from 'node:assert/strict';
import test from 'node:test';

import { businessUnitSchema } from './schemas.js';

test('business unit code is normalized to lowercase', () => {
  const result = businessUnitSchema.parse({ code: ' SD ', name: 'SberDevices' });

  assert.equal(result.code, 'sd');
});

test('business unit code rejects unsupported characters with a readable message', () => {
  const result = businessUnitSchema.safeParse({ code: 'СД', name: 'SberDevices' });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.error.flatten().fieldErrors.code?.[0],
      'Используйте латинские буквы, цифры и дефис',
    );
  }
});
