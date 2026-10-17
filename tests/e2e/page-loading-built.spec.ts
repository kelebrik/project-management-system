import { expect, test, type Page } from './fixtures';
import { mockAdminProject } from './overview-and-baseline.support';

// Production chunks, rather than the dev server's source modules, are the contract here.
test.skip(process.env.E2E_BUILT !== '1', 'needs the built application');

async function mockPages(page: Page) {
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
  await mockAdminProject(page);
  await page.route('**/api/admin/config', route => route.fulfill({ json: { rolePermissions: [], dictionaryItems: [], systemSettings: [], projectModules: [], managedPermissions: [], health: {}, backupStatus: {} } }));
  await page.route('**/api/admin/integrations', route => route.fulfill({ json: { apiTokens: [], webhookEndpoints: [], webhookDeliveries: [], integrationSettings: [] } }));
}

test('built: unrelated sections load on first visit and reuse their code on return', async ({ page }) => {
  await mockPages(page);
  const scripts: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.url().endsWith('.js')) scripts.push(new URL(request.url()).pathname);
  });
  await page.goto('/projects');
  await expect(page.locator('.portfolio-progress-layout .highcharts-container')).toBeVisible();
  expect(scripts.some(file => /\/(?:WikiPage|WikiNavigation|wiki|Admin\w+|ProjectJiraWorkPage|ProjectWorkspacePage)-/.test(file))).toBe(false);

  const wiki = page.getByRole('button', { name: 'FAQ', exact: true });
  await wiki.focus();
  await expect.poll(() => scripts.some(file => /\/WikiPage-/.test(file))).toBe(true);
  await expect(page).toHaveURL(/\/projects$/);
  await wiki.click();
  await expect(page.locator('.wiki-article').first()).toBeVisible();
  await expect(page.locator('.wiki-section-tabs a').first()).toBeVisible();
  expect(scripts.some(file => /\/WikiPage-/.test(file))).toBe(true);
  const wikiRequests = scripts.filter(file => /\/(?:WikiPage|WikiNavigation|wiki)-/.test(file));

  await page.locator('.global-section-nav').getByRole('button', { name: 'Проекты', exact: true }).click();
  await expect(page.locator('.portfolio-progress-layout .highcharts-container')).toBeVisible();
  await page.getByRole('button', { name: 'FAQ', exact: true }).click();
  await expect(page.locator('.wiki-article').first()).toBeVisible();
  expect(scripts.filter(file => /\/(?:WikiPage|WikiNavigation|wiki)-/.test(file))).toEqual(wikiRequests);
  await page.getByTestId('language-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.wiki-section-tabs')).toHaveAttribute('aria-label', 'FAQ contents');
  expect(errors).toEqual([]);
});

test('built: a newly split admin page recovers when its old chunk is gone', async ({ page }) => {
  await mockPages(page);
  let failures = 0;
  await page.route(/\/assets\/AdminAuditPageContent-[^/]+\.js$/, route => {
    if (failures++ === 0) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fallback();
  });
  await page.goto('/admin/audit');
  await expect(page.locator('.audit-filters')).toBeVisible();
  expect(failures).toBe(2);
});

test('built: a failed hover preload leaves the current page usable and recovers on navigation', async ({ page }) => {
  await mockPages(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let documents = 0;
  page.on('request', request => { if (request.resourceType() === 'document') documents += 1; });
  let attempts = 0;
  await page.route(/\/assets\/WikiPage-[^/]+\.js$/, route => {
    if (attempts++ === 0) return route.fulfill({ status: 404, body: 'Not found' });
    return route.fallback();
  });
  await page.goto('/projects');
  await expect(page.locator('.portfolio-progress-layout .highcharts-container')).toBeVisible();
  await page.getByRole('button', { name: 'FAQ', exact: true }).hover();
  await expect.poll(() => attempts).toBe(1);
  await page.getByTestId('language-toggle').click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/projects$/);
  expect(documents).toBe(1);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'FAQ', exact: true }).click();
  await expect(page.locator('.wiki-article').first()).toBeVisible();
  expect(attempts).toBe(2);
  expect(documents).toBe(2);
});

test('built: a failed section keeps navigation available and another section opens', async ({ page }) => {
  await mockPages(page);
  await page.route(/\/assets\/WikiPage-[^/]+\.js$/, route => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto('/wiki');
  const error = page.getByRole('alert').filter({ hasText: 'Не удалось показать страницу' });
  await expect(error).toBeVisible();
  await expect(error).toContainText('вышла новая версия приложения');
  await page.locator('.global-section-nav').getByRole('button', { name: 'Проекты', exact: true }).click();
  await expect(page.locator('.portfolio-progress-layout .highcharts-container')).toBeVisible();
  await expect(error).toHaveCount(0);
});
