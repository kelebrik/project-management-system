import { expect, test } from "./fixtures";
import { LIVE_API_REASON, liveApiAvailable, projectPagePath } from "./project-routes";

// These read live data: they run against a real API and skip next to the web dev server alone.
test.beforeEach(async ({ page }) => {
  test.skip(!(await liveApiAvailable(page)), LIVE_API_REASON);
});

test("the old schedule PDF prints one A4 landscape page per part", async ({ page }) => {
  // The old schedule with its two-part PDF lives in Development; the project's own tab is the Highcharts one.
  await page.goto(await projectPagePath(page, "schedule"));
  await page.goto("/development/schedule-legacy");
  await expect(page).toHaveURL(/\/development\/schedule-legacy$/);
  await expect(page.locator("#milestones-by-phase")).toBeVisible();

  // The page's "Save as PDF" prints the whole schedule document, one sheet per part.
  for (const sectionId of ["project-schedule-print"]) {
    // The same marks printSectionAsPdf puts on the page: both the root and the body.
    await page.evaluate((target) => {
      document.documentElement.dataset.printTarget = target;
      document.body.dataset.printTarget = target;
    }, sectionId);
    await page.emulateMedia({ media: "print" });

    const metrics = await page.evaluate((target) => {
      const section = document.querySelector(`[data-print-section="${target}"]`) ?? document.getElementById(target);
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
    const parts = await page.locator(".schedule-print-page").count();
    expect(parts).toBeGreaterThan(0);
    expect(countPdfPages(pdf)).toBe(parts);

    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => {
      delete document.documentElement.dataset.printTarget;
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
