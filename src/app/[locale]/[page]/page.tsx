import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { site } from "@/content/site";
import { isLocale, isPageKey } from "@/lib/routes";
import { SiteShell } from "@/components/site-shell";
import { PublicPage } from "@/components/public-content";

type Props = { params: Promise<{ locale: string; page: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  if (!isLocale(locale) || !isPageKey(page)) return {};
  return { title: `${site[locale].nav[page]} | ${site[locale].brand}` };
}
export default async function Page({ params }: Props) {
  const { locale, page } = await params;
  if (!isLocale(locale) || !isPageKey(page)) notFound();
  return (
    <SiteShell locale={locale} page={page}>
      <PublicPage locale={locale} page={page} />
    </SiteShell>
  );
}
