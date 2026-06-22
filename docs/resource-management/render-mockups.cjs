const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

async function main() {
  const root = __dirname;
  const htmlPath = path.join(root, "mockups.html");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    if (!String(error?.message ?? error).includes("Executable doesn't exist")) {
      throw error;
    }
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });

  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const shots = await page.locator("[data-shot]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-shot")),
  );

  for (const shot of shots) {
    const outputPath = path.join(root, `${shot}.jpg`);
    await page
      .locator(`[data-shot="${shot}"]`)
      .screenshot({ path: outputPath, type: "jpeg", quality: 92 });
    console.log(outputPath);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
