import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "teacher-real.browser.ts",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: "list",
  outputDir: "test-results/teacher-real",
  use: { baseURL: "http://127.0.0.1:3455", launchOptions: { executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] }, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
  webServer: { command: "VERCEL=1 VERCEL_ENV=preview VERCEL_GIT_COMMIT_REF=preview/academy-synthetic ACADEMY_SUPABASE_URL=https://dyyvpcntbbwbuzskiidb.supabase.co ACADEMY_SUPABASE_PUBLISHABLE_KEY=sb_publishable_mock_public_test_key_only ACADEMY_DEMO=synthetic-only npm run start -- --port 3455", url: "http://127.0.0.1:3455/en/teacher", reuseExistingServer: false, timeout: 30000 },
});
