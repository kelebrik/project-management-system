import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultBusinessUnitPermissionEnabled } from './business-unit-permissions.js';

test('every business unit role can create projects by default', () => {
  assert.equal(defaultBusinessUnitPermissionEnabled('ADMIN', 'PROJECT_CREATE'), true);
  assert.equal(defaultBusinessUnitPermissionEnabled('PROJECT_MANAGER', 'PROJECT_CREATE'), true);
  assert.equal(defaultBusinessUnitPermissionEnabled('VIEWER', 'PROJECT_CREATE'), true);
});

test('only business unit admins receive broad administration defaults', () => {
  assert.equal(defaultBusinessUnitPermissionEnabled('ADMIN', 'PROJECT_ADMIN'), true);
  assert.equal(defaultBusinessUnitPermissionEnabled('ADMIN', 'MEMBERS_MANAGE'), true);
  assert.equal(defaultBusinessUnitPermissionEnabled('PROJECT_MANAGER', 'PROJECT_ADMIN'), false);
  assert.equal(defaultBusinessUnitPermissionEnabled('VIEWER', 'MEMBERS_MANAGE'), false);
});
