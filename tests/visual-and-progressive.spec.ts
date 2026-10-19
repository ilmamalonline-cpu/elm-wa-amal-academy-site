import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { site, locales } from '../src/content/site';

for (const locale of locales) {
  test(`${locale}: server-rendered pages and locale link work without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:3000/${locale}/packages`);
    await expect(page.locator('[data-package]')).toHaveCount(3);
    await page.getByRole('link', { name: site[locale].language, exact: true }).click();
    const other = locale === 'ar' ? 'en' : 'ar';
    await expect(page.locator('html')).toHaveAttribute('lang', other);
    await expect(page.locator('h1')).toHaveText(site[other].nav.packages);
    await context.close();
  });

  for (const key of ['home', 'packages'] as const) {
    test(`${locale} ${key}: capture visual review evidence`, async ({ page }, testInfo) => {
      await page.goto(`/${locale}${key === 'home' ? '' : '/packages'}`);
      await expect(page.locator('h1')).toBeVisible();
      await mkdir('docs/previews', { recursive: true });
      await page.screenshot({ path: `docs/previews/${testInfo.project.name}-${locale}-${key}.png`, fullPage: true });
    });
  }
}
