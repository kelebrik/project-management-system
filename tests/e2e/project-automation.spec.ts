import { expect, test } from './fixtures';
import { createIssueSchema, raidItemSchema, wbsItemSchema } from '@pms/shared';
import { mockAdminProject } from './overview-and-baseline.support';

const insight = {
  generatedAt: '2026-09-08T12:00:00Z',
  readiness: [{ id: 'goal', code: '2', title: 'Запуск', href: '/TV-OVERVIEW/wbs?focusWbs=goal', dueDate: '2026-10-01', state: 'blocked', remaining: [{ id: 'wbs-1', code: '1.1', title: 'Проверить образцы', href: '/TV-OVERVIEW/wbs?focusWbs=wbs-1' }], blockers: [], warnings: [] }],
  reconciliation: [{ id: 'wbs-1', code: '1.1', title: 'Проверить образцы', href: '/TV-OVERVIEW/wbs?focusWbs=wbs-1', jiraKey: 'TV-1', jiraStatus: 'Done', syncedAt: '2026-09-08T12:00:00Z', currentStatus: 'IN_PROGRESS', proposedStatus: 'DONE', currentOwner: 'Анна', proposedOwner: null, expectedUpdatedAt: '2026-09-08T12:00:00.000Z', expectedJiraUpdatedAt: '2026-09-08T11:00:00.000Z', warnings: [], actionable: true }],
};

test.afterEach(async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('automation.png'), fullPage: true });
});

test('weekly brief groups both history sources and switches project scope', async ({ page }) => {
  await mockAdminProject(page);
  await page.route('**/api/reports/weekly-brief?*', (route) => route.fulfill({ json: { from: '2026-09-01', to: '2026-09-08', projectCount: 1, warnings: ['История может быть неполной'], changes: [
    { id: 'c', projectId: 'project-1', projectCode: 'TV-OVERVIEW', title: 'Проверить образцы', field: 'Окончание', before: '2026-09-10', after: '2026-09-15', at: '2026-09-08', actor: 'Анна', href: '/TV-OVERVIEW/wbs?focusWbs=wbs-1', source: 'wbs' },
    { id: 'e', projectId: 'project-1', projectCode: 'TV-OVERVIEW', title: 'Поставка', field: 'Статус', before: 'Open', after: 'Closed', at: '2026-09-08', actor: 'Иван', href: '/TV-OVERVIEW/issues', source: 'journal' },
  ] } }));
  await page.goto('/reports?reportView=weekly');
  await expect(page.getByRole('heading', { name: 'Что изменилось за неделю', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Проверить образцы' })).toHaveAttribute('href', /focusWbs=wbs-1/);
  await expect(page.getByRole('heading', { name: /Вопросы, риски и проект — журнал/ })).toBeVisible();
  const request = page.waitForRequest((req) => req.url().includes('/reports/weekly-brief?') && !req.url().includes('projectId='));
  await page.getByLabel('Область отчета').selectOption(''); await request;
});

test('readiness exposes the actual unfinished prerequisite', async ({ page }) => {
  await mockAdminProject(page);
  await page.route('**/automation/insights', (route) => route.fulfill({ json: insight }));
  await page.goto('/TV-OVERVIEW/overview');
  await page.getByText('Готовность вех', { exact: true }).click();
  await expect(page.getByText('Есть незавершенные условия', { exact: true })).toBeVisible();
  await page.getByText('Осталось работ: 1').click();
  await expect(page.getByRole('link', { name: '1.1 Проверить образцы' })).toBeVisible();
});

test('Jira reconciliation applies only selected local fields with source preconditions', async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.route('**/automation/insights', (route) => route.fulfill({ json: insight }));
  let payload: any;
  await page.route('**/wbs-items/bulk', (route) => {
    payload = route.request().postDataJSON();
    return route.fulfill({ json: { ...project, updatedCount: 1 } });
  });
  await page.goto('/TV-OVERVIEW/jira-work');
  await expect(page.getByText('Сверка Jira и WBS', { exact: true })).toHaveCount(0);
  await page.goto('/development/jira-reconciliation');
  await page.getByLabel('Проект для сверки').selectOption('project-1');
  const apply = page.getByRole('button', { name: 'Применить выбранное к WBS' });
  await expect(apply).toBeDisabled();
  await page.locator('.automation-body').getByRole('checkbox').check();
  await apply.click();
  await expect(page.getByText('Обновлено работ: 1')).toBeVisible();
  expect(payload.items[0].patch).toEqual({ status: 'DONE' });
  expect(payload.items[0].expectedUpdatedAt).toBe(insight.reconciliation[0].expectedUpdatedAt);
  expect(payload.items[0].expectedJira.key).toBe('TV-1');
});

test('scenario preview changes no live data and restores a saved variant', async ({ page }) => {
  await mockAdminProject(page);
  let writes = 0;
  page.on('request', (request) => { if (request.url().includes('/api/') && ['PATCH', 'PUT', 'DELETE'].includes(request.method())) writes++; });
  await page.route('**/automation/scenario?*', (route) => {
    const patches = JSON.parse(new URL(route.request().url()).searchParams.get('patches')!);
    expect(patches).toEqual([{ id: 'wbs-1', workDays: 5 }]);
    return route.fulfill({ json: { schedule: { items: [{ id: 'wbs-1', startDate: '2026-09-08', dueDate: '2026-09-15' }], criticalDependencyIds: [], floatById: [{ itemId: 'wbs-1', totalFloatWorkDays: 0, isNearCritical: false }] }, fingerprint: 'baseline-v1', generatedAt: '2026-09-08', beforeFinish: '2026-09-10', afterFinish: '2026-09-15', beforeCriticalIds: ['wbs-1'], afterCriticalIds: ['wbs-1'], warnings: [], changes: [{ id: 'wbs-1', code: '1.1', title: 'Тестовая задача', href: '/TV-OVERVIEW/wbs', beforeStart: '2026-09-08', afterStart: '2026-09-08', beforeFinish: '2026-09-10', afterFinish: '2026-09-15', checkpoint: false }] } });
  });
  await page.goto('/TV-OVERVIEW/gantt');
  await page.getByText('Сценарии «Что будет, если…»', { exact: true }).click();
  await page.getByRole('button', { name: 'Добавить изменение' }).click();
  await page.getByLabel('Длительность, раб. дней').fill('5');
  const bar = page.locator('.gantt-bar').first();
  const workingTitle = await bar.getAttribute('title');
  await page.getByRole('button', { name: 'Сравнить с рабочим планом' }).click();
  await expect(bar).toHaveAttribute('title', /15\.09\.2026/);
  await expect(page.locator('.gantt-link-handle:enabled')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить вариант' }).click();
  await page.getByRole('button', { name: 'Вернуться к рабочему плану' }).click();
  await expect(bar).toHaveAttribute('title', workingTitle!);
  await expect(page.getByText('Завершение графика:', { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByText('Сценарии «Что будет, если…»', { exact: true }).click();
  await page.getByRole('button', { name: 'Загрузить', exact: true }).click();
  await expect(page.getByLabel('Длительность, раб. дней')).toHaveValue('5');
  expect(writes).toBe(0);
});

test('meeting drafts require review, create valid payloads and never retry uncertain outcomes', async ({ page }) => {
  await mockAdminProject(page);
  const created: string[] = [];
  await page.route('**/api/projects/project-1/wbs-items', (route) => {
    expect(wbsItemSchema.safeParse(route.request().postDataJSON()).success).toBe(true);
    created.push('task'); return route.fulfill({ status: 201, json: { item: { id: 'new-task' } } });
  });
  await page.route('**/api/projects/project-1/open-issues', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: [] });
    expect(createIssueSchema.safeParse(route.request().postDataJSON()).success).toBe(true);
    created.push('issue'); return route.fulfill({ status: 201, json: { id: 'new-issue' } });
  });
  await page.route('**/api/projects/project-1/raid-items', (route) => {
    expect(raidItemSchema.safeParse(route.request().postDataJSON()).success).toBe(true);
    created.push('risk'); return route.abort();
  });
  await page.goto('/TV-OVERVIEW/issues');
  await page.getByText('Из протокола — в поручения', { exact: true }).click();
  await page.getByLabel('Текст протокола').fill('Задача: Проверить новую плату; Ответственный: Анна; Срок: 2026-09-20\nВопрос: Согласовать доставку\nРиск: Задержка поставщика');
  await page.getByRole('button', { name: 'Подготовить черновики' }).click();
  const create = page.getByRole('button', { name: 'Создать проверенные записи' });
  await expect(create).toBeDisabled();
  await page.getByText('Из протокола — в поручения', { exact: true }).click();
  await page.getByText('Из протокола — в поручения', { exact: true }).click();
  await expect(page.getByLabel('Название', { exact: true }).first()).toHaveValue('Проверить новую плату');
  for (const checkbox of await page.locator('.automation-body').getByRole('checkbox').all()) await checkbox.check();
  await create.click();
  await expect(page.getByText('Создано записей: 2')).toBeVisible();
  await expect(page.getByText(/Результат сохранения неизвестен/)).toBeVisible();
  await expect(create).toBeDisabled();
  expect(created).toEqual(['task', 'issue', 'risk']);
});


test('development reconciliation switches project scope and clears selected proposals', async ({ page }) => {
  const project = await mockAdminProject(page);
  await page.route('**/api/projects', (route) => route.fulfill({ json: [project, { ...project, id: 'project-2', code: 'OTHER', name: 'Другой проект', status: 'CLOSED' }] }));
  const requested: string[] = [];
  await page.route('**/automation/insights', (route) => {
    requested.push(route.request().url());
    return route.fulfill({ json: insight });
  });
  await page.goto('/development/jira-reconciliation');
  const picker = page.getByLabel('Проект для сверки');
  await expect(picker).toHaveValue('');
  expect(requested).toHaveLength(0);
  await picker.selectOption('project-1');
  const checkbox = page.locator('.automation-body').getByRole('checkbox');
  await checkbox.check();
  const apply = page.getByRole('button', { name: 'Применить выбранное к WBS' });
  await expect(apply).toBeEnabled();
  await picker.selectOption('project-2');
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeDisabled();
  await expect(apply).toBeDisabled();
  expect(requested.at(-1)).toContain('/projects/project-2/automation/insights');
});


test('Gantt keeps compact controls and scrolls expanded rows inside fullscreen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAdminProject(page, (project) => {
    const task = project.wbsItems[0];
    project.wbsItems = Array.from({ length: 4 }, (_, phase) => [
      { ...task, id: `phase-${phase}`, code: `${phase + 1}`, title: `Фаза ${phase + 1}`, type: 'PHASE', parentId: null, wbsLevel: 1, sortOrder: phase * 20 },
      ...Array.from({ length: 15 }, (_, index) => ({ ...task, id: `task-${phase}-${index}`, parentId: `phase-${phase}`, code: `${phase + 1}.${index + 1}`, wbsLevel: 2, sortOrder: phase * 20 + index + 1 })),
    ]).flat();
  });
  await page.goto('/TV-OVERVIEW/gantt');
  const controls = page.locator('.gantt-controls');
  const normalHeight = (await controls.boundingBox())!.height;
  await page.getByRole('button', { name: 'Развернуть Гантт на весь экран' }).click();
  const fullscreenHeight = (await controls.boundingBox())!.height;
  expect(Math.abs(fullscreenHeight - normalHeight)).toBeLessThan(3);
  await page.locator('[aria-label="Глубина иерархии Гантта"]').getByRole('button', { name: '5', exact: true }).click();
  const scroll = page.locator('.gantt-panel-scroll');
  await expect.poll(() => scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByRole('button', { name: 'Вернуть обычный режим Гантта' })).toBeInViewport();
  expect(Math.abs((await controls.boundingBox())!.height - fullscreenHeight)).toBeLessThan(3);
  const chart = (await page.locator('.gantt-panel').boundingBox())!;
  expect(chart.y + chart.height).toBeLessThanOrEqual(900);
  await page.getByText('Сценарии «Что будет, если…»', { exact: true }).click();
  await page.getByRole('button', { name: 'Добавить изменение' }).click();
  await expect(page.getByRole('button', { name: 'Вернуть обычный режим Гантта' })).toBeInViewport();
  expect((await page.locator('.gantt-panel').boundingBox())!.height).toBeGreaterThan(150);
  await page.getByRole('button', { name: 'Вернуть обычный режим Гантта' }).click();
  expect(Math.abs((await controls.boundingBox())!.height - normalHeight)).toBeLessThan(3);
  await page.setViewportSize({ width: 800, height: 600 });
  await page.getByRole('button', { name: 'Развернуть Гантт на весь экран' }).click();
  await expect(page.getByRole('button', { name: 'Вернуть обычный режим Гантта' })).toBeInViewport();
  expect((await page.locator('.gantt-panel').boundingBox())!.height).toBeGreaterThanOrEqual(200);
});
