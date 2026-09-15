import { test, expect } from '@playwright/test';
import { mockAdminProject } from './overview-and-baseline.support';
import type { ArtifactTable } from '../../apps/web/src/app/artifactTable';

test('artifact grid persists dates, columns, prepended rows, files and safe links', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
  const project = await mockAdminProject(page);
  let stored: ArtifactTable | null = null;
  await page.route(`**/api/projects/${project.id}/artifact-table`, async route => {
    if (route.request().method() === 'PUT') stored = { ...route.request().postDataJSON(), revision: (stored?.revision ?? 0) + 1 };
    await route.fulfill({ json: stored });
  });
  await page.route(`**/api/projects/${project.id}/artifact-table/files`, async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data; boundary=');
    expect(route.request().postDataBuffer()?.toString()).toContain('hello attachment');
    await route.fulfill({ status: 201, json: { id: 'file-1', name: 'notes.txt' } });
  });
  await page.route(`**/api/projects/${project.id}/artifact-table/files/file-1`, route => route.fulfill({ body: 'hello attachment', contentType: 'application/octet-stream', headers: { 'Content-Disposition': "attachment; filename*=UTF-8''notes.txt" } }));
  await page.goto(`/${project.code}/artifacts`);
  const panel = page.locator('.artifact-table-page');
  await expect(panel.locator('.requirements-column-title')).toHaveCount(4);
  await expect(panel.getByTestId('artifact-table-row')).toHaveCount(1);
  await panel.locator('input[type=date]').fill('2026-09-15');
  await panel.locator('.artifact-table-cell textarea').first().fill('Original artifact');
  await panel.locator('.artifact-table-cell textarea').nth(2).fill('https://example.com/spec javascript:alert(1)');
  await expect(panel.getByRole('link', { name: 'https://example.com/spec', exact: true })).toHaveAttribute('href', 'https://example.com/spec');
  await expect(panel.locator('a[href^="javascript:"]')).toHaveCount(0);
  await panel.locator('input[type=file]').first().setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello attachment') });
  await expect(panel.getByRole('button', { name: 'notes.txt', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(panel.getByTestId('artifact-table-row')).toHaveCount(2);
  await expect(panel.getByTestId('artifact-table-row').first().locator('input[type=date]')).toHaveValue('');
  await expect(panel.getByTestId('artifact-table-row').nth(1).locator('input[type=date]')).toHaveValue('2026-09-15');
  await panel.getByRole('button', { name: 'Add column', exact: true }).click();
  await panel.locator('.requirements-column-title textarea').last().fill('Approval evidence');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.reload();
  await expect(panel.locator('.requirements-column-title textarea').last()).toHaveValue('Approval evidence');
  await expect(panel.getByTestId('artifact-table-row').nth(1).locator('input[type=date]')).toHaveValue('2026-09-15');
  await panel.screenshot({ path: '/tmp/pms-artifact-table.png' });
  const downloading = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'notes.txt', exact: true }).click();
  expect((await downloading).suggestedFilename()).toBe('notes.txt');
  await page.getByTestId('language-toggle').click();
  await expect(panel.getByRole('button', { name: 'Добавить строку', exact: true })).toBeVisible();
});

test('artifact save conflict retains unsaved edits', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
  const project = await mockAdminProject(page);
  await page.route(`**/api/projects/${project.id}/artifact-table`, route => route.request().method() === 'PUT' ? route.fulfill({ status: 409, json: { error: 'ARTIFACT_TABLE_CONFLICT' } }) : route.fulfill({ json: null }));
  await page.goto(`/${project.code}/artifacts`);
  const panel = page.locator('.artifact-table-page');
  const cell = panel.locator('.artifact-table-cell textarea').first();
  await expect(cell).toBeEnabled();
  await cell.fill('Keep my edits');
  await panel.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Reload saved table' })).toBeVisible();
  await expect(cell).toHaveValue('Keep my edits');
  await expect(panel.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});
