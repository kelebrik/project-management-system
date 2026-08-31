import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaClient } from '@prisma/client';

import { upsertIssueWorkPackage } from '../../apps/api/src/services/open-issue-work-package.js';

const testDatabaseUrl = process.env.JIRA_HISTORY_TEST_DATABASE_URL?.trim() ?? '';

test('open issue work package move keeps its subtree and stores a valid renumbering in PostgreSQL', {
  skip: !testDatabaseUrl,
}, async () => {
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'JIRA_HISTORY_TEST_DATABASE_URL must target a test database');
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const businessUnitId = `issue-wp-bu-${suffix}`;
  const projectId = `issue-wp-project-${suffix}`;
  try {
    await prisma.businessUnit.create({
      data: {
        id: businessUnitId,
        code: `issue-wp-${suffix}`,
        name: `Issue WP ${suffix}`,
      },
    });
    await prisma.project.create({
      data: {
        id: projectId,
        businessUnitId,
        code: `IWP-${suffix}`,
        name: 'Issue work package integration test',
        portfolio: 'TEST',
        sponsor: 'Test',
        projectManager: 'Test',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        targetDate: new Date('2026-12-31T00:00:00.000Z'),
        budgetPlanned: 0,
        budgetForecast: 0,
        summary: 'Temporary integration test project',
      },
    });
    await prisma.wbsItem.createMany({
      data: [
        {
          id: `phase-a-${suffix}`,
          projectId,
          code: '1',
          title: 'Phase A',
          type: 'PHASE',
          owner: 'Test',
          wbsLevel: 1,
          sortOrder: 10,
        },
        {
          id: `package-${suffix}`,
          projectId,
          parentId: `phase-a-${suffix}`,
          code: '1.1',
          title: 'Question package',
          type: 'WORK_PACKAGE',
          owner: 'Test',
          wbsLevel: 2,
          sortOrder: 20,
        },
        {
          id: `task-${suffix}`,
          projectId,
          parentId: `package-${suffix}`,
          code: '1.1.1',
          title: 'Nested task',
          type: 'TASK',
          owner: 'Test',
          wbsLevel: 3,
          sortOrder: 30,
        },
        {
          id: `phase-b-${suffix}`,
          projectId,
          code: '2',
          title: 'Phase B',
          type: 'PHASE',
          owner: 'Test',
          wbsLevel: 1,
          sortOrder: 40,
        },
        {
          id: `goal-${suffix}`,
          projectId,
          parentId: `phase-b-${suffix}`,
          code: '2.1',
          title: 'Phase B goal',
          type: 'GOAL',
          owner: 'Test',
          wbsLevel: 2,
          sortOrder: 50,
        },
      ],
    });

    const mutation = await prisma.$transaction((tx) => upsertIssueWorkPackage(tx, {
      projectId,
      phaseId: `phase-b-${suffix}`,
      workPackageId: `package-${suffix}`,
      title: 'Updated question package',
      owner: 'New owner',
      dueDate: new Date('2026-09-30T00:00:00.000Z'),
    }));
    assert.equal(mutation.kind, 'moved');

    const items = await prisma.wbsItem.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
    });
    assert.deepEqual(items.map((item) => item.id), [
      `phase-a-${suffix}`,
      `phase-b-${suffix}`,
      `package-${suffix}`,
      `task-${suffix}`,
      `goal-${suffix}`,
    ]);
    const workPackage = items.find((item) => item.id === `package-${suffix}`);
    const nestedTask = items.find((item) => item.id === `task-${suffix}`);
    assert.equal(workPackage?.parentId, `phase-b-${suffix}`);
    assert.equal(workPackage?.code, '2.1');
    assert.equal(workPackage?.title, 'Updated question package');
    assert.equal(nestedTask?.parentId, workPackage?.id);
    assert.equal(nestedTask?.code, '2.1.1');
    assert.equal(items.some((item) => item.code.startsWith('__')), false);
  } finally {
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.businessUnit.deleteMany({ where: { id: businessUnitId } });
    await prisma.$disconnect();
  }
});
