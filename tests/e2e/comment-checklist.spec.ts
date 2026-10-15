import { expect, test, type Page } from "./fixtures";
import { mockAdminProject, mockReadOnlyProject } from "./overview-and-baseline.support";

// A task's comment is a checklist, as in Confluence: Enter adds an item, Shift+Enter a plain line.

async function openWith(page: Page, comment: string) {
  const project = await mockAdminProject(page, (fixture) => {
    Object.assign(fixture.wbsItems[0], { comment, structureVersion: undefined });
    Object.assign(fixture, { structureVersion: "1" });
  });
  const patches: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push(body);
    const item = { ...project.wbsItems[0], ...("comment" in body ? { comment: body.comment } : {}) };
    project.wbsItems[0] = item;
    const version = String(patches.length + 1);
    await route.fulfill({ json: { item, structureVersion: version, structureDelta: { projectId: "project-1", baseVersion: String(patches.length), version, today: "2026-10-13", deletedItemIds: [], dependencies: [], deletedDependencyIds: [], items: [item] } } });
  });
  return { patches, project };
}

for (const where of [
  { name: "Current work", path: "/TV-OVERVIEW/current-work", cell: () => ".current-work-row .checklist-field" },
  { name: "Structure", path: "/TV-OVERVIEW/wbs", cell: () => '[data-wbs-row-id="wbs-1"] .checklist-field' },
]) {
  test(`${where.name}: Enter adds an item, Shift+Enter a plain line, leaving the field saves`, async ({ page }) => {
    const { patches } = await openWith(page, "");
    await page.goto(where.path);
    const field = page.locator(where.cell()).first();
    await field.click();
    const editor = page.locator(".checklist-editor");
    await expect(editor).toHaveValue("☐ ");
    await editor.press("End");
    await editor.pressSequentially("Раз");
    await editor.press("Enter");
    await editor.pressSequentially("Два");
    await editor.press("Shift+Enter");
    await editor.pressSequentially("заметка");
    await expect(editor).toHaveValue("☐ Раз\n☐ Два\nзаметка");
    // Enter on an empty item leaves the list.
    await editor.press("Enter");
    await editor.press("Enter");
    await expect(editor).toHaveValue("☐ Раз\n☐ Два\nзаметка\n");
    await page.getByRole("heading").first().click();
    await expect.poll(() => patches.map((patch) => patch.comment)).toEqual(["☐ Раз\n☐ Два\nзаметка"]);
    await expect(field.getByRole("checkbox")).toHaveCount(2);
    // A tick saves at once.
    await field.getByRole("checkbox", { name: "Пункт выполнен: Два" }).click();
    await expect.poll(() => patches.map((patch) => patch.comment)).toEqual(["☐ Раз\n☐ Два\nзаметка", "☐ Раз\n☑ Два\nзаметка"]);
    await expect(field.getByRole("checkbox", { name: "Пункт выполнен: Два" })).toHaveAttribute("aria-checked", "true");
  });
}

test("Escape gives up the edit, and opening a comment without changing it saves nothing", async ({ page }) => {
  const { patches } = await openWith(page, "☐ Раз");
  await page.goto("/TV-OVERVIEW/wbs");
  const field = page.locator('[data-wbs-row-id="wbs-1"] .checklist-field');
  await field.locator("span", { hasText: "Раз" }).click();
  const editor = page.locator(".checklist-editor");
  await editor.press("End");
  await editor.pressSequentially(" и два");
  await editor.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(field).toContainText("Раз");
  await expect(field).not.toContainText("и два");
  await field.locator("span", { hasText: "Раз" }).click();
  await page.getByRole("heading").first().click();
  await page.waitForTimeout(800);
  expect(patches).toEqual([]);
});

test("text with lines and tabs pasted into a comment stays in it, not spread over the table", async ({ page }) => {
  const { patches } = await openWith(page, "");
  await page.goto("/TV-OVERVIEW/wbs");
  await page.locator('[data-wbs-row-id="wbs-1"] .checklist-field').click();
  const editor = page.locator(".checklist-editor");
  await editor.press("End");
  // A real paste: the browser puts the text in; the table's own paste of rows and columns stays out.
  await page.evaluate(() => navigator.clipboard.writeText("первое\tвторое\nтретье"));
  await editor.press("ControlOrMeta+V");
  await expect(editor).toHaveValue("☐ первое\tвторое\nтретье");
  await page.getByRole("heading").first().click();
  await expect.poll(() => patches).toEqual([{ comment: "☐ первое\tвторое\nтретье" }]);
});

test("a reader sees the checklist with its ticks, and cannot change them", async ({ page }) => {
  const project = await mockReadOnlyProject(page);
  Object.assign(project.wbsItems[0], { comment: "☐ Раз\n☑ Два" });
  await page.goto("/TV-OVERVIEW/current-work");
  const boxes = page.locator(".checklist-field").first().getByRole("checkbox");
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toBeDisabled();
  await page.locator(".checklist-field").first().click();
  await expect(page.locator(".checklist-editor")).toHaveCount(0);
});

test("Tab saves and moves on; Space on a tick box ticks it without opening the editor", async ({ page }) => {
  const { patches } = await openWith(page, "☐ Раз");
  await page.goto("/TV-OVERVIEW/current-work");
  const field = page.locator(".current-work-row .checklist-field").first();
  await field.locator("span", { hasText: "Раз" }).click();
  const editor = page.locator(".checklist-editor");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Два");
  await editor.press("Tab");
  await expect(editor).toHaveCount(0);
  // The focus went on to the next control of the row, not lost to the page.
  expect(await page.evaluate(() => document.activeElement !== document.body && !document.activeElement?.closest(".checklist-field"))).toBe(true);
  await expect.poll(() => patches.map((patch) => patch.comment)).toEqual(["☐ Раз\n☐ Два"]);
  const box = field.getByRole("checkbox", { name: "Пункт выполнен: Раз" });
  await box.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".checklist-editor")).toHaveCount(0);
  await expect.poll(() => patches.map((patch) => patch.comment)).toEqual(["☐ Раз\n☐ Два", "☑ Раз\n☐ Два"]);
});

test("typing in a long Structure and scrolling the row away keeps the text and saves it", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    const base = fixture.wbsItems[0];
    // More than 200 rows: the table draws only those on screen.
    for (let index = 2; index <= 260; index += 1) fixture.wbsItems.push({ ...base, id: `wbs-${index}`, code: `${index}`, title: `Строка ${index}`, parentId: null, wbsLevel: 1, sortOrder: index * 10, comment: "" });
    Object.assign(fixture, { structureVersion: "1" });
  });
  const patches: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches.push(route.request().postDataJSON());
    const item = { ...project.wbsItems[0], comment: (route.request().postDataJSON() as { comment: string }).comment };
    project.wbsItems[0] = item;
    const version = String(patches.length + 1);
    await route.fulfill({ json: { item, structureVersion: version, structureDelta: { projectId: "project-1", baseVersion: String(patches.length), version, today: "2026-10-13", deletedItemIds: [], dependencies: [], deletedDependencyIds: [], items: [item] } } });
  });
  await page.goto("/TV-OVERVIEW/wbs");
  await page.locator('[data-wbs-row-id="wbs-1"] .checklist-field').click();
  const editor = page.locator(".checklist-editor");
  await editor.press("End");
  await editor.pressSequentially("Не потерять");
  await page.mouse.wheel(0, 20_000);
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, -20_000);
  await page.waitForTimeout(500);
  await expect(editor).toHaveValue("Проверить результатНе потерять");
  await page.getByRole("heading").first().click();
  await expect.poll(() => patches.map((patch) => patch.comment)).toEqual(["Проверить результатНе потерять"]);
});

test("quick ticks while saves are still answering lose nothing", async ({ page }) => {
  const project = await mockAdminProject(page, (fixture) => {
    Object.assign(fixture.wbsItems[0], { comment: "☐ Раз\n☐ Два\n☐ Три" });
    Object.assign(fixture, { structureVersion: "1" });
  });
  const answers: Array<() => Promise<void>> = [];
  const sent: string[] = [];
  await page.route(/\/api\/wbs-items\/[^/]+$/, async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    const comment = (route.request().postDataJSON() as { comment: string }).comment;
    sent.push(comment);
    const version = String(sent.length + 1);
    await new Promise<void>((resolve) => answers.push(async () => {
      const item = { ...project.wbsItems[0], comment };
      project.wbsItems[0] = item;
      await route.fulfill({ json: { item, structureVersion: version, structureDelta: { projectId: "project-1", baseVersion: String(sent.length), version, today: "2026-10-13", deletedItemIds: [], dependencies: [], deletedDependencyIds: [], items: [item] } } });
      resolve();
    }));
  });
  await page.goto("/TV-OVERVIEW/current-work");
  const field = page.locator(".current-work-row .checklist-field").first();
  await field.getByRole("checkbox", { name: "Пункт выполнен: Раз" }).click();
  await field.getByRole("checkbox", { name: "Пункт выполнен: Три" }).click();
  await expect(field.getByRole("checkbox", { name: "Пункт выполнен: Раз" })).toHaveAttribute("aria-checked", "true");
  await expect(field.getByRole("checkbox", { name: "Пункт выполнен: Три" })).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => answers.length).toBeGreaterThan(0);
  while (answers.length > 0) await answers.shift()!();
  await expect.poll(() => sent.at(-1)).toBe("☑ Раз\n☐ Два\n☑ Три");
  await expect(field.getByRole("checkbox", { name: "Пункт выполнен: Раз" })).toHaveAttribute("aria-checked", "true");
  await expect(field.getByRole("checkbox", { name: "Пункт выполнен: Три" })).toHaveAttribute("aria-checked", "true");
});

test("leaving the editor by a key gives the focus back to the field; Ctrl/Cmd+K still opens the palette", async ({ page }) => {
  const { patches } = await openWith(page, "☐ Раз");
  await page.goto("/TV-OVERVIEW/wbs");
  const field = page.locator('[data-wbs-row-id="wbs-1"] .checklist-field');
  await field.locator("span", { hasText: "Раз" }).click();
  const editor = page.locator(".checklist-editor");
  await editor.press("Escape");
  await expect(field).toBeFocused();
  await field.press("Enter");
  await editor.press("End");
  await editor.pressSequentially(" и два");
  await editor.press("ControlOrMeta+Enter");
  await expect(field).toBeFocused();
  await expect.poll(() => patches.map((patch) => patch.comment)).toEqual(["☐ Раз и два"]);
  await field.press("Enter");
  await page.keyboard.press("ControlOrMeta+K");
  await expect(page.getByRole("dialog").filter({ has: page.getByRole("combobox") }).or(page.locator(".command-palette"))).toBeVisible();
});

test("a narrower column wraps the edited text anew and the box grows to show it all", async ({ page }) => {
  await openWith(page, "☐ Очень длинный пункт чек-листа, который при узкой колонке переносится на несколько строк");
  await page.goto("/TV-OVERVIEW/current-work");
  await page.locator(".current-work-row .checklist-field").first().click();
  const editor = page.locator(".checklist-editor");
  const before = await editor.evaluate((area) => area.getBoundingClientRect().height);
  await editor.evaluate((area) => { area.style.width = "120px"; });
  await expect.poll(() => editor.evaluate((area) => area.getBoundingClientRect().height)).toBeGreaterThan(before);
  expect(await editor.evaluate((area) => area.scrollHeight <= area.clientHeight + 1)).toBe(true);
});

test("an editor opened but not typed in does not put the old comment back over someone else's change", async ({ page }) => {
  let send!: (event: Record<string, unknown>) => void;
  const sent = new Promise<Record<string, unknown>>((resolve) => { send = resolve; });
  await page.route("**/api/projects/project-1/events", async (route) => {
    const event = await sent;
    await route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: `retry: 60000\n\nevent: change\ndata: ${JSON.stringify(event)}\n\n` });
  });
  const { patches, project } = await openWith(page, "☐ Раз");
  await page.goto("/TV-OVERVIEW/current-work");
  const field = page.locator(".current-work-row .checklist-field").first();
  await field.locator("span", { hasText: "Раз" }).click();
  await expect(page.locator(".checklist-editor")).toHaveValue("☐ Раз");
  // Anna ticks it elsewhere; the page takes her change in by itself.
  await page.route("**/api/projects/project-1/structure?since=*", (route) =>
    route.fulfill({ json: { projectId: "project-1", version: "2", baseVersion: "1", full: false, today: "2026-10-13", calendarOverrides: [], items: [{ ...project.wbsItems[0], comment: "☑ Раз" }], dependencies: [], deletedItemIds: [], deletedDependencyIds: [] } }));
  send({ id: "evt-anna", projectId: "project-1", section: "structure", actorId: "u-anna", actorName: "Анна Орлова", clientId: "tab-of-anna", at: "2026-10-13T10:00:00.000Z", structureVersion: "2", structureOnly: true });
  await page.waitForTimeout(800);
  // Leaving the untouched editor saves nothing; her tick stays.
  await page.getByRole("heading").first().click();
  await expect(field.getByRole("checkbox", { name: "Пункт выполнен: Раз" })).toHaveAttribute("aria-checked", "true");
  await page.waitForTimeout(500);
  expect(patches).toEqual([]);
});
