import { test, expect } from "@playwright/test";

const childOne = {
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "ليان",
  birth_year: 2015,
};
const childTwo = {
  id: "22222222-2222-4222-8222-222222222222",
  display_name: "آدم",
  birth_year: 2017,
};
const guardian = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  display_name: "ولي تجريبي",
  locale: "ar",
};
function workspace(child: typeof childOne, locale = "ar") {
  return {
    child: { id: child.id, display_name: child.display_name },
    locale,
    contentMode: "synthetic-only",
    lessons: [
      {
        id: "lesson-1",
        title: locale === "ar" ? "حروف وكلمات" : "Letters and words",
        description:
          locale === "ar"
            ? "درس اصطناعي للمراجعة."
            : "Synthetic review lesson.",
      },
      {
        id: "lesson-2",
        title: locale === "ar" ? "رحلة قصيرة" : "A short journey",
        description:
          locale === "ar" ? "نشاط اصطناعي آخر." : "Another synthetic activity.",
      },
    ],
    progress: null,
    reports: [],
    teacher: null,
    nextLesson: null,
    meetingUrl: null,
    payments: [],
  };
}

async function mockFamily(page: import("@playwright/test").Page) {
  let selected = "";
  await page.route("**/api/family", async (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: { authenticated: true, guardian, children: [childOne, childTwo] },
      });
    const body = request.postDataJSON();
    if (body.action === "logout")
      return route.fulfill({ json: { status: "signed_out" } });
    selected = body.child_id;
    return route.fulfill({
      json: workspace(
        body.child_id === childOne.id ? childOne : childTwo,
        body.locale,
      ),
    });
  });
  return () => selected;
}

test("guardian sees scoped synthetic lessons without role switching or child sign-in", async ({
  page,
}) => {
  const selected = await mockFamily(page);
  await page.goto("/ar/workspace");
  await expect(page.getByRole("heading", { name: /مرحبًا/ })).toBeVisible();
  await expect(
    page.getByText("الأطفال لا يسجلون الدخول", { exact: false }),
  ).not.toBeVisible();
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).toBeVisible();
  await expect(
    page.getByText("ملخص الممارسة مبني", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".learner-hero").getByText(/معلم/)).toBeVisible();
  expect(selected()).toBe(childOne.id);
  await expect(
    page.getByText(/تبديل الشخصية|Role switch|Adult learner/i),
  ).not.toBeVisible();
});

test("switching child clears private content before the next response and logout clears it", async ({
  page,
}) => {
  await mockFamily(page);
  let release!: () => void;
  await page.route("**/api/family", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON().child_id === childTwo.id
    ) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return route.fulfill({ json: workspace(childTwo) });
    }
    await route.fallback();
  });
  await page.goto("/ar/workspace");
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).toBeVisible();
  await page.getByLabel("اختر ملف الطفل").selectOption(childTwo.id);
  await expect(
    page.getByRole("heading", { name: /مساحة ليان/ }),
  ).not.toBeVisible();
  release();
  await expect(page.getByRole("heading", { name: /مساحة آدم/ })).toBeVisible();
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(
    page.getByRole("heading", { name: /سجّل الدخول/ }),
  ).toBeVisible();
  await expect(page.getByText("مساحة آدم")).not.toBeVisible();
});

test("English route has standalone locale and family links", async ({
  page,
}) => {
  await mockFamily(page);
  await page.goto("/en/workspace");
  await expect(page.getByRole("link", { name: "العربية" })).toHaveAttribute(
    "href",
    "/ar/workspace",
  );
  await expect(
    page.getByRole("link", { name: "Family space" }).first(),
  ).toHaveAttribute("href", "/en/family");
  await page.getByLabel("Choose a child profile").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /workspace/ })).toBeVisible();
});

test("missing guardian, empty children, and expired session clear private UI and retry", async ({
  page,
}) => {
  let reads = 0;
  await page.route("**/api/family", async (route) => {
    if (route.request().method() === "GET") {
      reads += 1;
      if (reads === 1)
        return route.fulfill({
          json: { authenticated: true, guardian: null, children: [] },
        });
      if (reads === 2)
        return route.fulfill({
          status: 401,
          json: { error: "sign_in_required" },
        });
      return route.fulfill({
        json: { authenticated: true, guardian, children: [] },
      });
    }
    return route.fulfill({ json: { status: "signed_out" } });
  });
  await page.goto("/ar/workspace");
  await expect(
    page.getByRole("heading", { name: /سجّل الدخول/ }),
  ).toBeVisible();
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
  test(`English ${code} state removes previously selected lessons`, async ({
    page,
  }) => {
    await mockFamily(page);
    await page.goto("/en/workspace");
    await expect(page.locator("main.learner-app")).toHaveAttribute(
      "dir",
      "ltr",
    );
    await page.getByLabel("Choose a child profile").selectOption(childOne.id);
    await expect(
      page.getByRole("heading", { name: "Letters and words" }),
    ).toBeVisible();
    await page.route("**/api/family", async (route) => {
      if (route.request().method() === "POST")
        return route.fulfill({ status, json: { error: code } });
      await route.fallback();
    });
    await page.getByLabel("Choose a child profile").selectOption(childTwo.id);
    await expect(
      page.locator("main.learner-app").getByRole("alert"),
    ).toContainText(message);
    await expect(
      page.getByRole("heading", { name: "Letters and words" }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("link", { name: "Family space", exact: true }).first(),
    ).toHaveAttribute("href", "/en/family");
  });
}

test("focus revalidates auth and ignores a late learner response", async ({
  page,
}) => {
  let signedOut = false;
  let release!: () => void;
  let requested = false;
  await page.route("**/api/family", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: signedOut
          ? { authenticated: false, guardian: null, children: [] }
          : { authenticated: true, guardian, children: [childOne] },
      });
    requested = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: workspace(childOne) }).catch(() => {});
  });
  await page.goto("/ar/workspace");
  await expect(page.locator("main.learner-app")).toHaveAttribute("dir", "rtl");
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect.poll(() => requested).toBe(true);
  signedOut = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("heading", { name: /سجّل الدخول/ }),
  ).toBeVisible();
  release();
  await expect(
    page.getByRole("heading", { name: /مساحة ليان/ }),
  ).not.toBeVisible();
  await expect(page.getByLabel("اختر ملف الطفل")).not.toBeVisible();
});

test("logout failure clears private content and cannot be undone by concurrent retry", async ({
  page,
}) => {
  await mockFamily(page);
  let release!: () => void;
  let logoutPending = false;
  let getCount = 0;
  await page.route("**/api/family", async (route) => {
    if (route.request().method() === "GET") {
      getCount++;
      return route.fallback();
    }
    if (route.request().postDataJSON().action !== "logout")
      return route.fallback();
    logoutPending = true;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return route.fulfill({
      status: 503,
      json: { error: "provider_unavailable" },
    });
  });
  await page.goto("/en/workspace");
  await page.getByLabel("Choose a child profile").selectOption(childOne.id);
  await expect(
    page.getByRole("heading", { name: "Letters and words" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect.poll(() => logoutPending).toBe(true);
  await expect(
    page.getByRole("heading", { name: /Sign in to access/ }),
  ).toBeVisible();
  const reads = getCount;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(getCount).toBe(reads);
  release();
  await expect(
    page.locator("main.learner-app").getByRole("alert"),
  ).toContainText("The service is temporarily unavailable");
  await expect(
    page.getByRole("heading", { name: "Letters and words" }),
  ).not.toBeVisible();
  await expect(
    page.getByText(guardian.display_name, { exact: false }),
  ).not.toBeVisible();
});

test("learning CRUD persists in the mock store, recovers ambiguous writes by reload, and resets drafts on child switch", async ({
  page,
}) => {
  const store = new Map<
    string,
    {
      goal: string;
      weekly_target_minutes: number;
      entries: Array<{
        id: string;
        activity: string;
        minutes: number;
        practiced_on: string;
        note: string;
      }>;
    }
  >();
  let nextId = 1;
  let delayedChild = false;
  let releaseDelayed!: () => void;
  const getLearning = (id: string) =>
    store.get(id) ?? { goal: "", weekly_target_minutes: 0, entries: [] };
  const makeWorkspace = (child: typeof childOne, locale: string) => {
    const learning = getLearning(child.id);
    return {
      ...workspace(child, locale),
      learning: {
        plan: learning.goal
          ? {
              goal: learning.goal,
              weekly_target_minutes: learning.weekly_target_minutes,
            }
          : null,
        entries: learning.entries,
        summary: {
          entry_count: learning.entries.length,
          total_minutes: learning.entries.reduce(
            (sum, entry) => sum + entry.minutes,
            0,
          ),
          scope: "latest-100",
        },
      },
    };
  };
  await page.route("**/api/family", async (route) => {
    const request = route.request();
    if (request.method() === "GET")
      return route.fulfill({
        json: { authenticated: true, guardian, children: [childOne, childTwo] },
      });
    const body = request.postDataJSON();
    if (body.action === "logout")
      return route.fulfill({ json: { status: "signed_out" } });
    const child = body.child_id === childOne.id ? childOne : childTwo;
    if (body.action === "learner-workspace") {
      if (delayedChild && child.id === childTwo.id) {
        await new Promise<void>((resolve) => {
          releaseDelayed = resolve;
        });
      }
      return route.fulfill({ json: makeWorkspace(child, body.locale ?? "ar") });
    }
    const current = getLearning(child.id);
    if (body.action === "save-learning-plan") {
      store.set(child.id, {
        ...current,
        goal: body.goal,
        weekly_target_minutes: body.weekly_target_minutes,
      });
    } else if (body.action === "add-practice") {
      current.entries.unshift({
        id: `entry-${nextId++}`,
        activity: body.activity,
        minutes: body.minutes,
        practiced_on: body.practiced_on,
        note: body.note ?? "",
      });
      store.set(child.id, current);
      return route.fulfill({
        status: 503,
        json: { error: "provider_unavailable" },
      });
    } else if (body.action === "delete-practice") {
      store.set(child.id, {
        ...current,
        entries: current.entries.filter((entry) => entry.id !== body.id),
      });
    } else if (body.action === "update-practice") {
      store.set(child.id, {
        ...current,
        entries: current.entries.map((entry) =>
          entry.id === body.id
            ? {
                ...entry,
                activity: body.activity,
                minutes: body.minutes,
                practiced_on: body.practiced_on,
                note: body.note ?? "",
              }
            : entry,
        ),
      });
    } else if (body.action === "delete-learning-plan") {
      store.set(child.id, {
        ...current,
        goal: "",
        weekly_target_minutes: 0,
      });
    }
    return route.fulfill({ json: { status: "saved" } });
  });
  await page.goto("/ar/workspace");
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await page.getByLabel("الهدف").fill("قراءة يومية");
  await page.getByLabel("الدقائق الأسبوعية").fill("30");
  await page.getByRole("button", { name: "حفظ الخطة" }).click();
  await expect(page.getByText("قراءة يومية")).toBeVisible();
  await page.getByLabel("النشاط").fill("قراءة قصة");
  await page.getByLabel("الدقائق", { exact: true }).fill("10");
  await page.getByRole("button", { name: "إضافة التمرين" }).click();
  await expect(
    page.locator("main.learner-app").getByRole("alert"),
  ).toContainText("الخدمة غير متاحة");
  await page.getByRole("button", { name: "إعادة تحميل البيانات" }).click();
  await expect(page.getByText("قراءة قصة")).toBeVisible();
  const practiceEntry = page.locator(".practice-entry").filter({
    hasText: "قراءة قصة",
  });
  await practiceEntry.getByRole("button", { name: "تعديل" }).click();
  await page.getByLabel("النشاط").fill("قراءة قصة معدلة");
  await page.getByLabel("الدقائق", { exact: true }).fill("15");
  await page.getByRole("button", { name: "حفظ التعديل" }).click();
  await expect(page.getByText("قراءة قصة معدلة")).toBeVisible();
  await expect(page.getByText("قراءة قصة", { exact: true })).not.toBeVisible();
  const updatedPractice = page.locator(".practice-entry").filter({
    hasText: "قراءة قصة معدلة",
  });
  await updatedPractice.getByRole("button", { name: "حذف" }).click();
  await expect(page.getByText("قراءة قصة معدلة")).not.toBeVisible();
  await page.reload();
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByText("قراءة يومية")).toBeVisible();
  await expect(page.getByText("قراءة قصة معدلة")).not.toBeVisible();

  await page.getByRole("button", { name: "تعديل" }).first().click();
  await page.getByLabel("الهدف").fill("مسودة لا تحفظ");
  await page.getByLabel("اختر ملف الطفل").selectOption(childTwo.id);
  await expect(page.getByRole("heading", { name: /مساحة آدم/ })).toBeVisible();
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).toBeVisible();
  await page.getByRole("button", { name: "تعديل" }).first().click();
  await expect(page.getByLabel("الهدف")).toHaveValue("قراءة يومية");
  await page.getByLabel("الهدف").fill("قراءة منتظمة");
  await page.getByRole("button", { name: "حفظ الخطة" }).click();
  await expect(page.getByText("قراءة منتظمة", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "حذف الخطة" }).click();
  await expect(page.getByLabel("الهدف")).toHaveValue("");

  delayedChild = true;
  await page.getByLabel("اختر ملف الطفل").selectOption(childTwo.id);
  await expect.poll(() => Boolean(releaseDelayed)).toBe(true);
  await page.getByLabel("اختر ملف الطفل").selectOption(childOne.id);
  await expect(page.getByRole("heading", { name: /مساحة ليان/ })).toBeVisible();
  await expect(page.getByLabel("الهدف")).toHaveValue("");
  releaseDelayed();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/workspace");
  await expect(page.locator("main.learner-app")).toHaveAttribute("dir", "ltr");
  await page.getByLabel("Choose a child profile").selectOption(childOne.id);
  await expect(page.getByText("Letters and words", { exact: true })).toBeVisible();
});

// Stored session fixtures are local HTTP mocks, never hosted family data.
for (const locale of ["ar", "en"] as const) {
  test(`${locale}: stored session summaries are scoped, plain text, and cleared on child switch`, async ({ page }) => {
    await mockFamily(page);
    const note = '<img src=x onerror="window.summaryInjected=true"> Local stored follow-up';
    let release!: () => void;
    let secondRequested = false;
    await page.route("**/api/family/session-summaries?**", async route => {
      const url = new URL(route.request().url());
      expect(route.request().headers()["x-family-registration"]).toBe("local-review");
      expect(url.searchParams.get("offset")).toBe("0");
      const childId = url.searchParams.get("child_id");
      if (childId === childTwo.id) {
        secondRequested = true;
        await new Promise<void>(resolve => { release = resolve; });
        return route.fulfill({ json: { summaries: [], has_more: false } });
      }
      expect(childId).toBe(childOne.id);
      return route.fulfill({ json: { summaries: [{ id: "44444444-4444-4444-8444-444444444444", child_id: childOne.id, subject: "quran", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T10:30:00Z", time_zone: "UTC", status: "scheduled", outcome: "attended_completed", follow_up_note: note }], has_more: false } });
    });
    await page.goto(`/${locale}/workspace`);
    const chooser = page.getByLabel(locale === "ar" ? "اختر ملف الطفل" : "Choose a child profile");
    await chooser.selectOption(childOne.id);
    const summaries = page.locator('section[aria-labelledby="session-summaries-heading"]');
    await expect(summaries).toContainText(locale === "ar" ? "حضر وأكمل" : "Attended — completed");
    await expect(summaries).toContainText(note);
    await expect(summaries.locator("img")).toHaveCount(0);
    await expect(summaries).not.toContainText(/teacher_id|Teacher A/);
    await chooser.selectOption(childTwo.id);
    await expect(summaries).not.toContainText(note);
    await expect.poll(() => secondRequested).toBe(true);
    release();
    await expect(summaries).toContainText(locale === "ar" ? "لا توجد ملخصات جلسات محفوظة" : "No stored session summaries");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
  test(`${locale}: null outcomes stay unrecorded and provider failure is not an empty success`, async ({ page }) => {
    await mockFamily(page);
    let unavailable = false;
    await page.route("**/api/family/session-summaries?**", route => unavailable
      ? route.fulfill({ status: 503, json: { error: "provider_unavailable" } })
      : route.fulfill({ json: { summaries: [{ id: "44444444-4444-4444-8444-444444444444", child_id: childOne.id, subject: "tajweed", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T10:30:00Z", time_zone: "UTC", status: "scheduled", outcome: null, follow_up_note: "" }], has_more: false } }));
    await page.goto(`/${locale}/workspace`);
    const chooser = page.getByLabel(locale === "ar" ? "اختر ملف الطفل" : "Choose a child profile");
    await chooser.selectOption(childOne.id);
    const summaries = page.locator('section[aria-labelledby="session-summaries-heading"]');
    await expect(summaries).toContainText(locale === "ar" ? "لم تُسجل نتيجة" : "No outcome recorded");
    await expect(summaries).not.toContainText(locale === "ar" ? "حضر وأكمل" : "Attended — completed");
    unavailable = true;
    await chooser.selectOption(childTwo.id);
    await expect(summaries).toContainText(locale === "ar" ? "غير متاحة حاليًا" : "unavailable right now");
    await expect(summaries.locator(".learner-summary")).toHaveCount(0);
  });
}
