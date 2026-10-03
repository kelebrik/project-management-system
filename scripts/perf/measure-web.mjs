/**
 * Browser timings on a load-test portfolio (scripts/perf/seed.ts): opening the
 * Structure, expanding every level, scrolling, editing a date, and the Gantt.
 *   PERF_BASE_URL=http://127.0.0.1:3100 node scripts/perf/measure-web.mjs
 * The API must serve the built web app (NODE_ENV=production, cloud profile).
 */
import { chromium } from 'playwright';
const B = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:3100';
const email = process.env.PERF_EMAIL ?? 'perf@example.com';
const password = process.env.PERF_PASSWORD ?? 'perf-password-123';
const codes = (process.env.PERF_CODES ?? 'PERF-051-2000,PERF-052-5000').split(',');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(() => {
  window.__long = 0;
  new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__long += e.duration; }).observe({ type: 'longtask', buffered: true });
});
const page = await context.newPage();
await page.request.post(`${B}/api/auth/login`, { data: { email, password }, headers: { Origin: B } });
const long = () => page.evaluate(() => { const v = window.__long; window.__long = 0; return Math.round(v); });
const stats = () => page.evaluate(() => ({ dom: document.querySelectorAll('*').length, rows: document.querySelectorAll('.wbs-table-row').length, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6) }));
const scroll = () => page.evaluate(async () => {
  const boxes = [...document.querySelectorAll('*')].filter((el) => el.scrollHeight > el.clientHeight + 200 && getComputedStyle(el).overflowY !== 'visible');
  const box = boxes.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] ?? document.scrollingElement;
  const began = performance.now(); let worst = 0;
  for (let i = 0; i < 20; i += 1) { const f = performance.now(); box.scrollTop += box.clientHeight; await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); worst = Math.max(worst, performance.now() - f); }
  return { totalMs: Math.round(performance.now() - began), worstFrameMs: Math.round(worst) };
});
const hasTitle = (title, timeout = 300000) => page.waitForFunction((t) => [...document.querySelectorAll('input.wbs-title-input')].some((i) => i.value === t) || document.body.innerText.includes(t), title, { timeout, polling: 100 });
const out = (o) => console.log(JSON.stringify(o));
for (const code of codes) {
  let t = Date.now();
  await page.goto(`${B}/${code}/wbs`, { waitUntil: 'networkidle' });
  await hasTitle('Фаза 10');
  out({ step: `${code} wbs open`, ms: Date.now() - t, longMs: await long(), ...(await stats()) });
  t = Date.now();
  await page.getByRole('button', { name: '3', exact: true }).first().click();
  // A long Structure renders only the rows in view, so wait for one near the top.
  await hasTitle('Задача 1.1.3: подготовить и согласовать результат');
  const expanded = { step: `${code} wbs expand all`, ms: Date.now() - t, longMs: await long(), ...(await stats()) };
  out({ ...expanded, scroll: await scroll() });
  // After scrolling to the end the last row must be on screen.
  await page.evaluate(() => { const box = document.querySelector('.wbs-table-shell'); if (box) box.scrollTop = box.scrollHeight; });
  await page.waitForTimeout(500);
  const lastTitle = await page.evaluate(() => { const titles = [...document.querySelectorAll('input.wbs-title-input')]; return titles[titles.length - 1]?.value ?? null; });
  out({ step: `${code} wbs end of the table`, lastTitle });
  await page.evaluate(() => { const box = document.querySelector('.wbs-table-shell'); if (box) box.scrollTop = 0; });
  await page.waitForTimeout(300);
  // Edit one due date in the first task row and wait for the autosave to settle.
  const row = page.locator('.wbs-table-row', { has: page.locator('input.wbs-title-input[value^="Задача 1.1.3:"]') }).first();
  await row.scrollIntoViewIfNeeded();
  const due = row.locator('input[type="date"]').last();
  t = Date.now();
  // Always a different date, or nothing would be saved.
  const current = await due.inputValue();
  const next = new Date(`${current || '2026-03-10'}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const patched = page.waitForResponse((r) => r.url().includes('/api/wbs-items/') && r.request().method() === 'PATCH', { timeout: 120000 });
  await due.fill(next.toISOString().slice(0, 10));
  await due.blur();
  await patched;
  const saved = Date.now() - t;
  await page.waitForLoadState('networkidle');
  out({ step: `${code} wbs edit date`, responseMs: saved, settledMs: Date.now() - t, longMs: await long() });
  t = Date.now();
  await page.goto(`${B}/${code}/gantt`, { waitUntil: 'networkidle' });
  await hasTitle('Фаза 10');
  out({ step: `${code} gantt open`, ms: Date.now() - t, longMs: await long(), ...(await stats()) });
  const levelButton = page.getByRole('button', { name: '3', exact: true }).first();
  if (await levelButton.count()) {
    t = Date.now();
    await levelButton.click();
    await hasTitle('Задача 10.1.10: подготовить и согласовать результат');
    out({ step: `${code} gantt expand all`, ms: Date.now() - t, longMs: await long(), ...(await stats()), scroll: await scroll() });
  }
}
await browser.close();
