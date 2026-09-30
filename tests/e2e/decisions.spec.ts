import { expect, test, type Page } from "./fixtures";
import { mockAdminProject } from "./overview-and-baseline.support";

type Row = Record<string, unknown> & { id: string; status: string; version: number };

const base = (extra: Partial<Row>): Row => ({
  id: "d1",
  projectId: "project-1",
  title: "Кто платит за доставку",
  context: "",
  decision: "",
  status: "PROPOSED",
  decidedBy: null,
  decidedAt: null,
  createdByName: "Администратор",
  approverUserId: null,
  approverName: null,
  requestedAt: null,
  approvalComment: null,
  answeredAt: null,
  issueId: null,
  raidItemId: null,
  wbsItemId: null,
  changeRequestId: null,
  supersedesId: null,
  version: 1,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  ...extra,
});

async function mockDecisions(page: Page, rows: Row[]) {
  await mockAdminProject(page);
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  await page.route(/\/api\/(projects\/project-1\/decisions|decisions\/.+|projects\/project-1\/decision-approvers)$/, (route) => {
    const request = route.request();
    const url = request.url();
    calls.push({ method: request.method(), url, body: request.postDataJSON?.() ?? null });
    if (url.endsWith("/decision-approvers")) return route.fulfill({ json: [{ id: "admin-1", name: "Администратор", email: "a@x" }, { id: "u2", name: "Спонсор", email: "s@x" }] });
    if (request.method() === "GET") return route.fulfill({ json: rows });
    const body = request.postDataJSON() as Record<string, unknown>;
    if (url.endsWith("/project-1/decisions")) {
      rows.unshift(base({ id: `d${rows.length + 1}`, title: String(body.title), decision: String(body.decision ?? ""), status: body.mode === "RECORD" ? "APPROVED" : "PROPOSED", decidedBy: (body.decidedBy as string) ?? null, decidedAt: (body.decidedAt as string) ?? null }));
      return route.fulfill({ status: 201, json: rows[0] });
    }
    const id = url.split("/decisions/")[1].split("/")[0];
    const row = rows.find((candidate) => candidate.id === id)!;
    if (url.endsWith("/request-approval")) Object.assign(row, { status: "PENDING_APPROVAL", approverUserId: body.approverUserId, approverName: "Администратор", requestedAt: "2026-10-02T10:00:00.000Z" });
    if (url.endsWith("/answer")) Object.assign(row, { status: body.verdict === "APPROVE" ? "APPROVED" : "REJECTED", approvalComment: body.comment, decidedBy: "Администратор", decidedAt: "2026-10-02T11:00:00.000Z" });
    row.version += 1;
    return route.fulfill({ json: row });
  });
  return calls;
}

test("a decision is proposed, sent to an approver and answered with a comment", async ({ page }) => {
  const calls = await mockDecisions(page, []);
  await page.goto("/TV-OVERVIEW/decisions");
  await expect(page.getByRole("heading", { name: "Решения" })).toBeVisible();
  await expect(page.getByText("Решений пока нет")).toBeVisible();

  await page.getByRole("button", { name: "Новое решение" }).click();
  const form = page.getByRole("dialog", { name: "Новое решение" });
  await form.getByLabel("О чем решение").fill("Кто платит за доставку");
  await form.getByLabel("Что решили").fill("Платит заказчик");
  await form.getByRole("button", { name: "Сохранить" }).click();
  const card = page.locator(".decision-card").first();
  await expect(card.getByText("Черновик")).toBeVisible();

  await card.getByRole("button", { name: "На согласование" }).click();
  await card.getByLabel("Согласующий").selectOption("admin-1");
  await card.getByRole("button", { name: "Отправить" }).click();
  await expect(card.getByText("На согласовании")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ждут меня: 1" })).toBeVisible();

  // The signed-in user is the approver here, so the card offers the answer.
  await card.getByRole("button", { name: "Ответить" }).click();
  await expect(card.getByRole("button", { name: "Согласовать" })).toBeDisabled();
  await card.getByLabel("Комментарий (обязательно)").fill("Согласовано на комитете");
  await card.getByRole("button", { name: "Согласовать" }).click();
  await expect(card.getByText("Принято", { exact: true })).toBeVisible();
  await expect(card.getByText("«Согласовано на комитете»")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("decisions.png"), fullPage: true });

  const posts = calls.filter((call) => call.method !== "GET" && !call.url.endsWith("decision-approvers"));
  expect(posts.map((call) => call.url.replace(/.*\/api/, ""))).toEqual(["/projects/project-1/decisions", "/decisions/d1/request-approval", "/decisions/d1/answer"]);
  expect(posts[1].body).toEqual({ approverUserId: "admin-1", expectedVersion: 1 });
  expect(posts[2].body).toEqual({ verdict: "APPROVE", comment: "Согласовано на комитете", expectedVersion: 2 });
});

test("a decision already taken is recorded with who and when, and can be replaced", async ({ page }) => {
  const calls = await mockDecisions(page, [base({ id: "d1", status: "APPROVED", decision: "Платит заказчик", decidedBy: "Комитет", decidedAt: "2026-10-01T00:00:00.000Z" })]);
  await page.goto("/TV-OVERVIEW/decisions");
  const card = page.locator(".decision-card").first();
  await expect(card.getByText("принято: Комитет, 01.10.2026")).toBeVisible();
  await card.getByRole("button", { name: "Заменить новым решением" }).click();
  const form = page.getByRole("dialog", { name: /Замена решения/ });
  await expect(form.getByLabel("Уже принято")).toBeChecked();
  await form.getByLabel("Что решили").fill("Платим пополам");
  await form.getByLabel("Кем принято").fill("Спонсор");
  await form.getByRole("button", { name: "Сохранить" }).click();
  const post = calls.find((call) => call.method === "POST")!;
  expect(post.body).toMatchObject({ mode: "RECORD", decidedBy: "Спонсор", supersedesId: "d1", decision: "Платим пополам" });
});
