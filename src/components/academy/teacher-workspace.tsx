"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/content/site";
import { teacherProfilePendingCopy } from "@/lib/academy/teacher-workspace-copy";
import "./teacher-workspace.css";

type Teacher = { id: string; display_name: string; time_zone: string };
type Outcome = "attended_completed" | "attended_incomplete" | "absent";
type Lesson = { id: string; subject: string; starts_at: string; ends_at: string; time_zone: string; status: string; outcome: Outcome | null; follow_up_note: string };
type ReadData = { teacher: Teacher; lessons: Lesson[]; has_more: boolean; offset: number };
type ApiError = { error?: string; lesson?: Lesson };

const PAGE_SIZE = 50;
const labels = {
  authentication_required: ["تسجيل الدخول مطلوب.", "Sign in is required."],
  teacher_profile_required: [teacherProfilePendingCopy.ar, teacherProfilePendingCopy.en],
  teacher_roster_unavailable: ["تعذر تحميل سجل المعلم مؤقتًا. حاول مرة أخرى.", "The teacher roster is temporarily unavailable. Try again."],
  network: ["تعذر الاتصال. حاول مرة أخرى.", "The service could not be reached. Try again."],
  save_failed: ["تعذر حفظ تحديث الجلسة. لم يتم تأكيد الحفظ.", "The session update could not be saved. It was not confirmed."],
  invalid_session_outcome: ["النتيجة أو الملاحظة غير صالحة.", "The outcome or note is invalid."],
  session_not_available: ["هذه الجلسة لم تعد متاحة للتحديث.", "This session is no longer available for update."],
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
  const [activationPending, setActivationPending] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftOutcome, setDraftOutcome] = useState<Outcome | "">("");
  const [draftNote, setDraftNote] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

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

  const resetEditor = useCallback(() => {
    setEditing(null); setDraftOutcome(""); setDraftNote(""); setSaveMessage("");
  }, []);

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    setActivationPending(false);
    try {
      const { response, body } = await request({ method: "GET" }, nextOffset ? `?offset=${nextOffset}` : "");
      if (!response.ok) throw new Error(body.error || "network");
      setData(body as ReadData);
      setOffset(nextOffset);
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "network";
      setData(null); resetEditor();
      setError(messageFor(code)); setActivationPending(code === "teacher_profile_required");
    } finally { setLoading(false); }
  }, [messageFor, request, resetEditor]);

  useEffect(() => { let active = true; queueMicrotask(() => { if (active) void load(0); }); return () => { active = false; }; }, [load]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setLoginError(""); setActivationPending(false);
    try {
      const { response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email: email.trim(), password }) });
      if (!response.ok) throw new Error(body.error || "network");
      setPassword(""); setData(body as ReadData); setOffset(0); setError(""); setActivationPending(false); resetEditor();
    } catch (cause) {
      resetEditor();
      const code = cause instanceof Error ? cause.message : "network";
      if (code === "teacher_profile_required") setEmail("");
      setActivationPending(code === "teacher_profile_required");
      setLoginError(messageFor(code));
    }
    finally { setPassword(""); setBusy(false); }
  };

  const logout = async () => {
    setBusy(true);
    try {
      const { response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
      if (!response.ok) throw new Error(body.error || "network");
      setData(null); setOffset(0); setError(""); setLoginError(""); setActivationPending(false); resetEditor();
    } catch (cause) { resetEditor(); setError(messageFor(cause instanceof Error ? cause.message : "network")); }
    finally { setBusy(false); }
  };

  const beginEdit = (lesson: Lesson) => {
    if (lesson.status === "cancelled") return;
    setEditing(lesson.id); setDraftOutcome(lesson.outcome ?? ""); setDraftNote(lesson.follow_up_note ?? ""); setSaveMessage(""); setError("");
  };

  const validateDraft = () => {
    const hasNote = draftNote.length > 0;
    if ((!draftOutcome && hasNote) || (hasNote && !/\S/u.test(draftNote)) || [...draftNote].some(character => { const code = character.codePointAt(0) ?? 0; return code < 32 || (code >= 127 && code <= 159); })) return "invalid_session_outcome";
    return "";
  };

  const saveLesson = async (event: FormEvent, lesson: Lesson) => {
    event.preventDefault();
    const validationError = validateDraft();
    if (validationError) { setError(messageFor(validationError)); return; }
    setBusy(true); setSaveMessage(""); setError("");
    try {
      const { response, body } = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update-session", id: lesson.id, outcome: draftOutcome || null, follow_up_note: draftNote }) });
      if (!response.ok) { if (response.status === 401 || response.status === 403) { setData(null); resetEditor(); } throw new Error(body.error || "save_failed"); }
      if (!body.lesson || body.lesson.id !== lesson.id) throw new Error("session_not_available");
      setData(current => current ? { ...current, lessons: current.lessons.map(item => item.id === body.lesson!.id ? body.lesson! : item) } : current);
      setEditing(null); setDraftOutcome(""); setDraftNote(""); setSaveMessage(en ? "Session update saved." : "تم حفظ تحديث الجلسة.");
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "save_failed";
      setError(messageFor(code)); setActivationPending(code === "teacher_profile_required");
    }
    finally { setBusy(false); }
  };

  const changePage = async (next: number) => {
    setBusy(true);
    try {
      const { response, body } = await request({ method: "GET" }, next ? `?offset=${next}` : "");
      if (!response.ok) throw new Error(body.error || "network");
      setData(body as ReadData); setOffset(next); setError(""); setActivationPending(false); resetEditor();
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "network";
      setData(null); resetEditor(); setError(messageFor(code)); setActivationPending(code === "teacher_profile_required");
    }
    finally { setBusy(false); }
  };

  const formatDate = (value: string, zone: string) => new Intl.DateTimeFormat(en ? "en-US" : "ar-EG", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: zone }).format(new Date(value));
  const formatTime = (value: string, zone: string) => new Intl.DateTimeFormat(en ? "en-US" : "ar-EG", { hour: "numeric", minute: "2-digit", timeZone: zone }).format(new Date(value));
  const subject = (value: string) => ({ quran: t("القرآن الكريم", "Quran"), nur_al_bayan: t("نور البيان", "Nur Al-Bayan"), tajweed: t("التجويد", "Tajweed") }[value] ?? value);
  const status = (value: string) => value === "cancelled" ? t("ملغاة", "Cancelled") : t("مجدولة", "Scheduled");
  const outcome = (value: Outcome | null) => value === "attended_completed" ? t("حضر وأكمل", "Attended — completed") : value === "attended_incomplete" ? t("حضر ولم يكمل", "Attended — incomplete") : value === "absent" ? t("غائب", "Absent") : t("غير مسجلة", "Unrecorded");
  const title = data ? t("مساحة المعلم", "Teacher workspace") : activationPending ? t("تفعيل الوصول إلى مساحة المعلم", "Teacher workspace access pending") : t("دخول المعلم", "Teacher sign in");
  const pageLabel = useMemo(() => offset / PAGE_SIZE + 1, [offset]);

  return <main className="teacher-workspace" dir={en ? "ltr" : "rtl"}>
    <div className="teacher-workspace-shell">
      <header className="teacher-workspace-header">
        <div><p className="teacher-workspace-kicker">{t("مساحة المعلم · وصول حقيقي", "TEACHER WORKSPACE · REAL ACCESS")}</p><h1>{title}</h1>{data && <p>{t(`مرحبًا ${data.teacher.display_name}`, `Welcome, ${data.teacher.display_name}`)}</p>}</div>
        <nav aria-label={t("روابط المساحة", "Workspace links")}><Link href={`/${other}/teacher`}>{en ? "العربية" : "English"}</Link>{data && <button className="text-button" type="button" onClick={() => void logout()} disabled={busy}>{t("تسجيل الخروج", "Sign out")}</button>}</nav>
      </header>

      {loading && <p className="workspace-status" role="status">{t("جارٍ تحميل المساحة…", "Loading workspace…")}</p>}
      {!loading && !data && activationPending && <section className="teacher-auth card activation-pending" aria-labelledby="teacher-activation-title">
        <p className="section-kicker">01 / {t("حالة الوصول", "ACCESS STATUS")}</p>
        <h2 id="teacher-activation-title">{t("يلزم تفعيل الوصول إلى مساحة المعلم", "Teacher workspace access needs activation")}</h2>
        <p className="activation-message" role="status">{messageFor("teacher_profile_required")}</p>
        <button className="secondary-button" type="button" onClick={() => { setError(""); setLoginError(""); setActivationPending(false); }}>{t("العودة إلى تسجيل الدخول", "Return to sign in")}</button>
      </section>}

      {!loading && !data && !activationPending && <section className="teacher-auth card" aria-labelledby="teacher-login-title">
        <p className="section-kicker">01 / {t("دخول آمن", "SECURE SIGN IN")}</p><h2 id="teacher-login-title">{t("سجّل الدخول بحساب المعلم المعتمد", "Sign in with an approved teacher account")}</h2><p className="muted">{t("هذه المساحة للمعلمين البالغين المعيّنين فقط. لا يوجد تسجيل جديد أو إعادة تعيين أو دعوة.", "For existing approved adult teachers only. There is no sign-up, reset, or invite flow.")}</p>
        {error && <p className="alert" role="alert">{error}</p>}{loginError && <p className="alert" role="alert">{loginError}</p>}
        <form onSubmit={submitLogin}><label>{t("البريد الإلكتروني", "Email")}<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label><label>{t("كلمة المرور", "Password")}<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button className="primary-button" type="submit" disabled={busy}>{busy ? t("جارٍ التحقق…", "Checking…") : t("تسجيل الدخول", "Sign in")}</button></form>
      </section>}

      {!loading && data && <>
        <section className="teacher-summary card"><div><p className="section-kicker">01 / {t("المعلّم المعيّن", "ASSIGNED TEACHER")}</p><h2>{data.teacher.display_name}</h2><p className="muted">{data.teacher.time_zone}</p></div><div className="read-only-note">{t("يمكن تحديث النتيجة والملاحظة فقط", "Outcome and note only")}</div></section>
        <section className="lessons card" aria-labelledby="lessons-title"><div className="section-heading"><div><p className="section-kicker">02 / {t("الجدول", "SCHEDULE")}</p><h2 id="lessons-title">{t("الجلسات الفردية المعيّنة", "Assigned individual sessions")}</h2></div></div>
          {error && <p className="alert" role="alert">{error}</p>}{saveMessage && <p className="confirmation" role="status">{saveMessage}</p>}
          {data.lessons.length === 0 ? <p className="empty-state">{t("لا توجد جلسات فردية معيّنة حاليًا.", "No assigned individual sessions at this time.")}</p> : <div className="lesson-list">{data.lessons.map(lesson => <article className="lesson-row" key={lesson.id}><div><strong>{subject(lesson.subject)}</strong><span>{formatDate(lesson.starts_at, lesson.time_zone)}</span></div><div><strong>{formatTime(lesson.starts_at, lesson.time_zone)} – {formatTime(lesson.ends_at, lesson.time_zone)}</strong><span>{lesson.time_zone}</span></div><span className={`status status-${lesson.status}`}>{status(lesson.status)}</span><div className="stored-session" aria-label={t("البيانات المسجلة", "Stored session details")}><span>{t("النتيجة", "Outcome")}: {outcome(lesson.outcome)}</span><span>{t("ملاحظة المتابعة", "Follow-up note")}: {lesson.follow_up_note ? lesson.follow_up_note : t("غير مسجلة", "Unrecorded")}</span></div>{lesson.status === "cancelled" ? <p className="read-only-session">{t("الجلسة الملغاة للقراءة فقط.", "Cancelled sessions are read-only.")}</p> : editing === lesson.id ? <form className="lesson-editor" onSubmit={event => void saveLesson(event, lesson)}><label>{t("النتيجة", "Outcome")}<select disabled={busy} value={draftOutcome} onChange={event => setDraftOutcome(event.target.value as Outcome | "")}><option value="">{t("بدون نتيجة", "No outcome")}</option><option value="attended_completed">{t("حضر وأكمل", "Attended — completed")}</option><option value="attended_incomplete">{t("حضر ولم يكمل", "Attended — incomplete")}</option><option value="absent">{t("غائب", "Absent")}</option></select></label><label>{t("ملاحظة متابعة مرئية لولي الأمر", "Follow-up note visible to the guardian")}<textarea disabled={busy} maxLength={1000} value={draftNote} onChange={event => setDraftNote([...event.target.value].slice(0, 500).join(""))} rows={4} /></label><small>{[...draftNote].length}/500</small><div className="lesson-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? t("جارٍ الحفظ…", "Saving…") : t("حفظ", "Save")}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => setEditing(null)}>{t("إلغاء", "Cancel")}</button></div></form> : <button className="secondary-button edit-session" type="button" disabled={busy} onClick={() => beginEdit(lesson)}>{t("تحديث الجلسة", "Update session")}</button>}</article>)}</div>}
          <div className="pagination"><button type="button" className="secondary-button" disabled={busy || offset === 0} onClick={() => void changePage(Math.max(0, offset - PAGE_SIZE))}>{t("السابق", "Previous")}</button><span aria-live="polite">{t(`صفحة ${pageLabel}`, `Page ${pageLabel}`)}</span><button type="button" className="secondary-button" disabled={busy || !data.has_more} onClick={() => void changePage(offset + PAGE_SIZE)}>{t("التالي", "Next")}</button></div>
        </section>
      </>}
      <footer>{t("تظهر هنا الجلسات المعيّنة لهذا الحساب فقط. يمكن تحديث النتيجة وملاحظة المتابعة المرئية لولي الأمر فقط.", "Only sessions assigned to this account appear here. Teachers can update only the outcome and guardian-visible follow-up note.")}</footer>
    </div>
  </main>;
}
