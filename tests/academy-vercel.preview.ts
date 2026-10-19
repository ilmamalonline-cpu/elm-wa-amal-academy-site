import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AcademyWorld } from "../src/lib/academy/types";
async function snapshot(page: Page): Promise<AcademyWorld> {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem("elm-wa-amal:browser-synthetic:v1")!).world);
}
const apiCalls = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const calls: string[] = [];
  apiCalls.set(page, calls);
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/api/")) calls.push(request.url()); });
});
test.afterEach(async ({ page }) => { expect(apiCalls.get(page)).toEqual([]); });

async function enter(page: Page, locale = "en", role = "guardian") {
  await page.goto(`/${locale}/workspace`);
  const label =
    locale === "en"
      ? {
          guardian: "01 Guardian",
          teacher: "03 Teacher",
          admin: "04 Administration",
          student: "02 Adult learner",
        }[role]
      : {
          guardian: "01 ولي الأمر",
          teacher: "03 المعلم",
          admin: "04 الإدارة",
          student: "02 الطالب البالغ",
        }[role];
  await page.getByRole("button", { name: new RegExp(label!) }).click();
  await expect(
    page.getByRole("combobox", {
      name: locale === "en" ? "Switch demo persona" : "تبديل الشخصية التجريبية",
    }),
  ).toHaveValue(role);
}
async function switchRole(page: Page, role: string) {
  await page
    .getByRole("combobox", { name: "Switch demo persona" })
    .selectOption(role);
  await expect(
    page.getByRole("combobox", { name: "Switch demo persona" }),
  ).toHaveValue(role);
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
}
async function nav(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "Academy workspace" })
    .getByRole("button", { name: new RegExp(`^${name}(?:\\s+\\d+)?$`) })
    .click();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save to local demo", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("browser preview: enrollment → assessment → assignment → plan → booking → reschedule → cancellation persists", async ({
  page,
}) => {
  await enter(page);
  await nav(page, "Learners & plans");
  await page
    .getByRole("button", { name: "Demo enrollment +", exact: true })
    .click();
  await save(page);
  const view = await snapshot(page);
  const child = view.students.find(
    (s) =>
      s.ageBand === "child" && s.guardianId === "guardian-1" && s.id !== "child-1",
  );
  expect(child).toBeTruthy();
  if (!child) throw new Error("Synthetic guardian child was not created");
  await switchRole(page, "admin");
  await nav(page, "Learners & plans");
  await page.getByRole("searchbox", { name: "Search learners" }).fill(child.id);
  await page.getByRole("button", { name: "Assessment", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Demo assessment notes" })
    .fill("Synthetic placement: begin with a small revision target.");
  await save(page);
  await page
    .getByRole("button", { name: "Assign teacher", exact: true })
    .click();
  await save(page);
  await switchRole(page, "teacher");
  await nav(page, "Learners & plans");
  await page.getByRole("searchbox", { name: "Search learners" }).fill(child.id);
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Learning goal", exact: true })
    .fill("Synthetic goal: revise a short reference with consistent practice.");
  await page.getByRole("checkbox").check();
  await save(page);
  await switchRole(page, "guardian");
  await nav(page, "Learners & plans");
  await page.getByRole("searchbox", { name: "Search learners" }).fill(child.id);
  await page.getByRole("button", { name: "Book lesson", exact: true }).click();
  const options = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Available time" })
    .locator("option:not([disabled])");
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Available time" })
    .selectOption((await options.first().getAttribute("value"))!);
  await save(page);
  await page.reload();
  const selected = page.getByRole("button", {
    name: new RegExp(`Demo child.*${child.id.replace(/[^0-9]/g, "")}`),
  });
  await selected.click();
  await nav(page, "Lessons & schedule");
  await expect(page.locator(".aw-session")).toHaveCount(1);
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const available = page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Available time" })
    .locator("option:not([disabled])");
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Available time" })
    .selectOption((await available.last().getAttribute("value"))!);
  await page
    .getByRole("textbox", { name: "Reason for change" })
    .fill("Synthetic family scheduling request");
  await save(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cancellation reason" })
    .fill("Synthetic cancellation with sufficient notice");
  await page
    .getByRole("button", { name: "Confirm local cancellation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".aw-session .aw-badge")).toHaveText("Cancelled");
});

test("browser preview: teacher draft → publish → guardian submission → teacher review, synthetic staff note stays absent from family UI", async ({
  page,
}) => {
  await enter(page, "en", "teacher");
  await nav(page, "Lessons & schedule");
  await page
    .getByRole("button", { name: "Record & evaluate", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator('input[name="memorization"]')
    .fill("4");
  await page.getByRole("dialog").locator('input[name="fluency"]').fill("3");
  await page
    .getByRole("textbox", {
      name: "Feedback shared with the family when published",
    })
    .fill(
      "Synthetic feedback: a steady beginning; revisit the assigned reference.",
    );
  await page
    .getByRole("textbox", {
      name: "Private note for teacher and administration",
    })
    .fill("PRIVATE-SYNTHETIC-STAFF-NOTE");
  await page
    .getByRole("textbox", { name: "Homework & next revision task" })
    .fill("Synthetic revision task for the next lesson");
  await page
    .getByRole("dialog")
    .locator('input[name="homeworkDue"]')
    .fill("2030-12-20");
  await save(page);
  await switchRole(page, "guardian");
  await expect(page.locator("main")).not.toContainText("PRIVATE-SYNTHETIC-STAFF-NOTE");
  await nav(page, "Homework");
  await expect(page.locator("main")).not.toContainText("Synthetic revision task for the next lesson");
  await switchRole(page, "teacher");
  await nav(page, "Progress & reports");
  await page
    .getByRole("button", {
      name: "Publish report & homework to family",
      exact: true,
    })
    .click();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await switchRole(page, "guardian");
  await nav(page, "Homework");
  await page
    .getByRole("button", { name: "Submit response", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Demo completion note or homework response" })
    .fill(
      "Synthetic guardian response: completed the practice reference together.",
    );
  await save(page);
  await switchRole(page, "teacher");
  await nav(page, "Homework");
  await page
    .getByRole("button", { name: "Review homework", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Teacher review feedback" })
    .fill("Synthetic review: good consistency; continue the same target.");
  await save(page);
  await switchRole(page, "guardian");
  await nav(page, "Progress & reports");
  await expect(page.locator("main")).not.toContainText(
    "PRIVATE-SYNTHETIC-STAFF-NOTE",
  );
  await expect(page.locator("main")).toContainText("4 / 5");
  expect((await snapshot(page)).homework[0].reviewedAt).toBeTruthy();
  await nav(page, "Notifications & activity");
  const unread = page.getByRole("button", {
    name: "Mark as read",
    exact: true,
  });
  if (await unread.count()) {
    await unread.first().click();
    await expect(
      page.locator(".aw-notification").filter({ hasText: "Read" }).first(),
    ).toBeVisible();
  }
  await nav(page, "Progress & reports");
});

for (const locale of ["ar", "en"]) {
  test(`browser preview: ${locale} responsive, semantic, accessible roles and dialog keyboard`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await enter(page, locale);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("h1")).toHaveCount(1);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 950 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    const navigation = page.getByRole("navigation", {
      name: locale === "ar" ? "مساحة الأكاديمية" : "Academy workspace",
    });
    await navigation
      .getByRole("button", {
        name: locale === "ar" ? "الطلاب والخطط" : "Learners & plans",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: locale === "ar" ? "طلب تعلم تجريبي +" : "Demo enrollment +",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await navigation
      .getByRole("button", {
        name: locale === "ar" ? "نظرة عامة" : "Overview",
        exact: true,
      })
      .click();
    await page
      .getByRole("link", {
        name: locale === "ar" ? "English" : "العربية",
        exact: true,
      })
      .click();
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      locale === "ar" ? "ltr" : "rtl",
    );
    expect(errors).toEqual([]);
    await page.setViewportSize({ width: test.info().project.name === "mobile" ? 375 : 1440, height: 950 });
  });
}

test("preview: per-visitor isolation, no real account cookies, reset, corrupt storage recovery", async ({ page, browser }) => {
  await enter(page);
  await nav(page, "Learners & plans");
  await page.getByRole("button", { name: "Demo enrollment +", exact: true }).click();
  await save(page);
  expect((await snapshot(page)).students.length).toBe(4);
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto("http://127.0.0.1:3410/en/workspace");
  await expect(other.getByRole("button", { name: "01 Guardian" })).toBeVisible();
  expect(await other.evaluate(() => document.cookie)).toBe("");
  await context.close();
  await page.evaluate(() => sessionStorage.setItem("elm-wa-amal:browser-synthetic:v1", "bad-json"));
  await page.reload();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reset this tab’s demo data" }).click();
  await expect(page.getByRole("button", { name: "01 Guardian" })).toBeVisible();
});

test("preview: public server APIs remain closed even with synthetic flags; production cannot enable browser sandbox", async ({ request, page }) => {
  for (const origin of ["http://127.0.0.1:3410", "http://127.0.0.1:3411"]) {
    for (const path of ["academy-demo", "phase2/me", "manual-payments/requests"]) {
      expect((await request.get(`${origin}/api/${path}`)).status()).toBe(503);
    }
    expect((await request.get(`${origin}/en/not-a-page`)).status()).toBe(404);
  }
  // The per-page no-API assertion applies to preview flows, not the intentional
  // disabled-API read performed by the production guard UI.
  await page.goto("http://127.0.0.1:3411/en/workspace");
  await expect(page.getByRole("heading", { name: "The demo is disabled by default" })).toBeVisible();
  expect(apiCalls.get(page)?.every(url => url === "http://127.0.0.1:3411/api/academy-demo")).toBe(true);
  apiCalls.set(page, []);
});
