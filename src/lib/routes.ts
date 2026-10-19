import { locales, pageKeys, type Locale, type PageKey } from "@/content/site";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
export function isPageKey(value: string): value is PageKey {
  return (pageKeys as readonly string[]).includes(value);
}
export function route(locale: Locale, page?: PageKey) {
  return `/${locale}${page ? `/${page}` : ""}`;
}
