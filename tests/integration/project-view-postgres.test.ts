import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('each person keeps their own view of a project, also when they may only read it', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pv-${suffix}`, name: 'View test' } });
  const password = await hashPassword('test-view-only');
  const editor = await prisma.user.create({ data: { email: `pve-${suffix}@example.test`, name: 'РП', role: 'PROJECT_MANAGER', passwordHash: password } });
  const reader = await prisma.user.create({ data: { email: `pvr-${suffix}@example.test`, name: 'Читатель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const outsider = await prisma.user.create({ data: { email: `pvo-${suffix}@example.test`, name: 'Чужой', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const sharedUiState = { wbsColumnOrder: ['level', 'structure', 'owner'], passportRows: [{ id: 'x', field: 'Поле', description: 'Значение' }] };
  const project = await prisma.project.create({
    data: { code: `PV-${suffix}`, name: 'View', businessUnitId: unit.id, portfolio: 'TEST', sponsor: '', projectManager: 'РП', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '', status: 'CLOSED', uiState: sharedUiState },
  });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: editor.id, level: 'EDIT' } });
  await prisma.projectAccess.create({ data: { projectId: project.id, userId: reader.id, level: 'VIEW' } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-view-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const asEditor = await session(editor.email);
    const asReader = await session(reader.email);
    const asOutsider = await session(outsider.email);
    const path = `/api/projects/${project.id}/my-view`;

    assert.deepEqual(await (await asReader(path)).json(), { state: null });
    // A reader of a closed project still arranges their own view.
    const saved = await asReader(path, 'PATCH', { wbsHiddenColumns: ['comment'], wbsColumnWidths: { owner: 220 } });
    assert.equal(saved.status, 200, await saved.clone().text());
    await asReader(path, 'PATCH', { wbsSort: { columnKey: 'start', direction: 'desc' }, wbsHierarchyLevel: 2 });
    assert.deepEqual((await (await asReader(path)).json()).state, {
      wbsHiddenColumns: ['comment'], wbsColumnWidths: { owner: 220 }, wbsSort: { columnKey: 'start', direction: 'desc' }, wbsHierarchyLevel: 2,
    });

    // Nobody else sees it, and the project itself does not change.
    assert.deepEqual(await (await asEditor(path)).json(), { state: null });
    const overview = await (await asEditor(`/api/projects/${project.id}/overview`)).json();
    assert.equal(overview.myViewState, null);
    assert.deepEqual(overview.uiState, sharedUiState);
    const readerOverview = await (await asReader(`/api/projects/${project.id}/overview`)).json();
    assert.equal(readerOverview.myViewState.wbsHierarchyLevel, 2);

    // Two changes at the same moment both stay.
    await Promise.all([asEditor(path, 'PATCH', { ganttWbsWidth: 400 }), asEditor(path, 'PATCH', { sidebarCollapsed: true })]);
    assert.deepEqual((await (await asEditor(path)).json()).state, { ganttWbsWidth: 400, sidebarCollapsed: true });

    // An old stored value out of range drops only that field from the view.
    await prisma.userViewDefaults.update({
      where: { userId: editor.id },
      data: { state: { ganttWbsWidth: 400, wbsColumnWidths: { owner: 999999 } } },
    });
    assert.deepEqual((await (await asEditor(path)).json()).state, { ganttWbsWidth: 400 });

    assert.equal((await asReader(path, 'PATCH', { passportRows: [] })).status, 400);
    assert.equal((await asReader(path, 'PATCH', { wbsColumnWidths: { owner: 99999 } })).status, 400);
    // Every signed-in person reads every project today, so another person has a view of their own.
    assert.equal((await asOutsider(path, 'PATCH', { wbsHiddenColumns: [] })).status, 200);
    assert.deepEqual((await (await asOutsider(path)).json()).state, { wbsHiddenColumns: [] });
    assert.equal((await asOutsider('/api/projects/no-such-project/my-view')).status, 404);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { id: project.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [editor.id, reader.id, outsider.id] } } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});

test('the Structure layout a person sets in one project holds in every project; the hierarchy level stays with each', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pd-${suffix}`, name: 'View defaults test' } });
  const password = await hashPassword('test-view-only');
  const pm = await prisma.user.create({ data: { email: `pdp-${suffix}@example.test`, name: 'РП', role: 'ADMIN', passwordHash: password } });
  const other = await prisma.user.create({ data: { email: `pdo-${suffix}@example.test`, name: 'Другой', role: 'ADMIN', passwordHash: password } });
  const projectData = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: '', projectManager: 'РП', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const first = await prisma.project.create({ data: { ...projectData, code: `PA-${suffix}`, name: 'A' } });
  const second = await prisma.project.create({ data: { ...projectData, code: `PB-${suffix}`, name: 'B' } });
  // An older record of B from before the layout was shared: the layout set later wins over it.
  await prisma.userProjectViewState.create({ data: { userId: pm.id, projectId: second.id, state: { wbsHiddenColumns: ['owner'], currentWorkColumnWidths: { title: 300 } } } });
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-view-only' }) });
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(url + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  const view = (id: string) => `/api/projects/${id}/my-view`;
  try {
    const asPm = await session(pm.email);
    const asOther = await session(other.email);
    const layout = { wbsColumnOrder: ['level', 'structure', 'status', 'owner'], wbsHiddenColumns: [], wbsColumnWidths: { owner: 240 }, wbsSort: null };
    assert.equal((await asPm(view(first.id), 'PATCH', { ...layout, wbsHierarchyLevel: 3 })).status, 200);

    // B, and a project made after, open with the same layout; their own level and other tables' widths stay theirs.
    const third = await prisma.project.create({ data: { ...projectData, code: `PC-${suffix}`, name: 'C' } });
    const inSecond = (await (await asPm(view(second.id))).json()).state;
    assert.deepEqual(inSecond, { ...layout, currentWorkColumnWidths: { title: 300 } });
    const thirdOverview = await (await asPm(`/api/projects/${third.id}/overview`)).json();
    assert.deepEqual(thirdOverview.myViewState, layout);
    assert.equal((await (await asPm(view(first.id))).json()).state.wbsHierarchyLevel, 3);

    // A change in B shows in A; someone else's view is untouched.
    assert.equal((await asPm(view(second.id), 'PATCH', { wbsHiddenColumns: ['comment'], sidebarCollapsed: false })).status, 200);
    const inFirst = (await (await asPm(view(first.id))).json()).state;
    assert.deepEqual([inFirst.wbsHiddenColumns, inFirst.sidebarCollapsed, inFirst.wbsHierarchyLevel], [['comment'], false, 3]);
    assert.deepEqual((await (await asOther(view(first.id))).json()).state, null);

    // Changes made at once from two projects both stay.
    await Promise.all([
      asPm(view(first.id), 'PATCH', { ganttWbsWidth: 420, wbsHierarchyLevel: 2 }),
      asPm(view(second.id), 'PATCH', { ganttPanelHeight: 500, wbsHierarchyLevel: 4 }),
    ]);
    const [a, b] = await Promise.all([first, second].map(async (project) => (await (await asPm(view(project.id))).json()).state));
    assert.deepEqual([a.ganttWbsWidth, a.ganttPanelHeight, a.wbsHierarchyLevel], [420, 500, 2]);
    assert.deepEqual([b.ganttWbsWidth, b.ganttPanelHeight, b.wbsHierarchyLevel], [420, 500, 4]);
  } finally {
    server.close();
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [pm.id, other.id] } } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});

test('the migration takes each shared layout field from the project the person arranged it in last', { skip: !enabled }, async () => {
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pm-${suffix}`, name: 'View backfill test' } });
  const user = await prisma.user.create({ data: { email: `pm-${suffix}@example.test`, name: 'РП', role: 'ADMIN' } });
  const projectData = { businessUnitId: unit.id, portfolio: 'TEST', sponsor: '', projectManager: 'РП', startDate: day('2026-10-01'), targetDate: day('2026-12-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const older = await prisma.project.create({ data: { ...projectData, code: `PO-${suffix}`, name: 'Old' } });
  const newer = await prisma.project.create({ data: { ...projectData, code: `PN-${suffix}`, name: 'New' } });
  await prisma.userProjectViewState.create({ data: { userId: user.id, projectId: older.id, state: { wbsHiddenColumns: ['owner'], wbsColumnWidths: { owner: 200 }, wbsHierarchyLevel: 2 }, updatedAt: new Date('2026-10-01T00:00:00Z') } });
  await prisma.userProjectViewState.create({ data: { userId: user.id, projectId: newer.id, state: { wbsHiddenColumns: [], sidebarCollapsed: false }, updatedAt: new Date('2026-10-10T00:00:00Z') } });
  try {
    const sql = readFileSync(new URL('../../prisma/migrations/20261016120000_user_view_defaults/migration.sql', import.meta.url), 'utf8');
    const backfill = sql.slice(sql.indexOf('INSERT INTO "UserViewDefaults"')).replace(/;\s*$/, '');
    await prisma.$executeRawUnsafe(backfill.replace('GROUP BY latest."userId"', `WHERE latest."userId" = '${user.id}' GROUP BY latest."userId"`));
    const row = await prisma.userViewDefaults.findUniqueOrThrow({ where: { userId: user.id } });
    assert.deepEqual(row.state, { wbsHiddenColumns: [], wbsColumnWidths: { owner: 200 }, sidebarCollapsed: false });
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.project.deleteMany({ where: { businessUnitId: unit.id } });
    await prisma.businessUnit.delete({ where: { id: unit.id } });
  }
});
