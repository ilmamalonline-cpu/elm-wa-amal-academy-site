"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Locale } from "@/content/site";

type Child = { id: string; display_name: string; birth_year: number };
type Guardian = { id: string; display_name: string; locale: Locale };
type FamilyState = { guardian: Guardian | null; children: Child[]; authenticated?: boolean };
type Mode = "login" | "signup";
type ChildDraft = { display_name: string; birth_year: string };

const errorCopy: Record<string, [string, string]> = {
  invalid_input: ["راجع البيانات المطلوبة وحاول مرة أخرى.", "Check the required details and try again."],
  invalid_request: ["تعذر فهم الطلب. راجع البيانات وحاول مرة أخرى.", "The request could not be understood. Check the details and try again."],
  configuration_required: ["التسجيل غير مهيأ في هذه المراجعة المحلية.", "Registration is not configured for this local review."],
  email_confirmation_configuration_required: ["تأكيد البريد الإلكتروني غير مهيأ لهذه المراجعة المحلية.", "Email confirmation is not configured for this local review."],
  registration_disabled: ["التسجيل معطل حاليًا.", "Registration is currently disabled."],
  signup_disabled: ["إنشاء الحساب قيد الإعداد في Preview؛ استخدم تسجيل الدخول بعد التحقق.", "Preview signup is being prepared; use sign in after verification."],
  local_review_only: ["هذه الواجهة متاحة للمراجعة المحلية فقط.", "This interface is available for local review only."],
  csrf_required: ["تعذر التحقق من مصدر الطلب. أعد تحميل الصفحة.", "The request origin could not be verified. Reload the page."],
  same_origin_required: ["يجب أن يأتي الطلب من هذه الصفحة.", "The request must come from this page."],
  consent_required: ["الموافقة مطلوبة لإكمال العملية.", "Consent is required to continue."],
  invalid_birth_year: ["راجع سنة الميلاد.", "Check the birth year."],
  authentication_failed: ["تعذر التحقق من بيانات الدخول.", "The sign-in details could not be verified."],
  email_confirmation_required: ["أكد بريدك الإلكتروني قبل تسجيل الدخول.", "Confirm your email before signing in."],
  sign_in_required: ["سجل الدخول لإكمال هذا الإجراء.", "Sign in to continue."],
  provider_unavailable: ["الخدمة المحلية غير متاحة الآن. حاول لاحقًا.", "The local service is unavailable. Try again later."],
  persistence_unavailable: ["تعذر حفظ التغيير. حاول مرة أخرى.", "The change could not be saved. Try again."],
  try_later: ["محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.", "Too many attempts. Wait a moment and try again."],
  invalid_credentials: ["تعذر تسجيل الدخول بهذه البيانات.", "Those sign-in details could not be verified."],
  email_exists: ["هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.", "That email is already registered. Try signing in."],
  confirmation_required: ["تم استلام الطلب. راجع بريدك الإلكتروني للتأكيد.", "Request received. Check your email for confirmation."],
  network: ["تعذر الاتصال بالخادم المحلي. حاول مرة أخرى.", "The local server could not be reached. Try again."],
  forbidden: ["هذا الإجراء غير متاح لهذا الحساب.", "This action is not available for this account."],
  not_found: ["لم يتم العثور على السجل. حدّث الصفحة.", "The record was not found. Refresh the page."],
};

export function FamilyRegistration({ locale, preview = false, previewSignupEnabled = true }: { locale: Locale; preview?: boolean; previewSignupEnabled?: boolean }) {
  const en = locale === "en";
  const t = (ar: string, english: string) => (en ? english : ar);
  const [family, setFamily] = useState<FamilyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [guardianLocale, setGuardianLocale] = useState<Locale>(locale);
  const [consent, setConsent] = useState(false);
  const [childDraft, setChildDraft] = useState<ChildDraft>({ display_name: "", birth_year: "" });
  const [editingId, setEditingId] = useState<string | null>(null);

  const message = useCallback((code: string) => {
    return errorCopy[code]?.[en ? 1 : 0] ?? (en
      ? "The action could not be completed. Check the details and try again."
      : "لم يكتمل الإجراء. راجع البيانات وحاول مرة أخرى.");
  }, [en]);

  const request = useCallback(async (init?: RequestInit) => {
    try {
      return await fetch("/api/family", { ...init, cache: "no-store", headers: { ...(init?.headers || {}), "X-Family-Registration": "local-review" } });
    } catch {
      throw new Error("network");
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await request();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "network");
      setFamily(data);
      if (data.guardian) { setDisplayName(data.guardian.display_name); setGuardianLocale(data.guardian.locale); }
      setError("");
    } catch (cause) {
      if (cause instanceof Error && cause.message === "sign_in_required") setFamily({ authenticated: false, guardian: null, children: [] });
      setError(message(cause instanceof Error ? cause.message : "network"));
    } finally {
      setLoading(false);
    }
  }, [message, request]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await request();
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "network");
        if (!cancelled) {
          setFamily(data); setError(""); setLoading(false);
          if (data.guardian) { setDisplayName(data.guardian.display_name); setGuardianLocale(data.guardian.locale); }
        }
      } catch (cause) {
        if (!cancelled) { setError(message(cause instanceof Error ? cause.message : "network")); setLoading(false); }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [message, request]);

  async function run(action: Record<string, unknown>, success?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "network");
      if (success) setNotice(success);
      if (action.action === "signup") {
        setPassword("");
        setEmail("");
        setDisplayName("");
        setConsent(false);
        setMode("login");
      }
      await refresh();
      return true;
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "network";
      if (["sign_in_required", "email_confirmation_required", "authentication_failed"].includes(code)) {
        setFamily({ authenticated: false, guardian: null, children: [] });
        setMode("login");
      }
      setError(message(code));
      return false;
    } finally { setBusy(false); }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup" && !consent) { setError(t("أكد موافقتك على الشروط قبل إنشاء الحساب.", "Confirm your agreement before creating an account.")); return; }
    const action = mode === "signup"
      ? { action: "signup", email: email.trim(), password, display_name: displayName.trim(), locale: guardianLocale, consent: true }
      : { action: "login", email: email.trim(), password };
    if (mode === "login") setPassword("");
    await run(action,
      mode === "signup" ? t("تم استلام الطلب. راجع بريدك الإلكتروني للتأكيد قبل تسجيل الدخول.", "Request received. Check your email for confirmation before signing in.") : t("تم تسجيل الدخول.", "Signed in."));
  }

  async function saveGuardian(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consent) { setError(t("أكد موافقتك على الشروط لإكمال الملف.", "Confirm your agreement to complete your profile.")); return; }
    await run({ action: "save-guardian", display_name: displayName.trim(), locale: guardianLocale, consent: true }, t("تم تحديث ملف ولي الأمر.", "Guardian profile updated."));
  }

  async function saveChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { display_name: childDraft.display_name.trim(), birth_year: Number(childDraft.birth_year) };
    const saved = await run(editingId ? { action: "update-child", id: editingId, ...payload } : { action: "add-child", ...payload }, editingId ? t("تم تحديث ملف الطفل.", "Child profile updated.") : t("تمت إضافة الطفل.", "Child added."));
    if (saved) { setChildDraft({ display_name: "", birth_year: "" }); setEditingId(null); }
  }

  const currentYear = new Date().getFullYear();
  const childCount = family?.children.length ?? 0;
  const intro = useMemo(() => en ? "Manage guardian details and the children linked to your learning workspace." : "أدر بيانات ولي الأمر والأطفال المرتبطين بمساحة التعلم الخاصة بك.", [en]);

  if (loading) return <main className="family-page" aria-busy="true"><div className="family-shell"><p className="family-muted">{t("جارٍ تحميل مساحة الأسرة…", "Loading family workspace…")}</p></div></main>;

  return (
    <main className="family-page" dir={en ? "ltr" : "rtl"}>
      <div className="family-shell">
        <header className="family-header">
          <div><p className="family-kicker">{t("مساحة الأسرة", "FAMILY SPACE")}</p><h1>{t("تسجيل الأسرة وإدارة الأطفال", "Family registration & children")}</h1><p className="family-muted">{intro}</p></div>
          <span className="family-review-badge">{preview ? t("مراجعة المالك في Preview فقط", "OWNER PREVIEW ONLY") : t("مراجعة محلية فقط", "LOCAL REVIEW ONLY")}</span>
        </header>
        {(error || notice) && <div className={error ? "family-alert family-alert-error" : "family-alert family-alert-success"} role="status" aria-live="polite">{error || notice}</div>}

        {!family?.guardian && !family?.authenticated ? (
          <section className="family-auth-grid" aria-label={t("تسجيل الأسرة", "Family access")}>
            <div className="family-panel family-auth-panel">
              <div className="family-tabs" role="tablist" aria-label={t("نوع الوصول", "Access type")}>
                <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setError(""); }}>{t("تسجيل الدخول", "Sign in")}</button>
                <button type="button" role="tab" aria-selected={mode === "signup"} disabled={preview && !previewSignupEnabled} className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(""); }}>{t("إنشاء حساب ولي الأمر", "Create guardian account")}</button>
              </div>
              <form onSubmit={submitAuth} className="family-form">
                {preview && !previewSignupEnabled && <p className="family-muted" role="note">{t("إنشاء الحساب قيد الإعداد في Preview؛ استخدم تسجيل الدخول بعد التحقق.", "Preview signup is being prepared; use sign in after verification.")}</p>}
                {mode === "signup" && <label>{t("اسم ولي الأمر", "Guardian name")}<input name="display_name" autoComplete="name" required minLength={2} maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>}
                <label>{t("البريد الإلكتروني", "Email")}<input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                <label>{t("كلمة المرور", "Password")}<input name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /><small>{t("12 حرفًا على الأقل، وبحد أقصى 128 حرفًا.", "At least 12 characters, maximum 128.")}</small></label>
                {mode === "signup" && <><label>{t("لغة الحساب", "Account language")}<select value={guardianLocale} onChange={(e) => setGuardianLocale(e.target.value as Locale)}><option value="ar">العربية</option><option value="en">English</option></select></label><label className="family-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>{t("أقر بأنني ولي أمر بالغ، وأوافق على استخدام هذه البيانات لإنشاء مساحة الأسرة. راجع شروط الخصوصية للمزيد.", "I attest that I am an adult guardian and consent to using these details to create a family workspace. See the privacy terms for more.")}</span></label></>}
                <button className="family-button" type="submit" disabled={busy}>{busy ? t("جارٍ التنفيذ…", "Working…") : mode === "signup" ? t("إنشاء الحساب", "Create account") : t("تسجيل الدخول", "Sign in")}</button>
              </form>
              <p className="family-footnote">{t("الأطفال لا يسجلون الدخول؛ تظل ملفاتهم تحت إدارة ولي الأمر.", "Children do not sign in; their profiles remain guardian-managed.")}</p>
            </div>
            <aside className="family-panel family-note"><h2>{t("مساحة منفصلة وآمنة", "A separate, focused workspace")}</h2><p>{t("هذه المساحة مخصصة لملفات الأسرة فقط. المنهج يديره المعلم ولا يتم استيراده هنا.", "This workspace is for family profiles only. Teachers manage curriculum; nothing is imported here.")}</p><p>{t(preview ? "هذه مساحة Preview خاصة بالمالك فقط؛ لا تُعرض هوية البريد المسموح." : "الدفع الحقيقي وZoom معطلان في هذه المراجعة المحلية.", preview ? "This is a private owner-only Preview; the allowed email identity is not exposed." : "Real payments and Zoom are disabled in this local review.")}</p></aside>
          </section>
        ) : family?.authenticated && !family.guardian ? (
          <section className="family-panel family-profile-completion">
            <p className="family-kicker">{t("خطوة أخيرة", "ONE MORE STEP")}</p>
            <h2>{t("أكمل ملف ولي الأمر", "Complete your guardian profile")}</h2>
            <p className="family-muted">{t("تم تسجيل الدخول. أضف هذه البيانات والموافقة لإدارة ملفات الأطفال.", "You are signed in. Add these details and consent to manage child profiles.")}</p>
            <form onSubmit={saveGuardian} className="family-form">
              <label>{t("اسم ولي الأمر", "Guardian name")}<input name="display_name" autoComplete="name" required minLength={2} maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
              <label>{t("لغة الحساب", "Account language")}<select value={guardianLocale} onChange={(e) => setGuardianLocale(e.target.value as Locale)}><option value="ar">العربية</option><option value="en">English</option></select></label>
              <label className="family-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>{t("أؤكد أنني ولي الأمر المخول بإدارة هذه الملفات.", "I confirm that I am the authorized guardian managing these profiles.")}</span></label>
              <button className="family-button" disabled={busy} type="submit">{t("إكمال الملف", "Complete profile")}</button>
            </form>
          </section>
        ) : family?.guardian ? (
          <section className="family-dashboard">
            <div className="family-dashboard-top"><div><p className="family-kicker">{t("مرحبًا", "WELCOME")}</p><h2>{family.guardian.display_name}</h2><p className="family-muted">{t(`${childCount} ملف طفل تحت إدارة ولي الأمر`, `${childCount} guardian-managed child profile${childCount === 1 ? "" : "s"}`)}</p></div><button type="button" className="family-button family-button-secondary" disabled={busy} onClick={() => void run({ action: "logout" }, t("تم تسجيل الخروج.", "Signed out."))}>{t("تسجيل الخروج", "Sign out")}</button></div>
            <div className="family-dashboard-grid">
              <section className="family-panel"><div className="family-panel-heading"><div><h2>{t("بيانات ولي الأمر", "Guardian details")}</h2><p className="family-muted">{t("يمكنك تحديث الاسم واللغة في أي وقت.", "Update your name and language at any time.")}</p></div></div><form onSubmit={saveGuardian} className="family-form"><label>{t("اسم ولي الأمر", "Guardian name")}<input name="display_name" autoComplete="name" required minLength={2} maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label><label>{t("لغة الحساب", "Account language")}<select value={guardianLocale} onChange={(e) => setGuardianLocale(e.target.value as Locale)}><option value="ar">العربية</option><option value="en">English</option></select></label><label className="family-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /><span>{t("أؤكد أنني ولي الأمر المخول بإدارة هذه الملفات.", "I confirm that I am the authorized guardian managing these profiles.")}</span></label><button className="family-button" disabled={busy} type="submit">{t("حفظ التغييرات", "Save changes")}</button></form></section>
              <section className="family-panel"><div className="family-panel-heading"><div><h2>{t("ملفات الأطفال", "Children")}</h2><p className="family-muted">{t("أضف أو حدّث ملفات الأطفال دون تسجيل دخول لهم.", "Add or update children without child sign-in.")}</p></div><span className="family-count">{childCount}</span></div>{family.children.length ? <ul className="family-children">{family.children.map((child) => <li key={child.id}><div><strong>{child.display_name}</strong><small>{t("سنة الميلاد", "Birth year")}: {child.birth_year}</small></div><div className="family-row-actions"><button type="button" className="family-text-button" onClick={() => { setEditingId(child.id); setChildDraft({ display_name: child.display_name, birth_year: String(child.birth_year) }); }}>{t("تعديل", "Edit")}</button><button type="button" className="family-text-button family-danger" disabled={busy} onClick={() => void run({ action: "delete-child", id: child.id }, t("تم حذف ملف الطفل.", "Child profile deleted."))}>{t("حذف", "Delete")}</button></div></li>)}</ul> : <p className="family-empty">{t("لم تضف ملفات أطفال بعد.", "No child profiles yet.")}</p>}<form onSubmit={saveChild} className="family-form family-child-form"><h3>{editingId ? t("تعديل الملف", "Edit profile") : t("إضافة طفل", "Add a child")}</h3><label>{t("اسم الطفل", "Child name")}<input name="child_display_name" autoComplete="off" required minLength={2} maxLength={100} value={childDraft.display_name} onChange={(e) => setChildDraft({ ...childDraft, display_name: e.target.value })} /></label><label>{t("سنة الميلاد", "Birth year")}<input name="birth_year" type="number" inputMode="numeric" min={currentYear - 18} max={currentYear} required value={childDraft.birth_year} onChange={(e) => setChildDraft({ ...childDraft, birth_year: e.target.value })} /></label><div className="family-row-actions"><button className="family-button" disabled={busy} type="submit">{editingId ? t("حفظ الملف", "Save profile") : t("إضافة الملف", "Add profile")}</button>{editingId && <button type="button" className="family-button family-button-secondary" onClick={() => { setEditingId(null); setChildDraft({ display_name: "", birth_year: "" }); }}>{t("إلغاء", "Cancel")}</button>}</div></form></section>
            </div>
          </section>
        ) : null}
        <footer className="family-footer">{t("هذه واجهة مراجعة محلية اصطناعية فقط؛ لا تُدخل بيانات شخصية حقيقية.", "Synthetic local-review interface only; do not enter real personal data.")}</footer>
      </div>
    </main>
  );
}
