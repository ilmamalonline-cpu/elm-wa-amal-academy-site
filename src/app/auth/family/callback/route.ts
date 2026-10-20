import { previewShare, familyMode, PREVIEW_CALLBACK_HOST } from "@/lib/academy/family-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const script = 'history.replaceState(null,"",location.pathname);';
const scriptHash = "sha256-FA4aZEf2T/1XGagpJkYxlmqzN6jyUQhTeiObiA5E4Rk=";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": `default-src 'none'; script-src '${scriptHash}'; style-src 'unsafe-inline'; frame-ancestors 'none'`, "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff", "Content-Type": "text/html; charset=utf-8" };
const generic = () => new Response("Bad request", { status: 400, headers });
export async function GET(request: Request) {
  let incoming: URL;
  try { incoming = new URL(request.url); } catch { return generic(); }
  if (familyMode() !== "owner-preview" || incoming.origin !== `https://${PREVIEW_CALLBACK_HOST}` || incoming.hostname !== PREVIEW_CALLBACK_HOST || incoming.pathname !== "/auth/family/callback") return new Response("Not found", { status: 404, headers });
  const share = previewShare();
  const supplied = incoming.searchParams.getAll("_vercel_share");
  // The Vercel protection gateway consumes _vercel_share, sets its own access
  // cookie, and redirects here without a query. This page grants no session.
  if (!share || supplied.length > 1 || [...incoming.searchParams.keys()].some(key => key !== "_vercel_share") || (supplied.length === 1 && supplied[0] !== share)) return generic();
  const link = `/ar/family?_vercel_share=${encodeURIComponent(share)}`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تأكيد البريد الإلكتروني</title><meta name="robots" content="noindex"><script>${script}</script></head><body><main><h1>تأكيد البريد الإلكتروني</h1><p>تمت زيارة رابط العودة. أكّد بريدك الإلكتروني أولًا، ثم استخدم تسجيل الدخول يدويًا.</p><p>لا يعني فتح هذه الصفحة تسجيل الدخول تلقائيًا.</p><p><a href="${link}">العودة إلى مساحة الأسرة</a></p></main></body></html>`;
  return new Response(html, { status: 200, headers });
}
