import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { prisma } from '../../apps/api/src/db.js';
import { anonymousVisitorHash, pageVisitActor } from '../../apps/api/src/routes/page-visits.routes.js';

const enabled = Boolean(process.env.DATABASE_URL);

// The guest rule was correct in isolation but the visit still never reached the
// database: PageVisit.userId is a foreign key, and the public demo identity has
// no row in User. Only a real insert catches that, which is why this test exists.
test('a guest visit is actually stored, including from the public demo identity', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);

  const created: string[] = [];
  const recordVisit = async (anonymousId: string) => {
    const eventId = randomUUID();
    const user = pageVisitActor({ id: 'public-demo-user' });
    await prisma.pageVisit.create({
      data: {
        eventId,
        actorType: user ? 'USER' : 'ANONYMOUS',
        userId: user?.id ?? null,
        userName: null,
        anonymousVisitorHash: user ? null : anonymousVisitorHash(anonymousId),
        pageKey: 'portfolio',
      },
    });
    created.push(eventId);
    return eventId;
  };

  try {
    const first = await recordVisit('11111111-1111-4111-8111-111111111111');
    const second = await recordVisit('22222222-2222-4222-8222-222222222222');

    const rows = await prisma.pageVisit.findMany({
      where: { eventId: { in: [first, second] } },
      select: { actorType: true, userId: true, anonymousVisitorHash: true },
    });

    assert.equal(rows.length, 2, 'both visits must survive the foreign key');
    assert.deepEqual([...new Set(rows.map((row) => row.actorType))], ['ANONYMOUS']);
    assert.deepEqual([...new Set(rows.map((row) => row.userId))], [null]);
    assert.equal(
      new Set(rows.map((row) => row.anonymousVisitorHash)).size,
      2,
      'two browsers must count as two guests',
    );
  } finally {
    await prisma.pageVisit.deleteMany({ where: { eventId: { in: created } } });
    await prisma.$disconnect();
  }
});
