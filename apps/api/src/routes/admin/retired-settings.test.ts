import assert from 'node:assert/strict';
import test from 'node:test';

import { integrationSettings, managedPermissions, retiredPermissions, retiredSystemSettings } from './defaults.js';
import { normalizeProjectModules, parseProjectModulesSetting } from './project-modules.js';
import { adminConfigImportSchema } from './schemas.js';

test('stored module settings drop the retired budget and resources modules', () => {
  const modules = parseProjectModulesSetting(
    JSON.stringify({
      modules: [
        { key: 'budget', enabled: true },
        { key: 'resources', enabled: true },
        { key: 'changes', enabled: true },
      ],
    }),
  );
  const keys = modules.map((module) => module.key);
  assert.equal(keys.includes('budget'), false);
  assert.equal(keys.includes('resources'), false);
  assert.equal(modules.find((module) => module.key === 'changes')?.enabled, true);
  assert.deepEqual(normalizeProjectModules().map((module) => module.key), keys);
});

test('an older configuration export with dictionary items still parses', () => {
  const parsed = adminConfigImportSchema.safeParse({
    dictionaryItems: [{ dictionary: 'wbs_type', code: 'TASK', label: 'Task' }, { anything: true }],
    systemSettings: [{ key: 'wbs.templates', value: '[]' }],
  });
  assert.equal(parsed.success, true);
});

test('retired permissions and settings are neither managed nor seeded', () => {
  for (const permission of ['admin.templates', 'admin.dictionaries', 'admin.health', 'admin.backup', 'admin.project_access', 'admin.audit']) {
    assert.equal(retiredPermissions.includes(permission), true, permission);
    assert.equal(managedPermissions.includes(permission), false, permission);
  }
  const seededKeys = integrationSettings.map(([key]) => key as string);
  for (const key of ['wbs.templates', 'github.token', 'azureDevOps.token', 'bi.exportUrl']) {
    assert.equal(retiredSystemSettings.includes(key), true, key);
    assert.equal(seededKeys.includes(key), false, key);
  }
  assert.deepEqual(seededKeys, ['gitlab.enabled', 'gitlab.baseUrl', 'gitlab.token', 'jira.backgroundSync']);
});
