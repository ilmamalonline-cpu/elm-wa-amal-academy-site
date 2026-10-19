import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["**/*.preview.ts", "**/public-site.spec.ts", "**/visual-and-progressive.spec.ts"],
  grepInvert: /capture visual review evidence/,
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/vercel-preview",
  use: {
    baseURL: "http://127.0.0.1:3410",
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
      command: "VERCEL=1 VERCEL_ENV=preview ACADEMY_DEMO=synthetic-only PHASE2_LOCAL_SECURITY=synthetic-only PHASE2_MANUAL_PAYMENT=synthetic-only npm run start -- --port 3410",
      url: "http://127.0.0.1:3410/en/workspace",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "VERCEL=1 VERCEL_ENV=production ACADEMY_PREVIEW=browser-synthetic-only ACADEMY_DEMO=synthetic-only PHASE2_LOCAL_SECURITY=synthetic-only PHASE2_MANUAL_PAYMENT=synthetic-only npm run start -- --port 3411",
      url: "http://127.0.0.1:3411/en/workspace",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
