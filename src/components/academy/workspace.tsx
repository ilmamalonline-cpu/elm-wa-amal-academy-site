"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Locale } from "@/content/site";
import type {
  AcademyAction,
  AcademyView,
  PlanReference,
  Role,
  Session,
  Student,
} from "@/lib/academy/types";

type Tab =
  | "overview"
  | "learners"
  | "schedule"
  | "homework"
  | "reports"
  | "activity"
  | "services";
type Modal =
  | { kind: "enroll" }
  | { kind: "assess" | "assign" | "plan" | "book"; student: Student }
  | { kind: "reschedule" | "cancel" | "evaluate"; session: Session }
  | { kind: "submit" | "review"; id: string }
  | { kind: "reset" };
const roles: Role[] = ["guardian", "student", "teacher", "admin"];
const tabs: Tab[] = [
  "overview",
  "learners",
  "schedule",
  "homework",
  "reports",
  "activity",
  "services",
];
const tabCopy: Record<Tab, [string, string, string]> = {
  overview: ["نظرة عامة", "Overview", "◈"],
  learners: ["الطلاب والخطط", "Learners & plans", "▤"],
  schedule: ["الحصص والمواعيد", "Lessons & schedule", "▦"],
  homework: ["الواجبات", "Homework", "✓"],
  reports: ["التقدم والتقارير", "Progress & reports", "↗"],
  activity: ["الإشعارات والسجل", "Notifications & activity", "◎"],
  services: ["الخدمات والاشتراك", "Services & subscription", "⚙"],
};
const roleCopy: Record<Role, [string, string]> = {
  guardian: ["ولي الأمر", "Guardian"],
  student: ["الطالب البالغ", "Adult learner"],
  teacher: ["المعلم", "Teacher"],
  admin: ["الإدارة", "Administration"],
};

export function AcademyWorkspace({ locale, browserPreview = false }: { locale: Locale; browserPreview?: boolean }) {
  const en = locale === "en";
  const t = (ar: string, english: string) => (en ? english : ar);
  const [view, setView] = useState<AcademyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState(0);
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [page, setPage] = useState(1);
  const [timezone, setTimezone] = useState("Africa/Cairo");
  const [modal, setModal] = useState<Modal | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const role = view?.role;
  const staff = role === "teacher" || role === "admin";
  const admin = role === "admin";
  const family = role === "guardian" || role === "student";

  const errorText = useCallback(
    (code: string) => {
      const errors: Record<string, [string, string]> = {
        academy_demo_disabled: [
          "التجربة المحلية معطلة. شغّلها بالأمر الموضح أدناه.",
          "The local demo is disabled. Start it using the command below.",
        ],
        forbidden: [
          "لا تسمح الشخصية الحالية بهذا الإجراء أو بهذا الطالب.",
          "This persona cannot perform this action or access this learner.",
        ],
        not_found: [
          "السجل غير متاح لهذه الشخصية. حدّث البيانات.",
          "This record is unavailable to this persona. Refresh the data.",
        ],
        slot_conflict: [
          "الموعد محجوز بالفعل. اختر موعدًا آخر؛ لم يتغير الحجز السابق.",
          "This slot is already booked. Choose another; your previous booking is unchanged.",
        ],
        conflict: [
          "يوجد تعارض أو تغيّر في حالة السجل. حدّث البيانات واختر موعدًا آخر.",
          "The record changed or conflicts with another booking. Refresh and try another slot.",
        ],
        validation_error: [
          "راجع الحقول: النص مطلوب والمراجع والدرجات يجب أن تكون ضمن النطاق المحدد.",
          "Check the fields: required text, reference ranges and scores must be valid.",
        ],
        invalid_input: [
          "راجع البيانات المطلوبة ونطاق المراجع والدرجات.",
          "Check the required fields and reference and score ranges.",
        ],
        invalid_reference: [
          "المراجع التجريبية المسموحة: السور 112 إلى 114، ضمن عدد آياتها.",
          "Demo references support surahs 112–114 within their verse counts.",
        ],
        cancel_window: [
          "الإلغاء أو النقل للأسرة متاح قبل 24 ساعة على الأقل. اطلب مراجعة الإدارة داخل التجربة.",
          "Family changes require at least 24 hours’ notice. Switch to the demo administrator for review.",
        ],
        session_not_finished: [
          "لا يمكن تسجيل حضور جلسة مستقبلية. استخدم جلسة التدريب الماضية.",
          "A future lesson cannot have attendance recorded. Use the past practice lesson.",
        ],
        journey_incomplete: [
          "أكمل التقييم والإسناد ونشر الخطة أولًا.",
          "Complete assessment, teacher assignment and a published plan first.",
        ],
        invalid_field: [
          "راجع النصوص والتاريخ والحقول المطلوبة.",
          "Check the required fields, text and date.",
        ],
        invalid_score: [
          "الدرجة عدد صحيح من 1 إلى 5، أو اتركها فارغة إن لم تُقَيَّم.",
          "Scores must be whole numbers from 1 to 5, or blank when not evaluated.",
        ],
        already_enrolled: [
          "لهذا الطالب طلب تعلم بالفعل. لا يمكن تغيير الباقة بطلب مكرر.",
          "This learner is already enrolled; duplicate enrollment cannot change the package.",
        ],
        demo_capacity_reached: [
          "وصل الملف إلى سعة التجربة: 8 حجوزات غير ملغاة. ليست هذه محاسبة اشتراك حقيقي.",
          "This demo profile reached its 8 non-cancelled reservation limit. This is not real subscription accounting.",
        ],
        assignment_required: [
          "يلزم إسناد معلم فعال أولًا.",
          "An active teacher assignment is required first.",
        ],
        assessment_required: [
          "أكمل التقييم الأولي قبل إسناد المعلم.",
          "Complete placement assessment before assigning a teacher.",
        ],
        slot_unavailable: [
          "الموعد لم يعد متاحًا أو مضى. حدّث البيانات واختر موعدًا آخر.",
          "The time is unavailable or in the past. Refresh and choose another.",
        ],
        local_storage_unavailable: [
          "تعذر حفظ التجربة محليًا. حدّث البيانات للتحقق من حالتها قبل إعادة الإرسال.",
          "Local demo storage is unavailable. Refresh to check the state before retrying.",
        ],
        network: [
          "تعذر الاتصال بالخادم المحلي. أعد المحاولة دون تكرار الإجراء إن كان قد حُفظ.",
          "The local server could not be reached. Refresh before retrying an uncertain save.",
        ],
      };
      return (
        errors[code]?.[en ? 1 : 0] ??
        (en
          ? `The action could not be completed (${code}). Check the record and try again.`
          : `لم يكتمل الإجراء (${code}). راجع حالة السجل ثم أعد المحاولة.`)
      );
    },
    [en],
  );

  const request = useCallback(async (init?: RequestInit) => {
    if (!browserPreview) return fetch("/api/academy-demo", init);
    const { browserPreviewRequest } = await import("@/lib/academy/browser-preview");
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return browserPreviewRequest(window.sessionStorage,
        init?.body ? JSON.parse(String(init.body)) as AcademyAction : undefined);
    } catch {
      return Response.json({ error: "local_storage_unavailable" }, { status: 400 });
    }
  }, [browserPreview]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await request({ cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setDisabled(response.status === 503);
        throw new Error(data.error ?? "network");
      }
      setView(data.view);
      setClock(
        Date.parse(response.headers.get("date") ?? "2026-10-18T00:00:00Z"),
      );
      setDisabled(false);
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : "network"));
    } finally {
      setLoading(false);
    }
  }, [errorText, request]);
  useEffect(() => {
    const controller = new AbortController();
    request({ cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setDisabled(response.status === 503);
          throw new Error(data.error ?? "network");
        }
        setView(data.view);
        setClock(
          Date.parse(response.headers.get("date") ?? "2026-10-18T00:00:00Z"),
        );
        setDisabled(false);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(errorText(err instanceof Error ? err.message : "network"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [errorText, request]);
  useEffect(() => {
    if (modal && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [modal]);

  async function run(action: AcademyAction, close = true) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await request({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Academy-Demo": "synthetic-only",
        },
        body: JSON.stringify(action),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "network");
      setView(data.view);
      setClock(
        Date.parse(response.headers.get("date") ?? "2026-10-18T00:00:00Z"),
      );
      setNotice(
        t(
          browserPreview ? "حُفظ في هذا التبويب فقط، لا على خادم؛ لا تستخدم بيانات شخصية." : "تم حفظ التغيير محليًا في التجربة فقط؛ لم تُرسل بيانات إلى خدمة خارجية.",
          browserPreview ? "Saved in this browser tab only, not on a server. Do not enter personal data." : "Saved to this local demo only. Nothing was sent to an external service.",
        ),
      );
      if (close) setModal(null);
      if (action.action === "enter" || action.action === "reset") {
        setSelectedId("");
        setTab("overview");
        setQuery("");
        setPage(1);
      }
    } catch (err) {
      setError(errorText(err instanceof Error ? err.message : "network"));
    } finally {
      setBusy(false);
    }
  }
  const currentId = view?.students.some((s) => s.id === selectedId)
    ? selectedId
    : view?.students[0]?.id;
  const current = view?.students.find((s) => s.id === currentId);
  const studentName = (id: string) => {
    const student = view?.students.find((s) => s.id === id);
    if (!student) return t("طالب غير متاح", "Unavailable learner");
    return en
      ? `${student.ageBand === "child" ? "Demo child" : "Demo adult"} · ${student.id.replace(/[^0-9]/g, "") || student.name.split(" ").at(-1)}`
      : student.name === "Synthetic child one"
        ? "الطالب التجريبي 1"
        : student.name === "Synthetic child two"
          ? "الطالب التجريبي 2"
          : student.name === "Adult learner"
            ? "الطالب البالغ التجريبي"
            : student.name;
  };
  const date = (value: string, time = true) =>
    new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG", {
      timeZone: timezone,
      day: "numeric",
      month: "short",
      ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(new Date(value));
  const referenceText = (r: PlanReference) =>
    t(
      `سورة ${r.surah} · الآيات ${r.from}–${r.to}`,
      `Surah ${r.surah} · verses ${r.from}–${r.to}`,
    );
  const status = (value: string) =>
    ({
      scheduled: t("مجدولة", "Scheduled"),
      completed: t("مكتملة", "Completed"),
      cancelled: t("ملغاة", "Cancelled"),
      foundation: t("تأسيس", "Foundation"),
      developing: t("نامٍ", "Developing"),
      confident: t("متقدم", "Confident"),
    })[value] ?? value;
  const getStudentSessions = (id: string) =>
    view?.sessions.filter((s) => s.studentId === id) ?? [];
  const getPlan = (id: string) =>
    view?.plans.filter((p) => p.studentId === id).at(-1);
  const getAssessment = (id: string) =>
    view?.assessments.filter((a) => a.studentId === id).at(-1);
  const getAssignment = (id: string) =>
    view?.assignments.find((a) => a.studentId === id && a.active);
  const scopedSessions =
    view?.sessions.filter((s) => !family || s.studentId === currentId) ?? [];
  const scopedReports =
    view?.evaluations.filter(
      (e) => e.published && scopedSessions.some((s) => s.id === e.sessionId),
    ) ?? [];
  const scopedHomework =
    view?.homework.filter((h) =>
      scopedSessions.some((s) => s.id === h.sessionId),
    ) ?? [];
  const next = scopedSessions
    .filter(
      (s) => s.status === "scheduled" && new Date(s.startsAt).getTime() > clock,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const visibleStudents = (view?.students ?? []).filter(
    (s) =>
      (studentName(s.id).toLowerCase().includes(query.toLowerCase()) ||
        s.id.includes(query)) &&
      (stage === "all" ||
        (stage === "assessment"
          ? !getAssessment(s.id)
          : stage === "assignment"
            ? !getAssignment(s.id)
            : !getPlan(s.id)?.published)),
  );
  const visibleSessions = scopedSessions
    .filter((s) => stage === "all" || s.status === stage)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const visibleHomework = scopedHomework.filter(
    (h) =>
      stage === "all" ||
      (stage === "pending"
        ? !h.submittedAt
        : stage === "submitted"
          ? !!h.submittedAt && !h.reviewedAt
          : !!h.reviewedAt),
  );
  function go(nextTab: Tab) {
    setTab(nextTab);
    setStage("all");
    setQuery("");
    setPage(1);
    setError("");
  }
  function open(value: Modal) {
    setError("");
    setModal(value);
  }
  function field(
    name: string,
    ar: string,
    english: string,
    children?: ReactNode,
  ) {
    return (
      <label className="aw-field">
        {t(ar, english)}
        {children ?? <input name={name} required maxLength={500} />}
      </label>
    );
  }
  function referenceFields(defaultRef?: PlanReference) {
    return (
      <fieldset className="aw-reference">
        <legend>
          {t(
            "مرجع رقمي تجريبي — بلا نص قرآني",
            "Demo reference — no Quran text",
          )}
        </legend>
        {field(
          "surah",
          "رقم السورة",
          "Surah number",
          <select name="surah" defaultValue={defaultRef?.surah ?? 112}>
            <option value="112">112 · {t("الإخلاص", "Al-Ikhlas")}</option>
            <option value="113">113 · {t("الفلق", "Al-Falaq")}</option>
            <option value="114">114 · {t("الناس", "An-Nas")}</option>
          </select>,
        )}
        {field(
          "from",
          "من الآية",
          "From verse",
          <input
            name="from"
            type="number"
            min="1"
            max="6"
            defaultValue={defaultRef?.from ?? 1}
            required
          />,
        )}
        {field(
          "to",
          "إلى الآية",
          "To verse",
          <input
            name="to"
            type="number"
            min="1"
            max="6"
            defaultValue={defaultRef?.to ?? 4}
            required
          />,
        )}
        <small>
          {t(
            "112: أربع آيات · 113: خمس · 114: ست. هذه أمثلة مرجعية لا قاعدة مصحف معتمدة.",
            "112: 4 verses · 113: 5 · 114: 6. Reference examples, not an approved Quran dataset.",
          )}
        </small>
      </fieldset>
    );
  }
  function slotSelect(studentId: string, excludeSessionId?: string) {
    const assignment = getAssignment(studentId);
    const available =
      view?.slots.filter(
        (slot) =>
          slot.teacherId === assignment?.teacherId &&
          new Date(slot.startsAt).getTime() > clock &&
          !view.sessions.some(
            (s) =>
              s.id !== excludeSessionId &&
              s.status !== "cancelled" &&
              s.teacherId === slot.teacherId &&
              s.startsAt < slot.endsAt &&
              s.endsAt > slot.startsAt,
          ),
      ) ?? [];
    return field(
      "slotId",
      "الموعد المتاح",
      "Available time",
      <select name="slotId" required defaultValue="">
        <option value="" disabled>
          {available.length
            ? t("اختر موعدًا", "Choose a time")
            : t(
                "لا مواعيد متاحة — يلزم إسناد فعال",
                "No availability — active assignment required",
              )}
        </option>
        {available.map((s) => (
          <option key={s.id} value={s.id}>
            {date(s.startsAt)} · {s.durationMinutes} {t("دقيقة", "min")}
          </option>
        ))}
      </select>,
    );
  }
  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const ref = () => ({
      surah: Number(data.get("surah")),
      from: Number(data.get("from")),
      to: Number(data.get("to")),
    });
    const score = (key: string) =>
      text(key) === "" ? null : Number(text(key));
    switch (modal.kind) {
      case "reset":
        await run({ action: "reset" });
        break;
      case "enroll":
        await run({
          action: "enroll",
          packageId: text("packageId") as "quran" | "noor" | "complete",
          ageBand: role === "guardian" ? "child" : "adult",
        });
        break;
      case "assess":
        await run({
          action: "assess",
          studentId: modal.student.id,
          level: text("level") as "foundation" | "developing" | "confident",
          notes: text("notes"),
        });
        break;
      case "assign":
        await run({
          action: "assign",
          studentId: modal.student.id,
          teacherId: text("teacherId"),
        });
        break;
      case "plan":
        await run({
          action: "plan",
          studentId: modal.student.id,
          goal: text("goal"),
          reference: ref(),
          published: data.get("published") === "on",
        });
        break;
      case "book":
        await run({
          action: "book",
          studentId: modal.student.id,
          slotId: text("slotId"),
        });
        break;
      case "reschedule":
        await run({
          action: "reschedule",
          sessionId: modal.session.id,
          slotId: text("slotId"),
          reason: text("reason"),
        });
        break;
      case "cancel":
        await run({
          action: "cancel",
          sessionId: modal.session.id,
          reason: text("reason"),
        });
        break;
      case "submit":
        await run({
          action: "submit",
          homeworkId: modal.id,
          response: text("response"),
        });
        break;
      case "review":
        await run({
          action: "review",
          homeworkId: modal.id,
          feedback: text("feedback"),
        });
        break;
      case "evaluate":
        await run({
          action: "evaluate",
          sessionId: modal.session.id,
          attendance: text("attendance") as "present" | "absent" | "technical",
          memorization: score("memorization"),
          tajweed: score("tajweed"),
          makharij: score("makharij"),
          fluency: score("fluency"),
          feedback: text("feedback"),
          privateNote: text("privateNote"),
          reference: ref(),
          homeworkTitle: text("homeworkTitle"),
          homeworkDue: new Date(
            `${text("homeworkDue")}T12:00:00Z`,
          ).toISOString(),
          published: data.get("published") === "on",
        });
        break;
    }
  }

  const modalTitle = modal
    ? {
        enroll: t("طلب تعلم تجريبي", "Demo enrollment"),
        assess: t("تسجيل التقييم الأولي", "Record placement assessment"),
        assign: t("إسناد معلم", "Assign a teacher"),
        plan: t("خطة التعلم الفردية", "Individual learning plan"),
        book: t("حجز حصة فردية", "Book an individual lesson"),
        reschedule: t("نقل موعد الحصة", "Reschedule lesson"),
        cancel: t("إلغاء الحصة", "Cancel lesson"),
        evaluate: t("توثيق الجلسة والتقييم", "Session record & evaluation"),
        submit: t("تسليم الواجب", "Submit homework"),
        review: t("مراجعة الواجب", "Review homework"),
        reset: t("إعادة ضبط التجربة", "Reset the demo"),
      }[modal.kind]
    : "";

  const pageHeader = (
    <>
      <a className="skip-link" href="#academy-main">
        {t("تخطّي إلى المحتوى", "Skip to content")}
      </a>
      <div className="aw-demo-banner">
        {browserPreview ? t(
          "معاينة متصفح معزولة • بيانات اصطناعية فقط • ليست منصة تشغيل • لا تُدخل بيانات شخصية • حفظ مؤقت في هذا التبويب",
          "ISOLATED BROWSER PREVIEW • SYNTHETIC ONLY • NOT A LIVE PLATFORM • NO PERSONAL DATA • TEMPORARY TAB STORAGE",
        ) : t(
          "مساحة اختبار محلية • بيانات اصطناعية فقط • لا تسجيل حقيقي أو تحصيل",
          "LOCAL DEMO • SYNTHETIC DATA ONLY • NO REAL ONBOARDING OR PAYMENTS",
        )}
      </div>
    </>
  );
  if (!role)
    return (
      <div className="academy-app">
        {pageHeader}
        <header className="aw-entry-header">
          <Link href={`/${locale}`} className="brand">
            <span className="brand-mark" aria-hidden="true">
              ع
            </span>
            <strong>{t("علم وعمل", "Elm wa Amal")}</strong>
          </Link>
          <a href={`/${en ? "ar" : "en"}/workspace`} className="aw-link">
            {en ? "العربية" : "English"}
          </a>
        </header>
        <main id="academy-main" className="aw-entry" tabIndex={-1}>
          <span className="aw-eyebrow">
            {t("مساحتك للتعلم والنمو", "A SPACE TO LEARN & GROW")}
          </span>
          <h1>{t("خطوات واضحة. أثر يبقى.", "Clear steps. Lasting growth.")}</h1>
          <p>
            {t(
              "استكشف حلقة تعليمية حقيقية محليًا: تقييم، معلم، خطة، حصة، واجب، وتقدم. اختر شخصية اصطناعية؛ هذا ليس تسجيل دخول أو منح صلاحيات لحساب حقيقي.",
              "Explore a connected local learning journey: assessment, teacher, plan, lesson, homework and progress. Choose a synthetic persona. This is not real authentication or an account role grant.",
            )}
          </p>
          {browserPreview && error && (
            <button className="aw-button" disabled={busy} onClick={() => {
              if (window.confirm(en ? "Reset this tab’s synthetic data? This cannot be undone." : "إعادة ضبط بيانات التجربة في هذا التبويب؟ لا يمكن التراجع.")) void run({ action: "reset" });
            }}>{t("إعادة ضبط بيانات هذا التبويب", "Reset this tab’s demo data")}</button>
          )}
          {loading ? (
            <div className="aw-skeleton" role="status">
              {t("جارٍ تحميل التجربة…", "Loading the demo…")}
            </div>
          ) : disabled ? (
            <section className="aw-panel">
              <h2>
                {t(
                  "التجربة معطلة افتراضيًا",
                  "The demo is disabled by default",
                )}
              </h2>
              <p>
                {t(
                  "تشغيل محلي فقط من مجلد المشروع، دون أسرار أو خدمات خارجية:",
                  "Start locally from the project directory, without secrets or external services:",
                )}
              </p>
              <code dir="ltr">npm run dev:academy</code>
              <p>
                {t(
                  "يبقى الموقع العام متاحًا دون تفعيل التجربة.",
                  "The public website remains available without enabling the demo.",
                )}
              </p>
              <button className="aw-button" onClick={() => void refresh()}>
                {t("إعادة المحاولة", "Retry")}
              </button>
            </section>
          ) : (
            <div className="aw-role-grid">
              {roles.map((r, i) => (
                <button
                  key={r}
                  className="aw-persona"
                  disabled={busy}
                  onClick={() => void run({ action: "enter", role: r })}
                >
                  <span className="aw-persona-number">0{i + 1}</span>
                  <strong>{roleCopy[r][en ? 1 : 0]}</strong>
                  <span>
                    {
                      {
                        guardian: t(
                          "متابعة طفل مرتبط وتسليم واجباته",
                          "Follow a linked child and submit homework",
                        ),
                        student: t(
                          "خطة الطالب البالغ وحصصه الفردية",
                          "Your adult learning plan and individual lessons",
                        ),
                        teacher: t(
                          "تحضير الحصة وتقييمها ونشر التقدم",
                          "Prepare lessons, evaluate and publish progress",
                        ),
                        admin: t(
                          "التقييم والإسناد والإشراف التشغيلي",
                          "Placement, assignment and operational oversight",
                        ),
                      }[r]
                    }
                  </span>
                  <span className="aw-link">
                    {t("استكشف المساحة ←", "Explore workspace →")}
                  </span>
                </button>
              ))}
            </div>
          )}
          {error && (
            <p role="alert" className="aw-error">
              {error}
            </p>
          )}
          <p className="aw-footnote">
            {t(
              "لا حساب مستقل للقاصر. الدفع وZoom والرفع والبريد معطلة. لا تستخدم بيانات شخصية حقيقية.",
              "No independent minor login. Payments, Zoom, uploads and email are disabled. Do not enter real personal information.",
            )}
          </p>
        </main>
      </div>
    );

  return (
    <div className="academy-app">
      {pageHeader}
      <div className="aw-layout">
        <aside className="aw-sidebar">
          <Link href={`/${locale}`} className="aw-brand">
            <span className="aw-brand-mark" aria-hidden="true">
              ع
            </span>
            <span>
              <strong>{t("علم وعمل", "Elm wa Amal")}</strong>
              <small>{t("مساحة الأكاديمية", "ACADEMY WORKSPACE")}</small>
            </span>
          </Link>
          <p className="aw-sidebar-label">
            {t("رحلتك التعليمية", "YOUR LEARNING JOURNEY")}
          </p>
          <nav aria-label={t("مساحة الأكاديمية", "Academy workspace")}>
            {tabs.map((key) => (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => go(key)}
              >
                <span aria-hidden="true">{tabCopy[key][2]}</span>
                {tabCopy[key][en ? 1 : 0]}
                {key === "homework" &&
                  scopedHomework.filter((h) => !h.reviewedAt).length > 0 && (
                    <b>{scopedHomework.filter((h) => !h.reviewedAt).length}</b>
                  )}
              </button>
            ))}
          </nav>
          <div className="aw-sidebar-bottom">
            <span className="aw-gold-line" />
            <p>
              {t(
                "تعلم فردي، وخطة تليق بكل طالب.",
                "Individual learning. A plan for every learner.",
              )}
            </p>
            <Link href={`/${locale}/packages`}>
              {t("البرامج والباقات ↗", "Programs & packages ↗")}
            </Link>
          </div>
        </aside>
        <div className="aw-body">
          <header className="aw-topbar">
            <div>
              <small>{t("أكاديمية علم وعمل", "ELM WA AMAL ACADEMY")}</small>
              <strong>{tabCopy[tab][en ? 1 : 0]}</strong>
            </div>
            <div className="aw-topbar-actions">
              <a
                href={`/${en ? "ar" : "en"}/workspace`}
                className="aw-link"
                lang={en ? "ar" : "en"}
              >
                {en ? "العربية" : "English"}
              </a>
              <label className="aw-role-switch">
                {t("الشخصية التجريبية", "Demo persona")}
                <select
                  aria-label={t(
                    "تبديل الشخصية التجريبية",
                    "Switch demo persona",
                  )}
                  value={role}
                  disabled={busy}
                  onChange={(e) =>
                    void run({ action: "enter", role: e.target.value as Role })
                  }
                >
                  {roles.map((r) => (
                    <option value={r} key={r}>
                      {roleCopy[r][en ? 1 : 0]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="aw-avatar"
                title={t(
                  "الخروج من الشخصية التجريبية",
                  "Leave the demo persona",
                )}
                aria-label={t(
                  "الخروج من الشخصية التجريبية",
                  "Leave the demo persona",
                )}
                disabled={busy}
                onClick={() => void run({ action: "logout" })}
              >
                ↪
              </button>
            </div>
          </header>
          <main
            id="academy-main"
            tabIndex={-1}
            className="aw-main"
            aria-busy={busy}
          >
            <div className="aw-page-title">
              <div>
                <span className="aw-eyebrow">
                  {t("تقدم بخطوة، كل يوم", "A LITTLE PROGRESS, EVERY DAY")}
                </span>
                <h1>
                  {tab === "overview"
                    ? t(
                        "أهلًا بك في رحلة علم وعمل",
                        "Welcome to your learning journey",
                      )
                    : tabCopy[tab][en ? 1 : 0]}
                </h1>
                <p>
                  {t(
                    browserPreview ? "تجربة مترابطة؛ السجلات اصطناعية ومحفوظة في هذا التبويب فقط، بلا مزامنة بين الأجهزة." : "تجربة مترابطة؛ كل سجل هنا اصطناعي ومحفوظ على الخادم المحلي.",
                    browserPreview ? "One connected journey. Synthetic records stay in this tab only; there is no cloud persistence or cross-device sync." : "One connected journey. Every record is synthetic and saved on the local server.",
                  )}
                </p>
              </div>
              <button
                className="aw-button aw-secondary"
                disabled={loading || busy}
                onClick={() => void refresh()}
              >
                {t("تحديث البيانات", "Refresh data")}
              </button>
            </div>
            {notice && (
              <div className="aw-success" role="status">
                {notice}
                <button
                  aria-label={t("إغلاق التنبيه", "Dismiss notification")}
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            {error && !modal && (
              <div className="aw-error" role="alert">
                {error}
              </div>
            )}
            {family && view.students.length > 0 && (
              <div
                className="aw-family-tabs"
                aria-label={t("الملفات المرتبطة", "Linked profiles")}
              >
                {view.students.map((s) => (
                  <button
                    key={s.id}
                    aria-pressed={s.id === currentId}
                    onClick={() => setSelectedId(s.id)}
                  >
                    {studentName(s.id)}
                    <small>
                      {s.ageBand === "child"
                        ? t("بإدارة ولي الأمر", "Guardian-managed")
                        : t("طالب بالغ", "Adult learner")}
                    </small>
                  </button>
                ))}
              </div>
            )}
            {tab === "overview" && (
              <>
                <section className="aw-welcome">
                  <div>
                    <span className="aw-kicker">
                      {t(
                        "من النية إلى الاستمرار",
                        "FROM INTENTION TO CONSISTENCY",
                      )}
                    </span>
                    <h2>
                      {t(
                        "لكل خطوة هدف.\nولكل تقدم أثر.",
                        "Every step has purpose.\nEvery effort makes progress.",
                      )}
                    </h2>
                    <p>
                      {staff
                        ? t(
                            "تابع طلابك من التقييم الأولي إلى الأثر التعليمي المنشور، في مكان واحد.",
                            "Guide learners from their first assessment to published learning progress, all in one place.",
                          )
                        : t(
                            "خطة واضحة، معلم يتابع، وأسرة ترى تقدم التعلم خطوة بخطوة.",
                            "A clear plan, a supportive teacher and a family that sees progress, step by step.",
                          )}
                    </p>
                    <button
                      className="aw-button aw-white"
                      onClick={() => go(staff ? "learners" : "schedule")}
                    >
                      {staff
                        ? t("متابعة الطلاب", "View learners")
                        : t("استعرض الحصص", "View lessons")}{" "}
                      <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  <div className="aw-journey-symbol" aria-hidden="true">
                    <span>ع</span>
                    <small>ELM WA AMAL</small>
                  </div>
                </section>
                <div className="aw-stats">
                  {[
                    [
                      t("الملفات المتاحة", "Accessible learners"),
                      family ? (current ? 1 : 0) : view.students.length,
                      t(
                        "بحسب الرابط أو الإسناد",
                        "Scoped to your relationship",
                      ),
                    ],
                    [
                      t("حصص قادمة", "Upcoming lessons"),
                      scopedSessions.filter(
                        (s) =>
                          s.status === "scheduled" &&
                          new Date(s.startsAt).getTime() > clock,
                      ).length,
                      t(
                        "مواعيد فردية مؤكدة محليًا",
                        "Local individual bookings",
                      ),
                    ],
                    [
                      t("واجبات تنتظر المتابعة", "Homework to follow up"),
                      scopedHomework.filter((h) => !h.reviewedAt).length,
                      t(
                        "من سجلات الواجب الفعلية",
                        "Derived from homework records",
                      ),
                    ],
                    [
                      t("تقارير منشورة", "Published reports"),
                      scopedReports.length,
                      t("لا تشمل المسودات", "Drafts are excluded"),
                    ],
                  ].map(([label, value, sub]) => (
                    <article className="aw-stat" key={String(label)}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                      <small>{sub}</small>
                    </article>
                  ))}
                </div>
                <div className="aw-two-col">
                  <section className="aw-panel">
                    <PanelTitle
                      title={t("الحصة القادمة", "Your next lesson")}
                      aside={
                        <button
                          className="aw-text-button"
                          onClick={() => go("schedule")}
                        >
                          {t("كل الحصص", "All lessons")}
                        </button>
                      }
                    />
                    {next ? (
                      <>
                        <div className="aw-next-date">
                          <span aria-hidden="true">▦</span>
                          <div>
                            <strong>{date(next.startsAt)}</strong>
                            <small dir="ltr">{timezone}</small>
                          </div>
                          <Badge>{status(next.status)}</Badge>
                        </div>
                        <h3>{studentName(next.studentId)}</h3>
                        <p>
                          {t(
                            "حصة فردية — مواد التعلم لدى المعلم داخل Zoom. لا يوجد ربط مباشر في التجربة.",
                            "Individual lesson. Teachers use their materials in Zoom. No live meeting integration in this demo.",
                          )}
                        </p>
                        <button
                          className="aw-button aw-secondary"
                          onClick={() => go("schedule")}
                        >
                          {t("تفاصيل الموعد", "Lesson details")}
                        </button>
                      </>
                    ) : (
                      <Empty
                        title={t("لا توجد حصة قادمة", "No upcoming lesson")}
                        body={t(
                          "اختر ملفًا بخطة منشورة واحجز موعدًا تجريبيًا من جدول الحصص.",
                          "Choose a learner with a published plan, then book a local demo slot.",
                        )}
                      />
                    )}
                  </section>
                  <section className="aw-panel">
                    <PanelTitle
                      title={t(
                        "الخطوة التعليمية التالية",
                        "The next learning step",
                      )}
                    />
                    {current ? (
                      <>
                        <h3>{studentName(current.id)}</h3>
                        <JourneySteps
                          assessment={!!getAssessment(current.id)}
                          assignment={!!getAssignment(current.id)}
                          plan={!!getPlan(current.id)?.published}
                          lesson={getStudentSessions(current.id).length > 0}
                          report={view.evaluations.some(
                            (e) =>
                              e.published &&
                              getStudentSessions(current.id).some(
                                (s) => s.id === e.sessionId,
                              ),
                          )}
                          en={en}
                        />
                        <button
                          className="aw-text-button"
                          onClick={() => go("learners")}
                        >
                          {t("افتح الملف والخطة ←", "Open profile & plan →")}
                        </button>
                      </>
                    ) : (
                      <Empty
                        title={t(
                          "ابدأ بطلب تجريبي",
                          "Start with demo enrollment",
                        )}
                        body={t(
                          "سجل طلبًا اصطناعيًا من تبويب الطلاب والخطط.",
                          "Create a synthetic enrollment from Learners & plans.",
                        )}
                      />
                    )}
                  </section>
                </div>
                <section className="aw-panel aw-section">
                  <PanelTitle
                    title={t(
                      "آخر ملاحظات المعلم المنشورة",
                      "Latest published teacher feedback",
                    )}
                    aside={
                      <button
                        className="aw-text-button"
                        onClick={() => go("reports")}
                      >
                        {t("عرض التقارير", "View reports")}
                      </button>
                    }
                  />
                  {scopedReports.length ? (
                    scopedReports.slice(-2).map((e) => (
                      <blockquote className="aw-feedback" key={e.id}>
                        <p>{e.feedback}</p>
                        <small>
                          {referenceText(e.reference)} ·{" "}
                          {date(e.createdAt, false)}
                        </small>
                      </blockquote>
                    ))
                  ) : (
                    <Empty
                      title={t(
                        "التقدم يبدأ بسجل موثّق",
                        "Progress starts with a recorded lesson",
                      )}
                      body={t(
                        "بعد توثيق المعلم للجلسة ونشرها، تظهر الملاحظات هنا للأسرة.",
                        "Once a teacher records and publishes a lesson, the feedback appears here for the family.",
                      )}
                    />
                  )}
                </section>
              </>
            )}

            {tab === "learners" && (
              <>
                <div className="aw-toolbar">
                  <label className="aw-search">
                    {t("ابحث عن طالب", "Search learners")}
                    <input
                      type="search"
                      value={query}
                      placeholder={t(
                        "اسم الملف أو معرفه…",
                        "Name or record ID…",
                      )}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <label className="aw-field">
                    {t("الخطوة المطلوبة", "Next step")}
                    <select
                      value={stage}
                      onChange={(e) => {
                        setStage(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">
                        {t("كل الملفات", "All profiles")}
                      </option>
                      <option value="assessment">
                        {t("بانتظار التقييم", "Needs assessment")}
                      </option>
                      <option value="assignment">
                        {t("بانتظار المعلم", "Needs teacher")}
                      </option>
                      <option value="plan">
                        {t("بانتظار خطة منشورة", "Needs published plan")}
                      </option>
                    </select>
                  </label>
                  {family && (
                    <button
                      className="aw-button"
                      disabled={role === "student" && !!current?.packageId}
                      title={
                        role === "student" && current?.packageId
                          ? t(
                              "لهذا الطالب طلب تعلم بالفعل",
                              "This learner is already enrolled",
                            )
                          : undefined
                      }
                      onClick={() => open({ kind: "enroll" })}
                    >
                      {t("طلب تعلم تجريبي +", "Demo enrollment +")}
                    </button>
                  )}
                </div>
                <div className="aw-learner-grid">
                  {visibleStudents.slice((page - 1) * 4, page * 4).map((s) => {
                    const plan = getPlan(s.id);
                    const assessment = getAssessment(s.id);
                    return (
                      <article className="aw-panel" key={s.id}>
                        <div className="aw-card-heading">
                          <div className="aw-initial" aria-hidden="true">
                            {s.ageBand === "child" ? "01" : "02"}
                          </div>
                          <div>
                            <h2 className="aw-card-title">
                              {studentName(s.id)}
                            </h2>
                            <small>
                              {s.ageBand === "child"
                                ? t(
                                    "ملف قاصر بإدارة الولي — بلا دخول مستقل",
                                    "Guardian-managed minor — no independent login",
                                  )
                                : t("طالب بالغ", "Adult learner")}
                            </small>
                          </div>
                        </div>
                        <JourneySteps
                          assessment={!!assessment}
                          assignment={!!getAssignment(s.id)}
                          plan={!!plan?.published}
                          lesson={getStudentSessions(s.id).length > 0}
                          report={view.evaluations.some(
                            (e) =>
                              e.published &&
                              getStudentSessions(s.id).some(
                                (x) => x.id === e.sessionId,
                              ),
                          )}
                          en={en}
                        />
                        <div className="aw-record-line">
                          <span>{t("التقييم الأولي", "Placement")}</span>
                          <strong>
                            {assessment
                              ? status(assessment.level)
                              : t("لم يقيّم بعد", "Not assessed")}
                          </strong>
                        </div>
                        <div className="aw-record-line">
                          <span>{t("إسناد المعلم", "Teacher assignment")}</span>
                          <strong>
                            {getAssignment(s.id)
                              ? t(
                                  "المعلم التجريبي المسند",
                                  "Assigned demo teacher",
                                )
                              : t("بانتظار الإسناد", "Awaiting assignment")}
                          </strong>
                        </div>
                        {plan ? (
                          <div className="aw-plan-summary">
                            <Badge>
                              {plan.published
                                ? t("خطة منشورة", "Published plan")
                                : t("مسودة للمعلم فقط", "Staff-only draft")}
                            </Badge>
                            <h3>{plan.goal}</h3>
                            <p>{referenceText(plan.reference)}</p>
                          </div>
                        ) : (
                          <p className="aw-muted">
                            {t(
                              "لا توجد خطة منشورة لهذا الملف.",
                              "No published learning plan for this profile.",
                            )}
                          </p>
                        )}
                        <div className="aw-actions">
                          {admin && (
                            <>
                              <button
                                className="aw-button aw-secondary"
                                onClick={() =>
                                  open({ kind: "assess", student: s })
                                }
                              >
                                {t("تقييم أولي", "Assessment")}
                              </button>
                              <button
                                className="aw-button aw-secondary"
                                disabled={!assessment}
                                onClick={() =>
                                  open({ kind: "assign", student: s })
                                }
                              >
                                {t("إسناد معلم", "Assign teacher")}
                              </button>
                            </>
                          )}
                          {staff && (
                            <button
                              className="aw-button"
                              disabled={!getAssignment(s.id)}
                              onClick={() => open({ kind: "plan", student: s })}
                            >
                              {t("تحرير الخطة", "Edit plan")}
                            </button>
                          )}
                          {family && (
                            <button
                              className="aw-button"
                              disabled={
                                !plan?.published || !getAssignment(s.id)
                              }
                              onClick={() => open({ kind: "book", student: s })}
                            >
                              {t("حجز حصة", "Book lesson")}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!visibleStudents.length && (
                  <Empty
                    title={t("لا ملفات مطابقة", "No matching profiles")}
                    body={t(
                      "غيّر البحث أو المرشح. ملفات الأسر الأخرى غير متاحة لهذه الشخصية.",
                      "Try another search or filter. Other families’ profiles are not available to this persona.",
                    )}
                  />
                )}
                <Pagination
                  page={page}
                  total={visibleStudents.length}
                  size={4}
                  onChange={setPage}
                  en={en}
                />
                <p className="aw-footnote">
                  {t(
                    browserPreview ? "الأسماء والعلاقات اصطناعية. تبديل الشخصية محاكاة داخل متصفحك، لا مصادقة أو حماية لحسابات حقيقية." : "الأسماء والروابط اصطناعية. الإسناد وصلاحيات القراءة يفحصهما الخادم، لا مجرد إخفاء أزرار.",
                    browserPreview ? "All names and relationships are synthetic. Persona switching is a browser simulation, not authentication or protection for real accounts." : "Names and relationships are synthetic. Assignments and reading permissions are checked on the server, not just by hiding buttons.",
                  )}
                </p>
              </>
            )}

            {tab === "schedule" && (
              <>
                <div className="aw-toolbar">
                  <label className="aw-field">
                    {t("عرض التوقيت في", "Display timezone")}
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      <option>Africa/Cairo</option>
                      <option>Asia/Kuwait</option>
                      <option>Asia/Qatar</option>
                      <option>UTC</option>
                    </select>
                  </label>
                  <label className="aw-field">
                    {t("حالة الحصة", "Lesson status")}
                    <select
                      value={stage}
                      onChange={(e) => {
                        setStage(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">
                        {t("كل الحصص", "All lessons")}
                      </option>
                      {["scheduled", "completed", "cancelled"].map((s) => (
                        <option value={s} key={s}>
                          {status(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(family || admin) && current && (
                    <button
                      className="aw-button"
                      disabled={!getPlan(current.id)?.published}
                      onClick={() => open({ kind: "book", student: current })}
                    >
                      {t("حجز حصة فردية +", "Book individual lesson +")}
                    </button>
                  )}
                </div>
                <p className="aw-notice">
                  {t(
                    "المواعيد مخزنة UTC وتعرض بالمنطقة المختارة. النقل والإلغاء للأسرة قبل 24 ساعة؛ الحجز تجريبي ولا يخصم رصيدًا أو يفعّل اشتراكًا. سعة كل ملف 8 حجوزات غير ملغاة للاختبار فقط.",
                    "Times are stored in UTC and displayed in your selected timezone. Family changes require 24 hours’ notice. Demo bookings do not debit a balance or activate a subscription. Each profile has an 8 non-cancelled reservation test capacity.",
                  )}
                </p>
                <div className="aw-session-list">
                  {visibleSessions.slice((page - 1) * 6, page * 6).map((s) => {
                    const evaluation = view.evaluations.find(
                      (e) => e.sessionId === s.id,
                    );
                    const future = new Date(s.endsAt).getTime() > clock;
                    const lateChange =
                      family &&
                      new Date(s.startsAt).getTime() - clock < 86_400_000;
                    return (
                      <article className="aw-panel aw-session" key={s.id}>
                        <div className="aw-date-block">
                          <strong>
                            {new Intl.DateTimeFormat(en ? "en" : "ar", {
                              timeZone: timezone,
                              day: "numeric",
                            }).format(new Date(s.startsAt))}
                          </strong>
                          <span>
                            {new Intl.DateTimeFormat(en ? "en" : "ar", {
                              timeZone: timezone,
                              month: "short",
                            }).format(new Date(s.startsAt))}
                          </span>
                        </div>
                        <div className="aw-session-copy">
                          <div className="aw-inline">
                            <h2 className="aw-card-title">
                              {studentName(s.studentId)}
                            </h2>
                            <Badge>{status(s.status)}</Badge>
                            {evaluation && !evaluation.published && (
                              <Badge>
                                {t("تقييم مسودة", "Draft evaluation")}
                              </Badge>
                            )}
                          </div>
                          <p>
                            {date(s.startsAt)} —{" "}
                            {new Intl.DateTimeFormat(en ? "en-GB" : "ar-EG", {
                              timeZone: timezone,
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(s.endsAt))}
                          </p>
                          <small dir="ltr">
                            {timezone} · {t("حصة فردية", "Individual lesson")}
                          </small>
                          {s.cancelReason && <p>{s.cancelReason}</p>}
                        </div>
                        <div className="aw-actions">
                          {s.status === "scheduled" && (family || admin) && (
                            <>
                              <button
                                className="aw-button aw-secondary"
                                disabled={lateChange}
                                title={
                                  lateChange
                                    ? t(
                                        "يلزم إشعار قبل 24 ساعة؛ للإدارة مراجعة الاستثناء",
                                        "24 hours’ notice required; administration can review an exception",
                                      )
                                    : undefined
                                }
                                onClick={() =>
                                  open({ kind: "reschedule", session: s })
                                }
                              >
                                {t("نقل الموعد", "Reschedule")}
                              </button>
                              <button
                                className="aw-text-button aw-danger"
                                disabled={lateChange}
                                title={
                                  lateChange
                                    ? t(
                                        "يلزم إشعار قبل 24 ساعة؛ للإدارة مراجعة الاستثناء",
                                        "24 hours’ notice required; administration can review an exception",
                                      )
                                    : undefined
                                }
                                onClick={() =>
                                  open({ kind: "cancel", session: s })
                                }
                              >
                                {t("إلغاء", "Cancel")}
                              </button>
                            </>
                          )}
                          {staff && s.status !== "cancelled" && (
                            <button
                              className="aw-button"
                              disabled={future || !!evaluation}
                              title={
                                future
                                  ? t(
                                      "متاح بعد وقت الحصة",
                                      "Available after the lesson time",
                                    )
                                  : evaluation
                                    ? t(
                                        "التقييم محفوظ — انشر المسودة من التقارير",
                                        "Evaluation saved — publish drafts in Reports",
                                      )
                                    : undefined
                              }
                              onClick={() =>
                                open({ kind: "evaluate", session: s })
                              }
                            >
                              {evaluation
                                ? t("تم التوثيق", "Recorded")
                                : t("توثيق وتقييم", "Record & evaluate")}
                            </button>
                          )}
                          <button
                            className="aw-button aw-secondary"
                            disabled
                            title={t(
                              "Zoom غير مفعّل في النسخة المحلية",
                              "Zoom is not enabled in this local version",
                            )}
                          >
                            Zoom · {t("غير مفعّل", "Disabled")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!visibleSessions.length && (
                  <Empty
                    title={t(
                      "لا حصص بهذه الحالة",
                      "No lessons with this status",
                    )}
                    body={t(
                      "أكمل التقييم والإسناد والخطة، ثم احجز موعدًا متاحًا. زر Zoom معطل بوضوح حتى تفعيل التكامل.",
                      "Complete placement, assignment and the plan, then choose an available slot. Zoom is explicitly disabled until integration is enabled.",
                    )}
                  />
                )}
                <Pagination
                  page={page}
                  total={visibleSessions.length}
                  size={6}
                  onChange={setPage}
                  en={en}
                />
              </>
            )}

            {tab === "homework" && (
              <>
                <div className="aw-toolbar">
                  <label className="aw-field">
                    {t("حالة الواجب", "Homework status")}
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                    >
                      <option value="all">
                        {t("كل الواجبات", "All homework")}
                      </option>
                      <option value="pending">
                        {t("بانتظار التسليم", "Awaiting submission")}
                      </option>
                      <option value="submitted">
                        {t("بانتظار المراجعة", "Awaiting review")}
                      </option>
                      <option value="reviewed">
                        {t("تمت المراجعة", "Reviewed")}
                      </option>
                    </select>
                  </label>
                </div>
                <div className="aw-learner-grid">
                  {visibleHomework.map((h) => (
                    <article className="aw-panel" key={h.id}>
                      <Badge>
                        {h.reviewedAt
                          ? t("تمت المراجعة", "Reviewed")
                          : h.submittedAt
                            ? t("تم التسليم", "Submitted")
                            : t("واجب مطلوب", "Assigned")}
                      </Badge>
                      <h2 className="aw-card-title">{h.title}</h2>
                      <p>
                        {studentName(
                          view.sessions.find((s) => s.id === h.sessionId)
                            ?.studentId ?? "",
                        )}
                      </p>
                      <p>
                        {t("موعد التسليم", "Due")} · {date(h.due, false)}
                      </p>
                      {h.response && (
                        <blockquote className="aw-feedback">
                          <p>{h.response}</p>
                        </blockquote>
                      )}
                      {h.reviewFeedback && (
                        <p className="aw-review-feedback">
                          {t("تعليق المعلم: ", "Teacher feedback: ")}
                          {h.reviewFeedback}
                        </p>
                      )}
                      <div className="aw-actions">
                        {family && !h.submittedAt && (
                          <button
                            className="aw-button"
                            onClick={() => open({ kind: "submit", id: h.id })}
                          >
                            {t("تسليم نصي", "Submit response")}
                          </button>
                        )}
                        {staff && h.submittedAt && !h.reviewedAt && (
                          <button
                            className="aw-button"
                            onClick={() => open({ kind: "review", id: h.id })}
                          >
                            {t("مراجعة الواجب", "Review homework")}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                {!visibleHomework.length && (
                  <Empty
                    title={t("لا واجبات مطابقة", "No matching homework")}
                    body={t(
                      "ينشئ المعلم الواجب ضمن توثيق جلسة منشورة. لا تسجيل صوتي أو رفع ملفات في التجربة.",
                      "Teachers create homework with a published lesson record. Audio recording and file uploads are not supported in this demo.",
                    )}
                  />
                )}
                <p className="aw-footnote">
                  {t(
                    "التسليم نص وحالة فقط؛ ولي الأمر يسلّم نيابة عن طفله المرتبط.",
                    "Text and status only. Guardians submit on behalf of their linked child.",
                  )}
                </p>
              </>
            )}

            {tab === "reports" && (
              <>
                <section className="aw-panel">
                  <PanelTitle
                    title={t(
                      "التقدم يُبنى من السجلات المنشورة",
                      "Progress comes from published records",
                    )}
                  />
                  <p>
                    {t(
                      "لا نسب حفظ عامة أو تقييم آلي. تعرض هذه المساحة المراجع التي وثقها المعلم والدرجات التجريبية 1–5؛ «لم يقيّم» ليست صفرًا. مقياس تجريبي غير معتمد تربويًا.",
                      "No global memorization percentages or automated scoring. This workspace shows teacher-recorded references and demo scores from 1–5; “not assessed” is not zero. This rubric is a prototype, not an approved educational standard.",
                    )}
                  </p>
                  <div className="aw-inline">
                    <Badge>
                      {scopedReports.length}{" "}
                      {t("تقارير منشورة", "published reports")}
                    </Badge>
                    <Badge>
                      {scopedReports.reduce(
                        (sum, e) =>
                          sum + (e.reference.to - e.reference.from + 1),
                        0,
                      )}{" "}
                      {t(
                        "إشارات آيات موثقة — قد تتكرر بالمراجعة",
                        "recorded verse references — revision may repeat",
                      )}
                    </Badge>
                  </div>
                </section>
                <div className="aw-report-list">
                  {view.evaluations
                    .filter((e) =>
                      scopedSessions.some((s) => s.id === e.sessionId),
                    )
                    .map((e) => (
                      <article className="aw-panel" key={e.id}>
                        <div className="aw-inline">
                          <h2 className="aw-card-title">
                            {studentName(
                              view.sessions.find((s) => s.id === e.sessionId)
                                ?.studentId ?? "",
                            )}
                          </h2>
                          <Badge>
                            {e.published
                              ? t("منشور للأسرة", "Published to family")
                              : t("مسودة — للموظفين فقط", "Draft — staff only")}
                          </Badge>
                          <small>{date(e.createdAt, false)}</small>
                        </div>
                        <p className="aw-reference-text">
                          {referenceText(e.reference)}
                        </p>
                        <p>
                          {t("الحضور: ", "Attendance: ")}
                          {e.attendance === "present"
                            ? t("حاضر", "Present")
                            : e.attendance === "absent"
                              ? t("غائب", "Absent")
                              : t("عطل تقني", "Technical incident")}
                        </p>
                        <div className="aw-score-grid">
                          {[
                            [t("الحفظ", "Memorization"), e.memorization],
                            [t("التجويد", "Tajweed"), e.tajweed],
                            [t("المخارج", "Makharij"), e.makharij],
                            [t("الطلاقة", "Fluency"), e.fluency],
                          ].map(([label, value]) => (
                            <div key={String(label)}>
                              <span>{label}</span>
                              <strong>
                                {value === null
                                  ? t("لم يقيّم", "Not assessed")
                                  : `${value} / 5`}
                              </strong>
                            </div>
                          ))}
                        </div>
                        <blockquote className="aw-feedback">
                          <p>{e.feedback}</p>
                        </blockquote>
                        {staff &&
                          view.privateNotes?.find(
                            (n) => n.sessionId === e.sessionId,
                          ) && (
                            <details className="aw-private">
                              <summary>
                                {t(
                                  "ملاحظة داخلية — لا تظهر للأسرة",
                                  "Private note — not shared with family",
                                )}
                              </summary>
                              <p>
                                {
                                  view.privateNotes.find(
                                    (n) => n.sessionId === e.sessionId,
                                  )?.body
                                }
                              </p>
                            </details>
                          )}
                        {staff && !e.published && (
                          <button
                            className="aw-button"
                            disabled={busy}
                            onClick={() =>
                              void run({
                                action: "publish",
                                sessionId: e.sessionId,
                              })
                            }
                          >
                            {t(
                              "نشر التقرير والواجب للأسرة",
                              "Publish report & homework to family",
                            )}
                          </button>
                        )}
                      </article>
                    ))}
                </div>
                {!view.evaluations.some((e) =>
                  scopedSessions.some((s) => s.id === e.sessionId),
                ) && (
                  <Empty
                    title={t("لا تقارير متاحة بعد", "No reports available yet")}
                    body={t(
                      "على المعلم توثيق جلسة ماضية ونشرها؛ المسودات والملاحظات الخاصة لا تظهر للأسرة.",
                      "The teacher must record and publish a past lesson. Drafts and private notes are never shared with the family.",
                    )}
                  />
                )}
              </>
            )}

            {tab === "activity" && (
              <>
                <section className="aw-panel">
                  <PanelTitle
                    title={t("إشعارات داخل التجربة", "In-demo notifications")}
                  />
                  {view.notifications.length ? (
                    view.notifications.map((n) => (
                      <article className="aw-notification" key={n.id}>
                        <div>
                          <strong>
                            {en
                              ? ({
                                  enrollment:
                                    "New synthetic enrollment request",
                                  assessment:
                                    "A synthetic placement assessment was recorded",
                                  assignment:
                                    "A demo teacher assignment was updated",
                                  plan_published:
                                    "A learning plan was published",
                                  booking:
                                    "An individual demo lesson was reserved",
                                  reschedule: "A demo lesson was rescheduled",
                                  booking_cancelled:
                                    "A demo lesson was cancelled",
                                  evaluation_published:
                                    "The lesson report and homework were published",
                                  homework_submitted:
                                    "A homework response was submitted",
                                  homework_reviewed:
                                    "Homework feedback is ready",
                                }[n.kind] ?? n.message)
                              : n.message}
                          </strong>
                          <small>{date(n.createdAt)}</small>
                        </div>
                        {n.readAt ? (
                          <Badge>{t("مقروء", "Read")}</Badge>
                        ) : (
                          <button
                            className="aw-button aw-secondary"
                            disabled={busy}
                            onClick={() =>
                              void run({ action: "read", notificationId: n.id })
                            }
                          >
                            {t("تحديد كمقروء", "Mark as read")}
                          </button>
                        )}
                      </article>
                    ))
                  ) : (
                    <Empty
                      title={t("لا إشعارات جديدة", "No notifications yet")}
                      body={t(
                        "تظهر أحداث الخطة والحصص والواجب هنا؛ لا إرسال بريد أو رسائل خارجية.",
                        "Plan, lesson and homework updates appear here. No external emails or messages are sent.",
                      )}
                    />
                  )}
                </section>
                {admin && (
                  <section className="aw-panel aw-section">
                    <PanelTitle
                      title={t("سجل العمليات المحلي", "Local audit trail")}
                    />
                    <div className="aw-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{t("الإجراء", "Action")}</th>
                            <th>{t("المرجع", "Record")}</th>
                            <th>{t("الوقت", "Time")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {view.audits
                            ?.slice(-20)
                            .reverse()
                            .map((a) => (
                              <tr key={a.id}>
                                <td>
                                  <code>{a.action}</code>
                                </td>
                                <td>
                                  <code>{a.entityId ?? "—"}</code>
                                </td>
                                <td>{date(a.createdAt)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="aw-footnote">
                      {t(
                        browserPreview ? "آخر 20 حدثًا اصطناعيًا داخل المتصفح؛ ليست سجلات خادم أو تدقيقًا إنتاجيًا." : "آخر 20 حدثًا، من أحداث الخادم فقط؛ ليس نظام تدقيق إنتاجيًا.",
                        browserPreview ? "Latest 20 synthetic browser events; not server logs or a production audit system." : "Latest 20 server-generated events. This is not a production audit system.",
                      )}
                    </p>
                  </section>
                )}
              </>
            )}

            {tab === "services" && (
              <>
                <section className="aw-panel">
                  <PanelTitle
                    title={t(
                      "اتصال واضح، دون وعود وهمية",
                      "Clear status. No simulated integrations.",
                    )}
                  />
                  <p>
                    {t(
                      browserPreview ? "هذه معاينة متصفح معزولة، بلا وصول للخادم أو مصادقة حقيقية أو RLS أو حفظ سحابي. الشخصيات والسجلات اصطناعية؛ لا تستخدم بيانات شخصية." : "المسار التعليمي يعمل بمحوّل محلي مستقل. البنية الأصلية للهوية وRLS والدفع محفوظة، لكن هذه التجربة ليست متصلة بها أو بالخدمات المستضافة.",
                      browserPreview ? "This isolated browser sandbox has no backend access, real authentication, RLS or cloud storage. All personas and records are synthetic; never use personal information." : "The learning workflow uses an independent local adapter. Existing identity, RLS and payment foundations are preserved, but this demo is not connected to them or to hosted services.",
                    )}
                  </p>
                  <div className="aw-service-grid">
                    {[
                      [
                        t("بيانات الأكاديمية", "Academy data"),
                        t(
                          browserPreview ? "في هذا التبويب فقط · لا حفظ سحابي" : "محلية فقط · محفوظة خادميًا",
                          browserPreview ? "This tab only · no cloud storage" : "Local only · server persisted",
                        ),
                      ],
                      [
                        "Supabase Auth / PostgreSQL",
                        t(
                          "التكامل المستضاف غير متحقق",
                          "Hosted integration not verified",
                        ),
                      ],
                      [
                        "Zoom",
                        t(
                          "معطل · يلزم سر مدوّر واختبار مأذون",
                          "Disabled · rotated secret and authorized test required",
                        ),
                      ],
                      [
                        t("الدفع والتحصيل", "Payments & collection"),
                        t(
                          "معطل · لا تحويل عملة أو محفظة عامة",
                          "Disabled · no currency conversion or public wallet",
                        ),
                      ],
                      [
                        t("الملفات والصوت", "Files & audio"),
                        t(
                          "معطل · التسليم نصي فقط",
                          "Disabled · text submissions only",
                        ),
                      ],
                      [
                        t("البريد والرسائل", "Email & messaging"),
                        t(
                          "معطل · الإشعارات داخلية",
                          "Disabled · in-app notifications only",
                        ),
                      ],
                    ].map(([label, value]) => (
                      <div className="aw-service" key={label}>
                        <strong>{label}</strong>
                        <p>{value}</p>
                      </div>
                    ))}
                  </div>
                </section>
                {!staff && (
                  <section className="aw-panel aw-section">
                    <PanelTitle
                      title={t(
                        "الباقة المعلنة، وليست فاتورة دفع",
                        "Published package, not a payment invoice",
                      )}
                    />
                    <p>
                      {t(
                        "360 / 500 / 650 ريال سعودي شهريًا، 8 حصص فردية. المحتوى والمدة بحسب الباقة؛ لا تفعيل مالي أو تجديد تلقائي داخل التجربة.",
                        "360 / 500 / 650 SAR monthly, 8 individual lessons. Content and duration depend on the package. No financial activation or automatic renewal in the demo.",
                      )}
                    </p>
                    <Link
                      href={`/${locale}/packages`}
                      className="aw-button aw-secondary"
                    >
                      {t("تفاصيل الباقات المعتمدة", "View package details")}
                    </Link>
                    <button className="aw-button" disabled>
                      {t("الدفع غير مفعّل", "Payments disabled")}
                    </button>
                  </section>
                )}
                <section className="aw-panel aw-section">
                  <PanelTitle title={t("إدارة التجربة", "Demo controls")} />
                  <p>
                    {t(
                      "إعادة الضبط تمسح عالم البيانات الاصطناعي في هذا المتصفح فقط وتعيد أمثلة البداية. لا تؤثر في أي قاعدة خارجية.",
                      "Reset removes this browser’s synthetic world and restores the initial examples. It does not affect any external database.",
                    )}
                  </p>
                  <button
                    className="aw-button aw-secondary aw-danger"
                    onClick={() => open({ kind: "reset" })}
                  >
                    {t("إعادة ضبط البيانات التجريبية", "Reset demo data")}
                  </button>
                </section>
              </>
            )}
            <footer className="aw-footer">
              {t(
                "علم وعمل · تعلم فردي، متابعة إنسانية · نسخة محلية غير جاهزة للإطلاق",
                "Elm wa Amal · Individual learning, human guidance · Local version, not ready for launch",
              )}
            </footer>
          </main>
        </div>
      </div>

      {modal && (
        <dialog
          ref={dialog}
          className="aw-dialog"
          onCancel={() => {
            if (!busy) setModal(null);
          }}
          aria-labelledby="aw-dialog-title"
        >
          <form onSubmit={(e) => void submitForm(e)}>
            <div className="aw-dialog-heading">
              <h2 id="aw-dialog-title">{modalTitle}</h2>
              <button
                type="button"
                className="aw-close"
                aria-label={t("إغلاق", "Close")}
                disabled={busy}
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>
            <p className="aw-footnote">
              {t(
                "بيانات اصطناعية فقط. لا تكتب اسمًا أو معلومة شخصية حقيقية.",
                "Synthetic data only. Do not enter real names or personal information.",
              )}
            </p>
            {modal.kind === "reset" && (
              <p>
                {t(
                  "هل تريد حذف تغييرات هذا العالم التجريبي وإعادة أمثلة البداية؟ لا يمكن التراجع عن إعادة الضبط.",
                  "Delete changes in this demo world and restore the initial examples? This reset cannot be undone.",
                )}
              </p>
            )}
            {modal.kind === "enroll" && (
              <>
                {field(
                  "packageId",
                  "الباقة",
                  "Package",
                  <select name="packageId">
                    {view.packages.map((p, i) => (
                      <option key={p.id} value={p.id}>
                        {
                          (en
                            ? [
                                "Quran memorization",
                                "Quran & Noor Al-Bayan",
                                "Quran, Noor & Tajweed",
                              ]
                            : [
                                "تحفيظ القرآن",
                                "القرآن ونور البيان",
                                "القرآن ونور البيان والتجويد",
                              ])[i]
                        }{" "}
                        · {p.price} SAR
                      </option>
                    ))}
                  </select>,
                )}
                <p>
                  {role === "guardian"
                    ? t(
                        "سينشأ ملف طفل تجريبي مرتبط بك فقط، دون تسجيل دخول مستقل.",
                        "A synthetic child profile will be linked to this guardian only, with no independent login.",
                      )
                    : t(
                        "ينشأ طلب اصطناعي للطالب البالغ فقط.",
                        "A synthetic enrollment is created for this adult learner only.",
                      )}
                </p>
                <p>
                  {t(
                    "اختيار الباقة لا يثبت الدفع ولا يفعّل اشتراكًا حقيقيًا.",
                    "Selecting a package does not verify payment or activate a real subscription.",
                  )}
                </p>
              </>
            )}
            {modal.kind === "assess" && (
              <>
                {field(
                  "level",
                  "المستوى الأولي",
                  "Placement level",
                  <select
                    name="level"
                    defaultValue={
                      getAssessment(modal.student.id)?.level ?? "foundation"
                    }
                  >
                    {["foundation", "developing", "confident"].map((l) => (
                      <option value={l} key={l}>
                        {status(l)}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "notes",
                  "ملاحظات التقييم التجريبية",
                  "Demo assessment notes",
                  <textarea
                    name="notes"
                    required
                    minLength={3}
                    maxLength={1000}
                    defaultValue={getAssessment(modal.student.id)?.notes}
                  />,
                )}
              </>
            )}
            {modal.kind === "assign" && (
              <>
                {field(
                  "teacherId",
                  "المعلم التجريبي المتاح",
                  "Available demo teacher",
                  <select name="teacherId" required>
                    {view.teachers?.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {t(
                          "المعلم التجريبي — ليس ملفًا حقيقيًا",
                          "Demo teacher — not a real teacher profile",
                        )}
                      </option>
                    ))}
                  </select>,
                )}
                <p>
                  {t(
                    browserPreview ? "الإسناد يحاكي علاقة المعلم بالملف داخل بيانات التجربة فقط." : "الإسناد يحدد صلاحية المعلم لهذا الملف على الخادم.",
                    browserPreview ? "Assignment simulates the teacher relationship within synthetic browser data only." : "The assignment scopes this teacher’s server-side access to the learner.",
                  )}
                </p>
              </>
            )}
            {modal.kind === "plan" && (
              <>
                {field(
                  "goal",
                  "هدف الخطة",
                  "Learning goal",
                  <textarea
                    name="goal"
                    required
                    minLength={3}
                    maxLength={1000}
                    defaultValue={getPlan(modal.student.id)?.goal}
                  />,
                )}
                {referenceFields(getPlan(modal.student.id)?.reference)}
                <label className="aw-check">
                  <input
                    name="published"
                    type="checkbox"
                    defaultChecked={getPlan(modal.student.id)?.published}
                  />
                  {t(
                    "نشر الخطة للأسرة والسماح بالحجز التجريبي",
                    "Publish the plan to the family and allow demo booking",
                  )}
                </label>
              </>
            )}
            {modal.kind === "book" && (
              <>
                {slotSelect(modal.student.id)}
                <p>
                  {studentName(modal.student.id)} · <bdi>{timezone}</bdi>
                </p>
                <p>
                  {t(
                    browserPreview ? "تُحاكى قواعد التوفر والتعارض داخل هذا التبويب فقط؛ لا حجز حقيقي أو رصيد مالي." : "يفحص الخادم التوفر وتعارض الطالب والمعلم قبل الحفظ. الحجز لا يستهلك رصيدًا.",
                    browserPreview ? "Availability and conflict rules are simulated in this tab only; there are no shared real bookings or financial entitlements." : "The server checks teacher and learner conflicts before saving. Booking does not consume a lesson entitlement.",
                  )}
                </p>
              </>
            )}
            {modal.kind === "reschedule" && (
              <>
                {slotSelect(modal.session.studentId, modal.session.id)}
                {field(
                  "reason",
                  "سبب النقل",
                  "Reason for change",
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                  />,
                )}
                <p>
                  {t(
                    "لا يُحرر الموعد القديم إلا عند ضمان الموعد الجديد.",
                    "The old slot is released only after the new one is secured.",
                  )}
                </p>
              </>
            )}
            {modal.kind === "cancel" && (
              <>
                <p>
                  {date(modal.session.startsAt)} ·{" "}
                  {studentName(modal.session.studentId)}
                </p>
                {field(
                  "reason",
                  "سبب الإلغاء",
                  "Cancellation reason",
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                  />,
                )}
                <p>
                  {t(
                    "يُحفظ سجل الإلغاء. لا رسوم أو خصم مالي في التجربة.",
                    "Cancellation stays in the history. No fees or financial deductions occur in the demo.",
                  )}
                </p>
              </>
            )}
            {modal.kind === "evaluate" && (
              <>
                {field(
                  "attendance",
                  "الحضور",
                  "Attendance",
                  <select name="attendance">
                    <option value="present">{t("حاضر", "Present")}</option>
                    <option value="absent">{t("غائب", "Absent")}</option>
                    <option value="technical">
                      {t("عطل تقني", "Technical incident")}
                    </option>
                  </select>,
                )}
                {referenceFields(getPlan(modal.session.studentId)?.reference)}
                <fieldset className="aw-scores">
                  <legend>
                    {t(
                      "مقياس تجريبي 1–5؛ اترك الفارغ دون تقييم",
                      "Demo scale 1–5; leave blank for not assessed",
                    )}
                  </legend>
                  {[
                    ["memorization", t("الحفظ", "Memorization")],
                    [
                      "tajweed",
                      t("التجويد — باقة 650 فقط", "Tajweed — package 650 only"),
                    ],
                    ["makharij", t("المخارج", "Makharij")],
                    ["fluency", t("الطلاقة", "Fluency")],
                  ].map(([key, label]) => (
                    <label className="aw-field" key={key}>
                      {label}
                      <input
                        type="number"
                        name={key}
                        min="1"
                        max="5"
                        step="1"
                        disabled={
                          key === "tajweed" &&
                          modal.session.packageId !== "complete"
                        }
                      />
                    </label>
                  ))}
                </fieldset>
                {field(
                  "feedback",
                  "تعليق يظهر للأسرة عند النشر",
                  "Feedback shared with the family when published",
                  <textarea
                    name="feedback"
                    required
                    minLength={3}
                    maxLength={1000}
                  />,
                )}
                {field(
                  "privateNote",
                  "ملاحظة خاصة بالمعلم والإدارة",
                  "Private note for teacher and administration",
                  <textarea name="privateNote" maxLength={1000} />,
                )}
                {field(
                  "homeworkTitle",
                  "الواجب وخطوة المراجعة التالية",
                  "Homework & next revision task",
                  <textarea
                    name="homeworkTitle"
                    required
                    minLength={3}
                    maxLength={500}
                  />,
                )}
                {field(
                  "homeworkDue",
                  "تاريخ تسليم الواجب (12:00 UTC)",
                  "Homework due date (12:00 UTC)",
                  <input
                    name="homeworkDue"
                    type="date"
                    required
                    min={new Date(clock).toISOString().slice(0, 10)}
                  />,
                )}
                <label className="aw-check">
                  <input name="published" type="checkbox" />
                  {t(
                    "نشر التقرير والواجب الآن؛ دون ذلك يحفظان مسودة",
                    "Publish report and homework now; otherwise save a draft",
                  )}
                </label>
              </>
            )}
            {modal.kind === "submit" &&
              field(
                "response",
                "وصف الإنجاز التجريبي أو إجابة الواجب",
                "Demo completion note or homework response",
                <textarea
                  name="response"
                  required
                  minLength={3}
                  maxLength={2000}
                />,
              )}
            {modal.kind === "review" &&
              field(
                "feedback",
                "تعليق مراجعة المعلم",
                "Teacher review feedback",
                <textarea
                  name="feedback"
                  required
                  minLength={3}
                  maxLength={1000}
                />,
              )}
            {error && (
              <p className="aw-error" role="alert">
                {error}
              </p>
            )}
            <div className="aw-dialog-actions">
              <button className="aw-button" type="submit" disabled={busy}>
                {busy
                  ? t("جارٍ الحفظ…", "Saving…")
                  : modal.kind === "cancel"
                    ? t("تأكيد الإلغاء المحلي", "Confirm local cancellation")
                    : modal.kind === "reset"
                      ? t("تأكيد إعادة الضبط", "Confirm reset")
                      : t("حفظ في التجربة المحلية", "Save to local demo")}
              </button>
              <button
                className="aw-button aw-secondary"
                type="button"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                {t("رجوع", "Back")}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </div>
  );
}
function Badge({ children }: { children: ReactNode }) {
  return <span className="aw-badge">{children}</span>;
}
function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="aw-empty">
      <span aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
function PanelTitle({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="aw-panel-title">
      <h2>{title}</h2>
      {aside}
    </div>
  );
}
function JourneySteps({
  assessment,
  assignment,
  plan,
  lesson,
  report,
  en,
}: {
  assessment: boolean;
  assignment: boolean;
  plan: boolean;
  lesson: boolean;
  report: boolean;
  en: boolean;
}) {
  return (
    <ol className="aw-steps">
      {[
        [assessment, en ? "Assessment" : "تقييم"],
        [assignment, en ? "Teacher" : "معلم"],
        [plan, en ? "Plan" : "خطة"],
        [lesson, en ? "Lesson" : "حصة"],
        [report, en ? "Progress" : "تقدم"],
      ].map(([done, label], i) => (
        <li key={String(label)} className={done ? "done" : ""}>
          <span aria-hidden="true">{done ? "✓" : i + 1}</span>
          <small>{label}</small>
          <span className="aw-sr-only">
            {done
              ? en
                ? " complete"
                : " مكتمل"
              : en
                ? " pending"
                : " قيد الانتظار"}
          </span>
        </li>
      ))}
    </ol>
  );
}
function Pagination({
  page,
  total,
  size,
  onChange,
  en,
}: {
  page: number;
  total: number;
  size: number;
  onChange: (n: number) => void;
  en: boolean;
}) {
  if (total <= size) return null;
  const pages = Math.ceil(total / size);
  return (
    <nav className="aw-pagination" aria-label={en ? "Pagination" : "الصفحات"}>
      <button
        className="aw-button aw-secondary"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        {en ? "Previous" : "السابق"}
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        className="aw-button aw-secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        {en ? "Next" : "التالي"}
      </button>
    </nav>
  );
}
