import assert from 'node:assert/strict';
import test from 'node:test';

import { metricRoute } from './telemetry.js';

test('Jira sync active and run status endpoints keep separate bounded metric labels', () => {
  assert.equal(
    metricRoute({ path: '/api/projects/project-1/jira/sync-runs/active' }),
    '/api/projects/:projectId/jira/sync-runs/active',
  );
  assert.equal(
    metricRoute({ path: '/api/projects/project-1/jira/sync-runs/run-secret' }),
    '/api/projects/:projectId/jira/sync-runs/:runId',
  );
});
