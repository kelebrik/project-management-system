import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PAGE_TEMPLATES, pageFromTemplate } from '@pms/shared';
import { prisma } from '../../apps/api/src/db.js';
import { createApp } from '../../apps/api/src/server/app.js';
import { hashPassword } from '../../apps/api/src/server/auth.js';
import { loadPortfolioReport } from '../../apps/api/src/services/portfolio-reports.js';
import { forgetPageQueryCache, runPageQueries } from '../../apps/api/src/services/pages/query.js';
import { PAGE_SOURCE_ADAPTERS } from '../../apps/api/src/services/pages/registry.js';

const enabled = process.env.WORKFLOW_TEST_DATABASE === 'true';
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

test('my page: sources mean what the portfolio report means, pages belong to their owner and saves do not overwrite each other', { skip: !enabled }, async () => {
  assert.match(new URL(process.env.DATABASE_URL!).pathname, /test/);
  forgetPageQueryCache();
  const suffix = randomUUID().slice(0, 8);
  const unit = await prisma.businessUnit.create({ data: { code: `pg-${suffix}`, name: `Pages ${suffix}` } });
  const password = await hashPassword('test-pages-only');
  const admin = await prisma.user.create({ data: { email: `pa-${suffix}@example.test`, name: 'Админ', role: 'ADMIN', passwordHash: password } });
  const otherAdmin = await prisma.user.create({ data: { email: `pb-${suffix}@example.test`, name: 'Другой', role: 'ADMIN', passwordHash: password } });
  const viewer = await prisma.user.create({ data: { email: `pv-${suffix}@example.test`, name: 'Зритель', role: 'EXECUTIVE_VIEWER', passwordHash: password } });
  const base = { businessUnitId: unit.id, sponsor: '', projectManager: 'Анна', startDate: day('2026-09-01'), budgetPlanned: 0, budgetForecast: 0, summary: '' };
  const tv = await prisma.project.create({ data: { ...base, portfolio: 'TV', code: `PGT-${suffix}`, name: 'Телевизор', initialTargetDate: day('2026-12-01'), targetDate: day('2026-12-11'), rag: 'RED', progress: 40 } });
  const au = await prisma.project.create({ data: { ...base, portfolio: 'AU', code: `PGA-${suffix}`, name: 'Аудио', targetDate: day('2026-12-01'), rag: 'GREEN', progress: 80 } });
  const closed = await prisma.project.create({ data: { ...base, portfolio: 'TV', code: `PGC-${suffix}`, name: 'Закрытый', targetDate: day('2026-12-01'), status: 'CLOSED' } });
  const item = (projectId: string, data: Record<string, unknown>) => prisma.wbsItem.create({ data: { projectId, owner: 'Иван', ...data } as never });

  const previousProfile = process.env.DEPLOYMENT_PROFILE;
  process.env.DEPLOYMENT_PROFILE = 'cloud';
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const session = async (email: string) => {
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'test-pages-only' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    return (path: string, method = 'GET', body?: unknown) =>
      fetch(baseUrl + path, { method, headers: { Cookie: cookie, 'x-business-unit-id': unit.id, 'Content-Type': 'application/json', 'X-PMS-Section': 'development' }, body: body === undefined ? undefined : JSON.stringify(body) });
  };
  try {
    const phase = await item(tv.id, { code: '1', title: 'Разработка', type: 'PHASE', status: 'IN_PROGRESS' });
    await item(tv.id, { code: '1.1', title: 'Плата', type: 'TASK', status: 'IN_PROGRESS', dueDate: day('2026-09-20'), parentId: phase.id });
    await item(tv.id, { code: '1.2', title: 'Готовая', type: 'TASK', status: 'DONE', dueDate: day('2026-09-20'), closedAt: day('2026-09-25'), parentId: phase.id });
    const parent = await item(tv.id, { code: '1.3', title: 'Пакет', type: 'WORK_PACKAGE', status: 'IN_PROGRESS', dueDate: day('2026-09-01'), parentId: phase.id });
    await item(tv.id, { code: '1.3.1', title: 'Внутри пакета', type: 'TASK', status: 'NOT_STARTED', dueDate: day('2026-10-20'), parentId: parent.id });
    const beta = await item(tv.id, { code: '2', title: 'Beta', type: 'MILESTONE', status: 'NOT_STARTED', dueDate: day('2026-10-17'), forecastDueDate: day('2026-10-21'), baselineDueDate: day('2026-10-14') });
    await item(au.id, { code: '1', title: 'Достигнута', type: 'GOAL', status: 'DONE', dueDate: day('2026-09-10') });
    await prisma.raidItem.create({ data: { projectId: tv.id, type: 'RISK', title: 'Поставщик', description: '', owner: 'Иван', status: 'OPEN', riskScore: 20 } as never });
    await prisma.raidItem.create({ data: { projectId: au.id, type: 'RISK', title: 'Средний', description: '', owner: '', status: 'OPEN', riskScore: 9 } as never });
    await prisma.raidItem.create({ data: { projectId: closed.id, type: 'RISK', title: 'Из закрытого', description: '', owner: '', status: 'OPEN', riskScore: 25 } as never });
    await prisma.decision.create({ data: { projectId: tv.id, title: 'Поставщик плат', status: 'PENDING_APPROVAL', approverName: 'Спонсор', requestedAt: day('2026-10-02') } });
    await prisma.scheduleShift.create({ data: { projectId: tv.id, checkpointId: beta.id, checkpointCode: '2', checkpointTitle: 'Beta', checkpointType: 'MILESTONE', previousDate: day('2026-10-17'), newDate: day('2026-10-21'), deltaDays: 4, trigger: 'EDIT', operationId: `op-${suffix}`, reasonCategory: 'SUPPLIER', createdAt: day('2026-10-05') } });

    const now = new Date('2026-10-07T10:00:00.000Z');
    const projects = [tv, au].map((project) => ({ id: project.id, code: project.code, name: project.name, portfolio: project.portfolio }));
    const context = { projects, now, today: '2026-10-07' };
    const projectRows = await PAGE_SOURCE_ADAPTERS.projects!(context);
    const report = await loadPortfolioReport({ id: { in: [tv.id, au.id] } }, { now, horizonDays: 28, periodDays: 30 });
    for (const line of report.summary) {
      const row = projectRows.find((entry) => entry.projectId === line.projectId)!;
      assert.equal(row.values.overdueWork, line.overdueWork, 'overdue as in the report');
      assert.equal(row.values.redRisks, line.redRisks, 'red risks as in the report');
    }
    const tvRow = projectRows.find((row) => row.projectId === tv.id)!;
    assert.equal(tvRow.values.targetShiftDays, 10);
    assert.equal(tvRow.values.nextCheckpoint, 'Beta');
    assert.equal(tvRow.values.nextCheckpointSlipDays, 7);
    assert.equal(tvRow.values.waitingDecisions, 1);

    const work = await PAGE_SOURCE_ADAPTERS.work!(context);
    assert.deepEqual(work.map((row) => row.values.code).sort(), ['1.1', '1.2', '1.3.1'], 'only work without child rows');
    assert.equal(work.filter((row) => row.values.overdue).length, tvRow.values.overdueWork);
    assert.equal(work.find((row) => row.values.code === '1.1')!.values.phase, 'Разработка');
    assert.equal(work.find((row) => row.values.code === '1.1')!.values.overdueDays, 17);

    const checkpoints = await PAGE_SOURCE_ADAPTERS.checkpoints!(context);
    assert.deepEqual(checkpoints.map((row) => row.values.title).sort(), ['Beta', 'Достигнута'], 'reached checkpoints and those without shifts too');
    const betaRow = checkpoints.find((row) => row.values.title === 'Beta')!;
    assert.deepEqual([betaRow.values.slipDays, betaRow.values.inDays, betaRow.values.shiftCount], [7, 14, 1]);

    const risks = await PAGE_SOURCE_ADAPTERS.risks!(context);
    assert.deepEqual(risks.map((row) => row.values.level).sort(), ['AMBER', 'RED']);

    // The query of a whole page: the template answers, closed projects stay out, a portfolio narrows.
    const template = pageFromTemplate(PAGE_TEMPLATES.find((entry) => entry.id === 'portfolio-executive')!, { mode: 'all' }, 'ru');
    const queries = template.document.widgets.map((widget) => ({ id: widget.id, widget: { type: widget.type, data: widget.data } }));
    const answer = await runPageQueries({ businessUnitId: unit.id }, { scope: { mode: 'all' }, periodDays: 30, queries }, now);
    assert.deepEqual(answer.projects.map((project) => project.code).sort(), [au.code, tv.code]);
    const value = (id: string) => (answer.results[id] as { value: number }).value;
    assert.deepEqual([value('k-projects'), value('k-red'), value('k-risks'), value('k-overdue')], [2, 1, 1, 1]);
    const table = answer.results['t-projects'];
    assert.equal(table.kind, 'rows');
    const reasons = answer.results['c-reasons'];
    assert.deepEqual(reasons.kind === 'groups' && reasons.groups.map((group) => [group.key, group.value]), [['SUPPLIER', 4]]);
    const portfolio = await runPageQueries({ businessUnitId: unit.id }, { scope: { mode: 'portfolio', portfolios: ['AU'] }, periodDays: 30, queries: queries.slice(0, 1) }, now);
    assert.equal((portfolio.results['k-projects'] as { value: number }).value, 1);

    // A number made of two metrics: overdue work as a share of the work to do.
    const share = await runPageQueries({ businessUnitId: unit.id }, {
      scope: { mode: 'all' }, periodDays: 30,
      queries: [{ id: 'f', widget: { type: 'kpi', data: { metric: 'work.overdue', filters: [] }, formula: { op: 'percent', data: { metric: 'work.open', filters: [] } } } }],
    }, now);
    assert.equal((share.results.f as { value: number }).value, 50);

    // Past the row limit a number is refused, a table shows the first rows and says it is cut.
    forgetPageQueryCache();
    const limited = await runPageQueries({ businessUnitId: unit.id }, {
      scope: { mode: 'all' }, periodDays: 30,
      queries: [
        { id: 'n', widget: { type: 'kpi', data: { metric: 'work.open', filters: [] } } },
        { id: 't', widget: { type: 'table', data: { metric: 'work.open', filters: [], columns: ['code', 'title'] } } },
      ],
    }, now, 1);
    assert.equal(limited.results.n.kind, 'error');
    assert.equal(limited.results.t.kind, 'rows');
    assert.equal((limited.results.t as { truncated: boolean }).truncated, true);
    forgetPageQueryCache();

    // Over HTTP: owners only, revisions, viewers kept out.
    const asAdmin = await session(admin.email);
    const asOther = await session(otherAdmin.email);
    const asViewer = await session(viewer.email);
    // Anyone signed in has their own pages.
    const viewerPages = await asViewer('/api/pages');
    assert.equal(viewerPages.status, 200);
    assert.deepEqual((await viewerPages.json()).pages, []);
    const created = await asAdmin('/api/pages', 'POST', template);
    assert.equal(created.status, 201, await created.clone().text());
    const page = await created.json();
    assert.equal((await asOther(`/api/pages/${page.id}`)).status, 404);
    assert.equal((await asViewer(`/api/pages/${page.id}`)).status, 404);
    assert.equal((await asOther(`/api/pages/${page.id}`, 'DELETE')).status, 404);
    const renamed = await asAdmin(`/api/pages/${page.id}`, 'PATCH', { title: 'Портфель TV', expectedRevision: 1 });
    assert.equal(renamed.status, 200);
    assert.equal((await renamed.json()).revision, 2);
    const stale = await asAdmin(`/api/pages/${page.id}`, 'PATCH', { title: 'Старая вкладка', expectedRevision: 1 });
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).page.title, 'Портфель TV');
    const overlapping = { ...template.document, widgets: [...template.document.widgets, { ...template.document.widgets[0], id: 'dup' }] };
    assert.equal((await asAdmin(`/api/pages/${page.id}`, 'PATCH', { document: overlapping, expectedRevision: 2 })).status, 400);
    const query = await asAdmin('/api/pages/query', 'POST', { scope: { mode: 'projects', projectIds: [tv.id, closed.id] }, periodDays: 30, queries: queries.slice(0, 1) });
    assert.equal(query.status, 200, await query.clone().text());
    assert.equal((await query.json()).results['k-projects'].value, 1, 'a closed project is not counted even when named');
    const copy = await asAdmin(`/api/pages/${page.id}/duplicate`, 'POST');
    assert.equal(copy.status, 201);
    const list = await (await asAdmin('/api/pages')).json();
    assert.equal(list.pages.length, 2);
    assert.equal((await asAdmin(`/api/pages/${page.id}`, 'DELETE')).status, 204);
    const options = await (await asAdmin('/api/pages/scope-options')).json();
    assert.deepEqual(options.portfolios, ['AU', 'TV']);

    // The quota holds when several tabs create pages at once.
    const have = await prisma.dashboardPage.count({ where: { ownerId: admin.id } });
    await prisma.dashboardPage.createMany({ data: Array.from({ length: 49 - have }, (_, index) => ({ ownerId: admin.id, title: `Страница ${index}`, document: template.document })) });
    const burst = await Promise.all([0, 1, 2, 3].map(() => asAdmin('/api/pages', 'POST', template)));
    assert.deepEqual(burst.map((response) => response.status).sort(), [201, 409, 409, 409]);
    assert.equal((await burst.find((response) => response.status === 409)!.json()).code, 'PAGES_LIMIT');
    assert.equal(await prisma.dashboardPage.count({ where: { ownerId: admin.id } }), 50);
  } finally {
    server.close();
    process.env.DEPLOYMENT_PROFILE = previousProfile;
    await prisma.dashboardPage.deleteMany({ where: { ownerId: { in: [admin.id, otherAdmin.id] } } }).catch(() => undefined);
    await prisma.project.deleteMany({ where: { id: { in: [tv.id, au.id, closed.id] } } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, otherAdmin.id, viewer.id] } } }).catch(() => undefined);
    await prisma.businessUnit.deleteMany({ where: { id: unit.id } }).catch(() => undefined);
  }
});
