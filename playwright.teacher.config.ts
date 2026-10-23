import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "teacher-demo.browser.ts", fullyParallel: true,
  workers: 3, retries: 0, reporter: "list", outputDir: "test-results/teacher-demo",
  use: { baseURL: "http://127.0.0.1:3430", launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] }, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: [
    { command: "VERCEL=1 VERCEL_ENV=preview VERCEL_GIT_COMMIT_REF=preview/academy-synthetic ACADEMY_DEMO=synthetic-only npm run start -- --port 3430", url: "http://127.0.0.1:3430/en/teacher-demo", reuseExistingServer: false, timeout: 30000 },
    { command: "VERCEL=1 VERCEL_ENV=production VERCEL_GIT_COMMIT_REF=preview/academy-synthetic ACADEMY_PREVIEW=browser-synthetic-only npm run start -- --port 3431", url: "http://127.0.0.1:3431/en", reuseExistingServer: false, timeout: 30000 },
    { command: "env -u VERCEL -u VERCEL_ENV -u ACADEMY_PREVIEW npm run start -- --port 3432", url: "http://127.0.0.1:3432/en", reuseExistingServer: false, timeout: 30000 },
  ],
});
