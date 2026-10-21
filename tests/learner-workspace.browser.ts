import { test, expect } from "@playwright/test";

const childOne = { id: "11111111-1111-4111-8111-111111111111", display_name: "ليان", birth_year: 2015 };
const childTwo = { id: "22222222-2222-4222-8222-222222222222", display_name: "آدم", birth_year: 2017 };
const guardian = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", display_name: "ولي تجريبي", locale: "ar" };
function workspace(child: typeof childOne, locale = "ar") { return { child: { id: child.id, display_name: child.display_name }, locale, contentMode: "synthetic-only", lessons: [{ id: "lesson-1", title: locale === "ar" ? "حروف وكلمات" : "Letters and words", description: locale === "ar" ? "درس اصطناعي للمراجعة." : "Synthetic review lesson." }, { id: "lesson-2", title: locale === "ar" ? "رحلة قصيرة" : "A short journey", description: locale === "ar" ? "نشاط اصطناعي آخر." : "Another synthetic activity." }], progress: null, reports: [], teacher: null, nextLesson: null, meetingUrl: null, payments: [] }; }

async function mockFamily(page: import("@playwright/test").Page) {
  let selected = "";
  await page.route("**/api/family", async (route) => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: { authenticated: true, guardian, children: [childOne, childTwo] } });
    const body = request.postDataJSON();
    if (body.action === "logout") return route.fulfill({ json: { status: "signed_out" } });
    selected = body.child_id;
    return route.fulfill({ json: workspace(body.child_id === childOne.id ? childOne : childTwo, body.locale) });
  });
  return () => selected;
}

test("guardian sees scoped synthetic lessons without role switching or child sign-in", async ({ page }) => {
  const selected = await mockFamily(page);
  await page.goto("/ar/workspace");
  await expect(page.getByRole("heading", { name: /مرحبًا/ })).toBeVisible();
  await expect(page.getByText("الأطفال لا يسجلون الدخول", { exact: false })).not.toBeVisible();
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).toBeVisible();
  await expect(page.getByText("لا يوجد تقدم حقيقي", { exact: false })).toBeVisible();
  await expect(page.getByText(/معلم/)).toBeVisible();
  expect(selected()).toBe(childOne.id);
  await expect(page.getByText(/تبديل الشخصية|Role switch|Adult learner/i)).not.toBeVisible();
});

test("switching child clears private content before the next response and logout clears it", async ({ page }) => {
  await mockFamily(page);
  let release!: () => void;
  await page.route("**/api/family", async (route) => {
    if (route.request().method() === "POST" && route.request().postDataJSON().child_id === childTwo.id) {
      await new Promise<void>((resolve) => { release = resolve; });
      return route.fulfill({ json: workspace(childTwo) });
    }
    await route.fallback();
  });
  await page.goto("/ar/workspace");
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).toBeVisible();
  await page.getByLabel("اختر ملف الطفل").selectOption(childTwo.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).not.toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: /مساحة آدم/ })).toBeVisible();
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page.getByRole("heading", { name: /سجّل الدخول/ })).toBeVisible();
  await expect(page.getByText("مساحة آدم")).not.toBeVisible();
});

test("English route has standalone locale and family links", async ({ page }) => {
  await mockFamily(page);
  await page.goto("/en/workspace");
  await expect(page.getByRole("link", { name: "العربية" })).toHaveAttribute("href", "/ar/workspace");
  await expect(page.getByRole("link", { name: "Family space" }).first()).toHaveAttribute("href", "/en/family");
  await page.getByLabel("Choose a child profile").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /workspace/ })).toBeVisible();
});

test("missing guardian, empty children, and expired session clear private UI and retry", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/family", async (route) => {
    if (route.request().method() === "GET") {
      reads += 1;
      if (reads === 1) return route.fulfill({ json: { authenticated: true, guardian: null, children: [] } });
      if (reads === 2) return route.fulfill({ status: 401, json: { error: "sign_in_required" } });
      return route.fulfill({ json: { authenticated: true, guardian, children: [] } });
    }
    return route.fulfill({ json: { status: "signed_out" } });
  });
  await page.goto("/ar/workspace");
  await expect(page.getByRole("heading", { name: /سجّل الدخول/ })).toBeVisible();
  await expect(page.getByText(/الأطفال لا يسجلون الدخول/)).toBeVisible();
  await page.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect(page.getByText(/انتهت الجلسة/)).toBeVisible();
  await page.getByRole("button", { name: "إعادة المحاولة" }).click();
  await expect(page.getByText(/لا توجد ملفات أطفال/)).toBeVisible();
});

for (const [code, status, message] of [
  ["not_found", 404, "That child profile is no longer available"],
  ["not_allowed", 403, "This account cannot access that profile"],
  ["provider_unavailable", 503, "The service is temporarily unavailable"],
] as const) {
  test(`English ${code} state removes previously selected lessons`, async ({ page }) => {
    await mockFamily(page);
    await page.goto("/en/workspace");
    await expect(page.locator("main.learner-app")).toHaveAttribute("dir", "ltr");
    await page.getByLabel("Choose a child profile").selectOption(childOne.id);
    await expect(page.getByRole("heading", { name: "Letters and words" })).toBeVisible();
    await page.route("**/api/family", async route => {
      if (route.request().method() === "POST") return route.fulfill({ status, json: { error: code } });
      await route.fallback();
    });
    await page.getByLabel("Choose a child profile").selectOption(childTwo.id);
    await expect(page.locator("main.learner-app").getByRole("alert")).toContainText(message);
    await expect(page.getByRole("heading", { name: "Letters and words" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Family space", exact: true }).first()).toHaveAttribute("href", "/en/family");
  });
}

test("focus revalidates auth and ignores a late learner response", async ({ page }) => {
  let signedOut = false;
  let release!: () => void;
  let requested = false;
  await page.route("**/api/family", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: signedOut
      ? { authenticated: false, guardian: null, children: [] }
      : { authenticated: true, guardian, children: [childOne] } });
    requested = true;
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: workspace(childOne) }).catch(() => {});
  });
  await page.goto("/ar/workspace");
  await expect(page.locator("main.learner-app")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect.poll(() => requested).toBe(true);
  signedOut = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: /سجّل الدخول/ })).toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).not.toBeVisible();
  await expect(page.getByLabel("اختر ملف الطفل")).not.toBeVisible();
});

test("logout failure clears private content and cannot be undone by concurrent retry", async ({ page }) => {
  await mockFamily(page);
  let release!: () => void;
  let logoutPending = false;
  let getCount = 0;
  await page.route("**/api/family", async route => {
    if (route.request().method() === "GET") { getCount++; return route.fallback(); }
    if (route.request().postDataJSON().action !== "logout") return route.fallback();
    logoutPending = true;
    await new Promise<void>(resolve => { release = resolve; });
    return route.fulfill({ status: 503, json: { error: "provider_unavailable" } });
  });
  await page.goto("/en/workspace");
  await page.getByLabel("Choose a child profile").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: "Letters and words" })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect.poll(() => logoutPending).toBe(true);
  await expect(page.getByRole("heading", { name: /Sign in to access/ })).toBeVisible();
  const reads = getCount;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(getCount).toBe(reads);
  release();
  await expect(page.locator("main.learner-app").getByRole("alert")).toContainText("The service is temporarily unavailable");
  await expect(page.getByRole("heading", { name: "Letters and words" })).not.toBeVisible();
  await expect(page.getByText(guardian.display_name, { exact: false })).not.toBeVisible();
});
