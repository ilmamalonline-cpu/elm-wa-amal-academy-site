import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/routes";
import { teacherDemoEnabled } from "@/lib/academy/teacher-demo-access";
import { TeacherDemo } from "@/components/academy/teacher-demo";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    robots: { index: false, follow: false },
    title: locale === "en" ? "Synthetic teacher demo | Elm wa Amal" : "تجربة المعلّم الاصطناعية | علم وعمل",
  };
}
export default async function TeacherDemoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const incoming = await headers();
  if (!isLocale(locale) || !teacherDemoEnabled(process.env, incoming.get("host"))) notFound();
  return <TeacherDemo locale={locale} />;
}
