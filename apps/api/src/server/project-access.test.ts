import assert from 'node:assert/strict';
import test from 'node:test';

import { projectIdForWritePath } from './project-access.js';

test('static project collection routes are not treated as project ids', async () => {
  assert.equal(await projectIdForWritePath('/projects/structure-copy-options'), null);
  assert.equal(
    await projectIdForWritePath('/projects/structure-copy-options?search=phase'),
    null,
  );
  assert.equal(await projectIdForWritePath('/projects/portfolio-roadmap'), null);
});

test('project entity routes still resolve the project id', async () => {
  assert.equal(await projectIdForWritePath('/projects/project-1/overview'), 'project-1');
});
