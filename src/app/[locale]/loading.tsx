"use client";
import { useParams } from "next/navigation";
import { site } from "@/content/site";
export default function Loading() {
  const params = useParams();
  const locale = params.locale === "en" ? "en" : "ar";
  return (
    <div className="loading-state" role="status" aria-live="polite">
      {site[locale].loading}
    </div>
  );
}
