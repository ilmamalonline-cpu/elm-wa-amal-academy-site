"use client";
import { useParams } from "next/navigation";
import { site } from "@/content/site";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const locale = params.locale === "en" ? "en" : "ar";
  const t = site[locale];
  return (
    <main className="container state-page">
      <h1>{t.error.title}</h1>
      <p role="alert">{t.error.description}</p>
      <button type="button" className="button" onClick={reset}>
        {t.error.retry}
      </button>
    </main>
  );
}
