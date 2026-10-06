import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PAGE_TEMPLATES, pageFromTemplate } from '@pms/shared';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { forgetPageQueryCache } from '../../apps/api/src/services/pages/query.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('my page: versions to go back to, frozen releases and read-only links', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  forgetPageQueryCache();
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pv-${suffix}`, name: `Versions ${suffix}` } });
  const otherUnit = await prisma.businessUnit.create({ data: { code: `pw-${suffix}`, name: `Other ${suffix}` } });
  const password = await hashPassword('test-pages-only');
  const admin = await prisma.user.create({ data: { email: `va-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: password } });
  const reader = await prisma.user.create({ data: { email: `vr-${suffix}@example.test`, name: 'Читатель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const base = { sponsor: '', projectManager: 'Анна', portfolio: 'TV', startDate: day('2026-09-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const project = await prisma.project.create({ data: { ...base, businessUnitId: unit.id, code: `PV-${suffix}`, name: 'Выпуски', rag: 'RED' } });

  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const session = async (email: string, unitId = unit.id) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-pages-only' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(baseUrl + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unitId, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asAdmin = await session(admin.email);
    const asReader = await session(reader.email);
    const asOutsider = await session(reader.email, otherUnit.id);
    const template = pageFromTemplate(PAGE_TEMPLATES[0], { mode: 'projects', projectIds: [project.id] }, 'ru');
    const page = await (await asAdmin('/api/pages', 'POST', template)).json();

    // A version, a change, then back: the changed state is kept as a version too.
    assert.equal((await asAdmin(`/api/pages/${page.id}/revisions`, 'POST', { label: 'Перед комитетом' })).status, 201);
    await asAdmin(`/api/pages/${page.id}`, 'PATCH', { title: 'Изменённая', expectedRevision: 1 });
    const versions = await (await asAdmin(`/api/pages/${page.id}/revisions`)).json();
    assert.deepEqual(versions.map((entry: { label: string }) => entry.label), ['Перед комитетом']);
    assert.equal((await asAdmin(`/api/pages/${page.id}/revisions/${versions[0].id}/restore`, 'POST', { expectedRevision: 1 })).status, 409);
    const restored = await (await asAdmin(`/api/pages/${page.id}/revisions/${versions[0].id}/restore`, 'POST', { expectedRevision: 2 })).json();
    assert.deepEqual([restored.title, restored.revision], [template.title, 3]);
    const after = await (await asAdmin(`/api/pages/${page.id}/revisions`)).json();
    assert.deepEqual(after.map((entry: { label: string; title: string }) => [entry.label, entry.title]), [['Перед восстановлением', 'Изменённая'], ['Перед комитетом', template.title]]);
    assert.equal((await asReader(`/api/pages/${page.id}/revisions`)).status, 403);

    // A release freezes the answers; later changes of the data do not move it.
    const release = await (await asAdmin(`/api/pages/${page.id}/releases`, 'POST', { label: 'Комитет 10.10' })).json();
    const frozen = await (await asAdmin(`/api/pages/${page.id}/releases/${release.id}`)).json();
    assert.equal(frozen.answer.results['k-red'].value, 1);
    await prisma.project.update({ where: { id: project.id }, data: { rag: 'GREEN' } });
    forgetPageQueryCache();
    assert.equal((await (await asAdmin(`/api/pages/${page.id}/releases/${release.id}`)).json()).answer.results['k-red'].value, 1);

    // A widget with its own scope: the release remembers every project read, not only the page's.
    const second = await prisma.project.create({ data: { ...base, businessUnitId: unit.id, code: `PV2-${suffix}`, name: 'Второй' } });
    const wide = { ...template.document, widgets: template.document.widgets.map((widget) => (widget.id === 'k-projects' ? { ...widget, scope: { mode: 'all' as const } } : widget)) };
    const current = await (await asAdmin(`/api/pages/${page.id}`)).json();
    assert.equal((await asAdmin(`/api/pages/${page.id}`, 'PATCH', { document: wide, expectedRevision: current.revision })).status, 200);
    const wideRelease = await (await asAdmin(`/api/pages/${page.id}/releases`, 'POST', { label: 'Шире' })).json();
    const stored = await prisma.dashboardPageRelease.findUniqueOrThrow({ where: { id: wideRelease.id } });
    assert.deepEqual([...stored.projectIds].sort(), [project.id, second.id].sort());
    assert.equal(JSON.stringify(stored.answers).includes('usedProjectIds'), false);

    // Links: live answers by the reader's own access, releases only with all their projects readable.
    const live = await (await asAdmin(`/api/pages/${page.id}/shares`, 'POST', { days: 7 })).json();
    const toRelease = await (await asAdmin(`/api/pages/${page.id}/shares`, 'POST', { releaseId: release.id })).json();
    assert.ok(live.token && live.expiresAt);
    const shares = await (await asAdmin(`/api/pages/${page.id}/shares`)).json();
    assert.equal(JSON.stringify(shares).includes(live.token), false, 'tokens are not kept');
    const opened = await (await asReader(`/api/page-links/${live.token}`)).json();
    assert.deepEqual([opened.release, opened.answer.results['k-red'].value], [null, 0]);
    const openedRelease = await (await asReader(`/api/page-links/${toRelease.token}`)).json();
    assert.equal(openedRelease.answer.results['k-red'].value, 1);
    assert.equal(openedRelease.release.label, 'Комитет 10.10');
    assert.equal((await asOutsider(`/api/page-links/${toRelease.token}`)).status, 403);
    assert.equal((await asOutsider(`/api/page-links/${live.token}`)).status, 200, 'a live link answers with what the reader may see');
    assert.equal((await asReader('/api/page-links/not-a-token')).status, 404);
    assert.equal((await asAdmin(`/api/pages/${page.id}/shares/${shares[0].id}`, 'DELETE')).status, 204);
    const revokedToken = shares[0].releaseId ? toRelease.token : live.token;
    assert.equal((await asReader(`/api/page-links/${revokedToken}`)).status, 404);
    await prisma.dashboardPageShare.updateMany({ where: { pageId: page.id, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const stillThere = shares[0].releaseId ? live.token : toRelease.token;
    assert.equal((await asReader(`/api/page-links/${stillThere}`)).status, 404, 'an expired link');
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.dashboardPage.deleteMany({ where: { ownerId: admin.id } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, reader.id] } } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: { in: [unit.id, otherUnit.id] } } }).catch(() => undefined);
  }
});
