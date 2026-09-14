import assert from 'node:assert/strict';
import test from 'node:test';
import { Router } from 'express';
import { registerDemoDataRoutes } from './demo-data.routes.js';
import { currentUser, requireAdmin, PUBLIC_DEMO_MODE } from '../../server/auth.js';
import type { AdminRoutesContext } from './types.js';

function route() {
  const router = Router();
  registerDemoDataRoutes(router, { requireAdmin, currentUser } as AdminRoutesContext);
  return router.stack.find((layer: any) => layer.route?.path === '/admin/demo-data/projects/:projectId').route;
}
function response() {
  return { statusCode: 200, status(code: number) { this.statusCode = code; return this; }, json() { return this; } };
}
test('demo population rejects anonymous, public demo and non-admin users before accessing the database', () => {
  for (const user of [null, { id: 'public-demo-user', role: 'PROJECT_MANAGER' }, { id: 'manager', role: 'PROJECT_MANAGER' }]) {
    const res = response(); let proceeded = false;
    route().stack[0].handle({ method: 'POST', currentUser: user }, res, () => { proceeded = true; });
    assert.equal(proceeded, false);
    assert.ok(res.statusCode === 401 || res.statusCode === 403);
  }
});
test('demo population is unavailable outside demo runtime even to an admin', { skip: PUBLIC_DEMO_MODE }, async () => {
  const res = response();
  await route().stack[1].handle({ method: 'POST', currentUser: { id: 'admin', role: 'ADMIN' } }, res);
  assert.equal(res.statusCode, 403);
});
