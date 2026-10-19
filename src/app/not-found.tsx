import Link from "next/link";
import { headers } from "next/headers";
import { site } from "@/content/site";

export default async function NotFound() {
  const locale = (await headers()).get("x-site-locale") === "en" ? "en" : "ar";
  const t = site[locale];
  return (
    <main className="container state-page">
      <p className="eyebrow">404</p>
      <h1>{t.notFound.title}</h1>
      <p>{t.notFound.description}</p>
      <Link className="button" href={`/${locale}`}>
        {t.home}
      </Link>
    </main>
  );
}
