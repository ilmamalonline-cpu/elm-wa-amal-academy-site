"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  cloneTeacherDemoSeed,
  sessionsForTeacher,
  updateTeacherDemoSession,
  type Attendance,
  type Completion,
  type TeacherDemoSeed,
  type TeacherDemoSession,
} from "@/lib/academy/teacher-demo";
import "./teacher-demo.css";

type Props = { locale: "ar" | "en" };
type Filter = "all" | Attendance | "completed";
type Draft = Pick<TeacherDemoSession, "attendance" | "completion" | "outcome" | "followup">;

const seededArabicText: Record<string, string> = {
  "Reviewed the learner's submitted work.": "راجعنا العمل الذي قدّمه الطالب.",
  "Bring one question to the next session.": "إحضار سؤال واحد إلى الجلسة القادمة.",
  "Reschedule requested in this fictional preview.": "طُلبت إعادة الجدولة في هذه المعاينة الخيالية.",
};

const emptyDraft = (session: TeacherDemoSession, locale: Props["locale"]): Draft => ({
  attendance: session.attendance,
  completion: session.completion,
  outcome: locale === "ar" ? (seededArabicText[session.outcome] ?? session.outcome) : session.outcome,
  followup: locale === "ar" ? (seededArabicText[session.followup] ?? session.followup) : session.followup,
});

export function TeacherDemo({ locale }: Props) {
  const en = locale === "en";
  const other = en ? "ar" : "en";
  const t = (ar: string, english: string) => (en ? english : ar);
  const [data, setData] = useState<TeacherDemoSeed>(() => cloneTeacherDemoSeed());
  const [teacherId, setTeacherId] = useState("teacher-01");
  const [filter, setFilter] = useState<Filter>("all");
  const [editorId, setEditorId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);

  const teacher = data.teachers.find((item) => item.id === teacherId) ?? data.teachers[0];
  const visibleSessions = useMemo(() => {
    const teacherSessions = sessionsForTeacher(data, teacher.id);
    return teacherSessions.filter((session) => filter === "all" || session.attendance === filter || (filter === "completed" && session.completion === "completed"));
  }, [data, filter, teacher.id]);

  const reset = () => {
    setData(cloneTeacherDemoSeed()); setTeacherId("teacher-01"); setFilter("all"); setEditorId(null); setDrafts({}); setError(""); setNotice(t("تمت استعادة بيانات المعاينة والحقول والمرشحات.", "Preview data, drafts, filters, and errors were reset."));
  };
  const selectTeacher = (id: string) => { setTeacherId(id); setEditorId(null); setError(""); setNotice(""); };
  const teacherLabel = (item: TeacherDemoSeed["teachers"][number]) => en ? item.label : `المعلم ${String(item.number).padStart(2, "0")}`;
  const studentLabel = (session: TeacherDemoSession) => en ? session.studentLabel : `الطالب ${session.studentLabel.match(/\d+$/)?.[0] ?? "01"}`;
  const openEditor = (session: TeacherDemoSession) => { setEditorId(session.id); setError(""); setNotice(""); setDrafts((current) => current[session.id] ? current : { ...current, [session.id]: emptyDraft(session, locale) }); };
  const draftFor = (session: TeacherDemoSession) => drafts[session.id] ?? emptyDraft(session, locale);
  useEffect(() => { if (editorId) editorHeadingRef.current?.focus(); }, [editorId]);
  const updateDraft = (id: string, field: keyof Draft, value: string) => { setDrafts((current) => ({ ...current, [id]: { ...draftFor(data.sessions.find((item) => item.id === id)!), [field]: value } as Draft })); setError(""); };
  const save = (session: TeacherDemoSession) => {
    const draft = draftFor(session);
    const outcome = draft.outcome.trim(); const followup = draft.followup.trim();
    if (outcome.length > 240 || followup.length > 240) { setError(t("استخدم 240 حرفًا أو أقل لكل حقل.", "Use 240 characters or fewer for each field.")); return; }
    if (draft.completion === "completed" && (draft.attendance !== "attended" || !outcome || !followup)) { setError(t("لا يمكن إكمال الجلسة إلا بعد تسجيل الحضور والنتيجة وخطوة المتابعة.", "A completed session requires attended status, an outcome, and a follow-up.")); return; }
    setData((current) => updateTeacherDemoSession(current, session.id, { ...draft, outcome, followup })); setDrafts((current) => { const next = { ...current }; delete next[session.id]; return next; }); setEditorId(null); setNotice(t("تم حفظ نتيجة الجلسة في هذه المعاينة فقط.", "Session outcome saved in this preview only.")); setError("");
  };

  const statusLabel = (status: Attendance | Completion) => ({ scheduled: t("مجدولة", "Scheduled"), attended: t("حضر", "Attended"), missed: t("لم يحضر", "Missed"), "not-started": t("لم تبدأ", "Not started"), "in-progress": t("قيد المتابعة", "In progress"), completed: t("مكتملة", "Completed") }[status]);
  const dateLabel = (value: string) => new Intl.DateTimeFormat(en ? "en-US" : "ar", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));

  return <main className="teacher-demo" dir={en ? "ltr" : "rtl"}>
    <div className="teacher-demo-shell">
      <header className="teacher-demo-header">
        <div><p className="teacher-demo-eyebrow">{t("مساحة المعلم · معاينة اصطناعية", "TEACHER WORKSPACE · SYNTHETIC PREVIEW")}</p><h1>{t("لوحة دروس فردية", "1-to-1 lesson workspace")}</h1><p>{t("إدارة الجداول والنتائج للمعلمين المرقمين فقط.", "Manage assigned schedules and outcomes for numbered teachers only.")}</p></div>
        <nav aria-label={t("روابط المعاينة", "Preview links")}><a href={`/${locale}/workspace`}>{t("مساحة ولي الأمر", "Family workspace")}</a><a href={`/${other}/teacher-demo`}>{t("تغيير اللغة", "Change language")}</a></nav>
      </header>

      <section className="teacher-demo-banner" aria-label={t("تنبيه البيانات", "Data notice")}><strong>{t("معاينة اصطناعية فقط", "Synthetic preview only")}</strong><span>{t("كل المعلمين والطلاب والجلسات وهميون. لا توجد هويات حقيقية أو مواد تعليمية أو روابط Zoom أو تسجيلات أو مدفوعات.", "Every teacher, student, and session is fictional. No real identities, instructional content, Zoom links, recordings, or payments are used.")}</span><span>{t("يستخدم المعلمون موادهم الخاصة، وتتم اجتماعات Zoom بشكل منفصل؛ لا يوجد تكامل مع الاجتماعات.", "Teachers use their own materials, and Zoom meetings happen separately; there is no integrated meeting.")}</span><span>{t("جدول خيالي · توقيت القاهرة (Africa/Cairo)", "Fictional schedule · Cairo time (Africa/Cairo)")}</span><button className="text-button" type="button" onClick={reset}>{t("إعادة الضبط", "Reset preview")}</button></section>

      <section className="teacher-demo-card teacher-picker" aria-labelledby="teacher-picker-title"><div><p className="section-kicker">01 / {t("اختيار", "SELECT")}</p><h2 id="teacher-picker-title">{t("المعلم المعيّن", "Assigned teacher")}</h2><p className="muted">{t("التبديل يعرض الجلسات المعيّنة لهذا المعلم فقط.", "Switching shows only this teacher's assigned sessions.")}</p></div><div className="teacher-options">{data.teachers.map((item) => <button key={item.id} type="button" className={`teacher-option ${item.id === teacher.id ? "selected" : ""}`} aria-pressed={item.id === teacher.id} onClick={() => selectTeacher(item.id)}><span className="teacher-number">{String(item.number).padStart(2, "0")}</span><span><strong>{teacherLabel(item)}</strong><small>{t("ملف اصطناعي", "Fictional profile")}</small></span></button>)}</div></section>

      <section className="teacher-demo-overview"><div><p className="section-kicker">02 / {t("جدول", "SCHEDULE")}</p><h2>{teacherLabel(teacher)}</h2><p className="muted">{t("جلسات فردية معيّنة", "Assigned 1-to-1 sessions")}</p></div><div className="stat-row"><div><strong>{sessionsForTeacher(data, teacher.id).length}</strong><span>{t("الجلسات", "Sessions")}</span></div><div><strong>{sessionsForTeacher(data, teacher.id).filter((s) => s.attendance === "attended").length}</strong><span>{t("حضر", "Attended")}</span></div><div><strong>{sessionsForTeacher(data, teacher.id).filter((s) => s.completion === "completed").length}</strong><span>{t("مكتملة", "Completed")}</span></div></div></section>

      <section className="teacher-demo-card" aria-labelledby="session-title"><div className="section-heading"><div><p className="section-kicker">03 / {t("جلسات", "SESSIONS")}</p><h2 id="session-title">{t("الجدول المعيّن", "Assigned schedule")}</h2></div><label className="filter-label">{t("تصفية", "Filter")}<select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label={t("تصفية الجلسات", "Filter sessions")}><option value="all">{t("كل الجلسات", "All sessions")}</option><option value="scheduled">{t("مجدولة", "Scheduled")}</option><option value="attended">{t("حضر", "Attended")}</option><option value="missed">{t("لم يحضر", "Missed")}</option><option value="completed">{t("مكتملة", "Completed")}</option></select></label></div>
        {visibleSessions.length === 0 ? <p className="empty-state">{t("لا توجد جلسات لهذا المرشح.", "No sessions match this filter.")}</p> : <div className="session-list">{visibleSessions.map((session) => <article className="session-row" key={session.id}><div className="session-date"><strong>{dateLabel(session.date)}</strong><span>{session.time} · {session.duration} {t("دقيقة", "min")}</span></div><div className="session-student"><strong>{studentLabel(session)}</strong><span>{t("طالب وهمي", "Fictional student")}</span></div><div className="session-status"><span className={`status status-${session.attendance}`}>{statusLabel(session.attendance)}</span><span className={`status status-${session.completion}`}>{statusLabel(session.completion)}</span></div><button className="primary-button" type="button" onClick={() => openEditor(session)}>{t("فتح الجلسة", "Open session")}</button></article>)}</div>}
      </section>

      {editorId && (() => { const session = data.sessions.find((item) => item.id === editorId); if (!session) return null; const draft = draftFor(session); return <section className="teacher-demo-card editor" aria-labelledby="editor-title"><div className="section-heading"><div><p className="section-kicker">04 / {t("توثيق", "DOCUMENT")}</p><h2 id="editor-title" ref={editorHeadingRef} tabIndex={-1}>{t("نتيجة الجلسة", "Session outcome")}</h2><p className="muted">{studentLabel(session)} · {dateLabel(session.date)} · {session.time}</p></div><span className="editor-note">{t("تعديلات غير محفوظة", "Unsaved changes")}</span></div><div className="editor-grid"><label>{t("الحضور", "Attendance")}<select value={draft.attendance} onChange={(e) => updateDraft(session.id, "attendance", e.target.value)}><option value="scheduled">{t("مجدولة", "Scheduled")}</option><option value="attended">{t("حضر", "Attended")}</option><option value="missed">{t("لم يحضر", "Missed")}</option></select></label><label>{t("حالة الإكمال", "Completion status")}<select value={draft.completion} onChange={(e) => updateDraft(session.id, "completion", e.target.value)}><option value="not-started">{t("لم تبدأ", "Not started")}</option><option value="in-progress">{t("قيد المتابعة", "In progress")}</option><option value="completed">{t("مكتملة", "Completed")}</option></select></label><label className="wide">{t("النتيجة", "Outcome")}<textarea aria-label={t("النتيجة", "Outcome")} maxLength={240} value={draft.outcome} onChange={(e) => updateDraft(session.id, "outcome", e.target.value)} placeholder={t("اكتب ملخصًا اصطناعيًا موجزًا", "Write a brief fictional summary")} /><small>{draft.outcome.length}/240</small></label><label className="wide">{t("خطوة المتابعة", "Follow-up")}<textarea aria-label={t("خطوة المتابعة", "Follow-up")} maxLength={240} value={draft.followup} onChange={(e) => updateDraft(session.id, "followup", e.target.value)} placeholder={t("ما الخطوة التالية؟", "What is the next step?")} /><small>{draft.followup.length}/240</small></label></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="primary-button" type="button" onClick={() => save(session)}>{t("حفظ النتيجة", "Save outcome")}</button><button className="secondary-button" type="button" onClick={() => { setDrafts((current) => { const next = { ...current }; if (editorId) delete next[editorId]; return next; }); setEditorId(null); setError(""); }}>{t("إلغاء التعديلات", "Cancel changes")}</button></div></section>; })()}
      {notice && <p className="teacher-demo-notice" role="status">{notice}</p>}
      <footer className="teacher-demo-footer">{t("إعادة التحميل أو زر إعادة الضبط يعيدان بيانات البداية. التعديلات مؤقتة في ذاكرة هذه الصفحة فقط. تغيير اللغة يبدأ تجربة جديدة.", "Reload or Reset preview restores the seed data. Changes exist only in this page’s memory. Changing language starts a fresh demo.")}</footer>
    </div>
  </main>;
}
