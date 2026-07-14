const { chromium } = require("playwright");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function render() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1520, height: 980 }, deviceScaleFactor: 1 });
  const source = path.join(__dirname, "mockups.html");
  await page.goto(pathToFileURL(source).href);

  const screens = ["projects", "overview", "gantt", "raid"];
  for (const [index, screen] of screens.entries()) {
    await page.locator(`[data-screen="${screen}"]`).screenshot({
      path: path.join(__dirname, `${String(index + 1).padStart(2, "0")}-${screen}.png`),
    });
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto(pathToFileURL(source).href);
  await mobile.locator('[data-screen="overview"]').screenshot({
    path: path.join(__dirname, "05-overview-mobile.png"),
  });
  await browser.close();
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

