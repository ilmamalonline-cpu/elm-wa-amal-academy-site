import { enabled as teacherEnabled, teacherConfiguration } from "./teacher-foundation";
import { familyMode, previewCallbackUrl, previewShare, PREVIEW_CALLBACK_HOST } from "./family-registration";

export const TEACHER_INVITE_PATH = "/auth/teacher/invite";
export const TEACHER_INVITE_HOST = PREVIEW_CALLBACK_HOST;
export const TEACHER_INVITE_APPROVED_EMAIL = "ilmamalonline@gmail.com";
const PREVIEW_URL = "https://dyyvpcntbbwbuzskiidb.supabase.co";
type Environment = Record<string, string | undefined>;

function validLocalTestHost(host: string | null) {
  if (!host) return false;
  try {
    const url = new URL(`http://${host}`);
    return url.host === host && !url.username && !url.password && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

/** Build the invitation redirect from the already-configured Preview callback, preserving its existing Vercel protection token. */
export function teacherInviteRedirectUrl(env: Environment = process.env): string | null {
  if (!teacherEnabled(env) || familyMode(env) !== "owner-preview") return null;
  const callback = previewCallbackUrl(env);
  const share = previewShare(env);
  if (!callback || !share) return null;
  try {
    const url = new URL(callback);
    if (url.origin !== `https://${TEACHER_INVITE_HOST}` || url.pathname !== "/auth/family/callback" ||
        url.username || url.password || url.hash || [...url.searchParams.keys()].length !== 1 ||
        url.searchParams.getAll("_vercel_share").length !== 1 || url.searchParams.get("_vercel_share") !== share) return null;
    url.pathname = TEACHER_INVITE_PATH;
    return url.toString();
  } catch { return null; }
}

/** Validate a callback request for this Preview branch only. No Supabase admin capability is used. */
export function teacherInviteConfig(request: Request, env: Environment = process.env) {
  if (!teacherEnabled(env) || familyMode(env) !== "owner-preview" || !teacherInviteRedirectUrl(env)) return null;
  const host = request.headers.get("host");
  let incoming: URL;
  try { incoming = new URL(request.url); } catch { return null; }
  const testLocal = env.TEACHER_INVITE_TEST_MODE === "true" && validLocalTestHost(host) && incoming.protocol === "http:";
  const exactPreview = host === TEACHER_INVITE_HOST && incoming.protocol === "https:" && incoming.hostname === TEACHER_INVITE_HOST;
  if (!testLocal && !exactPreview) return null;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost && forwardedHost !== host) return null;
  if (forwardedProto && forwardedProto !== (testLocal ? "http" : "https")) return null;
  if (incoming.pathname !== TEACHER_INVITE_PATH) return null;
  const queryKeys = [...incoming.searchParams.keys()];
  if (queryKeys.some(key => key !== "_vercel_share" && key !== "review") || incoming.searchParams.getAll("_vercel_share").length > 1 || incoming.searchParams.getAll("review").length > 1) return null;
  const suppliedShare = incoming.searchParams.get("_vercel_share");
  if (suppliedShare !== null && suppliedShare !== previewShare(env)) return null;
  const reviewOnly = incoming.searchParams.get("review") === "1";
  if (incoming.searchParams.has("review") && !reviewOnly) return null;
  const { key } = teacherConfiguration(env);
  return { projectUrl: PREVIEW_URL, apiKey: reviewOnly ? "" : key, approvedEmail: reviewOnly ? "" : TEACHER_INVITE_APPROVED_EMAIL, reviewOnly };
}
