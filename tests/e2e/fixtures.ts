import { test as base, expect } from "@playwright/test";

// Existing scenarios assert Russian copy explicitly; the bilingual suite tests
// the English default and runtime switching without this fixture.
export const test = base.extend<{ russianInterface: void }>({
  russianInterface: [async ({ page }, use) => {
    await page.addInitScript(() => {
      if (localStorage.getItem("pms-language") === null) localStorage.setItem("pms-language", "ru");
    });
    await use();
  }, { auto: true }],
});
export { expect };
export type { Page, Locator } from "@playwright/test";
