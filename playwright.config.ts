import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "true";
const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  // One dev server transforms the pages for every worker: with more than two, first loads of
  // pages and the tabs of the multi-tab Structure tests run into the test timeout now and then.
  workers: 2,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  ...(webServerCommand
    ? {
        webServer: {
          command: webServerCommand,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          url: baseURL,
        },
      }
    : {}),
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(useSystemChrome ? { channel: "chrome" } : {}),
      },
    },
  ],
});
