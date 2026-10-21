import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/routes";
import { AcademyWorkspace } from "@/components/academy/workspace";
import { LearnerWorkspace } from "@/components/academy/learner-workspace";
import { familyEnabled, familySecurity } from "@/lib/academy/family-registration";
import "./academy.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    robots: { index: false, follow: false },
    title: locale === "en" ? "Academy workspace | Elm wa Amal" : "مساحة الأكاديمية | علم وعمل",
  };
}

export default async function WorkspacePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const incoming = await headers();
  let enabled = false;
  if (familyEnabled() && incoming.get("host")) {
    try {
      const host = incoming.get("host") as string;
      const requestHeaders = new Headers(incoming);
      requestHeaders.set("host", host);
      if (process.env.VERCEL === "1" && process.env.VERCEL_ENV === "preview") {
        requestHeaders.set("x-forwarded-proto", "https");
        familySecurity(new Request(`https://${host}/api/family`, { headers: requestHeaders }));
      } else familySecurity(new Request(`http://${host}/`, { headers: requestHeaders }));
      enabled = true;
    } catch { enabled = false; }
  }
  if (enabled) return <LearnerWorkspace locale={locale} />;
  // Preserve the explicitly synthetic sandbox outside the owner-family gate.
  // This fallback has no connection to authenticated family profiles.
  const browserPreview = process.env.VERCEL_ENV === "preview" ||
    (!process.env.VERCEL && process.env.ACADEMY_PREVIEW === "browser-synthetic-only");
  return <AcademyWorkspace locale={locale} browserPreview={browserPreview} />;
}
