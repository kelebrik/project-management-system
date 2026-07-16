import assert from 'node:assert/strict';
import test from 'node:test';
import { Router } from 'express';
import type { Prisma } from '@prisma/client';

import {
  collectProjectSubtreeIds,
  moveProjectSubtreeInTransaction,
  ProjectMoveError,
  registerProjectBusinessUnitRoutes,
} from './project-business-unit.routes.js';
import type { AdminRoutesContext } from './types.js';

test('collectProjectSubtreeIds includes every descendant once', () => {
  const projects = [
    { id: 'root', parentId: null, businessUnitId: 'a' },
    { id: 'child', parentId: 'root', businessUnitId: 'a' },
    { id: 'grandchild', parentId: 'child', businessUnitId: 'a' },
    { id: 'other', parentId: null, businessUnitId: 'a' },
  ];
  assert.deepEqual(collectProjectSubtreeIds(projects, 'root'), ['root', 'child', 'grandchild']);
});

test('collectProjectSubtreeIds terminates when corrupt data contains a cycle', () => {
  const projects = [
    { id: 'root', parentId: 'child', businessUnitId: 'a' },
    { id: 'child', parentId: 'root', businessUnitId: 'a' },
  ];
  assert.deepEqual(collectProjectSubtreeIds(projects, 'root'), ['root', 'child']);
});

test('moveProjectSubtreeInTransaction moves descendants, detaches root and resets access', async () => {
  const calls: Array<{ operation: string; value: unknown }> = [];
  const tx = {
    businessUnit: {
      findUnique: async () => ({ id: 'target', name: 'Target BU', isActive: true }),
    },
    project: {
      findMany: async () => [
        { id: 'root', parentId: 'old-parent', businessUnitId: 'source', code: 'ROOT', name: 'Root' },
        { id: 'child', parentId: 'root', businessUnitId: 'source', code: 'CHILD', name: 'Child' },
        { id: 'other', parentId: null, businessUnitId: 'source', code: 'OTHER', name: 'Other' },
      ],
      updateMany: async (value: unknown) => {
        calls.push({ operation: 'updateMany', value });
        return { count: 2 };
      },
      update: async (value: unknown) => {
        calls.push({ operation: 'update', value });
        return {};
      },
    },
    projectAccess: {
      deleteMany: async (value: unknown) => {
        calls.push({ operation: 'deleteMany', value });
        return { count: 3 };
      },
    },
  } as unknown as Prisma.TransactionClient;

  const result = await moveProjectSubtreeInTransaction(tx, 'root', 'target');

  assert.deepEqual(result.movedProjectIds, ['root', 'child']);
  assert.equal(result.deletedAccessCount, 3);
  assert.deepEqual(calls, [
    {
      operation: 'deleteMany',
      value: { where: { projectId: { in: ['root', 'child'] } } },
    },
    {
      operation: 'updateMany',
      value: {
        where: { id: { in: ['root', 'child'] } },
        data: { businessUnitId: 'target' },
      },
    },
    {
      operation: 'update',
      value: { where: { id: 'root' }, data: { parentId: null } },
    },
  ]);
});

test('moveProjectSubtreeInTransaction rejects the current business unit before mutations', async () => {
  let mutated = false;
  const tx = {
    businessUnit: {
      findUnique: async () => ({ id: 'source', name: 'Source BU', isActive: true }),
    },
    project: {
      findMany: async () => [
        { id: 'root', parentId: null, businessUnitId: 'source', code: 'ROOT', name: 'Root' },
      ],
      updateMany: async () => { mutated = true; return { count: 0 }; },
      update: async () => { mutated = true; return {}; },
    },
    projectAccess: {
      deleteMany: async () => { mutated = true; return { count: 0 }; },
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () => moveProjectSubtreeInTransaction(tx, 'root', 'source'),
    (error: unknown) => error instanceof ProjectMoveError && error.status === 400,
  );
  assert.equal(mutated, false);
});

test('project business unit route always runs requireAdmin before its handler', () => {
  const requireAdmin = () => undefined;
  const router = Router();
  registerProjectBusinessUnitRoutes(router, {
    requireAdmin,
    currentUser: () => null,
  } as unknown as AdminRoutesContext);
  const routeLayer = (router as unknown as {
    stack: Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>;
  }).stack.find((layer) => layer.route?.path === '/admin/projects/:projectId/business-unit');

  assert.ok(routeLayer?.route);
  assert.equal(routeLayer.route.stack[0]?.handle, requireAdmin);
});
