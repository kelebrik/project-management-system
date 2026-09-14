import assert from 'node:assert/strict';
import test from 'node:test';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { PrismaClient } from '@prisma/client';
import { prismaClientProvider } from '../../db.js';
import { registerBusinessUnitAdminRoutes } from './business-units.routes.js';
import type { AdminRoutesContext } from './types.js';

const requireAdmin: RequestHandler = (_req, res) => { res.sendStatus(403); };
function renameRoute() {
  const router = Router();
  registerBusinessUnitAdminRoutes(router, {
    requireAdmin, currentUser: () => null,
  } as unknown as AdminRoutesContext);
  return router.stack.find((layer: any) => layer.route?.methods.patch
    && layer.route.path === '/admin/business-units/:businessUnitId').route;
}
function response() {
  return {
    statusCode: 200, body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
}
test('business unit rename stays behind the system administrator middleware', () => {
  assert.equal(renameRoute().stack[0].handle, requireAdmin);
});
test('rename rejects blank names and changes to identity or privileges', async () => {
  for (const body of [{ name: ' ' }, { name: 'BU_1', code: 'other' }, { name: 'BU_1', isDefault: true }]) {
    const res = response();
    await renameRoute().stack[1].handle({ params: { businessUnitId: 'unit-1' }, body }, res);
    assert.equal(res.statusCode, 400);
  }
});
test('rename updates only the selected unit and its portfolio labels inside the transaction', async () => {
  const previous = prismaClientProvider.get;
  const calls: unknown[] = [];
  const tx = {
    businessUnit: {
      findUnique: async (args: unknown) => { calls.push(args); return { id: 'unit-1', name: 'Old' }; },
      update: async (args: unknown) => { calls.push(args); return { id: 'unit-1', name: 'BU_1' }; },
    },
    project: { updateMany: async (args: unknown) => { calls.push(args); } },
  };
  let audit: any;
  prismaClientProvider.get = () => ({
    $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
    auditEvent: { create: async (args: unknown) => { audit = args; } },
  }) as unknown as PrismaClient;
  try {
    const res = response();
    await renameRoute().stack[1].handle({
      params: { businessUnitId: 'unit-1' }, body: { name: ' BU_1 ' }, get: () => undefined,
    } as unknown as Request, res as unknown as Response);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls[0], { where: { id: 'unit-1' } });
    assert.deepEqual((calls[1] as any).data, { name: 'BU_1' });
    assert.deepEqual(calls[2], { where: { businessUnitId: 'unit-1' }, data: { portfolio: 'BU_1' } });
    assert.deepEqual(audit.data.beforeValue, { name: 'Old' });
    assert.deepEqual(audit.data.afterValue, { name: 'BU_1' });
  } finally { prismaClientProvider.get = previous; }
});
test('missing unit returns 404 without updating projects', async () => {
  const previous = prismaClientProvider.get;
  prismaClientProvider.get = () => ({
    $transaction: async (fn: Function) => fn({ businessUnit: { findUnique: async () => null } }),
  }) as unknown as PrismaClient;
  try {
    const res = response();
    await renameRoute().stack[1].handle({ params: { businessUnitId: 'missing' }, body: { name: 'BU_1' } }, res);
    assert.equal(res.statusCode, 404);
  } finally { prismaClientProvider.get = previous; }
});
