import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

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

test("academy: enrollment → assessment → assignment → plan → booking → reschedule → cancellation persists", async ({
  page,
}) => {
  await enter(page);
  await nav(page, "Learners & plans");
  await page
    .getByRole("button", { name: "Demo enrollment +", exact: true })
    .click();
  await save(page);
  const response = await page.request.get("/api/academy-demo");
  const { view } = await response.json();
  const child = view.students.find(
    (s: { id: string; ageBand: string }) =>
      s.ageBand === "child" && s.id !== "child-1",
  );
  expect(child).toBeTruthy();
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

test("academy: teacher draft → publish → guardian submission → teacher review, private note stays private", async ({
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
  let data = await (await page.request.get("/api/academy-demo")).json();
  expect(data.view.evaluations).toHaveLength(0);
  expect(data.view.homework).toHaveLength(0);
  expect(JSON.stringify(data)).not.toContain("PRIVATE-SYNTHETIC-STAFF-NOTE");
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
  data = await (await page.request.get("/api/academy-demo")).json();
  expect(data.view.homework[0].reviewedAt).toBeTruthy();
  expect(data.view.privateNotes).toEqual([]);
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
  await mkdir("docs/previews/academy", { recursive: true });
  await nav(page, "Progress & reports");
  await page.screenshot({
    path: `docs/previews/academy/${test.info().project.name}-en-published-report.png`,
    fullPage: true,
  });
});

for (const locale of ["ar", "en"]) {
  test(`academy: ${locale} responsive, semantic, accessible roles and dialog keyboard`, async ({
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
    await mkdir("docs/previews/academy", { recursive: true });
    await page.setViewportSize({ width: test.info().project.name === "mobile" ? 375 : 1440, height: 950 });
    await page.screenshot({
      path: `docs/previews/academy/${test.info().project.name}-${locale === "ar" ? "en" : "ar"}-overview.png`,
      fullPage: true,
    });
  });
}

test("academy API: no child login, no header role escalation, isolated worlds, strict payloads and default service gates", async ({
  request,
  browser,
}) => {
  const headers = { "X-Academy-Demo": "synthetic-only" };
  expect(
    (
      await request.post("/api/academy-demo", {
        headers,
        data: { action: "enter", role: "child" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/academy-demo", {
        data: { action: "enter", role: "admin" },
      })
    ).status(),
  ).toBe(403);
  await request.post("/api/academy-demo", {
    headers,
    data: { action: "enter", role: "guardian" },
  });
  const read = await request.get("/api/academy-demo", {
    headers: { "x-academy-role": "admin" },
  });
  const data = await read.json();
  expect(data.view.role).toBe("guardian");
  expect(
    data.view.students.some((s: { id: string }) => s.id === "child-2"),
  ).toBe(false);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers,
        data: {
          action: "assess",
          studentId: "adult-1",
          level: "foundation",
          notes: "Synthetic",
        },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers: { ...headers, Origin: "http://127.0.0.1:3999" },
        data: { action: "enter", role: "admin" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/academy-demo", {
        headers,
        data: { action: "enter", role: "guardian", extra: true },
      })
    ).status(),
  ).toBe(400);
  const ctx = await browser.newContext();
  const fresh = await ctx.request.get("http://127.0.0.1:3000/api/academy-demo");
  expect((await fresh.json()).view.role).toBe(null);
  await ctx.close();
  expect((await request.get("/api/phase2/me")).status()).toBe(503);
  expect((await request.get("/api/manual-payments/orders")).status()).toBe(503);
});
