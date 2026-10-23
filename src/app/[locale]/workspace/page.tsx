import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/routes";
import { AcademyWorkspace } from "@/components/academy/workspace";
import { LearnerWorkspace } from "@/components/academy/learner-workspace";
import { familyEnabled, familySecurity } from "@/lib/academy/family-registration";
import { teacherDemoEnabled } from "@/lib/academy/teacher-demo-access";
import "./academy.css";
import "./teacher-demo-entry.css";

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
  // Preserve the explicitly synthetic sandbox outside the owner-family gate.
  // This fallback has no connection to authenticated family profiles.
  const browserPreview = process.env.VERCEL_ENV === "preview" ||
    (!process.env.VERCEL && process.env.ACADEMY_PREVIEW === "browser-synthetic-only");
  return <>
    {teacherDemoEnabled(process.env, incoming.get("host")) && <aside className="teacher-demo-entry">
      <a href={`/${locale}/teacher-demo`}>
        {locale === "ar" ? "جرّب مساحة المعلّم — بيانات اصطناعية فقط" : "Try the teacher workspace — synthetic data only"}
      </a>
      <span>{locale === "ar" ? "تجربة منفصلة؛ لا تستخدم حساب الأسرة أو بياناتها." : "Separate demo; does not use family accounts or records."}</span>
    </aside>}
    {enabled ? <LearnerWorkspace locale={locale} /> : <AcademyWorkspace locale={locale} browserPreview={browserPreview} />}
  </>;
}
