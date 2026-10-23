import { createHash } from "node:crypto";
import { teacherInviteConfig } from "@/lib/academy/teacher-invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Pragma": "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  Vary: "Host, Accept-Language",
};

function jsonForScript(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
    "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029",
  }[character]!));
}

function htmlText(value: string) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
}

export async function GET(request: Request) {
  const config = teacherInviteConfig(request);
  if (!config) return new Response("Not found", { status: 404, headers: BASE_HEADERS });

  const language = request.headers.get("accept-language")?.trim().toLowerCase().startsWith("en") ? "en" : "ar";
  const isEnglish = language === "en";
  const copy = isEnglish ? {
    kicker: "TEACHER INVITATION · SECURE SETUP",
    title: "Set your account password",
    intro: "This page accepts a valid, single-use teacher invitation only. Public registration is unavailable.",
    verifying: "Checking your invitation…",
    invitedTo: "Invitation for",
    password: "New password",
    confirm: "Confirm new password",
    submit: "Set password",
    submitting: "Saving password…",
    invalid: "This invitation link is invalid or expired. Ask the academy to check it before sending any replacement invitation.",
    passwordShort: "Use at least 8 characters.",
    mismatch: "The passwords do not match.",
    rejected: "The password was not accepted. Check the requirements and try again.",
    uncertain: "We could not confirm whether the password was saved. Do not submit this invitation again; contact the academy to check the account.",
    success: "Your password is set. This step does not create a teacher profile or grant access to the teacher workspace. The academy must approve and assign the account separately.",
    reviewBadge: "READ-ONLY REVIEW · NO INVITATION OR ACCOUNT",
    reviewStatus: "This is a display-only preview of the password setup screen. No invitation, account, or password change exists.",
    reviewEmail: "The invited email address will appear here after the invitee opens their own invitation link.",
    footer: "Only the invitation recipient can complete this step. No password is sent to the academy.",
  } : {
    kicker: "دعوة المعلم · إعداد آمن",
    title: "أنشئ كلمة مرور لحسابك",
    intro: "تقبل هذه الصفحة رابط دعوة معلم صالحًا لمرة واحدة فقط. التسجيل العام غير متاح.",
    verifying: "جارٍ التحقق من الدعوة…",
    invitedTo: "الدعوة موجّهة إلى",
    password: "كلمة المرور الجديدة",
    confirm: "تأكيد كلمة المرور الجديدة",
    submit: "حفظ كلمة المرور",
    submitting: "جارٍ حفظ كلمة المرور…",
    invalid: "رابط الدعوة غير صالح أو منتهي. اطلب من الأكاديمية التحقق منه قبل إرسال أي دعوة بديلة.",
    passwordShort: "استخدم ٨ أحرف على الأقل.",
    mismatch: "كلمتا المرور غير متطابقتين.",
    rejected: "لم تُقبل كلمة المرور. تحقّق من المتطلبات ثم حاول مرة أخرى.",
    uncertain: "تعذّر التأكد من حفظ كلمة المرور. لا تعاود إرسال هذه الدعوة؛ تواصل مع الأكاديمية للتحقق من الحساب.",
    success: "تم ضبط كلمة المرور. لا تنشئ هذه الخطوة ملفًا للمعلم ولا تمنح وصولًا إلى مساحة المعلم؛ يجب على الأكاديمية اعتماد الحساب وتعيينه بصورة مستقلة.",
    reviewBadge: "معاينة للقراءة فقط · لا توجد دعوة أو حساب",
    reviewStatus: "هذه معاينة شكلية لشاشة إعداد كلمة المرور. لا توجد دعوة أو حساب أو عملية تغيير كلمة مرور.",
    reviewEmail: "سيظهر البريد المدعو هنا عندما يفتح صاحبه رابط دعوته.",
    footer: "يستطيع مستلم الدعوة وحده إكمال هذه الخطوة. لا تُرسل كلمة المرور إلى الأكاديمية.",
  };

  const pageConfig = { projectUrl: config.projectUrl, apiKey: config.apiKey, approvedEmail: config.approvedEmail, reviewOnly: config.reviewOnly };
  const script = `(() => {
"use strict";
const CFG = ${jsonForScript(pageConfig)};
const COPY = ${jsonForScript(copy)};
const status = document.getElementById("invite-status");
const email = document.getElementById("invite-email");
const form = document.getElementById("invite-form");
const password = document.getElementById("invite-password");
const confirm = document.getElementById("invite-confirm");
const submit = document.getElementById("invite-submit");
const note = document.getElementById("invite-note");
let accessToken = "";
let dispatched = false;
const tokenPattern = /^[A-Za-z0-9_.-]{20,4000}$/;
function showInvalid() { status.textContent = COPY.invalid; status.setAttribute("role", "alert"); }
function headers() { return { apikey: CFG.apiKey, Authorization: "Bearer " + accessToken }; }
if (CFG.reviewOnly) {
  document.getElementById("review-badge").hidden = false;
  status.textContent = COPY.reviewStatus;
  email.textContent = COPY.reviewEmail;
  email.hidden = false;
  form.hidden = false;
  for (const field of form.querySelectorAll("input,button")) field.disabled = true;
  note.hidden = false;
} else {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const inviteType = fragment.get("type");
  const candidate = fragment.get("access_token") || "";
  const hasAuthError = fragment.has("error") || fragment.has("error_code") || fragment.has("error_description");
  history.replaceState(null, "", window.location.pathname);
  if (hasAuthError || inviteType !== "invite" || !tokenPattern.test(candidate)) {
    showInvalid();
  } else {
    accessToken = candidate;
    fetch(CFG.projectUrl + "/auth/v1/user", {
      method: "GET", headers: headers(), cache: "no-store", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer"
    }).then(async response => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => {
        const invitedEmail = body && body.email;
        if (!response.ok || !body || typeof invitedEmail !== "string" || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(invitedEmail) || invitedEmail.trim().toLowerCase() !== CFG.approvedEmail) {
          accessToken = "";
          showInvalid();
          return;
        }
        email.textContent = COPY.invitedTo + ": " + invitedEmail;
        email.hidden = false;
        status.textContent = "";
        form.hidden = false;
        password.focus();
      }).catch(() => { accessToken = ""; showInvalid(); });
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (dispatched || !accessToken) return;
    if ([...password.value].length < 8) { status.textContent = COPY.passwordShort; password.focus(); return; }
    if (password.value !== confirm.value) { status.textContent = COPY.mismatch; confirm.focus(); return; }
    dispatched = true;
    submit.disabled = true;
    status.textContent = COPY.submitting;
    try {
      const response = await fetch(CFG.projectUrl + "/auth/v1/user", {
        method: "PUT",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.value }),
        cache: "no-store", redirect: "error", credentials: "omit", referrerPolicy: "no-referrer"
      });
      if (response.ok) {
        accessToken = "";
        password.value = "";
        confirm.value = "";
        form.hidden = true;
        status.textContent = COPY.success;
        status.setAttribute("role", "status");
      } else if (response.status >= 400 && response.status < 500 && response.status !== 401) {
        dispatched = false;
        submit.disabled = false;
        password.value = "";
        confirm.value = "";
        status.textContent = COPY.rejected;
        password.focus();
      } else {
        accessToken = "";
        password.value = "";
        confirm.value = "";
        status.textContent = COPY.uncertain;
        status.setAttribute("role", "alert");
      }
    } catch {
      accessToken = "";
      password.value = "";
      confirm.value = "";
      status.textContent = COPY.uncertain;
      status.setAttribute("role", "alert");
    }
  });
}
})();`;

  const cspHash = createHash("sha256").update(script).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${cspHash}'; style-src 'unsafe-inline'; connect-src ${config.projectUrl}; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; img-src 'none'; font-src 'none'`;
  const dir = isEnglish ? "ltr" : "rtl";
  const review = config.reviewOnly ? `<p id="review-badge" class="review-badge">${htmlText(copy.reviewBadge)}</p>` : `<p id="review-badge" class="review-badge" hidden>${htmlText(copy.reviewBadge)}</p>`;
  const html = `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${htmlText(copy.title)} | Elm Wa Amal Academy</title>
<style>
:root{color-scheme:light;--green:#145c4a;--deep:#0c3e34;--gold:#88631e;--cream:#f7f4ed}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:var(--cream);color:#18332c;font:16px/1.65 Arial,sans-serif}.shell{width:min(680px,calc(100% - 28px));margin:0 auto;padding:32px 0 48px}.brand{border-bottom:1px solid #d8d0bd;padding:0 0 22px;margin-bottom:28px}.kicker{margin:0;color:var(--gold);font-size:.75rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.brand h1{margin:.35rem 0;color:var(--deep);font:700 clamp(1.9rem,5vw,3rem)/1.15 Georgia,serif}.card{background:#fff;border:1px solid #e2dbc9;border-radius:18px;box-shadow:0 10px 30px rgba(27,59,49,.06);padding:clamp(20px,5vw,38px)}.intro,.muted,.foot{color:#60776e;line-height:1.7}.status{padding:12px 14px;border-radius:10px;background:#f8faf7;color:var(--deep)}.status[role=alert]{background:#fff4e9;border:1px solid #dfb98a;color:#7d4423}.email{font-weight:700;color:var(--deep);overflow-wrap:anywhere}.form{display:grid;gap:17px;margin-top:20px}.form label{display:grid;gap:7px;font-weight:700;color:var(--deep)}.form input{width:100%;border:1px solid #cfd8cf;border-radius:9px;padding:12px 13px;background:#fcfdfb;font:inherit;color:var(--deep)}.form input:focus{outline:3px solid #d9bd75;border-color:var(--gold)}.form button{border:0;border-radius:999px;padding:12px 18px;background:var(--green);color:#fff;font:700 1rem Arial,sans-serif;cursor:pointer}.form button:disabled{opacity:.55;cursor:not-allowed}.review-badge{padding:9px 12px;border:1px solid #d8c58d;border-radius:9px;background:#fff9e9;color:#6d5117;font-size:.85rem;font-weight:800}.foot{margin:20px 4px 0;font-size:.88rem} [hidden]{display:none!important}
</style>
</head>
<body><main class="shell"><header class="brand"><p class="kicker">${htmlText(copy.kicker)}</p><h1>${htmlText(copy.title)}</h1></header><section class="card" aria-labelledby="invite-title">${review}<h2 id="invite-title" hidden>${htmlText(copy.title)}</h2><p class="intro">${htmlText(copy.intro)}</p><p id="invite-status" class="status" role="status" aria-live="polite">${htmlText(copy.verifying)}</p><p id="invite-email" class="email" hidden></p><form id="invite-form" class="form" autocomplete="on" hidden><label for="invite-password">${htmlText(copy.password)}<input id="invite-password" name="new-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label for="invite-confirm">${htmlText(copy.confirm)}<input id="invite-confirm" name="confirm-password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><button id="invite-submit" type="submit">${htmlText(copy.submit)}</button></form><p id="invite-note" class="foot" ${config.reviewOnly ? "" : "hidden"}>${htmlText(config.reviewOnly ? copy.footer : copy.success)}</p></section><p class="foot">${htmlText(copy.footer)}</p></main><script>${script}</script></body></html>`;

  return new Response(html, { status: 200, headers: { ...BASE_HEADERS, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": csp } });
}
