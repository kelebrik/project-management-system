import assert from 'node:assert/strict';
import test from 'node:test';
import { isProjectAnalyticsRead } from './project-write-guards.js';

test('closed project exception permits only analytical reads, never mutations', () => {
  for (const path of ['/jira/semantic-aggregates/query-batch', '/jira/semantic-aggregates/agg/query', '/jira/semantic-aggregates/agg/query/']) {
    assert.equal(isProjectAnalyticsRead({ method: 'POST', path }), true);
    for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal(isProjectAnalyticsRead({ method, path }), false);
  }
  for (const path of ['/jira/semantic-aggregates/agg/publish', '/jira/semantic-aggregates/agg/sync-gitlab', '/jira/semantic-aggregates/preview', '/jira/semantic-aggregates/dashboard', '/jira/current-refresh', '/wbs-items', '/ui-state', '/jira/semantic-aggregates/agg/query/extra']) {
    assert.equal(isProjectAnalyticsRead({ method: 'POST', path }), false, path);
  }
});

test('registered middleware blocks writes to closed projects and forwards only analytics reads', async () => {
  const { registerClosedProjectWriteGuards } = await import('./project-write-guards.js');
  const { prisma } = await import('../db.js');
  const routes = new Map<string, Function>();
  registerClosedProjectWriteGuards({ use(path: string, handler: Function) { routes.set(path, handler); } } as any);
  const original = prisma.project.findUnique;
  prisma.project.findUnique = (async () => ({ id: 'closed', status: 'CLOSED' })) as any;
  try {
    for (const [path, allowed] of [['/wbs-items', false], ['/jira/semantic-aggregates/a/publish', false], ['/jira/semantic-aggregates/query-batch', true], ['/jira/semantic-aggregates/a/query', true]] as const) {
      let forwarded = false;
      const res = { code: 200, status(code: number) { this.code = code; return this; }, json() {} };
      await routes.get('/api/projects/:projectId')!({ method: 'POST', path, params: { projectId: 'closed' } }, res, () => { forwarded = true; });
      assert.equal(forwarded, allowed, path);
      assert.equal(res.code, allowed ? 200 : 423);
    }
  } finally { prisma.project.findUnique = original; }
});
