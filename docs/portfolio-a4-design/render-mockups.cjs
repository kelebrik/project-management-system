const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Executable doesn't exist")) throw error;
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }

  const page = await browser.newPage({
    viewport: { width: 1800, height: 1280 },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(path.join(__dirname, "mockups.html")).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);

  const shots = await page.locator("[data-shot]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-shot")),
  );

  const expectedCounts = {
    "01-urgency-board": [".urgency-card", 55],
    "02-twin-ledgers": [".goal-ledger .ledger-row", 25, ".raid-ledger .ledger-row", 30],
    "03-time-first": [".timeline-event", 25, ".mini-raid-card", 30],
    "04-project-columns": [".column-item.goal", 25, ".column-item.problem", 10, ".column-item.risk", 20],
    "05-category-stack": [".category-goal-card", 25, ".category-problem-row", 10, ".category-risk-card", 20],
  };

  for (const shot of shots) {
    const audit = await page.locator(`[data-shot="${shot}"]`).evaluate((sheet, expectations) => {
      const counts = [];
      for (let index = 0; index < expectations.length; index += 2) {
        counts.push({ selector: expectations[index], actual: sheet.querySelectorAll(expectations[index]).length, expected: expectations[index + 1] });
      }
      counts.push({ selector: ".project-row", actual: sheet.querySelectorAll(".project-row").length, expected: 5 });

      const overflow = [...sheet.querySelectorAll("*")]
        .filter((node) => node.clientWidth > 0 && node.clientHeight > 0)
        .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1)
        .slice(0, 12)
        .map((node) => ({
          className: String(node.className || node.tagName),
          client: `${node.clientWidth}x${node.clientHeight}`,
          scroll: `${node.scrollWidth}x${node.scrollHeight}`,
          text: String(node.textContent || "").trim().slice(0, 80),
        }));
      return { counts, overflow };
    }, expectedCounts[shot]);

    const badCount = audit.counts.find((item) => item.actual !== item.expected);
    if (badCount) throw new Error(`${shot}: ${badCount.selector}=${badCount.actual}, expected ${badCount.expected}`);
    console.log(`${shot}: counts OK; overflow nodes ${audit.overflow.length}`);
    if (audit.overflow.length) console.log(JSON.stringify(audit.overflow, null, 2));

    const outputPath = path.join(__dirname, `${shot}.jpg`);
    await page.locator(`[data-shot="${shot}"]`).screenshot({
      path: outputPath,
      type: "jpeg",
      quality: 94,
    });
    console.log(outputPath);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
