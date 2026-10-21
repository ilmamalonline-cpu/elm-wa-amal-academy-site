"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/content/site";
import "./learner-workspace.css";

type Child = { id: string; display_name: string; birth_year: number };
type Guardian = { id: string; display_name: string; locale: Locale };
type Family = { authenticated?: boolean; guardian: Guardian | null; children: Child[] };
type Lesson = { id: string; title: string; description: string };
type Workspace = {
  child: { id: string; display_name: string };
  locale: Locale;
  contentMode: "synthetic-only";
  lessons: Lesson[];
  progress: null;
  reports: unknown[];
  teacher: null;
  nextLesson: null;
  meetingUrl: null;
  payments: unknown[];
};

const messages: Record<string, [string, string]> = {
  network: ["تعذر الاتصال. حاول مرة أخرى.", "The service could not be reached. Try again."],
  sign_in_required: ["انتهت الجلسة. سجّل الدخول من جديد.", "Your session expired. Sign in again."],
  not_allowed: ["لا يملك هذا الحساب صلاحية الوصول إلى هذا الملف.", "This account cannot access that profile."],
  not_found: ["لم يعد ملف الطفل متاحًا. اختر ملفًا آخر.", "That child profile is no longer available. Choose another."],
  provider_unavailable: ["الخدمة غير متاحة مؤقتًا. حاول لاحقًا.", "The service is temporarily unavailable. Try later."],
};

export function LearnerWorkspace({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const t = (ar: string, english: string) => (en ? english : ar);
  const [family, setFamily] = useState<Family | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loggedOut, setLoggedOut] = useState(false);
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const loggingOut = useRef(false);

  const textFor = useCallback((code: string) => messages[code]?.[en ? 1 : 0] ?? (en ? "The request could not be completed. Try again." : "لم يكتمل الطلب. حاول مرة أخرى."), [en]);
  const request = useCallback(async (init: RequestInit = {}) => {
    const response = await fetch("/api/family", {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "X-Family-Registration": "local-review", ...(init.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }, []);

  const clearPrivate = useCallback(() => {
    controller.current?.abort();
    setWorkspace(null);
    setSelectedId("");
    setBusy(false);
  }, []);

  const loadFamily = useCallback(async (signal?: AbortSignal) => {
    const { response, data } = await request({ signal });
    if (!response.ok) throw new Error(data.error || (response.status === 401 ? "sign_in_required" : "network"));
    return data as Family;
  }, [request]);

  const refresh = useCallback(async () => {
    if (loggingOut.current) return;
    const current = ++requestSequence.current;
    clearPrivate();
    setLoading(true);
    setError("");
    try {
      const data = await loadFamily();
      if (current !== requestSequence.current) return;
      setFamily(data);
      setLoggedOut(!data.authenticated || !data.guardian);
    } catch (cause) {
      if (current !== requestSequence.current) return;
      setFamily(null); setLoggedOut(true); setError(textFor(cause instanceof Error ? cause.message : "network"));
    } finally { if (current === requestSequence.current) setLoading(false); }
  }, [clearPrivate, loadFamily, textFor]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const sequenceAtMount = requestSequence.current;
    return () => {
      window.clearTimeout(timer);
      requestSequence.current = sequenceAtMount + 1;
      controller.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => { if (!loggingOut.current) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const selectChild = async (id: string) => {
    const sequence = ++requestSequence.current;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setSelectedId(id); setWorkspace(null); setError("");
    if (!id) return;
    setBusy(true);
    try {
      const { response, data } = await request({
        method: "POST", signal: nextController.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "learner-workspace", child_id: id, locale }),
      });
      if (!response.ok) throw new Error(data.error || (response.status === 401 ? "sign_in_required" : "network"));
      if (sequence !== requestSequence.current) return;
      setWorkspace(data as Workspace);
    } catch (cause) {
      if (nextController.signal.aborted || sequence !== requestSequence.current) return;
      clearPrivate();
      const code = cause instanceof Error ? cause.message : "network";
      if (["sign_in_required", "not_allowed", "not_found"].includes(code)) { setFamily(null); setLoggedOut(true); }
      setError(textFor(code));
    } finally { if (sequence === requestSequence.current) setBusy(false); }
  };

  const logout = async () => {
    loggingOut.current = true;
    ++requestSequence.current; controller.current?.abort(); clearPrivate();
    setFamily({ authenticated: false, guardian: null, children: [] }); setLoggedOut(true); setError(""); setBusy(true);
    try {
      const { response, data } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error(data.error || "network");
      setFamily({ authenticated: false, guardian: null, children: [] }); setLoggedOut(true);
    } catch (cause) { setError(textFor(cause instanceof Error ? cause.message : "network")); }
    finally { setBusy(false); loggingOut.current = false; }
  };

  const otherLocale = en ? "ar" : "en";
  if (loading) return <main className="learner-app" dir={en ? "ltr" : "rtl"}><div className="learner-shell"><p role="status">{t("جارٍ تحميل مساحة المتعلم…", "Loading learner workspace…")}</p></div></main>;
  if (loggedOut || !family?.guardian) return <main className="learner-app" dir={en ? "ltr" : "rtl"}><div className="learner-shell"><header className="learner-header"><div><p className="learner-kicker">{t("مساحة المتعلم", "LEARNER WORKSPACE")}</p><h1>{t("سجّل الدخول للوصول إلى مساحة طفلك", "Sign in to access your child’s workspace")}</h1></div><nav><Link href={`/${locale}/family`}>{t("مساحة الأسرة", "Family space")}</Link><Link href={`/${otherLocale}/workspace`}>{en ? "العربية" : "English"}</Link></nav></header>{error && <p className="learner-alert" role="alert">{error}</p>}<p>{t("يُدير ولي الأمر ملفات الأطفال؛ الأطفال لا يسجلون الدخول.", "Guardians manage child profiles; children do not sign in.")}</p><button className="learner-button" type="button" onClick={() => void refresh()}>{t("إعادة المحاولة", "Retry")}</button></div></main>;

  const child = family.children.find((item) => item.id === selectedId);
  return <main className="learner-app" dir={en ? "ltr" : "rtl"}>
    <div className="learner-shell">
      <header className="learner-header"><div><p className="learner-kicker">{t("مساحة المتعلم", "LEARNER WORKSPACE")}</p><h1>{t(`مرحبًا ${family.guardian.display_name}`, `Welcome ${family.guardian.display_name}`)}</h1><p>{t("محتوى اصطناعي للمراجعة فقط، مرتبط بملف الطفل الذي تختاره.", "Synthetic review content only, scoped to the child you choose.")}</p></div><nav><Link href={`/${locale}/family`}>{t("مساحة الأسرة", "Family space")}</Link><Link href={`/${otherLocale}/workspace`}>{en ? "العربية" : "English"}</Link><button className="learner-link-button" type="button" onClick={() => void logout()} disabled={busy}>{t("تسجيل الخروج", "Log out")}</button></nav></header>
      {error && <div className="learner-alert" role="alert">{error}<button type="button" onClick={() => void refresh()}>{t("إعادة المحاولة", "Retry")}</button></div>}
      <section className="learner-card learner-picker"><label htmlFor="learner-child">{t("اختر ملف الطفل", "Choose a child profile")}</label><select id="learner-child" value={selectedId} onChange={(event) => void selectChild(event.target.value)} disabled={busy}><option value="">{t("اختر طفلًا…", "Choose a child…")}</option>{family.children.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select>{family.children.length === 0 && <p className="learner-muted">{t("لا توجد ملفات أطفال مرتبطة بهذا الحساب.", "No child profiles are linked to this account.")}</p>}</section>
      {busy && <p role="status" className="learner-muted">{t("جارٍ التحقق من الملف…", "Verifying this profile…")}</p>}
      {workspace && child && <section className="learner-content" aria-live="polite"><div className="learner-hero"><p className="learner-kicker">{t("ملف متحقق من ملكية ولي الأمر", "GUARDIAN-VERIFIED PROFILE")}</p><h2>{t(`مساحة ${workspace.child.display_name}`, `${workspace.child.display_name}’s workspace`)}</h2><p>{t("هذه دروس اصطناعية فقط ولا تمثل تقدمًا حقيقيًا.", "These are synthetic lessons only and do not represent real progress.")}</p></div><div className="learner-lessons"><h2>{t("الدروس", "Lessons")}</h2>{workspace.lessons.map((lesson) => <article className="learner-card learner-lesson" key={lesson.id}><h3>{lesson.title}</h3><p>{lesson.description}</p><span>{t("لم تُسجّل إكمالات", "No completion recorded")}</span></article>)}</div><aside className="learner-notice"><strong>{t("بيانات غير متاحة في هذه المراجعة", "Not available in this review")}</strong><p>{t("لا يوجد تقدم حقيقي أو تقارير أو معلم أو رابط Zoom أو مدفوعات. لا تُحفظ تغييرات الدرس أو التقدم.", "There is no real progress, reports, teacher, Zoom link, or payment data. Lesson and progress changes are not persisted.")}</p></aside></section>}
      <footer><Link href={`/${locale}/family`}>{t("إدارة ملفات الأطفال في مساحة الأسرة", "Manage child profiles in Family space")}</Link></footer>
    </div>
  </main>;
}
