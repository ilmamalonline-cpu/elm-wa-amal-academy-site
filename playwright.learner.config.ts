import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/learner-workspace.browser.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/learner-workspace",
  use: {
    baseURL: "http://127.0.0.1:3422",
    launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: "ACADEMY_FAMILY_REGISTRATION=local-review npm run start -- --port 3422",
    url: "http://127.0.0.1:3422/en/workspace",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
