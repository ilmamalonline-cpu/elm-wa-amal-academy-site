import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/family-registration.browser.ts",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/family-registration",
  use: {
    baseURL: "http://127.0.0.1:3420",
    launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    {
      command: "ACADEMY_FAMILY_REGISTRATION=local-review npm run start -- --port 3420",
      url: "http://127.0.0.1:3420/en/family",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "VERCEL=1 VERCEL_ENV=production ACADEMY_FAMILY_REGISTRATION=local-review npm run start -- --port 3421",
      url: "http://127.0.0.1:3421/en/family",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
