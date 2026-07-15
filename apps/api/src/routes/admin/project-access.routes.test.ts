import assert from 'node:assert/strict';
import test from 'node:test';

import { businessUnitAdminCanManageAccess } from './project-access.routes.js';

test('business unit admin can grant and revoke edit access', () => {
  assert.equal(businessUnitAdminCanManageAccess(null, 'EDIT'), true);
  assert.equal(businessUnitAdminCanManageAccess('EDIT', null), true);
  assert.equal(businessUnitAdminCanManageAccess('EDIT', 'EDIT'), true);
});

test('business unit admin cannot grant or modify admin access', () => {
  assert.equal(businessUnitAdminCanManageAccess(null, 'ADMIN'), false);
  assert.equal(businessUnitAdminCanManageAccess('ADMIN', 'EDIT'), false);
  assert.equal(businessUnitAdminCanManageAccess('ADMIN', null), false);
});
