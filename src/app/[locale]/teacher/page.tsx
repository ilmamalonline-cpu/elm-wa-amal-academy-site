import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { TeacherWorkspace } from "@/components/academy/teacher-workspace";
import { enabled } from "@/lib/academy/teacher-foundation";
import { teacherWorkspaceHost } from "@/lib/academy/teacher-workspace";
import { isLocale } from "@/lib/routes";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return {
    robots: { index: false, follow: false },
    title: locale === "ar" ? "مساحة المعلم | علم وعمل" : "Teacher workspace | Elm wa Amal",
  };
}

export default async function TeacherPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const requestHeaders = await headers();
  if (!isLocale(locale) || !enabled(process.env) || !teacherWorkspaceHost(requestHeaders.get("host"))) notFound();
  return <TeacherWorkspace locale={locale} />;
}
