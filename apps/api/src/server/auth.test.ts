import assert from 'node:assert/strict';
import test from 'node:test';

import { safeUser } from './auth.js';

test('safeUser serializes business unit administrator assignments', () => {
  const user = safeUser({
    id: 'user-1',
    email: 'user@example.test',
    name: 'User',
    role: 'EXECUTIVE_VIEWER',
    isActive: true,
    lastLoginAt: null,
    businessUnitMemberships: [
      { businessUnitId: 'bu-a' },
      { businessUnitId: 'bu-b' },
    ],
  });

  assert.deepEqual(user.businessUnitAdminIds, ['bu-a', 'bu-b']);
});

test('safeUser defaults business unit administrator assignments to an empty list', () => {
  const user = safeUser({
    id: 'user-1',
    email: 'user@example.test',
    name: 'User',
    role: 'EXECUTIVE_VIEWER',
    isActive: true,
    lastLoginAt: null,
  });

  assert.deepEqual(user.businessUnitAdminIds, []);
});
