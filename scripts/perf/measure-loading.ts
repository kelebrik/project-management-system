/**
 * Compare production builds with the same API fixture and a fresh browser cache.
 * npm run build
 * PERF_DIST=apps/web/dist node --import tsx scripts/perf/measure-loading.ts
 * Optional: PERF_RUNS=5 PERF_CPU_RATE=4 PERF_LATENCY_MS=40 PERF_MBPS=5
 *           PERF_OUTPUT=/tmp/loading.json
 * Serves gzip on localhost with fixed CPU/network settings; API responses are fixtures.
 * This measures frontend loading, not production API or database latency.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, type Page } from 'playwright';
import { mockAdminProject } from '../../tests/e2e/overview-and-baseline.support';

type Sample = { step: string; readyMs: number; longTaskMs: number; jsBytes: number; jsGzipBytes: number; jsFiles: string[] };
const root = path.resolve(process.env.PERF_DIST ?? 'apps/web/dist');
const runs = Number(process.env.PERF_RUNS ?? 5);
const cpuRate = Number(process.env.PERF_CPU_RATE ?? 4);
const latencyMs = Number(process.env.PERF_LATENCY_MS ?? 40);
const mbps = Number(process.env.PERF_MBPS ?? 5);
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const files = new Map<string, { body: Buffer; gzip: Buffer; type: string }>();

async function file(urlPath: string) {
  const relative = urlPath === '/' || !path.extname(urlPath) ? 'index.html' : urlPath.slice(1);
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(`${root}${path.sep}`)) throw new Error('Invalid asset path');
  let value = files.get(urlPath);
  if (!value) {
    const body = await readFile(filename);
    value = { body, gzip: gzipSync(body), type: types[path.extname(filename)] ?? 'application/octet-stream' };
    files.set(urlPath, value);
  }
  return value;
}

async function measure(page: Page, step: string, action: () => Promise<unknown>, ready: () => Promise<unknown>): Promise<Sample> {
  const requests = new Set<string>();
  const record = (request: { url(): string }) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('.js')) requests.add(pathname);
  };
  page.on('request', record);
  const started = performance.now();
  try {
    await page.evaluate(() => { (window as unknown as { __loadingTasks: number }).__loadingTasks = 0; });
    await action();
    await ready();
    // Include the paint that makes the ready element visible to the person.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const readyMs = Math.round(performance.now() - started);
    const longTaskMs = await page.evaluate(() => Math.round((window as unknown as { __loadingTasks: number }).__loadingTasks));
    const jsFiles = [...requests].sort();
    const assets = await Promise.all(jsFiles.map(file));
    return { step, readyMs, longTaskMs, jsBytes: assets.reduce((sum, asset) => sum + asset.body.length, 0), jsGzipBytes: assets.reduce((sum, asset) => sum + asset.gzip.length, 0), jsFiles };
  } finally {
    page.off('request', record);
  }
}

async function main() {
  assert(Number.isInteger(runs) && runs > 0 && runs <= 50);
  assert(Number.isFinite(cpuRate) && cpuRate >= 1);
  assert(Number.isFinite(latencyMs) && latencyMs >= 0);
  assert(Number.isFinite(mbps) && mbps > 0);
  await file('/');
  const server = createServer(async (request, response) => {
    try {
      const asset = await file(new URL(request.url ?? '/', 'http://localhost').pathname);
      response.writeHead(200, { 'Content-Type': asset.type, 'Content-Encoding': 'gzip', 'Cache-Control': 'no-store' });
      response.end(asset.gzip);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const address = server.address();
    assert(address && typeof address !== 'string');
    const baseURL = `http://127.0.0.1:${address.port}`;
    const samples: Sample[][] = [];
    for (let index = 0; index < runs; index += 1) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, baseURL });
      try {
        await context.addInitScript(() => {
          localStorage.setItem('pms-language', 'ru');
          const state = window as unknown as { __loadingTasks: number };
          state.__loadingTasks = 0;
          new PerformanceObserver((list) => { for (const entry of list.getEntries()) state.__loadingTasks += entry.duration; }).observe({ type: 'longtask', buffered: true });
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
        const project = await mockAdminProject(page);
        await page.route('**/api/admin/config', route => route.fulfill({ json: { rolePermissions: [], dictionaryItems: [], systemSettings: [], projectModules: [], managedPermissions: [], health: {}, backupStatus: {} } }));
        await page.route('**/api/admin/integrations', route => route.fulfill({ json: { apiTokens: [], webhookEndpoints: [], webhookDeliveries: [], integrationSettings: [] } }));
        const session = await context.newCDPSession(page);
        await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
        await session.send('Network.emulateNetworkConditions', { offline: false, latency: latencyMs, downloadThroughput: mbps * 1_000_000 / 8, uploadThroughput: mbps * 1_000_000 / 8 });
        const projectsReady = async () => {
          await page.getByRole('heading', { name: 'Проекты', exact: true }).waitFor();
          await page.locator('.portfolio-progress-layout .highcharts-container').waitFor();
          await page.getByRole('button', { name: new RegExp(`Открыть паспорт: ${project.code}`) }).waitFor();
        };
        const sample = [await measure(page, 'projects-cold', () => page.goto('/projects'), projectsReady)];
        sample.push(await measure(page, 'wiki-first', () => page.getByRole('button', { name: 'FAQ', exact: true }).click(), () => page.locator('.wiki-article').first().waitFor()));
        sample.push(await measure(page, 'projects-return', () => page.locator('.global-section-nav').getByRole('button', { name: 'Проекты', exact: true }).click(), projectsReady));
        sample.push(await measure(page, 'wiki-return', () => page.getByRole('button', { name: 'FAQ', exact: true }).click(), () => page.locator('.wiki-article').first().waitFor()));
        // A pointer left on FAQ would prefetch it as soon as a new header mounts.
        await page.mouse.move(1590, 990);
        sample.push(await measure(page, 'structure-cold', () => page.goto(`/${project.code}/wbs`), () => page.locator('input.wbs-title-input').first().waitFor()));
        sample.push(await measure(page, 'gantt-first', () => page.locator('.project-section-navigation').getByRole('button', { name: 'Гантт', exact: true }).click(), () => page.locator('.gantt-bar').first().waitFor()));
        assert.deepEqual(errors, []);
        samples.push(sample);
        console.log(JSON.stringify({ run: index + 1, samples: sample }));
      } finally { await context.close(); }
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const summary = samples[0].map((sample, step) => ({
      step: sample.step,
      readyMs: median(samples.map(run => run[step].readyMs)),
      longTaskMs: median(samples.map(run => run[step].longTaskMs)),
      jsBytes: median(samples.map(run => run[step].jsBytes)),
      jsGzipBytes: median(samples.map(run => run[step].jsGzipBytes)),
    }));
    const result = { build: root, runs, cpuRate, latencyMs, mbps, browser: browser.version(), summary, samples };
    if (process.env.PERF_OUTPUT) await writeFile(process.env.PERF_OUTPUT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify({ summary }));
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
