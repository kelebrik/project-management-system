import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const V1 = "2026-10-01T09:00:00.000Z";
const V2 = "2026-10-07T10:00:00.000Z";

function work(id: string, projectId: string, owner: string, startDate: string, dueDate: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    projectId,
    code: `1.${id}`,
    title: `Работа ${id}`,
    owner,
    type: "TASK",
    status: "IN_PROGRESS",
    startDate,
    dueDate,
    updatedAt: V1,
    startLocked: false,
    finishLocked: false,
    lockedByIssue: false,
    ...extra,
  };
}

type Patch = { url: string; body: Record<string, unknown> };

/**
 * Wednesday 7 October 2026. Ivanov has a Monday-to-Friday task, Petrov one whose
 * start a link sets, and one in a project the user may only read.
 */
async function mockPlanner(page: Page, { conflict = false } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00"));
  await mockAdminProject(page);
  let loads = 0;
  const patches: Patch[] = [];
  await page.route(/\/api\/workload(\?.*)?$/, (route) => {
    loads += 1;
    return route.fulfill({
      json: {
        projects: [
          { id: "project-1", code: "TV-OVERVIEW", name: "Телевизор" },
          { id: "p2", code: "AUDIO", name: "Колонка" },
          { id: "p3", code: "READ", name: "Чужой проект" },
        ],
        items: [
          work("1", "project-1", "Иванов", "2026-10-05", "2026-10-09"),
          work("2", "p2", "Петров", "2026-10-12", "2026-10-16", { startLocked: true }),
          work("3", "p3", "Петров", "2026-10-19", "2026-10-20"),
        ],
        editableProjectIds: ["project-1", "p2"],
        employees: [
          { id: "e1", name: "Иванов", department: "Разработка" },
          { id: "e2", name: "Петров", department: "Разработка" },
          { id: "e3", name: "Сидоров", department: "Тестирование" },
        ],
        leaves: [],
        calendarDays: [],
      },
    });
  });
  await page.route(/\/api\/wbs-items\/[^/]+$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push({ url: route.request().url(), body });
    if (conflict) {
      return route.fulfill({
        status: 409,
        json: { error: "Работа изменилась, пока вы её правили. Данные обновлены — повторите изменение.", itemId: "1" },
      });
    }
    return route.fulfill({
      json: {
        item: {
          owner: body.owner ?? "Иванов",
          startDate: `${body.startDate ?? "2026-10-05"}T00:00:00.000Z`,
          dueDate: `${body.dueDate ?? "2026-10-09"}T00:00:00.000Z`,
          updatedAt: V2,
        },
      },
    });
  });
  await page.goto("/operations/workload");
  await page.getByRole("button", { name: "1 мес." }).click();
  return { patches, loads: () => loads };
}

function bar(page: Page, id: string) {
  return page.locator(`.workload-bar[data-item-id="${id}"]`);
}

/** Drags from a point of an element by a number of days and rows, in small steps like a hand would. */
async function dragBy(page: Page, from: { x: number; y: number }, dx: number, dy = 0) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
}

async function dayWidth(page: Page) {
  // Ivanov's bar spans five calendar days.
  const box = (await bar(page, "1").boundingBox())!;
  return box.width / 5;
}

test("dragging a bar moves its dates and keeps its working days", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  const box = (await bar(page, "1").boundingBox())!;
  const width = await dayWidth(page);
  await dragBy(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 7 * width);

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].url).toMatch(/\/api\/wbs-items\/1$/);
  expect(patches[0].body).toEqual({
    startDate: "2026-10-12",
    dueDate: "2026-10-16",
    scheduleDriver: "dates",
    expectedUpdatedAt: V1,
  });
  await expect(page.getByRole("status")).toContainText("Сохранено: TV-OVERVIEW · 1.1 Работа 1 — Иванов");
  // A drag is not a click: the work does not open.
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("dropping a bar on another person hands the work over, and undo gives it back", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  await page.getByLabel("Все сотрудники справочника").check();
  const box = (await bar(page, "1").boundingBox())!;
  const target = (await page.locator('.workload-row[data-row-owner="сидоров"] .workload-lane').boundingBox())!;
  await dragBy(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 0, target.y + target.height / 2 - (box.y + box.height / 2));

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].body).toEqual({ owner: "Сидоров", expectedUpdatedAt: V1 });

  await page.getByRole("button", { name: "Отменить" }).click();
  await expect.poll(() => patches.length).toBe(2);
  // Undo sends back what changed, against the version the save returned.
  expect(patches[1].body).toEqual({ owner: "Иванов", expectedUpdatedAt: V2 });
  await expect(page.getByRole("status")).toContainText("Возвращено");
});

test("an edge changes only its own date", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  const width = await dayWidth(page);
  const end = bar(page, "1").locator(".workload-handle.end");
  const handle = (await end.boundingBox())!;
  await dragBy(page, { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, 3 * width);
  await expect.poll(() => patches.length).toBe(1);
  // Friday plus three days is Monday.
  expect(patches[0].body).toEqual({ dueDate: "2026-10-12", scheduleDriver: "dates", expectedUpdatedAt: V1 });
});

test("work whose start a link sets keeps its start and can only be handed over", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  await expect(bar(page, "2").locator(".workload-handle.start")).toHaveCount(0);
  await expect(bar(page, "2").locator(".workload-handle.end")).toHaveCount(1);

  const box = (await bar(page, "2").boundingBox())!;
  const width = await dayWidth(page);
  await dragBy(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 5 * width);
  // Nothing to save: the dates stay, and the bar stayed on Petrov's row.
  await page.waitForTimeout(300);
  expect(patches).toHaveLength(0);

  await bar(page, "2").click();
  const dialog = page.getByRole("dialog", { name: /1\.2 Работа 2/ });
  await expect(dialog.getByLabel("Начало")).toBeDisabled();
  await expect(dialog.getByText("Начало задают связи в Структуре.")).toBeVisible();
  // The finish cannot go before the start the links set.
  await expect(dialog.getByLabel("Окончание")).toHaveAttribute("min", "2026-10-12");
});

test("work in a project the user may only read opens without editing", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  await expect(bar(page, "3").locator(".workload-handle")).toHaveCount(0);
  await bar(page, "3").click();
  const dialog = page.getByRole("dialog", { name: /1\.3 Работа 3/ });
  await expect(dialog.getByText("У вас нет прав на изменение работ этого проекта.")).toBeVisible();
  await expect(dialog.getByLabel("Исполнитель")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Сохранить" })).toHaveCount(0);
  expect(patches).toHaveLength(0);
});

test("the work panel edits the owner and dates from the keyboard", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  await bar(page, "1").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /1\.1 Работа 1/ });
  await dialog.getByLabel("Исполнитель").fill("Петров");
  await dialog.getByLabel("Окончание").fill("2026-10-14");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].body).toEqual({
    owner: "Петров",
    dueDate: "2026-10-14",
    scheduleDriver: "dates",
    expectedUpdatedAt: V1,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("an edit that lost to someone else's save is reported and the page reloads", async ({ page }) => {
  const { patches, loads } = await mockPlanner(page, { conflict: true });
  const before = loads();
  await bar(page, "1").click();
  const dialog = page.getByRole("dialog", { name: /1\.1 Работа 1/ });
  await dialog.getByLabel("Исполнитель").fill("Петров");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect.poll(() => patches.length).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Работа изменилась");
  await expect.poll(loads).toBeGreaterThan(before);
});

test("the work panel opens the item in the project structure", async ({ page }) => {
  await mockPlanner(page);
  await bar(page, "1").click();
  await page.getByRole("dialog").getByRole("link", { name: "Открыть в Структуре" }).click();
  await expect(page).toHaveURL(/\/TV-OVERVIEW\/wbs\?focusWbs=1$/);
});

test("Escape right after pressing a bar cancels it before any drag", async ({ page }) => {
  const { patches } = await mockPlanner(page);
  const box = (await bar(page, "1").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(patches).toHaveLength(0);
});
