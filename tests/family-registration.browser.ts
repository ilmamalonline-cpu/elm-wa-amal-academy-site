import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// These route handlers are deliberately synthetic UI harnesses. They verify client
// state transitions and selectors, not Supabase/provider behavior (covered by API tests).
type Child = { id: string; display_name: string; birth_year: number };
type MockState = { authenticated: boolean; guardian: { id: string; display_name: string; locale: "ar" | "en" } | null; children: Child[] };

async function mockFamilyApi(page: Page) {
  const state: MockState = { authenticated: false, guardian: null, children: [] };
  let nextId = 1;
  const requests: { action?: string; response: Response }[] = [];
  await page.route("**/api/family", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(state) });
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const action = String(body.action);
    if (action === "signup") {
      const response = { status: "confirmation_required" };
      requests.push({ action, response: new Response(JSON.stringify(response), { status: 200 }) });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    } else if (action === "login") {
      state.authenticated = true;
      state.guardian = null;
      const response = { status: "signed_in" };
      requests.push({ action, response: new Response(JSON.stringify(response), { status: 200 }) });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
    } else if (action === "save-guardian") {
      state.authenticated = true;
      state.guardian = { id: "guardian-1", display_name: String(body.display_name), locale: body.locale === "ar" ? "ar" : "en" };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "saved" }) });
    } else if (action === "add-child") {
      state.children.push({ id: `child-${nextId++}`, display_name: String(body.display_name), birth_year: Number(body.birth_year) });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "saved" }) });
    } else if (action === "update-child") {
      const child = state.children.find((item) => item.id === body.id);
      if (child) { child.display_name = String(body.display_name); child.birth_year = Number(body.birth_year); }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "saved" }) });
    } else if (action === "delete-child") {
      state.children = state.children.filter((item) => item.id !== body.id);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "saved" }) });
    } else if (action === "logout") {
      state.authenticated = false;
      state.guardian = null;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "signed_out" }) });
    } else {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_request" }) });
    }
  });
  return { state, requests };
}

const copy = {
  en: { localePath: "/en/family", create: "Create guardian account", guardian: "Guardian name", email: "Email", password: "Password", consent: /I attest that I am an adult guardian/, createButton: "Create account", signIn: "Sign in", complete: "Complete profile", child: "Child name", year: "Birth year", add: "Add profile", edit: "Edit", save: "Save profile", delete: "Delete", signOut: "Sign out", noForm: "Family registration is unavailable" },
  ar: { localePath: "/ar/family", create: "إنشاء حساب ولي الأمر", guardian: "اسم ولي الأمر", email: "البريد الإلكتروني", password: "كلمة المرور", consent: /أقر بأنني ولي أمر بالغ/, createButton: "إنشاء الحساب", signIn: "تسجيل الدخول", complete: "إكمال الملف", child: "اسم الطفل", year: "سنة الميلاد", add: "إضافة الملف", edit: "تعديل", save: "حفظ الملف", delete: "حذف", signOut: "تسجيل الخروج", noForm: "تسجيل الأسرة غير متاح" },
} as const;

for (const locale of ["en", "ar"] as const) {
  test.describe(`${locale} family registration`, () => {
    test("signup confirmation, login completion, child CRUD, logout, and persisted reload", async ({ page }) => {
      const t = copy[locale];
      const { state, requests } = await mockFamilyApi(page);
      await page.goto(t.localePath);
      await expect(page.getByRole("heading", { name: locale === "en" ? "Family registration & children" : "تسجيل الأسرة وإدارة الأطفال" })).toBeVisible();
      await page.getByRole("tab", { name: t.create }).click();
      await page.getByLabel(t.guardian).fill(locale === "en" ? "Sam Parent" : "ولي الأمر سام");
      await page.getByLabel(t.email).fill("synthetic@example.test");
      await page.getByLabel(t.password).fill("long-enough-password");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: t.createButton }).click();
      await expect(page.getByRole("status")).toContainText(locale === "en" ? "Request received" : "تم استلام الطلب");
      expect(requests.at(-1)?.action).toBe("signup");
      expect(requests.at(-1)?.response.headers.get("set-cookie")).toBeNull();

      await page.getByLabel(t.email).fill("synthetic@example.test");
      await page.getByLabel(t.password).fill("long-enough-password");
      await page.getByRole("button", { name: t.signIn }).click();
      await expect(page.getByRole("heading", { name: locale === "en" ? "Complete your guardian profile" : "أكمل ملف ولي الأمر" })).toBeVisible();
      expect(state.guardian).toBeNull();
      await page.getByLabel(t.guardian).fill(locale === "en" ? "Sam Parent" : "ولي الأمر سام");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: t.complete }).click();
      await expect(page.getByRole("heading", { name: locale === "en" ? "Sam Parent" : "ولي الأمر سام" })).toBeVisible();

      await page.getByLabel(t.child).fill(locale === "en" ? "Lina" : "لينا");
      await page.getByLabel(t.year).fill("2018");
      await page.getByRole("button", { name: t.add }).click();
      await expect(page.getByText(locale === "en" ? "Lina" : "لينا")).toBeVisible();
      await page.getByRole("button", { name: t.edit }).click();
      await page.getByLabel(t.child).fill(locale === "en" ? "Lina Updated" : "لينا محدثة");
      await page.getByRole("button", { name: t.save }).click();
      await expect(page.getByText(locale === "en" ? "Lina Updated" : "لينا محدثة")).toBeVisible();
      await page.getByRole("button", { name: t.delete }).click();
      await expect(page.getByText(locale === "en" ? "No child profiles yet." : "لم تضف ملفات أطفال بعد.")).toBeVisible();

      await page.getByRole("button", { name: t.signOut }).click();
      await expect(page.getByRole("tab", { name: t.signIn })).toBeVisible();
      // Re-authenticate, then reload to verify the in-memory mock state survives the page lifecycle.
      await page.getByLabel(t.email).fill("synthetic@example.test");
      await page.getByLabel(t.password).fill("long-enough-password");
      await page.getByRole("button", { name: t.signIn }).click();
      await page.getByLabel(t.guardian).fill(locale === "en" ? "Sam Parent" : "ولي الأمر سام");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: t.complete }).click();
      await page.reload();
      await expect(page.getByRole("heading", { name: locale === "en" ? "Sam Parent" : "ولي الأمر سام" })).toBeVisible();
      await expect(page.getByText(locale === "en" ? "No child profiles yet." : "لم تضف ملفات أطفال بعد.")).toBeVisible();

      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
    });

    test("hosted SSR is disabled and renders no registration form", async ({ page }) => {
      const t = copy[locale];
      const response = await page.goto(`http://127.0.0.1:3421${t.localePath}`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: t.noForm })).toBeVisible();
      await expect(page.locator("form")).toHaveCount(0);
      await expect(page.getByRole("button")).toHaveCount(0);
    });
  });
}

test("API defaults, hosted gate, local configuration gate, and CSRF rejection", async ({ request }) => {
  const hosted = await request.get("http://127.0.0.1:3421/api/family");
  expect(hosted.status()).toBe(503);
  expect(await hosted.json()).toEqual({ error: "registration_disabled" });

  const local = await request.get("http://127.0.0.1:3420/api/family");
  expect(local.status()).toBe(503);
  expect(await local.json()).toEqual({ error: "configuration_required" });

  const csrf = await request.post("http://127.0.0.1:3420/api/family", {
    headers: { Origin: "http://127.0.0.1:3420", "Content-Type": "application/json" },
    data: { action: "logout" },
  });
  expect(csrf.status()).toBe(403);
  expect(await csrf.json()).toEqual({ error: "csrf_required" });
});
