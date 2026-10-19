import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { site, locales, pageKeys } from "../src/content/site";

for (const locale of locales) {
  const t = site[locale];
  for (const key of ["home", ...pageKeys] as const) {
    const path = `/${locale}${key === "home" ? "" : `/${key}`}`;
    test(`${locale} ${key}: route, semantics, safe links, responsive layout and axe`, async ({
      page,
    }) => {
      const errors: string[] = [];
      const externalRequests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        if (new URL(route.request().url()).hostname !== "127.0.0.1") {
          externalRequests.push(route.request().url());
          await route.abort();
        } else await route.continue();
      });
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator("html")).toHaveAttribute(
        "dir",
        locale === "ar" ? "rtl" : "ltr",
      );
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("header")).toBeVisible();
      await expect(page.locator("footer")).toBeVisible();
      expect(await page.title()).toContain(t.brand);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const links = await page
        .locator("a")
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute("href")),
        );
      expect(links.length).toBeGreaterThan(5);
      for (const href of links) {
        if (
          key === "contact" &&
          (/^tel:\+?[0-9]+$/.test(href ?? "") || href === "https://wa.link/lhspfv")
        ) continue;
        expect(href).toMatch(/^(\/(ar|en)(\/|$)|#main-content$)/);
      }
      await expect(page.locator("form,input,textarea,select")).toHaveCount(0);
      if (key !== "contact") {
        await expect(page.locator("body")).not.toContainText(/01[0125][0-9]{8}/);
        await expect(page.locator("body")).not.toContainText("wa.link");
      }
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(result.violations).toEqual([]);
      expect(errors).toEqual([]);
      expect(externalRequests).toEqual([]);
    });
  }

  test(`${locale}: exact package contract`, async ({ page }) => {
    await page.goto(`/${locale}/packages`);
    const cards = page.locator("[data-package]");
    await expect(cards).toHaveCount(3);
    for (const [index, pack] of t.packages.entries()) {
      const card = cards.nth(index);
      await expect(card).toContainText(String(pack.price));
      await expect(card).toContainText(t.currency);
      await expect(card).toContainText(`8 ${t.lessons}`);
      await expect(card).toContainText(`${pack.duration} ${t.minutes}`);
      for (const feature of pack.features)
        await expect(card).toContainText(feature);
      const text = await card.innerText();
      if (index === 0)
        expect(text).not.toMatch(/نور البيان|Noor Al-Bayan|التجويد|Tajweed/);
      if (index === 2) {
        expect(text).toContain(t.upTo);
        expect(text).not.toMatch(/معاني|meanings/);
      }
    }
  });

  test(`${locale}: language switch preserves page and changes whole document`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/packages`);
    await page.getByRole("link", { name: t.language, exact: true }).click();
    const other = locale === "ar" ? "en" : "ar";
    await expect(page).toHaveURL(`/${other}/packages`);
    await expect(page.locator("html")).toHaveAttribute("lang", other);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      other === "ar" ? "rtl" : "ltr",
    );
    await expect(page.locator("h1")).toHaveText(site[other].nav.packages);
  });

  test(`${locale}: keyboard skip link and FAQ work without a mouse`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/faq`);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: t.skip })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
    const summary = page.locator(".faq-list summary").first();
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".faq-list details").first()).toHaveAttribute(
      "open",
      "",
    );
    await expect(
      page.locator(".faq-list details").first().locator("p"),
    ).toBeVisible();
  });

  test(`${locale}: external contact remains gated and policy draft visible`, async ({
    page,
  }) => {
    await page.goto(`/${locale}/contact`);
    await expect(
      page.getByText(t.contact.status, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(t.contact.notice, { exact: true }),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/01[0125][0-9]{8}/);
    await expect(page.locator('a[href^="tel:"],a[href*="wa.link"]')).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("link", { name: t.demoLink, exact: true })).toBeVisible();
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(page.locator("button,form,input[type=file]")).toHaveCount(0);
    await page.goto(`/${locale}/terms`);
    await expect(page.getByText(t.terms.intro, { exact: true })).toBeVisible();
    await page.goto(`/${locale}/privacy`);
    await expect(
      page.getByText(t.privacy.intro, { exact: true }),
    ).toBeVisible();
  });

  test(`${locale}: compact and tablet widths, mobile navigation and reduced motion`, async ({
    page,
  }) => {
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/packages`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.locator(".mobile-nav summary").click();
      await expect(page.locator(".mobile-nav nav")).toBeVisible();
      await page
        .locator(".mobile-nav")
        .getByRole("link", { name: t.nav.faq, exact: true })
        .click();
      await expect(page.locator("h1")).toHaveText(t.nav.faq);
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    ).toBe("auto");
  });

  test(`${locale}: unknown or future account route is a real not-found page`, async ({
    page,
  }) => {
    for (const suffix of ["not-a-page", "login", "register"]) {
      const response = await page.goto(`/${locale}/${suffix}`);
      expect(response?.status()).toBe(404);
      await expect(page.locator("h1")).toHaveText(t.notFound.title);
      await expect(
        page.getByRole("link", { name: t.home, exact: true }),
      ).toHaveAttribute("href", `/${locale}`);
    }
  });

  test(`${locale}: preview HTTP headers`, async ({ request }) => {
    const response = await request.get(`/${locale}`);
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response.headers()["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });
}

test("root defaults to Arabic; unsupported locale is not accepted", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL("/ar");
  const response = await page.goto("/fr");
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1")).toHaveText(site.ar.notFound.title);
});

test("dictionary keeps package values and translations in sync", () => {
  expect(
    site.ar.packages.map((pack) => [
      pack.id,
      pack.price,
      pack.duration,
      pack.upTo,
    ]),
  ).toEqual(
    site.en.packages.map((pack) => [
      pack.id,
      pack.price,
      pack.duration,
      pack.upTo,
    ]),
  );
  expect(site.ar.packages.map((pack) => pack.price)).toEqual([360, 500, 650]);
  expect(site.ar.packages.map((pack) => pack.duration)).toEqual([60, 60, 90]);
  expect(site.ar.faqs.length).toBe(site.en.faqs.length);
  expect(site.ar.terms.sections.length).toBe(site.en.terms.sections.length);
});
