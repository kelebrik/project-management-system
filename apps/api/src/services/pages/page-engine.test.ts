import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAGE_FORMATS,
  combinePageValues,
  PAGE_METRICS,
  PAGE_QUESTIONS,
  PAGE_SOURCES,
  PAGE_TEMPLATES,
  evaluatePageQuery,
  pageBucketRange,
  pageCompactBoxes,
  pageDocumentSchema,
  pageFreeSpot,
  pageFromTemplate,
  pageLayoutProblem,
  pagePlaceBox,
  pageQueryProblem,
  resolvePageWidgetQuery,
  type PageDatasetRow,
  type PageQuerySpec,
} from '@pms/shared';

const ctx = { today: '2026-10-07', periodDays: 30 };
const row = (id: string, values: PageDatasetRow['values']): PageDatasetRow => ({ id, projectId: String(values.project ?? 'p'), values });
const shifts = [
  row('1', { project: 'TV', deltaDays: 7, later: true, reasonCategory: 'SUPPLIER', createdAt: '2026-10-06' }),
  row('2', { project: 'TV', deltaDays: -2, later: false, reasonCategory: null, createdAt: '2026-09-20' }),
  row('3', { project: 'AU', deltaDays: 4, later: true, reasonCategory: 'SUPPLIER', createdAt: '2026-09-01' }),
  row('4', { project: 'AU', deltaDays: 3, later: true, reasonCategory: 'CUSTOMER', createdAt: '2026-08-20' }),
];
const spec = (patch: Partial<PageQuerySpec>): PageQuerySpec => ({ source: 'shifts', filters: [], measure: { fn: 'count' }, output: 'value', ...patch });

test('a value counts the rows of the period and compares with the period before', () => {
  const result = evaluatePageQuery(shifts, spec({ periodField: 'createdAt', compare: true }), ctx);
  assert.equal(result.kind, 'value');
  assert.deepEqual(result.kind === 'value' && [result.value, result.previous], [2, 2]);
  const sum = evaluatePageQuery(shifts, spec({ measure: { fn: 'sum', field: 'deltaDays' } }), ctx);
  assert.equal(sum.kind === 'value' && sum.value, 12);
});

test('weeks of the period are all there, empty ones as zero, in time order', () => {
  const result = evaluatePageQuery(shifts, spec({ output: 'groups', periodField: 'createdAt', groupBy: 'createdAt', bucket: 'week' }), ctx);
  assert.equal(result.kind, 'groups');
  if (result.kind !== 'groups') return;
  assert.equal(result.groups[0].key, '2026-09-07');
  assert.equal(result.groups.at(-1)!.key, '2026-10-05');
  assert.deepEqual(result.groups.map((group) => group.value), [0, 1, 0, 0, 1]);
});

test('groups are sorted by value, empty values have their own group, and the rest folds into one', () => {
  const result = evaluatePageQuery(shifts, spec({ output: 'groups', groupBy: 'reasonCategory' }), ctx);
  assert.equal(result.kind, 'groups');
  if (result.kind !== 'groups') return;
  assert.deepEqual(result.groups.map((group) => [group.key, group.value]), [['SUPPLIER', 2], ['CUSTOMER', 1], [null, 1]]);
  const folded = evaluatePageQuery(shifts, spec({ output: 'groups', groupBy: 'reasonCategory', limit: 1 }), ctx);
  assert.deepEqual(folded.kind === 'groups' && folded.groups.map((group) => [group.key, group.value]), [['SUPPLIER', 2], ['__other__', 2]]);
});

test('a second split gives every group the same sub keys', () => {
  const result = evaluatePageQuery(shifts, spec({ output: 'groups', groupBy: 'project', groupBy2: 'reasonCategory' }), ctx);
  assert.equal(result.kind, 'groups');
  if (result.kind !== 'groups') return;
  assert.deepEqual(result.subKeys, ['SUPPLIER', 'CUSTOMER', null]);
  assert.deepEqual(result.groups.find((group) => group.key === 'TV')!.sub!.map((part) => part.value), [1, 0, 1]);
});

test('the folded rest keeps its rows for the second split', () => {
  const result = evaluatePageQuery(shifts, spec({ output: 'groups', groupBy: 'reasonCategory', groupBy2: 'project', limit: 1 }), ctx);
  assert.equal(result.kind, 'groups');
  if (result.kind !== 'groups') return;
  const rest = result.groups.find((group) => group.key === '__other__')!;
  assert.equal(rest.value, 2);
  assert.deepEqual(rest.sub!.map((part) => [part.key, part.value]), [['AU', 1], ['TV', 1]]);
});

test('the page period applies to events only, never to plans or due dates', () => {
  assert.match(pageQueryProblem({ source: 'work', filters: [], measure: { fn: 'count' }, periodField: 'dueDate', output: 'value' })!, /Период не применяется/);
  assert.equal(pageQueryProblem({ source: 'work', filters: [], measure: { fn: 'count' }, periodField: 'closedAt', output: 'value' }), null);
  // The closed list: moments something happened, never a plan or a due date.
  assert.deepEqual(Object.fromEntries(Object.values(PAGE_SOURCES).map((source) => [source.key, [...source.periodFields]])), {
    projects: [], work: ['closedAt'], checkpoints: [], risks: ['createdAt'], decisions: ['requestedAt', 'decidedAt', 'createdAt'], shifts: ['createdAt'],
    issues: ['createdAt'], changes: ['createdAt', 'approvedAt'], workload: [], checkins: ['weekStart'], jira: ['createdAt', 'resolvedAt'],
  });
});

test('rows are sorted by a field, cut at the limit and keep only the asked columns', () => {
  const result = evaluatePageQuery(shifts, spec({ output: 'rows', sort: { by: 'deltaDays', dir: 'desc' }, limit: 2, columns: ['deltaDays'] }), ctx);
  assert.equal(result.kind, 'rows');
  if (result.kind !== 'rows') return;
  assert.deepEqual(result.rows.map((entry) => entry.id), ['1', '3']);
  assert.equal(result.truncated, true);
  assert.equal(result.total, 4);
  assert.deepEqual(Object.keys(result.rows[0].values).sort(), ['deltaDays', 'project']);
});

test('filters: between, in, empty, booleans and text', () => {
  const run = (filters: PageQuerySpec['filters']) => evaluatePageQuery(shifts, spec({ filters }), ctx);
  assert.equal((run([{ field: 'deltaDays', op: 'between', value: 3, value2: 7 }]) as { value: number }).value, 3);
  assert.equal((run([{ field: 'reasonCategory', op: 'in', value: ['CUSTOMER', 'SUPPLIER'] }]) as { value: number }).value, 3);
  assert.equal((run([{ field: 'reasonCategory', op: 'empty' }]) as { value: number }).value, 1);
  assert.equal((run([{ field: 'later', op: 'isFalse' }]) as { value: number }).value, 1);
  assert.equal((run([{ field: 'reasonCategory', op: 'neq', value: 'SUPPLIER' }]) as { value: number }).value, 2);
  assert.equal((run([{ field: 'createdAt', op: 'lt', value: '2026-09-02' }]) as { value: number }).value, 2);
});

test('questions that cannot be answered say why', () => {
  assert.match(pageQueryProblem(spec({ groupBy: 'nope' }))!, /нет в источнике/);
  assert.match(pageQueryProblem({ ...spec({}), source: 'projects', measure: { fn: 'sum', field: 'progress' } })!, /Проценты нельзя складывать/);
  assert.match(pageQueryProblem(spec({ measure: { fn: 'avg', field: 'reasonCategory' } }))!, /числовому полю/);
  assert.match(pageQueryProblem(spec({ compare: true }))!, /период/);
  assert.equal(evaluatePageQuery(shifts, spec({ groupBy: 'deltaDays', output: 'groups' }), ctx).kind, 'error');
});

test('every metric, question and template refers to fields its source has', () => {
  for (const metric of PAGE_METRICS) {
    assert.equal(pageQueryProblem({ source: metric.source, filters: metric.filters, measure: metric.measure, periodField: metric.periodField, output: 'value' }), null, metric.id);
  }
  const widgets = [...PAGE_QUESTIONS.map((question) => question.widget), ...PAGE_TEMPLATES.flatMap((template) => template.widgets)];
  for (const widget of widgets) {
    const resolved = resolvePageWidgetQuery(widget);
    if (!resolved) continue;
    assert.ok('spec' in resolved, JSON.stringify(widget));
    assert.equal(pageQueryProblem(resolved.spec), null, JSON.stringify(widget));
    for (const column of resolved.spec.columns ?? []) assert.ok(PAGE_SOURCES[resolved.spec.source].fields.some((field) => field.key === column), column);
  }
});

test('templates make valid pages in both languages', () => {
  for (const template of PAGE_TEMPLATES) {
    for (const locale of ['ru', 'en'] as const) {
      const page = pageFromTemplate(template, { mode: 'all' }, locale);
      assert.equal(pageDocumentSchema.safeParse(page.document).success, true, `${template.id} ${locale}`);
    }
  }
});

test('placing a widget pushes the ones under it down, and refuses to push past the sheet', () => {
  const boxes = [
    { id: 'a', x: 0, y: 0, w: 6, h: 3 },
    { id: 'b', x: 0, y: 3, w: 6, h: 3 },
    { id: 'c', x: 6, y: 0, w: 6, h: 3 },
  ];
  const moved = pagePlaceBox(boxes, { id: 'c', x: 3, y: 2, w: 6, h: 2 }, 14)!;
  assert.deepEqual(moved.map((box) => [box.id, box.y]), [['a', 4], ['b', 7], ['c', 2]]);
  assert.equal(pageLayoutProblem(moved, 14), null);
  assert.equal(pagePlaceBox(boxes, { id: 'c', x: 0, y: 2, w: 6, h: 10 }, 14), null);
  assert.equal(pagePlaceBox(boxes, { id: 'c', x: 8, y: 0, w: 6, h: 3 }, 14), null);
});

test('free spots, overlaps and a smaller sheet', () => {
  const boxes = [{ id: 'a', x: 0, y: 0, w: 12, h: 3 }, { id: 'b', x: 0, y: 6, w: 4, h: 4 }];
  assert.deepEqual(pageFreeSpot(boxes, 4, 3, 14), { x: 0, y: 3 });
  assert.equal(pageFreeSpot(boxes, 12, 12, 14), null);
  assert.match(pageLayoutProblem([...boxes, { id: 'c', x: 2, y: 2, w: 2, h: 2 }], 14)!, /накладываются/);
  const compact = pageCompactBoxes(boxes, 7)!;
  assert.deepEqual(compact.map((box) => box.y), [0, 3]);
  assert.equal(pageCompactBoxes([{ id: 'x', x: 0, y: 0, w: 12, h: 10 }], PAGE_FORMATS.wide.rows - 5), null);
});

test('bucket ranges stop at the limit', () => {
  assert.equal(pageBucketRange('2000-01-01', '2026-01-01', 'day'), null);
  assert.deepEqual(pageBucketRange('2026-01-15', '2026-04-02', 'quarter'), ['2026-01-01', '2026-04-01']);
});

test('two metrics into one number: a share, a ratio, a difference, nothing when dividing by nothing', () => {
  assert.equal(combinePageValues(3, 12, 'percent'), 25);
  assert.equal(combinePageValues(5, 4, 'ratio'), 1.25);
  assert.equal(combinePageValues(5, 7.5, 'difference'), -2.5);
  assert.equal(combinePageValues(5, 0, 'percent'), null);
  assert.equal(combinePageValues(null, 3, 'difference'), null);
});

test('a widget of a source removed since the page was saved still loads and says so', () => {
  const widget = { type: 'kpi' as const, data: { metric: 'custom', source: 'lessons', measure: { fn: 'count' as const }, filters: [] } };
  assert.equal(pageDocumentSchema.safeParse({ ...pageFromTemplate(PAGE_TEMPLATES[0], { mode: 'all' }, 'ru').document, widgets: [{ id: 'old', x: 0, y: 0, w: 3, h: 3, title: '', ...widget }] }).success, true);
  const resolved = resolvePageWidgetQuery(widget);
  assert.ok(resolved && 'error' in resolved && /больше нет/.test(resolved.error));
});
