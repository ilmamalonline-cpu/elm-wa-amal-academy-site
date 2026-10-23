import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const locale of ["en", "ar"] as const) {
  test(`${locale}: assigned individual sessions, validation, outcomes, cancel, reset and memory isolation`, async ({ page, context }) => {
    const en = locale === "en";
    const text = (english: string, arabic: string) => en ? english : arabic;
    const calls: string[] = [];
    page.on("request", r => { if (/\/api\/|supabase\.co/.test(r.url())) calls.push(r.url()); });
    await page.goto(`/${locale}/teacher-demo`);
    await expect(page.locator("main.teacher-demo")).toHaveAttribute("dir", en ? "ltr" : "rtl");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text("1-to-1 lesson workspace", "لوحة دروس فردية"));
    await expect(page.locator(".session-row")).toHaveCount(2);
    await expect(page.locator(".teacher-demo-banner")).toContainText(text("Every teacher, student, and session is fictional", "كل المعلمين والطلاب والجلسات وهميون"));
    const initialStorage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
    const first = () => page.locator(".session-row").filter({ hasText: text("Student 01", "الطالب 01") });
    await first().getByRole("button", { name: text("Open session", "فتح الجلسة"), exact: true }).click();
    await expect(page.locator(".editor")).toBeVisible();
    const editor = () => page.locator(".editor");
    await editor().getByRole("combobox", { name: text("Completion status", "حالة الإكمال"), exact: true }).selectOption("completed");
    await editor().getByRole("button", { name: text("Save outcome", "حفظ النتيجة"), exact: true }).click();
    await expect(editor().getByRole("alert")).toContainText(text("A completed session requires", "لا يمكن إكمال الجلسة"));
    await editor().getByRole("combobox", { name: text("Attendance", "الحضور"), exact: true }).selectOption("attended");
    await editor().getByRole("textbox", { name: text("Outcome", "النتيجة"), exact: true }).fill("  Synthetic outcome  ");
    await editor().getByRole("textbox", { name: text("Follow-up", "خطوة المتابعة"), exact: true }).fill("  Synthetic follow-up  ");
    await editor().getByRole("button", { name: text("Save outcome", "حفظ النتيجة"), exact: true }).click();
    await expect(page.locator(".editor")).toHaveCount(0);
    await expect(first().locator(".status-completed")).toHaveText(text("Completed", "مكتملة"));
    await first().getByRole("button").click();
    await expect(editor().getByRole("textbox", { name: text("Outcome", "النتيجة"), exact: true })).toHaveValue("Synthetic outcome");
    await editor().getByRole("textbox", { name: text("Outcome", "النتيجة"), exact: true }).fill("discard me");
    await editor().getByRole("button", { name: text("Cancel changes", "إلغاء التعديلات"), exact: true }).click();
    await first().getByRole("button").click();
    await expect(editor().getByRole("textbox", { name: text("Outcome", "النتيجة"), exact: true })).toHaveValue("Synthetic outcome");
    await editor().getByRole("button", { name: text("Cancel changes", "إلغاء التعديلات"), exact: true }).click();
    await page.getByRole("combobox", { name: text("Filter sessions", "تصفية الجلسات") }).selectOption("completed");
    await expect(page.locator(".session-row")).toHaveCount(1);
    await page.locator(".teacher-option").filter({ hasText: /02/ }).click();
    await expect(page.locator(".session-row")).toHaveCount(0);
    await page.getByRole("combobox", { name: text("Filter sessions", "تصفية الجلسات") }).selectOption("all");
    await expect(page.locator(".session-row")).toHaveCount(2);
    await expect(page.locator(".session-list")).not.toContainText(text("Student 01", "الطالب 01"));
    await page.getByRole("button", { name: text("Reset preview", "إعادة الضبط"), exact: true }).click();
    await expect(page.locator(".teacher-option[aria-pressed=true]")).toContainText("01");
    await expect(first().locator(".status-not-started")).toHaveCount(1);
    await expect(page.getByRole("combobox", { name: text("Filter sessions", "تصفية الجلسات") })).toHaveValue("all");
    await first().getByRole("button").click();
    await editor().getByRole("textbox", { name: text("Outcome", "النتيجة"), exact: true }).fill("only this document");
    await page.reload();
    await expect(page.locator(".editor")).toHaveCount(0);
    await first().getByRole("button").click();
    await expect(editor().getByRole("textbox", { name: text("Outcome", "النتيجة"), exact: true })).toHaveValue("");
    const secondTab = await context.newPage();
    await secondTab.goto(`/${locale}/teacher-demo`);
    await expect(secondTab.locator(".status-completed")).toHaveCount(0);
    await secondTab.close();
    expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }))).toEqual(initialStorage);
    expect(calls).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const violations = (await new AxeBuilder({ page }).include(".teacher-demo").analyze()).violations;
    expect(violations).toEqual([]);
  });
}

test("route and entry fail closed in production and default; Preview entry works", async ({ page, request }) => {
  for (const port of [3431, 3432]) {
    for (const locale of ["ar", "en"]) {
      const response = await request.get(`http://127.0.0.1:${port}/${locale}/teacher-demo`);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain("teacher-demo-shell");
      await page.goto(`http://127.0.0.1:${port}/${locale}/workspace`);
      await expect(page.locator(".teacher-demo-entry")).toHaveCount(0);
    }
  }
  await page.goto("/en/workspace");
  await page.getByRole("link", { name: "Try the teacher workspace — synthetic data only" }).click();
  await expect(page).toHaveURL(/\/en\/teacher-demo$/);
  await page.getByRole("link", { name: "Change language", exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/teacher-demo$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
});
