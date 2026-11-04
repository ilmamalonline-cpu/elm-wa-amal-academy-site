import { createHash } from "node:crypto";
import { familyMode, familyProductionConfig, previewShare, PREVIEW_CALLBACK_HOST } from "@/lib/academy/family-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const CALLBACK_PATH = "/auth/family/callback";
const previewScript = 'history.replaceState(null,"",location.pathname);';
const productionScript = `(()=>{let recoveryToken="";const params=new URLSearchParams(location.hash.slice(1));const type=params.get("type");const supplied=params.get("access_token");const error=params.get("error");history.replaceState(null,"",location.pathname);const status=document.getElementById("status");const form=document.getElementById("recovery");if(error){status.textContent="تعذر إكمال الرابط. اطلب رابطًا جديدًا إذا كنت تستعيد كلمة المرور. / The link could not be completed. Request a new one if you are resetting your password.";}else if(type==="recovery"&&supplied){recoveryToken=supplied;form.hidden=false;status.textContent="اختر كلمة مرور جديدة. / Choose a new password.";}else if(type==="signup"||type==="email"){status.textContent="تمت معالجة رابط التأكيد. سجّل الدخول يدويًا؛ لم يتم تسجيل دخولك تلقائيًا. / The confirmation link was processed. Sign in manually; you were not signed in automatically.";}form.addEventListener("submit",async event=>{event.preventDefault();const input=document.getElementById("password");const button=form.querySelector("button");const password=input.value;if(password.length<12||password.length>128){status.textContent="استخدم كلمة مرور من 12 إلى 128 حرفًا. / Use a password of 12 to 128 characters.";return;}if(!recoveryToken){form.hidden=true;status.textContent="انتهت صلاحية الرابط. اطلب رابطًا جديدًا. / This link has expired. Request a new one.";return;}button.disabled=true;try{const response=await fetch("/api/family",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"Content-Type":"application/json","X-Family-Registration":"local-review"},body:JSON.stringify({action:"update-password",access_token:recoveryToken,password})});recoveryToken="";if(!response.ok)throw new Error();form.hidden=true;status.textContent="تم تحديث كلمة المرور. سجّل الدخول يدويًا. / Password updated. Sign in manually.";}catch{recoveryToken="";form.hidden=true;status.textContent="تعذر تحديث كلمة المرور. اطلب رابطًا جديدًا. / Password update failed. Request a new link.";}finally{input.value="";button.disabled=false;}});})();`;
const headers = (script: string, allowApi = false) => ({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src 'sha256-${createHash("sha256").update(script).digest("base64")}'; ${allowApi ? "connect-src 'self'; " : ""}style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`, "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Content-Type": "text/html; charset=utf-8" });
const generic = () => new Response("Bad request", { status: 400, headers: headers(previewScript) });
export async function GET(request: Request) {
  let incoming: URL;
  try { incoming = new URL(request.url); } catch { return generic(); }
  if (incoming.pathname !== CALLBACK_PATH || incoming.username || incoming.password || incoming.hash) return new Response("Not found", { status: 404, headers: headers(previewScript) });

  if (familyMode() === "owner-preview") {
    if (incoming.origin !== `https://${PREVIEW_CALLBACK_HOST}` || incoming.hostname !== PREVIEW_CALLBACK_HOST) return new Response("Not found", { status: 404, headers: headers(previewScript) });
    const share = previewShare();
    const supplied = incoming.searchParams.getAll("_vercel_share");
    // The Vercel protection gateway consumes _vercel_share, sets its own access
    // cookie, and redirects here without a query. This page grants no session.
    if (!share || supplied.length > 1 || [...incoming.searchParams.keys()].some(key => key !== "_vercel_share") || (supplied.length === 1 && supplied[0] !== share)) return generic();
    const link = `/ar/family?_vercel_share=${encodeURIComponent(share)}`;
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تأكيد البريد الإلكتروني</title><meta name="robots" content="noindex"><script>${previewScript}</script></head><body><main><h1>تأكيد البريد الإلكتروني</h1><p>تمت زيارة رابط العودة. أكّد بريدك الإلكتروني أولًا، ثم استخدم تسجيل الدخول يدويًا.</p><p>لا يعني فتح هذه الصفحة تسجيل الدخول تلقائيًا.</p><p><a href="${link}">العودة إلى مساحة الأسرة</a></p></main></body></html>`;
    return new Response(html, { status: 200, headers: headers(previewScript) });
  }

  const production = familyProductionConfig();
  const configuredSite = production ? new URL(production.siteOrigin) : null;
  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (familyMode() !== "production" || !production || !configuredSite || incoming.origin !== production.siteOrigin || incoming.search || (host && host !== configuredSite.host) || (forwardedHost && forwardedHost !== configuredSite.host) || (forwardedProto && forwardedProto !== "https")) return new Response("Not found", { status: 404, headers: headers(productionScript, true) });
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تأكيد البريد واستعادة كلمة المرور</title><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><script>${productionScript}</script></head><body><main><h1>تأكيد البريد واستعادة كلمة المرور</h1><p id="status" role="status" aria-live="polite">إذا وصلت من رابط تأكيد البريد، سجّل الدخول يدويًا. / If you arrived from an email confirmation link, sign in manually.</p><form id="recovery" method="post" hidden><label for="password">كلمة المرور الجديدة / New password</label><input id="password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required><button type="submit">تحديث كلمة المرور / Update password</button></form></main></body></html>`;
  return new Response(html, { status: 200, headers: headers(productionScript, true) });
}
