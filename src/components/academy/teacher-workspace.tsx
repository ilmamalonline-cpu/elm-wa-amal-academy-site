"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/content/site";
import "./teacher-workspace.css";

type Teacher = { id: string; display_name: string; time_zone: string };
type Lesson = { id: string; subject: string; starts_at: string; ends_at: string; time_zone: string; status: string };
type ReadData = { teacher: Teacher; lessons: Lesson[]; has_more: boolean; offset: number };
type ApiError = { error?: string };

const PAGE_SIZE = 50;
const labels = {
  authentication_required: ["تسجيل الدخول مطلوب.", "Sign in is required."],
  teacher_profile_required: ["يجب تعيين صلاحية المعلم لهذا الحساب. حسابات أولياء الأمور والحسابات غير المعيّنة لا تملك وصول المعلم.", "Teacher access must be assigned to this account. Guardian and unassigned accounts cannot use the teacher workspace."],
  teacher_roster_unavailable: ["تعذر تحميل سجل المعلم مؤقتًا. حاول مرة أخرى.", "The teacher roster is temporarily unavailable. Try again."],
  network: ["تعذر الاتصال. حاول مرة أخرى.", "The service could not be reached. Try again."],
};

export function TeacherWorkspace({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const other = en ? "ar" : "en";
  const t = (ar: string, english: string) => (en ? english : ar);
  const [data, setData] = useState<ReadData | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const request = useCallback(async (init: RequestInit = {}, query = "") => {
    const response = await fetch(`/api/teacher${query}`, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-Teacher-Workspace": "real-preview", ...(init.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    return { response, body: body as ReadData & ApiError };
  }, []);

  const messageFor = useCallback((code: string) => {
    const pair = labels[code as keyof typeof labels] ?? labels.network;
    return en ? pair[1] : pair[0];
  }, [en]);

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    try {
      const { response, body } = await request({ method: "GET" }, nextOffset ? `?offset=${nextOffset}` : "");
      if (!response.ok) throw new Error(body.error || "network");
      setData(body as ReadData);
      setOffset(nextOffset);
    } catch (cause) {
      setData(null);
      setError(messageFor(cause instanceof Error ? cause.message : "network"));
    } finally { setLoading(false); }
  }, [messageFor, request]);

  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(0); }); return () => { active = false; }; }, [load]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setLoginError("");
    try {
      const { response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email: email.trim(), password }) });
      if (!response.ok) throw new Error(body.error || "network");
      setPassword(""); setData(body as ReadData); setOffset(0); setError("");
    } catch (cause) { setLoginError(messageFor(cause instanceof Error ? cause.message : "network")); }
    finally { setPassword(""); setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try {
      const { response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error(body.error || "network");
      setData(null); setOffset(0); setError(""); setLoginError("");
    } catch (cause) { setError(messageFor(cause instanceof Error ? cause.message : "network")); }
    finally { setBusy(false); }
  };

  const changePage = async (next: number) => {
    setBusy(true);
    try {
      const { response, body } = await request({ method: "GET" }, next ? `?offset=${next}` : "");
      if (!response.ok) throw new Error(body.error || "network");
      setData(body as ReadData); setOffset(next); setError("");
    } catch (cause) { setData(null); setError(messageFor(cause instanceof Error ? cause.message : "network")); }
    finally { setBusy(false); }
  };

  const formatDate = (value: string, zone: string) => new Intl.DateTimeFormat(en ? "en-US" : "ar-EG", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: zone }).format(new Date(value));
  const formatTime = (value: string, zone: string) => new Intl.DateTimeFormat(en ? "en-US" : "ar-EG", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(value));
  const subject = (value: string) => ({ quran: t("القرآن الكريم", "Quran"), nur_al_bayan: t("نور البيان", "Nur Al-Bayan"), tajweed: t("التجويد", "Tajweed") }[value] ?? value);
  const status = (value: string) => value === "cancelled" ? t("ملغاة", "Cancelled") : t("مجدولة", "Scheduled");
  const title = data ? t("مساحة المعلم", "Teacher workspace") : t("دخول المعلم", "Teacher sign in");
  const pageLabel = useMemo(() => offset / PAGE_SIZE + 1, [offset]);

  return <main className="teacher-workspace" dir={en ? "ltr" : "rtl"}>
    <div className="teacher-workspace-shell">
      <header className="teacher-workspace-header">
        <div><p className="teacher-workspace-kicker">{t("مساحة المعلم · وصول حقيقي", "TEACHER WORKSPACE · REAL ACCESS")}</p><h1>{title}</h1>{data && <p>{t(`مرحبًا ${data.teacher.display_name}`, `Welcome, ${data.teacher.display_name}`)}</p>}</div>
        <nav aria-label={t("روابط المساحة", "Workspace links")}><Link href={`/${other}/teacher`}>{en ? "العربية" : "English"}</Link>{data && <button className="text-button" type="button" onClick={() => void logout()} disabled={busy}>{t("تسجيل الخروج", "Sign out")}</button>}</nav>
      </header>

      {loading && <p className="workspace-status" role="status">{t("جارٍ تحميل المساحة…", "Loading workspace…")}</p>}
      {!loading && !data && <section className="teacher-auth card" aria-labelledby="teacher-login-title">
        <p className="section-kicker">01 / {t("دخول آمن", "SECURE SIGN IN")}</p><h2 id="teacher-login-title">{t("سجّل الدخول بحساب المعلم المعتمد", "Sign in with an approved teacher account")}</h2><p className="muted">{t("هذه المساحة للمعلمين البالغين المعيّنين فقط. لا يوجد تسجيل جديد أو إعادة تعيين أو دعوة.", "For existing approved adult teachers only. There is no sign-up, reset, or invite flow.")}</p>
        {error && <p className="alert" role="alert">{error}</p>}{loginError && <p className="alert" role="alert">{loginError}</p>}
        <form onSubmit={submitLogin}><label>{t("البريد الإلكتروني", "Email")}<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>{t("كلمة المرور", "Password")}<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="primary-button" type="submit" disabled={busy}>{busy ? t("جارٍ التحقق…", "Checking…") : t("تسجيل الدخول", "Sign in")}</button></form>
      </section>}

      {!loading && data && <>
        <section className="teacher-summary card"><div><p className="section-kicker">01 / {t("المعلّم المعيّن", "ASSIGNED TEACHER")}</p><h2>{data.teacher.display_name}</h2><p className="muted">{data.teacher.time_zone}</p></div><div className="read-only-note">{t("قراءة فقط", "Read only")}</div></section>
        <section className="lessons card" aria-labelledby="lessons-title"><div className="section-heading"><div><p className="section-kicker">02 / {t("الجدول", "SCHEDULE")}</p><h2 id="lessons-title">{t("الجلسات الفردية المعيّنة", "Assigned individual sessions")}</h2></div></div>
          {error && <p className="alert" role="alert">{error}</p>}
          {data.lessons.length === 0 ? <p className="empty-state">{t("لا توجد جلسات فردية معيّنة حاليًا.", "No assigned individual sessions at this time.")}</p> : <div className="lesson-list">{data.lessons.map(lesson => <article className="lesson-row" key={lesson.id}><div><strong>{subject(lesson.subject)}</strong><span>{formatDate(lesson.starts_at, lesson.time_zone)}</span></div><div><strong>{formatTime(lesson.starts_at, lesson.time_zone)} – {formatTime(lesson.ends_at, lesson.time_zone)}</strong><span>{lesson.time_zone}</span></div><span className={`status status-${lesson.status}`}>{status(lesson.status)}</span></article>)}</div>}
          <div className="pagination"><button type="button" className="secondary-button" disabled={busy || offset === 0} onClick={() => void changePage(Math.max(0, offset - PAGE_SIZE))}>{t("السابق", "Previous")}</button><span aria-live="polite">{t(`صفحة ${pageLabel}`, `Page ${pageLabel}`)}</span><button type="button" className="secondary-button" disabled={busy || !data.has_more} onClick={() => void changePage(offset + PAGE_SIZE)}>{t("التالي", "Next")}</button></div>
        </section>
      </>}
      <footer>{t("تظهر هنا الجلسات المعيّنة لهذا الحساب فقط. لا تُعرض بيانات الأطفال أو أدوات تسجيل الحضور والنتائج.", "Only sessions assigned to this account appear here. Child details and attendance or outcome controls are not shown.")}</footer>
    </div>
  </main>;
}
