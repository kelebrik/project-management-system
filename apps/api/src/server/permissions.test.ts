import assert from 'node:assert/strict';
import test from 'node:test';
import type { CurrentUser } from './auth.js';
import { canProceedWithWrite, writePermissionForPath } from './permissions.js';

const projectManager: CurrentUser = {
  id: 'user-1',
  email: 'pm@example.com',
  name: 'PM',
  role: 'PROJECT_MANAGER',
  isActive: true,
  lastLoginAt: null,
  businessUnitAdminIds: [],
};

test('project write requires project access even when role permission allows writes', async () => {
  const decision = await canProceedWithWrite(
    {
      user: projectManager,
      apiToken: null,
      pathname: '/projects/project-1',
      method: 'PATCH',
    },
    {
      projectIdForWritePath: async () => 'project-1',
      userCanWriteProject: async () => false,
      userHasPermission: async () => true,
      apiTokenHasPermission: () => false,
    },
  );

  assert.deepEqual(decision, {
    ok: false,
    status: 403,
    error: 'Нет доступа на изменение этого проекта',
  });
});

test('project write is allowed with project edit access', async () => {
  const decision = await canProceedWithWrite(
    {
      user: projectManager,
      apiToken: null,
      pathname: '/projects/project-1/wbs-items',
      method: 'POST',
    },
    {
      projectIdForWritePath: async () => 'project-1',
      userCanWriteProject: async () => true,
      userHasPermission: async () => false,
      apiTokenHasPermission: () => false,
    },
  );

  assert.deepEqual(decision, { ok: true });
});

test('global create project permission still allows creating a new project', async () => {
  const decision = await canProceedWithWrite(
    {
      user: {
        ...projectManager,
        role: 'EXECUTIVE_VIEWER',
      },
      apiToken: null,
      pathname: '/projects',
      method: 'POST',
    },
    {
      projectIdForWritePath: async () => null,
      userCanWriteProject: async () => false,
      userHasPermission: async (_user, permission) => permission === 'project.create',
      apiTokenHasPermission: () => false,
    },
  );

  assert.deepEqual(decision, { ok: true });
});

test('every authenticated user can create a project even when role permission is disabled', async () => {
  const decision = await canProceedWithWrite(
    {
      user: { ...projectManager, role: 'EXECUTIVE_VIEWER' },
      apiToken: null,
      pathname: '/projects',
      method: 'POST',
    },
    {
      projectIdForWritePath: async () => null,
      userCanWriteProject: async () => false,
      userHasPermission: async () => false,
      apiTokenHasPermission: () => false,
    },
  );

  assert.deepEqual(decision, { ok: true });
});

test('bulk WBS delete requires delete permission', () => {
  assert.equal(writePermissionForPath('/projects/project-1/wbs-items', 'DELETE'), 'wbs.delete');
});

test('business unit role writes require system administration permission', () => {
  assert.equal(
    writePermissionForPath('/admin/business-units/unit-1/memberships', 'POST'),
    'admin.config',
  );
  assert.equal(
    writePermissionForPath('/admin/business-unit-memberships/membership-1', 'DELETE'),
    'admin.config',
  );
});

test('project access writes use route-level business unit authorization', () => {
  assert.equal(
    writePermissionForPath('/admin/project-access', 'POST'),
    null,
  );
});
