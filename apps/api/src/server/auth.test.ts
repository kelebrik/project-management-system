import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import { requireAuth, safeUser } from './auth.js';

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

test('requireAuth rejects anonymous read requests', () => {
  let statusCode = 0;
  let body: unknown;
  let nextCalled = false;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;

  requireAuth({ method: 'GET' } as Request, response, () => {
    nextCalled = true;
  });

  assert.equal(statusCode, 401);
  assert.deepEqual(body, { error: 'Требуется вход в систему' });
  assert.equal(nextCalled, false);
});
