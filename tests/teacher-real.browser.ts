import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const teacher = { id: "teacher-test", display_name: "Local test fixture", time_zone: "Africa/Cairo" };
const pageOne = { id: "lesson-1", subject: "quran", starts_at: "2026-05-04T15:00:00+03:00", ends_at: "2026-05-04T16:00:00+03:00", time_zone: "Africa/Cairo", status: "scheduled" };
const pageTwo = { id: "lesson-2", subject: "tajweed", starts_at: "2026-05-05T15:00:00+03:00", ends_at: "2026-05-05T16:00:00+03:00", time_zone: "Africa/Cairo", status: "cancelled" };
const read = (lessons = [pageOne], has_more = false, offset = 0) => ({ teacher, lessons, has_more, offset });

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: approved teacher can sign in, read pages, sign out, and has no storage or overflow`, async ({ page }) => {
    const posts: string[] = [];
    await page.route("**/api/teacher**", async route => {
      const request = route.request();
      if (request.method() === "POST") {
        posts.push(request.postDataJSON()?.action ?? "");
        if (request.postDataJSON()?.action === "logout") return route.fulfill({ json: { status: "signed_out" } });
        return route.fulfill({ json: read([pageOne], true) });
      }
      const offset = new URL(request.url()).searchParams.get("offset");
      if (offset === "50") return route.fulfill({ json: read([pageTwo], false, 50) });
      return route.fulfill({ status: 401, json: { error: "authentication_required" } });
    });
    await page.goto(`/${locale}/teacher`);
    const en = locale === "en";
    const text = (english: string, arabic: string) => en ? english : arabic;
    await expect(page.locator("main.teacher-workspace")).toHaveAttribute("dir", en ? "ltr" : "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text("Teacher sign in", "دخول المعلم"));
    await page.getByLabel(text("Email", "البريد الإلكتروني")).fill("approved.teacher@example.test");
    await page.getByLabel(text("Password", "كلمة المرور")).fill("not-a-real-password");
    await page.getByRole("button", { name: text("Sign in", "تسجيل الدخول"), exact: true }).click();
    await expect(page.getByRole("heading", { name: text("Assigned individual sessions", "الجلسات الفردية المعيّنة") })).toBeVisible();
    await expect(page.locator(".lesson-row")).toHaveCount(1);
    await expect(page.locator(".lesson-row")).not.toContainText("child");
    await page.getByRole("button", { name: text("Next", "التالي"), exact: true }).click();
    await expect(page.locator(".lesson-row")).toContainText(text("Tajweed", "التجويد"));
    await page.getByRole("button", { name: text("Sign out", "تسجيل الخروج"), exact: true }).click();
    await expect(page.getByRole("heading", { name: text("Teacher sign in", "دخول المعلم") })).toBeVisible();
    expect(posts).toEqual(["login", "logout"]);
    expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, width: document.documentElement.scrollWidth <= innerWidth }))).toEqual({ local: {}, session: {}, width: true });
    expect(await new AxeBuilder({ page }).include(".teacher-workspace").analyze()).toHaveProperty("violations", []);
  });
}

test("real teacher route renders explicit access errors and never links demo", async ({ page }) => {
  await page.route("**/api/teacher**", route => route.fulfill({ status: 403, json: { error: "teacher_profile_required" } }));
  await page.goto("/en/teacher");
  await expect(page.locator("main.teacher-workspace").getByRole("alert")).toContainText("Teacher access must be assigned");
  await expect(page.getByText(/demo/i)).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("real teacher page remains separate from the synthetic demo", async ({ page }) => {
  await page.goto("/en/teacher-demo");
  await expect(page.locator("main.teacher-demo")).toBeVisible();
  await page.goto("/en/teacher");
  await expect(page.locator("main.teacher-demo")).toHaveCount(0);
});

for (const locale of ["ar", "en"] as const) {
  test(`${locale}: empty active profile and revoked pagination never show demo or stale sessions`, async ({ page }) => {
    let mode = "empty";
    await page.route("**/api/teacher**", route => {
      expect(route.request().headers()["x-teacher-workspace"]).toBe("real-preview");
      if (mode === "empty") return route.fulfill({ json: read([], false) });
      if (new URL(route.request().url()).searchParams.has("offset")) return route.fulfill({ status: 403, json: { error: "teacher_profile_required" } });
      return route.fulfill({ json: read([pageOne], true) });
    });
    await page.goto(`/${locale}/teacher`);
    await expect(page.locator(".empty-state")).toContainText(locale === "ar" ? "لا توجد جلسات فردية" : "No assigned individual sessions");
    mode = "rows";
    await page.reload();
    await expect(page.locator(".lesson-row")).toHaveCount(1);
    await page.getByRole("button", { name: locale === "ar" ? "التالي" : "Next", exact: true }).click();
    await expect(page.locator(".lesson-row")).toHaveCount(0);
    await expect(page.locator("main.teacher-workspace").getByRole("alert")).toContainText(locale === "ar" ? "يجب تعيين صلاحية المعلم" : "Teacher access must be assigned");
  });
  test(`${locale}: unavailable provider and denied login remain safe and clear password`, async ({ page }) => {
    await page.route("**/api/teacher**", route => route.fulfill({ status: route.request().method() === "POST" ? 403 : 503, json: { error: route.request().method() === "POST" ? "teacher_profile_required" : "teacher_roster_unavailable" } }));
    await page.goto(`/${locale}/teacher`);
    await expect(page.locator("main.teacher-workspace").getByRole("alert")).toContainText(locale === "ar" ? "تعذر تحميل سجل المعلم" : "temporarily unavailable");
    await page.getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email").fill("guardian@example.test");
    await page.getByLabel(locale === "ar" ? "كلمة المرور" : "Password").fill("local-test-only");
    await page.getByRole("button", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in", exact: true }).click();
    await expect(page.getByText(locale === "ar" ? /يجب تعيين صلاحية المعلم/ : /Teacher access must be assigned/)).toBeVisible();
    await expect(page.getByLabel(locale === "ar" ? "كلمة المرور" : "Password")).toHaveValue("");
    await expect(page.locator(".lesson-row")).toHaveCount(0);
  });
}

test("real HTTP handler enforces anonymous, CSRF and write restrictions without reaching Supabase", async ({ request }) => {
  const headers = { "X-Teacher-Workspace": "real-preview", Origin: "http://127.0.0.1:3455" };
  const anonymous = await request.get("/api/teacher", { headers });
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toEqual({ error: "authentication_required" });
  expect(anonymous.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/api/teacher")).status()).toBe(403);
  expect((await request.get("/api/teacher", { headers: { ...headers, Origin: "https://untrusted.example" } })).status()).toBe(403);
  expect((await request.post("/api/teacher", { headers, data: { action: "update-session" } })).status()).toBe(400);
  expect((await request.patch("/api/teacher", { headers, data: { status: "cancelled" } })).status()).toBe(405);
  expect((await request.post("/api/teacher", { headers, data: { action: "logout" } })).status()).toBe(200);
});
