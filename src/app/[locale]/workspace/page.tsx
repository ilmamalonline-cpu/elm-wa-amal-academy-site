import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/lib/routes";
import { AcademyWorkspace } from "@/components/academy/workspace";
import "./academy.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title:
      locale === "en"
        ? "Academy workspace | Elm wa Amal"
        : "مساحة الأكاديمية | علم وعمل",
  };
}
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // Vercel production never enables the role-switching sandbox automatically.
  // Local opt-in exists solely to verify the exact browser adapter before review.
  const browserPreview = process.env.VERCEL_ENV === "preview" ||
    (!process.env.VERCEL && process.env.ACADEMY_PREVIEW === "browser-synthetic-only");
  return <AcademyWorkspace locale={locale} browserPreview={browserPreview} />;
}
