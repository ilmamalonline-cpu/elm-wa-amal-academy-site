import "server-only";
import { enabled as previewTeacherEnabled, teacherConfiguration } from "./teacher-foundation";

const PREVIEW_URL = "https://dyyvpcntbbwbuzskiidb.supabase.co";
const PREVIEW_REF = "dyyvpcntbbwbuzskiidb";
const REQUEST_TIMEOUT_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/;

type Environment = Record<string, string | undefined>;
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class TeacherAdminError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "TeacherAdminError";
  }
}

function unavailable(): never {
  throw new TeacherAdminError(503, "teacher_admin_unavailable");
}

function authenticationRequired(): never {
  throw new TeacherAdminError(401, "authentication_required");
}

/** This foundation is disabled unless explicitly enabled on the exact Preview branch. */
export function teacherAdminPreviewEnabled(env: Environment = process.env): boolean {
  return env.ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED === "1" && previewTeacherEnabled(env);
}

function validServiceCredential(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 20 || value.length > 8192 || /[\r\n\s]/.test(value)) return false;
  if (value.startsWith("sb_secret_") && value.length > 20) return true;
  try {
    const parts = value.split(".");
    if (parts.length !== 3 || parts.some(part => !part)) return false;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    return claims.role === "service_role" && claims.ref === PREVIEW_REF;
  } catch { return false; }
}

function configuration(env: Environment) {
  if (!teacherAdminPreviewEnabled(env)) unavailable();
  let publicKey: string;
  try { publicKey = teacherConfiguration(env).key; } catch { return unavailable(); }
  const serviceKey = env.ACADEMY_SUPABASE_SERVICE_ROLE_KEY;
  if (!validServiceCredential(serviceKey)) unavailable();
  return { publicKey, serviceKey, base: PREVIEW_URL };
}

function requestInit(key: string, token: string): RequestInit {
  return {
    method: "GET",
    headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

function jsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Verify a real Auth user, then check the administrator allowlist using a server-only credential. */
export async function authorizeTeacherAdmin(
  token: string,
  options: { env?: Environment; fetchImpl?: FetchLike } = {},
): Promise<{ adminId: string }> {
  if (typeof token !== "string" || token.length === 0 || token.length > 8192 || /[\r\n]/.test(token)) {
    authenticationRequired();
  }

  const env = options.env ?? process.env;
  const { publicKey, serviceKey, base } = configuration(env);
  const fetchImpl = options.fetchImpl ?? fetch;
  let identity: unknown;
  try {
    const response = await fetchImpl(`${base}/auth/v1/user`, requestInit(publicKey, token));
    if (response.status === 401 || response.status === 403) authenticationRequired();
    if (!response.ok) return unavailable();
    identity = await response.json();
  } catch (error) {
    if (error instanceof TeacherAdminError) throw error;
    return unavailable();
  }
  if (!jsonObject(identity)) authenticationRequired();
  const uid = identity.id;
  if (typeof uid !== "string" || !UUID.test(uid) || identity.is_anonymous !== false ||
      typeof identity.email_confirmed_at !== "string" || !ISO_DATE.test(identity.email_confirmed_at) ||
      !Number.isFinite(Date.parse(identity.email_confirmed_at))) authenticationRequired();

  let rows: unknown;
  try {
    const url = `${base}/rest/v1/academy_admins?id=eq.${encodeURIComponent(uid)}&select=id&limit=2`;
    const response = await fetchImpl(url, requestInit(serviceKey, serviceKey));
    if (!response.ok) return unavailable();
    rows = await response.json();
  } catch (error) {
    if (error instanceof TeacherAdminError) throw error;
    return unavailable();
  }
  if (!Array.isArray(rows) || rows.length > 1 || rows.some(row => !jsonObject(row) || row.id !== uid)) unavailable();
  if (rows.length === 0) throw new TeacherAdminError(403, "academy_admin_required");
  return { adminId: uid };
}

export const TEACHER_ADMIN_CONFIG = {
  previewUrl: PREVIEW_URL,
  previewFlag: "ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED",
} as const;
