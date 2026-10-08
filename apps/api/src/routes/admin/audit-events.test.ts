import assert from 'node:assert/strict';
import test from 'node:test';

import { auditEventsQuerySchema, auditEventsWhere } from './audit-events.js';

test('audit journal query keeps the first page of 100 events by default and caps a page at 200', () => {
  assert.equal(auditEventsQuerySchema.parse({}).limit, 100);
  assert.equal(auditEventsQuerySchema.safeParse({ limit: '201' }).success, false);
  assert.equal(auditEventsQuerySchema.safeParse({ from: '2026-09-01' }).success, false);
  assert.deepEqual(auditEventsWhere(auditEventsQuerySchema.parse({ actor: '  ' }), null), {});
});

test('audit journal filters combine period, project, actor, action and the cursor', () => {
  const query = auditEventsQuerySchema.parse({
    from: '2026-08-31T21:00:00.000Z',
    to: '2026-09-21T21:00:00.000Z',
    projectId: 'project-1',
    actor: ' ivanov ',
    action: 'issue.update',
  });
  const cursorAt = new Date('2026-09-10T10:00:00.000Z');
  assert.deepEqual(auditEventsWhere(query, { id: 'event-9', createdAt: cursorAt }), {
    AND: [
      { createdAt: { gte: new Date('2026-08-31T21:00:00.000Z'), lt: new Date('2026-09-21T21:00:00.000Z') } },
      { projectId: 'project-1' },
      { action: 'issue.update' },
      {
        OR: [
          { actorName: { contains: 'ivanov', mode: 'insensitive' } },
          { actorEmail: { contains: 'ivanov', mode: 'insensitive' } },
        ],
      },
      // Events of the same instant continue by id, so a page boundary neither repeats nor skips them.
      { OR: [{ createdAt: { lt: cursorAt } }, { createdAt: cursorAt, id: { lt: 'event-9' } }] },
    ],
  });
});
