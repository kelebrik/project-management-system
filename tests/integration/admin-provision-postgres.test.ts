import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { verifyPassword } from '../../apps/api/src/server/auth.js';
import { adminStatus, grantAdmin, ProvisionError, setPassword } from '../../apps/api/src/services/admin-provision.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';

test('the command line creates or restores an administrator and resets a password', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const email = `Root-${suffix}@Example.test`;
  const viewer = await prisma.user.create({ data: { email: `viewer-${suffix}@example.test`, name: 'Зритель', role: 'EXECUTIVE_VIEWER', isActive: false } });
  try {
    assert.deepEqual(await grantAdmin(prisma, { email, name: 'Root' }), { email: email.toLowerCase(), created: true });
    // An administrator switched off by mistake comes back, without the sessions from before.
    await prisma.userSession.create({ data: { userId: viewer.id, tokenHash: `old-${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    assert.deepEqual(await grantAdmin(prisma, { email: viewer.email }), { email: viewer.email, created: false });
    assert.equal(await prisma.userSession.count({ where: { userId: viewer.id } }), 0);
    const restored = await prisma.user.findUniqueOrThrow({ where: { id: viewer.id } });
    assert.deepEqual([restored.role, restored.isActive, restored.name], ['ADMIN', true, 'Зритель']);
    assert.ok((await adminStatus(prisma)).some((admin) => admin.email === email.toLowerCase() && admin.isActive && !admin.hasPassword));

    await prisma.userSession.create({ data: { userId: viewer.id, tokenHash: `t-${suffix}`, expiresAt: new Date(Date.now() + 86_400_000) } });
    await assert.rejects(setPassword(prisma, { email: viewer.email, password: 'short' }), ProvisionError);
    await assert.rejects(setPassword(prisma, { email: `nobody-${suffix}@example.test`, password: 'long enough password' }), ProvisionError);
    await assert.rejects(grantAdmin(prisma, { email: 'not an address' }), ProvisionError);
    await setPassword(prisma, { email: viewer.email, password: 'long enough password' });
    const withPassword = await prisma.user.findUniqueOrThrow({ where: { id: viewer.id } });
    assert.equal(await verifyPassword('long enough password', withPassword.passwordHash), true);
    assert.equal(await prisma.userSession.count({ where: { userId: viewer.id } }), 0);
    assert.equal(await prisma.auditEvent.count({ where: { objectId: { in: [viewer.id] }, action: { startsWith: 'user.cli_' } } }), 2);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { action: { startsWith: 'user.cli_' }, metadata: { path: ['email'], string_contains: suffix } } });
    await prisma.user.deleteMany({ where: { email: { in: [email.toLowerCase(), viewer.email] } } });
  }
});
