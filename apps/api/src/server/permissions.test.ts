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

test('the public demo writes from Operations but only looks at Administration and Development', async () => {
  const { PUBLIC_DEMO_USER_ID } = await import('@pms/shared');
  const { writePermissionMiddleware } = await import('./permissions.js');
  const previous = { profile: process.env.DEPLOYMENT_PROFILE, demo: process.env.PUBLIC_DEMO_MODE };
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  process.env.PUBLIC_DEMO_MODE = 'true';
  const demoRequest = (section: string | undefined) =>
    ({
      method: 'POST',
      path: '/leave-schedule/leaves',
      currentUser: { id: PUBLIC_DEMO_USER_ID, role: 'PROJECT_MANAGER' },
      get: (name: string) => (name.toLowerCase() === 'x-pms-section' ? section : undefined),
    }) as any;
  const run = async (section: string | undefined) => {
    let passed = false;
    const res: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    await writePermissionMiddleware(demoRequest(section), res, () => {
      passed = true;
    });
    return { passed, status: res.statusCode };
  };
  try {
    assert.deepEqual(await run(undefined), { passed: true, status: 200 });
    assert.deepEqual(await run('development'), { passed: false, status: 403 });
    assert.deepEqual(await run('admin'), { passed: false, status: 403 });
  } finally {
    process.env.DEPLOYMENT_PROFILE = previous.profile;
    process.env.PUBLIC_DEMO_MODE = previous.demo;
    if (previous.profile === undefined) delete process.env.DEPLOYMENT_PROFILE;
    if (previous.demo === undefined) delete process.env.PUBLIC_DEMO_MODE;
  }
});
