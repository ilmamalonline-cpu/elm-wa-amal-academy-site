"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/content/site";
import type { LearningData } from "@/lib/academy/learning";
import "./learner-workspace.css";

type Child = { id: string; display_name: string; birth_year: number };
type Guardian = { id: string; display_name: string; locale: Locale };
type Family = {
  authenticated?: boolean;
  guardian: Guardian | null;
  children: Child[];
};
type Lesson = { id: string; title: string; description: string };
type SessionSummary = { id: string; child_id: string; subject: string; starts_at: string; ends_at: string; time_zone: string; status: string; outcome: "attended_completed" | "attended_incomplete" | "absent" | null; follow_up_note: string };
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
  learning?: LearningData;
};
type PracticeDraft = {
  activity: string;
  minutes: string;
  practiced_on: string;
  note: string;
};
const blankPractice: PracticeDraft = {
  activity: "",
  minutes: "",
  practiced_on: new Date().toISOString().slice(0, 10),
  note: "",
};
const messages: Record<string, [string, string]> = {
  network: [
    "تعذر الاتصال. حاول مرة أخرى.",
    "The service could not be reached. Try again.",
  ],
  sign_in_required: [
    "انتهت الجلسة. سجّل الدخول من جديد.",
    "Your session expired. Sign in again.",
  ],
  not_allowed: [
    "لا يملك هذا الحساب صلاحية الوصول إلى هذا الملف.",
    "This account cannot access that profile.",
  ],
  not_found: [
    "لم يعد ملف الطفل متاحًا. اختر ملفًا آخر.",
    "That child profile is no longer available. Choose another.",
  ],
  provider_unavailable: [
    "الخدمة غير متاحة مؤقتًا. حاول لاحقًا.",
    "The service is temporarily unavailable. Try later.",
  ],
};

export function LearnerWorkspace({ locale }: { locale: Locale }) {
  const en = locale === "en";
  const t = (ar: string, english: string) => (en ? english : ar);
  const [family, setFamily] = useState<Family | null>(null),
    [workspace, setWorkspace] = useState<Workspace | null>(null),
    [selectedId, setSelectedId] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [loggedOut, setLoggedOut] = useState(false);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]), [summaryState, setSummaryState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle"), [summaryHasMore, setSummaryHasMore] = useState(false);
  const [goal, setGoal] = useState(""),
    [weekly, setWeekly] = useState(""),
    [planEditing, setPlanEditing] = useState(false),
    [practice, setPractice] = useState<PracticeDraft>(blankPractice),
    [editingId, setEditingId] = useState<string | null>(null);
  const requestSequence = useRef(0),
    controller = useRef<AbortController | null>(null),
    loggingOut = useRef(false);
  const textFor = useCallback(
    (code: string) =>
      messages[code]?.[en ? 1 : 0] ??
      (en
        ? "The request could not be completed. Try again."
        : "لم يكتمل الطلب. حاول مرة أخرى."),
    [en],
  );
  const request = useCallback(async (init: RequestInit = {}) => {
    const response = await fetch("/api/family", {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "X-Family-Registration": "local-review",
        ...(init.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }, []);
  const resetForms = useCallback(() => {
    setGoal("");
    setWeekly("");
    setPlanEditing(false);
    setPractice({ ...blankPractice });
    setEditingId(null);
    setActionError("");
  }, []);
  const clearPrivate = useCallback(() => {
    controller.current?.abort();
    setWorkspace(null);
    setSummaries([]);
    setSummaryState("idle");
    setSelectedId("");
    setBusy(false);
    resetForms();
  }, [resetForms]);
  const loadFamily = useCallback(
    async (signal?: AbortSignal) => {
      const { response, data } = await request({ signal });
      if (!response.ok)
        throw new Error(
          data.error ||
            (response.status === 401 ? "sign_in_required" : "network"),
        );
      return data as Family;
    },
    [request],
  );
  const refresh = useCallback(async () => {
    if (loggingOut.current) return;
    const current = ++requestSequence.current;
    clearPrivate();
    const next = new AbortController();
    controller.current = next;
    setLoading(true);
    setError("");
    try {
      const data = await loadFamily(next.signal);
      if (current !== requestSequence.current || next.signal.aborted) return;
      setFamily(data);
      setLoggedOut(!data.authenticated || !data.guardian);
    } catch (cause) {
      if (next.signal.aborted || current !== requestSequence.current) return;
      setFamily(null);
      setLoggedOut(true);
      setError(textFor(cause instanceof Error ? cause.message : "network"));
    } finally {
      if (current === requestSequence.current) setLoading(false);
    }
  }, [clearPrivate, loadFamily, textFor]);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const mounted = requestSequence.current;
    return () => {
      window.clearTimeout(timer);
      requestSequence.current = mounted + 1;
      controller.current?.abort();
    };
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => {
      if (!loggingOut.current) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);
  const selectChild = async (id: string) => {
    const sequence = ++requestSequence.current;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setSelectedId(id);
    setWorkspace(null);
    setSummaries([]);
    setSummaryState("idle");
    setSummaryHasMore(false);
    resetForms();
    setError("");
    if (!id) {
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const { response, data } = await request({
        method: "POST",
        signal: next.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "learner-workspace",
          child_id: id,
          locale,
        }),
      });
      if (!response.ok)
        throw new Error(
          data.error ||
            (response.status === 401 ? "sign_in_required" : "network"),
        );
      if (sequence === requestSequence.current) {
        setWorkspace(data as Workspace);
        const learning = (data as Workspace).learning;
        setGoal(learning?.plan?.goal || "");
        setWeekly(learning?.plan ? String(learning.plan.weekly_target_minutes) : "");
        setSummaryState("loading");
        try {
          const summaryResponse = await fetch(`/api/family/session-summaries?child_id=${encodeURIComponent(id)}&offset=0`, { cache: "no-store", credentials: "same-origin", signal: next.signal, headers: { "X-Family-Registration": "local-review" } });
          const summaryData = await summaryResponse.json().catch(() => ({}));
          if (!summaryResponse.ok) throw new Error(summaryData.error || "unavailable");
          if (sequence === requestSequence.current) { setSummaries(Array.isArray(summaryData.summaries) ? summaryData.summaries : []); setSummaryHasMore(summaryData.has_more === true); setSummaryState("ready"); }
        } catch {
          if (next.signal.aborted) return;
          if (sequence === requestSequence.current) { setSummaries([]); setSummaryState("unavailable"); }
        }
      }
    } catch (cause) {
      if (next.signal.aborted || sequence !== requestSequence.current) return;
      setWorkspace(null);
      const code = cause instanceof Error ? cause.message : "network";
      if (["sign_in_required", "not_allowed", "not_found"].includes(code)) {
        setFamily(null);
        setLoggedOut(true);
      }
      setError(textFor(code));
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  };
  const refetchSelected = async () => {
    const id = selectedId;
    if (!id) return;
    await selectChild(id);
  };
  const mutate = async (action: string, payload: Record<string, unknown>) => {
    const childId = selectedId;
    if (!childId || busy) return;
    const sequence = ++requestSequence.current;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setBusy(true);
    setActionError("");
    try {
      const { response, data } = await request({
        method: "POST",
        signal: next.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, child_id: childId, ...payload }),
      });
      if (sequence !== requestSequence.current || next.signal.aborted) return;
      if (!response.ok || data.status !== "saved") {
        throw new Error(
          data.error ||
            (response.status === 401
              ? "sign_in_required"
              : response.status === 403
                ? "not_allowed"
                : response.status === 404
                  ? "not_found"
                  : "network"),
        );
      }
      resetForms();
      await selectChild(childId);
    } catch (cause) {
      if (next.signal.aborted || sequence !== requestSequence.current) return;
      const code = cause instanceof Error ? cause.message : "network";
      if (["sign_in_required", "not_allowed", "not_found"].includes(code)) {
        clearPrivate();
        setFamily(null);
        setLoggedOut(true);
        setError(textFor(code));
      } else {
        // A failed write may have reached the server. Retry only reloads its stored state.
        setActionError(textFor(code));
      }
    } finally {
      if (sequence === requestSequence.current) setBusy(false);
    }
  };
  const savePlan = (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = Number(weekly);
    if (!goal.trim() || !Number.isInteger(minutes) || minutes < 1 || minutes > 840) {
      setActionError(
        t(
          "أدخل هدفًا ووقتًا أسبوعيًا صحيحًا.",
          "Enter a goal and a valid weekly target.",
        ),
      );
      return;
    }
    void mutate("save-learning-plan", {
      goal: goal.trim(),
      weekly_target_minutes: minutes,
    });
  };
  const savePractice = (event: React.FormEvent) => {
    event.preventDefault();
    const minutes = Number(practice.minutes);
    if (
      !practice.activity.trim() ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      !practice.practiced_on
    ) {
      setActionError(
        t(
          "أكمل النشاط والدقائق والتاريخ.",
          "Complete the activity, minutes, and date.",
        ),
      );
      return;
    }
    void mutate(editingId ? "update-practice" : "add-practice", {
      ...(editingId ? { id: editingId } : {}),
      activity: practice.activity.trim(),
      minutes,
      practiced_on: practice.practiced_on,
      note: practice.note.trim(),
    });
  };
  const logout = async () => {
    loggingOut.current = true;
    ++requestSequence.current;
    controller.current?.abort();
    clearPrivate();
    setFamily({ authenticated: false, guardian: null, children: [] });
    setLoggedOut(true);
    setError("");
    setBusy(true);
    try {
      const { response, data } = await request({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!response.ok) throw new Error(data.error || "network");
    } catch (cause) {
      setError(textFor(cause instanceof Error ? cause.message : "network"));
    } finally {
      setBusy(false);
      loggingOut.current = false;
    }
  };
  const otherLocale = en ? "ar" : "en";
  if (loading)
    return (
      <main className="learner-app" dir={en ? "ltr" : "rtl"}>
        <div className="learner-shell">
          <p role="status">
            {t("جارٍ تحميل مساحة المتعلم…", "Loading learner workspace…")}
          </p>
        </div>
      </main>
    );
  if (loggedOut || !family?.guardian)
    return (
      <main className="learner-app" dir={en ? "ltr" : "rtl"}>
        <div className="learner-shell">
          <header className="learner-header">
            <div>
              <p className="learner-kicker">
                {t("مساحة المتعلم", "LEARNER WORKSPACE")}
              </p>
              <h1>
                {t(
                  "سجّل الدخول للوصول إلى مساحة طفلك",
                  "Sign in to access your child’s workspace",
                )}
              </h1>
            </div>
            <nav>
              <Link href={`/${locale}/family`}>
                {t("مساحة الأسرة", "Family space")}
              </Link>
              <Link href={`/${otherLocale}/workspace`}>
                {en ? "العربية" : "English"}
              </Link>
            </nav>
          </header>
          {error && (
            <p className="learner-alert" role="alert">
              {error}
            </p>
          )}
          <p>
            {t(
              "يُدير ولي الأمر ملفات الأطفال؛ الأطفال لا يسجلون الدخول.",
              "Guardians manage child profiles; children do not sign in.",
            )}
          </p>
          <button
            className="learner-button"
            type="button"
            onClick={() => void refresh()}
          >
            {t("إعادة المحاولة", "Retry")}
          </button>
        </div>
      </main>
    );
  const child = family.children.find((item) => item.id === selectedId),
    learning = workspace?.learning ?? {
      plan: null,
      entries: [],
      summary: {
        entry_count: 0,
        total_minutes: 0,
        scope: "latest-100" as const,
      },
    };
  return (
    <main className="learner-app" dir={en ? "ltr" : "rtl"}>
      <div className="learner-shell">
        <header className="learner-header">
          <div>
            <p className="learner-kicker">
              {t("مساحة المتعلم", "LEARNER WORKSPACE")}
            </p>
            <h1>
              {t(
                `مرحبًا ${family.guardian.display_name}`,
                `Welcome ${family.guardian.display_name}`,
              )}
            </h1>
            <p>
              {t(
                "خطة وتمارين منزلية يحفظها ولي الأمر لملف الطفل المختار في مشروع الاختبار.",
                "Guardian-saved home plans and practice for the selected child in the test project.",
              )}
            </p>
          </div>
          <nav>
            <Link href={`/${locale}/family`}>
              {t("مساحة الأسرة", "Family space")}
            </Link>
            <Link href={`/${otherLocale}/workspace`}>
              {en ? "العربية" : "English"}
            </Link>
            <button
              className="learner-link-button"
              type="button"
              onClick={() => void logout()}
            >
              {t("تسجيل الخروج", "Log out")}
            </button>
          </nav>
        </header>
        {error && (
          <div className="learner-alert" role="alert">
            {error}
            <button type="button" onClick={() => void refresh()}>
              {t("إعادة المحاولة", "Retry")}
            </button>
          </div>
        )}
        <section className="learner-card learner-picker">
          <label htmlFor="learner-child">
            {t("اختر ملف الطفل", "Choose a child profile")}
          </label>
          <select
            id="learner-child"
            value={selectedId}
            onChange={(event) => void selectChild(event.target.value)}
          >
            <option value="">{t("اختر طفلًا…", "Choose a child…")}</option>
            {family.children.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
          {family.children.length === 0 && (
            <p className="learner-muted">
              {t(
                "لا توجد ملفات أطفال مرتبطة بهذا الحساب.",
                "No child profiles are linked to this account.",
              )}
            </p>
          )}
        </section>
        {busy && (
          <p role="status" className="learner-muted">
            {t("جارٍ الحفظ أو التحقق…", "Saving or verifying…")}
          </p>
        )}
        {workspace && child && (
          <section className="learner-content" aria-live="polite">
            <div className="learner-hero">
              <p className="learner-kicker">
                {t("ملف متحقق من ملكية ولي الأمر", "GUARDIAN-VERIFIED PROFILE")}
              </p>
              <h2>
                {t(
                  `مساحة ${workspace.child.display_name}`,
                  `${workspace.child.display_name}’s workspace`,
                )}
              </h2>
              <p>
                {t(
                  "أمثلة الدروس اصطناعية وغير مخصصة. ملخص الممارسة مبني فقط على ما يسجله ولي الأمر، وليس تقييمًا من معلم.",
                  "Lesson examples are synthetic and unassigned. Practice summaries use only guardian-entered records, not teacher assessments.",
                )}
              </p>
            </div>
            <section className="learner-card" aria-labelledby="session-summaries-heading">
              <h2 id="session-summaries-heading">{t("ملخص الجلسات الفردية", "Individual session summaries")}</h2>
              {summaryState === "loading" && <p className="learner-muted" role="status">{t("جارٍ تحميل الملخصات المحفوظة…", "Loading stored summaries…")}</p>}
              {summaryState === "unavailable" && <p className="learner-muted" role="status">{t("ملخصات الجلسات غير متاحة حاليًا.", "Session summaries are unavailable right now.")}</p>}
              {summaryState === "ready" && summaries.length === 0 && <p className="learner-muted">{t("لا توجد ملخصات جلسات محفوظة لهذا الطفل.", "No stored session summaries for this child.")}</p>}
              {summaryState === "ready" && summaries.length > 0 && <div className="learner-summary-list">{summaries.map((summary) => <article className="learner-summary" key={summary.id}><h3>{summary.subject === "quran" ? t("القرآن", "Quran") : summary.subject === "nur_al_bayan" ? t("نور البيان", "Nur Al-Bayan") : t("التجويد", "Tajweed")}</h3><p>{new Date(summary.starts_at).toLocaleString(en ? "en" : "ar", { dateStyle: "medium", timeStyle: "short", timeZone: summary.time_zone })}</p><p><strong>{t("الحالة: ", "Schedule: ")}</strong>{summary.status === "cancelled" ? t("ملغاة", "Cancelled") : t("مجدولة", "Scheduled")}</p><p><strong>{t("النتيجة: ", "Outcome: ")}</strong>{summary.outcome === "attended_completed" ? t("حضر وأكمل", "Attended — completed") : summary.outcome === "attended_incomplete" ? t("حضر ولم يكمل", "Attended — incomplete") : summary.outcome === "absent" ? t("غائب", "Absent") : t("لم تُسجل نتيجة", "No outcome recorded")}</p>{summary.follow_up_note && <p><strong>{t("ملاحظة المتابعة: ", "Follow-up note: ")}</strong>{summary.follow_up_note}</p>}</article>)}</div>}
              {summaryState === "ready" && summaryHasMore && <p className="learner-muted">{t("تُعرض أحدث 50 ملخصًا فقط.", "Showing the first 50 summaries only.")}</p>}
            </section>
            <div className="learner-lessons">
              <h2>{t("أمثلة الدروس", "Example lessons")}</h2>
              {workspace.lessons.map((lesson) => (
                <article
                  className="learner-card learner-lesson"
                  key={lesson.id}
                >
                  <h3>{lesson.title}</h3>
                  <p>{lesson.description}</p>
                  <span>
                    {t("مثال اصطناعي غير مخصص", "Unassigned synthetic example")}
                  </span>
                </article>
              ))}
            </div>
            <section className="learner-card learning-panel">
              <h2>{t("خطة التعلم المنزلية", "Home learning plan")}</h2>
              <p className="learner-muted">
                {t(
                  "خطة يكتبها ولي الأمر للتمرين المنزلي فقط.",
                  "Guardian-authored plan for home practice only.",
                )}
              </p>
              {learning.plan && !planEditing ? (
                <div className="plan-summary">
                  <strong>{learning.plan.goal}</strong>
                  <span>
                    {learning.plan.weekly_target_minutes}{" "}
                    {t("دقيقة أسبوعيًا", "minutes per week")}
                  </span>
                  <div className="form-actions">
                    <button
                      className="learner-button secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setGoal(learning.plan?.goal || "");
                        setWeekly(String(learning.plan?.weekly_target_minutes || ""));
                        setPlanEditing(true);
                      }}
                    >
                      {t("تعديل", "Edit")}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busy}
                      onClick={() => void mutate("delete-learning-plan", {})}
                    >
                      {t("حذف الخطة", "Delete plan")}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={savePlan} className="learning-form">
                  <label htmlFor="learning-goal">{t("الهدف", "Goal")}</label>
                  <input
                    id="learning-goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    maxLength={500}
                    disabled={busy}
                  />
                  <label htmlFor="weekly-minutes">
                    {t("الدقائق الأسبوعية", "Weekly target minutes")}
                  </label>
                  <input
                    id="weekly-minutes"
                    type="number"
                    min="1"
                    max="840"
                    value={weekly}
                    onChange={(e) => setWeekly(e.target.value)}
                    disabled={busy}
                  />
                  <div className="form-actions">
                    <button
                      className="learner-button"
                      type="submit"
                      disabled={busy}
                    >
                      {t("حفظ الخطة", "Save plan")}
                    </button>
                    {planEditing && (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => setPlanEditing(false)}
                      >
                        {t("إلغاء", "Cancel")}
                      </button>
                    )}
                  </div>
                </form>
              )}
            </section>
            <section className="learner-card learning-panel">
              <h2>{t("سجل التمرين المنزلي", "Home practice log")}</h2>
              <p className="learner-muted">
                {t(
                  "هذه الإدخالات تتبعها الأسرة فقط، وليست تقييمًا أو إكمال جلسة معلم.",
                  "Family-tracked entries only; not teacher assessment or session completion.",
                )}
              </p>
              <div className="learning-summary">
                <strong>
                  {learning.summary.total_minutes} {t("دقيقة", "minutes")}
                </strong>
                <span>
                  {learning.summary.entry_count} {t("إدخالًا", "entries")} ·{" "}
                  {t("آخر 100 إدخال", "latest 100")}
                </span>
              </div>
              {learning.entries.length === 0 && (
                <p className="empty-state">
                  {t(
                    "لم تُسجّل تمارين منزلية بعد.",
                    "No home practice logged yet.",
                  )}
                </p>
              )}
              {learning.entries.map((entry) => (
                <article className="practice-entry" key={entry.id}>
                  <div>
                    <strong>{entry.activity}</strong>
                    <span>
                      {entry.minutes} {t("دقيقة", "minutes")} ·{" "}
                      {entry.practiced_on}
                    </span>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                  <div className="form-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(entry.id);
                        setPractice({
                          activity: entry.activity,
                          minutes: String(entry.minutes),
                          practiced_on: entry.practiced_on,
                          note: entry.note,
                        });
                      }}
                    >
                      {t("تعديل", "Edit")}
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void mutate("delete-practice", { id: entry.id })
                      }
                    >
                      {t("حذف", "Delete")}
                    </button>
                  </div>
                </article>
              ))}
              <form
                onSubmit={savePractice}
                className="learning-form practice-form"
              >
                <h3>
                  {editingId
                    ? t("تعديل التمرين", "Edit practice")
                    : t("إضافة تمرين", "Add practice")}
                </h3>
                <label htmlFor="practice-activity">
                  {t("النشاط", "Activity")}
                </label>
                <input
                  id="practice-activity"
                  value={practice.activity}
                  onChange={(e) =>
                    setPractice({ ...practice, activity: e.target.value })
                  }
                  maxLength={120}
                  disabled={busy}
                />
                <label htmlFor="practice-minutes">
                  {t("الدقائق", "Minutes")}
                </label>
                <input
                  id="practice-minutes"
                  type="number"
                  min="1"
                  max="240"
                  value={practice.minutes}
                  onChange={(e) =>
                    setPractice({ ...practice, minutes: e.target.value })
                  }
                  disabled={busy}
                />
                <label htmlFor="practice-date">
                  {t("تاريخ التمرين", "Practice date")}
                </label>
                <input
                  id="practice-date"
                  type="date"
                  min="2000-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  value={practice.practiced_on}
                  onChange={(e) =>
                    setPractice({ ...practice, practiced_on: e.target.value })
                  }
                  disabled={busy}
                />
                <label htmlFor="practice-note">
                  {t("ملاحظة اختيارية", "Optional note")}
                </label>
                <textarea
                  id="practice-note"
                  value={practice.note}
                  onChange={(e) =>
                    setPractice({ ...practice, note: e.target.value })
                  }
                  maxLength={500}
                  disabled={busy}
                />
                <div className="form-actions">
                  <button
                    className="learner-button"
                    type="submit"
                    disabled={busy}
                  >
                    {editingId
                      ? t("حفظ التعديل", "Save changes")
                      : t("إضافة التمرين", "Add practice")}
                  </button>
                  {editingId && (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setPractice({ ...blankPractice });
                      }}
                    >
                      {t("إلغاء", "Cancel")}
                    </button>
                  )}
                </div>
              </form>
              {actionError && (
                <div className="learner-alert inline-error" role="alert">
                  {actionError}
                  <button
                    type="button"
                    onClick={() => {
                      setActionError("");
                      void refetchSelected();
                    }}
                  >
                    {t("إعادة تحميل البيانات", "Reload saved data")}
                  </button>
                  <button type="button" onClick={() => setActionError("")}>
                    {t("إغلاق", "Dismiss")}
                  </button>
                </div>
              )}
            </section>
            <aside className="learner-notice">
              <strong>{t("نطاق البيانات", "Data scope")}</strong>
              <p>
                {t(
                  "تظهر هنا أمثلة دروس اصطناعية وسجل تمرين منزلي يديره ولي الأمر. لا توجد هوية معلم أو حضور أو نتائج أو Zoom أو مدفوعات.",
                  "This page shows synthetic lesson examples and guardian-managed home practice. It contains no teacher identity, attendance, outcomes, Zoom, or payment data.",
                )}
              </p>
            </aside>
          </section>
        )}
        <footer>
          <Link href={`/${locale}/family`}>
            {t(
              "إدارة ملفات الأطفال في مساحة الأسرة",
              "Manage child profiles in Family space",
            )}
          </Link>
        </footer>
      </div>
    </main>
  );
}
