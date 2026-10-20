import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { FamilyRegistration } from "@/components/academy/family-registration";
import { familyEnabled, familySecurity } from "@/lib/academy/family-registration";
import { isLocale } from "@/lib/routes";
import "./family.css";

type Props = { params: Promise<{ locale: string }> };

export const metadata: Metadata = {
  title: "Family registration | تسجيل الأسرة",
  robots: { index: false, follow: false },
};

export default async function FamilyPage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const incoming = await headers();
  let enabled = false;
  if (familyEnabled() && incoming.get("host")) {
    try {
      const host = incoming.get("host") as string;
      const requestHeaders = new Headers(incoming);
      requestHeaders.set("host", host);
      familySecurity(new Request(`http://${host}/`, { headers: requestHeaders }));
      enabled = true;
    } catch { enabled = false; }
  }
  if (!enabled) {
    return (
      <main className="family-page family-disabled" dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className="family-shell">
          <p className="family-kicker">{locale === "ar" ? "مساحة الأسرة" : "FAMILY SPACE"}</p>
          <h1>{locale === "ar" ? "تسجيل الأسرة غير متاح" : "Family registration is unavailable"}</h1>
          <p>{locale === "ar" ? "هذه الواجهة معطلة افتراضيًا ومتاحة فقط في مراجعة محلية على جهاز loopback." : "This interface is disabled by default and available only for a local loopback review."}</p>
        </div>
      </main>
    );
  }
  return <FamilyRegistration locale={locale} />;
}
