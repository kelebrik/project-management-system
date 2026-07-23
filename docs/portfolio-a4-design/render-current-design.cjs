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

  const page = await browser.newPage({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(__dirname, "current-design.html")).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts?.ready);

  const canvas = page.locator("[data-current-canvas]");
  const counts = await canvas.evaluate((node) => ({
    goals: node.querySelectorAll(".portfolio-goal-item").length,
    problems: node.querySelectorAll(".current-problems .portfolio-raid-item").length,
    risks: node.querySelectorAll(".current-risks .portfolio-raid-item").length,
    projects: node.querySelectorAll(".projects-overview-card").length,
  }));
  const expected = { goals: 25, problems: 10, risks: 20, projects: 5 };
  for (const [key, value] of Object.entries(expected)) {
    if (counts[key] !== value) throw new Error(`${key}=${counts[key]}, expected ${value}`);
  }

  const initialBox = await canvas.boundingBox();
  if (!initialBox) throw new Error("Current design canvas not found");
  const pageCount = Math.ceil(initialBox.height / 1240);
  await canvas.evaluate((node, pages) => {
    for (let pageNumber = 1; pageNumber < pages; pageNumber += 1) {
      const marker = document.createElement("div");
      marker.className = "a4-boundary";
      marker.style.top = `${pageNumber * 1240 - 1}px`;
      marker.innerHTML = `<span>Конец листа ${pageNumber} A4</span>`;
      node.append(marker);
    }
  }, pageCount);

  const box = await canvas.boundingBox();
  if (!box) throw new Error("Current design canvas disappeared");
  const fullPath = path.join(__dirname, "00-current-design-full.jpg");
  const firstPagePath = path.join(__dirname, "00-current-design-a4-page-1.jpg");
  await canvas.screenshot({ path: fullPath, type: "jpeg", quality: 94 });
  await page.screenshot({
    path: firstPagePath,
    type: "jpeg",
    quality: 94,
    clip: { x: box.x, y: box.y, width: 1754, height: 1240 },
  });

  console.log(`counts OK: ${JSON.stringify(counts)}`);
  console.log(`natural height: ${Math.ceil(box.height)}px = ${pageCount} A4 pages`);
  console.log(fullPath);
  console.log(firstPagePath);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
