import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';

import {
  createIssuesRouter,
  JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB,
  JIRA_CAPACITY_DEFAULT_STORAGE_GIB,
} from './issues.routes.js';

test('Jira capacity sampler uses the approved global history defaults', () => {
  assert.equal(JIRA_CAPACITY_DEFAULT_STORAGE_GIB, 5);
  assert.equal(JIRA_CAPACITY_DEFAULT_ALLOCATED_GIB, 0);
});

test('Jira capacity sampler rejects non-admin users before sampling', async () => {
  const router = createIssuesRouter() as unknown as {
    stack: Array<{
      route?: {
        path: string;
        stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
      };
    }>;
  };
  const route = router.stack.find(
    (layer) => layer.route?.path === '/projects/:projectId/jira/capacity-sample',
  )?.route;
  assert.ok(route);

  let status = 200;
  let payload: unknown;
  const response = {
    status(nextStatus: number) {
      status = nextStatus;
      return this;
    },
    json(nextPayload: unknown) {
      payload = nextPayload;
      return this;
    },
  } as unknown as Response;
  const request = {
    params: { projectId: 'project-1' },
    body: { scopeType: 'LABEL', scopeValue: 'cvte968' },
    currentUser: { role: 'PROJECT_MANAGER' },
  } as unknown as Request;

  await route.stack[0]!.handle(request, response);

  assert.equal(status, 403);
  assert.deepEqual(payload, {
    error: 'Замер ёмкости доступен только администратору системы',
  });
});
