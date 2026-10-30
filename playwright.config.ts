import { defineConfig, devices } from "@playwright/test";

/**
 * Browser journeys are written against the live Next.js app.
 *
 * In this QA sandbox `next dev` cannot bind a local port (EPERM), so no
 * webServer is configured here and every spec is explicitly skipped with the
 * blocked reason. Run with a reachable server via PLAYWRIGHT_BASE_URL once
 * the app can be started.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
