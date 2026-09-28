import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

const V1 = "2026-10-01T09:00:00.000Z";
const V2 = "2026-10-07T10:00:00.000Z";

type Patch = { id: string; body: Record<string, unknown> };

/** Wednesday 7 October 2026; Barber is on leave Monday 12 to Friday 16 October. */
async function mockLeaves(page: Page, { conflict = false } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00"));
  await mockAdminProject(page);
  const patches: Patch[] = [];
  await page.route(/\/api\/leave-schedule(\?.*)?$/, (route) =>
    route.fulfill({
      json: {
        employees: [{ id: "e1", name: "Барбер Роберт", department: "Разработка", userId: null, isActive: true, sortOrder: 0 }],
        types: [{ id: "vacation", name: "Отпуск", nameEn: "Vacation", color: "#8bc34a", isActive: true, sortOrder: 10 }],
        leaves: [
          { id: "l1", employeeId: "e1", typeId: "vacation", startDate: "2026-10-12", endDate: "2026-10-16", comment: "", updatedAt: V1 },
        ],
        calendarDays: [],
      },
    }),
  );
  await page.route(/\/api\/leave-schedule\/leaves\/l\d+$/, (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patches.push({ id: route.request().url().split("/").pop() ?? "", body });
    if (conflict) {
      return route.fulfill({ status: 409, json: { error: "Отсутствие пересекается с другим отсутствием сотрудника" } });
    }
    return route.fulfill({
      json: { id: "l1", employeeId: "e1", typeId: "vacation", comment: "", updatedAt: V2, ...body, expectedUpdatedAt: undefined },
    });
  });
  await page.goto("/operations/leave-schedule");
  return patches;
}

const leaveBar = (page: Page) => page.locator('.leave-bar[data-leave-id="l1"]');

async function dayWidth(page: Page) {
  const box = (await leaveBar(page).boundingBox())!;
  // Five calendar days, less the gap left between day bars.
  return (box.width + 2) / 5;
}

async function dragBy(page: Page, x: number, y: number, dx: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 8 });
  await page.mouse.up();
}

test("a leave dragged sideways moves by whole days, and undo moves it back", async ({ page }) => {
  const patches = await mockLeaves(page);
  const box = (await leaveBar(page).boundingBox())!;
  await dragBy(page, box.x + box.width / 2, box.y + box.height / 2, 3 * (await dayWidth(page)));

  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toEqual({ id: "l1", body: { startDate: "2026-10-15", endDate: "2026-10-19", expectedUpdatedAt: V1 } });
  await expect(page.getByRole("status").filter({ hasText: "Перенесено" })).toContainText("Барбер Роберт");
  // A drag is not a click: the editor does not open.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Отменить" }).click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1].body).toEqual({ startDate: "2026-10-12", endDate: "2026-10-16", expectedUpdatedAt: V2 });
});

test("an edge makes a leave longer or shorter", async ({ page }) => {
  const patches = await mockLeaves(page);
  const width = await dayWidth(page);
  const end = (await leaveBar(page).locator(".leave-handle.end").boundingBox())!;
  await dragBy(page, end.x + end.width / 2, end.y + end.height / 2, 2 * width);
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0].body).toEqual({ startDate: "2026-10-12", endDate: "2026-10-18", expectedUpdatedAt: V1 });
});

test("a move the server refuses is reported", async ({ page }) => {
  const patches = await mockLeaves(page, { conflict: true });
  const box = (await leaveBar(page).boundingBox())!;
  await dragBy(page, box.x + box.width / 2, box.y + box.height / 2, -2 * (await dayWidth(page)));
  await expect.poll(() => patches.length).toBe(1);
  await expect(page.getByRole("alert")).toContainText("пересекается");
});

test("a click without moving still opens the leave", async ({ page }) => {
  const patches = await mockLeaves(page);
  await leaveBar(page).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(patches).toHaveLength(0);
});
