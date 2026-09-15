import { expect, test } from "./fixtures";
import { projectPagePath } from "./project-routes";

test("schedule milestone PDF fits one A4 landscape page", async ({ page }) => {
  await page.goto(await projectPagePath(page, "schedule"));
  await expect(page).toHaveURL(/\/[^/]+\/schedule$/);
  await expect(page.locator("#milestones-by-phase")).toBeVisible();

  for (const sectionId of ["milestones-by-phase"]) {
    await page.evaluate((target) => {
      document.body.dataset.printTarget = target;
    }, sectionId);
    await page.emulateMedia({ media: "print" });

    const metrics = await page.evaluate((target) => {
      const section = document.getElementById(target);
      const rect = section?.getBoundingClientRect();
      const graph = section?.querySelector(
        ".milestone-timeline, .milestone-snake-shell",
      );
      const graphRect = graph?.getBoundingClientRect();

      return {
        section: rect
          ? {
              width: rect.width,
              height: rect.height,
              right: rect.right,
            }
          : null,
        graph: graphRect
          ? {
              width: graphRect.width,
              height: graphRect.height,
              right: graphRect.right,
            }
          : null,
      };
    }, sectionId);

    expect(metrics.section, `${sectionId} section is rendered`).not.toBeNull();
    expect(metrics.graph, `${sectionId} graph is rendered`).not.toBeNull();
    expect(metrics.graph!.right).toBeLessThanOrEqual(metrics.section!.right + 2);

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      preferCSSPageSize: true,
      printBackground: true,
    });
    expect(pdf.length).toBeGreaterThan(10_000);
    expect(countPdfPages(pdf)).toBe(1);

    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => {
      delete document.body.dataset.printTarget;
    });
  }
});

test("schedule does not expose horizontal overflow on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(await projectPagePath(page, "schedule"));
  await expect(page).toHaveURL(/\/[^/]+\/schedule$/);
  await expect(page.locator("#milestones-by-phase")).toBeVisible();

  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });

  expect(overflow).toBeLessThanOrEqual(2);
});

function countPdfPages(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}
