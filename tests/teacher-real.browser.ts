import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const teacher = { id: "teacher-test", display_name: "Local test fixture", time_zone: "Africa/Cairo" };
const pageOne = { id: "lesson-1", subject: "quran", starts_at: "2026-05-04T15:00:00+03:00", ends_at: "2026-05-04T16:00:00+03:00", time_zone: "Africa/Cairo", status: "scheduled", outcome: null, follow_up_note: "" };
const pageTwo = { id: "lesson-2", subject: "tajweed", starts_at: "2026-05-05T15:00:00+03:00", ends_at: "2026-05-05T16:00:00+03:00", time_zone: "Africa/Cairo", status: "cancelled", outcome: null, follow_up_note: "" };
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

for (const locale of ["ar", "en"] as const) {
  test(`${locale}: authenticated account without teacher activation gets a clear, accessible next step`, async ({ page }) => {
    await page.route("**/api/teacher**", route => route.fulfill(route.request().method() === "POST"
      ? { status: 403, json: { error: "teacher_profile_required" } }
      : { status: 401, json: { error: "authentication_required" } }));
    await page.goto(`/${locale}/teacher`);
    const en = locale === "en";
    const text = (english: string, arabic: string) => en ? english : arabic;
    await page.getByLabel(text("Email", "البريد الإلكتروني")).fill("teacher.synthetic@example.test");
    await page.getByLabel(text("Password", "كلمة المرور")).fill("synthetic-password-only");
    await page.getByRole("button", { name: text("Sign in", "تسجيل الدخول"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text("Teacher workspace access pending", "تفعيل الوصول إلى مساحة المعلم"));
    await expect(page.getByRole("heading", { name: text("Teacher workspace access needs activation", "يلزم تفعيل الوصول إلى مساحة المعلم") })).toBeVisible();
    await expect(page.locator("main.teacher-workspace").getByRole("status")).toContainText(text("Your sign-in was accepted", "تم التحقق من بيانات الدخول"));
    await expect(page.locator("main.teacher-workspace").getByRole("status")).toContainText(text("contact the academy administrator", "تواصل مع مسؤول الأكاديمية"));
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    await expect(page.getByText(/demo/i)).toHaveCount(0);
    await expect(page.locator("main.teacher-workspace").getByText(/academy_teachers|academy_teacher_assignments|teacher_profile_required/i)).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(await new AxeBuilder({ page }).include(".teacher-workspace").analyze()).toHaveProperty("violations", []);
    await page.getByRole("button", { name: text("Return to sign in", "العودة إلى تسجيل الدخول"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text("Teacher sign in", "دخول المعلم"));
    await expect(page.getByLabel(text("Password", "كلمة المرور"))).toHaveValue("");
  });
}

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
    await expect(page.locator("main.teacher-workspace").getByRole("status")).toContainText(locale === "ar" ? "تم التحقق من بيانات الدخول" : "Your sign-in was accepted");
  });
  test(`${locale}: unavailable provider and denied login remain safe and clear password`, async ({ page }) => {
    await page.route("**/api/teacher**", route => route.fulfill({ status: route.request().method() === "POST" ? 401 : 503, json: { error: route.request().method() === "POST" ? "authentication_required" : "teacher_roster_unavailable" } }));
    await page.goto(`/${locale}/teacher`);
    await expect(page.locator("main.teacher-workspace").getByRole("alert")).toContainText(locale === "ar" ? "تعذر تحميل سجل المعلم" : "temporarily unavailable");
    await page.getByLabel(locale === "ar" ? "البريد الإلكتروني" : "Email").fill("guardian@example.test");
    await page.getByLabel(locale === "ar" ? "كلمة المرور" : "Password").fill("local-test-only");
    await page.getByRole("button", { name: locale === "ar" ? "تسجيل الدخول" : "Sign in", exact: true }).click();
    await expect(page.getByText(locale === "ar" ? /تسجيل الدخول مطلوب/ : /Sign in is required/)).toBeVisible();
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
  expect((await request.post("/api/teacher", { headers, data: { action: "update-session" } })).status()).toBe(401);
  expect((await request.patch("/api/teacher", { headers, data: { status: "cancelled" } })).status()).toBe(405);
  expect((await request.post("/api/teacher", { headers, data: { action: "logout" } })).status()).toBe(200);
});

test("local synthetic fixture: teacher can update outcome and guardian-visible note, while cancelled stays read-only", async ({ page }) => {
  let lesson = { ...pageOne };
  await page.route("**/api/teacher**", async route => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.action === "login") return route.fulfill({ json: read([lesson, pageTwo]) });
      if (body.action === "update-session") {
        lesson = { ...lesson, outcome: body.outcome, follow_up_note: body.follow_up_note };
        return route.fulfill({ json: { lesson } });
      }
      return route.fulfill({ json: { status: "signed_out" } });
    }
    return route.fulfill({ json: read([lesson, pageTwo]) });
  });
  await page.goto("/en/teacher");
  await page.getByRole("button", { name: "Update session", exact: true }).first().click();
  await expect(page.getByLabel("Outcome")).toBeVisible();
  await expect(page.getByLabel("Follow-up note visible to the guardian")).toHaveAttribute("maxlength", "1000");
  await page.getByLabel("Outcome").selectOption("attended_completed");
  await page.getByLabel("Follow-up note visible to the guardian").fill("<b>Local synthetic note</b>");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Session update saved");
  expect(lesson).toMatchObject({ outcome: "attended_completed", follow_up_note: "<b>Local synthetic note</b>" });
  await expect(page.locator(".lesson-row").first()).toContainText("Attended — completed");
  await expect(page.locator(".lesson-row").first()).toContainText("<b>Local synthetic note</b>");
  await expect(page.locator(".lesson-row").first().locator("b")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".lesson-row").first()).toContainText("<b>Local synthetic note</b>");
  await expect(page.locator(".lesson-row").nth(1)).toContainText("Cancelled sessions are read-only");
  await expect(page.locator(".lesson-row").nth(1)).toContainText("Unrecorded");
});

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: invalid empty outcome and provider failures never confirm or retain stale drafts`, async ({ page }) => {
    let mode: "ok" | "503" | "403" = "ok";
    let lesson = { ...pageOne };
    await page.route("**/api/teacher**", async route => {
      const request = route.request();
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        if (body.action === "login") return route.fulfill({ json: read([lesson]) });
        if (body.action === "update-session" && mode !== "ok") return route.fulfill({ status: mode === "403" ? 403 : 503, json: { error: mode === "403" ? "session_not_available" : "teacher_roster_unavailable" } });
        if (body.action === "update-session") { lesson = { ...lesson, outcome: body.outcome, follow_up_note: body.follow_up_note }; return route.fulfill({ json: { lesson } });
        }
      }
      return route.fulfill({ json: read([lesson]) });
    });
    const text = (english: string, arabic: string) => locale === "en" ? english : arabic;
    await page.goto(`/${locale}/teacher`);
    await page.getByRole("button", { name: text("Update session", "تحديث الجلسة"), exact: true }).click();
    await page.getByLabel(text("Follow-up note visible to the guardian", "ملاحظة متابعة مرئية لولي الأمر")).fill("   ");
    await page.getByRole("button", { name: text("Save", "حفظ"), exact: true }).click();
    await expect(page.locator("main.teacher-workspace").getByRole("alert")).toContainText(text("outcome or note is invalid", "النتيجة أو الملاحظة غير صالحة"));
    mode = "503";
    await page.getByLabel(text("Follow-up note visible to the guardian", "ملاحظة متابعة مرئية لولي الأمر")).fill("valid note");
    await page.getByLabel(text("Outcome", "النتيجة")).selectOption("attended_completed");
    await page.getByRole("button", { name: text("Save", "حفظ"), exact: true }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    mode = "403";
    await page.getByRole("button", { name: text("Save", "حفظ"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text("Teacher sign in", "دخول المعلم"));
    await expect(page.locator("textarea")).toHaveCount(0);
  });
}
