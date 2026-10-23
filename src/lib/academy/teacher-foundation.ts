/**
 * Server-side, read-only foundation for the preview teacher roster.
 * This module deliberately has no route/UI/login integration and performs no
 * synthetic fallback. Keep it out of client bundles; no `server-only` import is
 * used so the unit tests can import it directly.
 */

const PREVIEW_URL = "https://dyyvpcntbbwbuzskiidb.supabase.co";
const PAGE_SIZE = 50;
const MAX_OFFSET = 10_000;
const REQUEST_TIMEOUT_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})$/;
const LESSON_STATUSES = new Set(["scheduled", "cancelled"]);

type Environment = Record<string, string | undefined>;
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type Teacher = {
  id: string;
  display_name: string;
  time_zone: string;
};

export type TeacherLesson = {
  id: string;
  child_id: string;
  subject: string;
  starts_at: string;
  ends_at: string;
  time_zone: string;
  status: "scheduled" | "cancelled";
};

export type TeacherFoundationResult = {
  teacher: Teacher;
  lessons: TeacherLesson[];
  has_more: boolean;
  offset: number;
};

export type TeacherReadOptions = {
  offset?: number;
  fetchImpl?: FetchLike;
  env?: Environment;
};

export class TeacherFoundationError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "TeacherFoundationError";
  }
}

/** The explicit activation flag is intentionally absent from normal deployments. */
export function enabled(env: Environment = process.env): boolean {
  return env.VERCEL === "1" &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_COMMIT_REF === "preview/academy-synthetic" &&
    env.ACADEMY_SUPABASE_URL === PREVIEW_URL &&
    env.ACADEMY_TEACHER_ACCOUNTS === "roster-approved";
}

function unavailable(): never {
  throw new TeacherFoundationError(503, "teacher_roster_unavailable");
}

function publicKey(env: Environment): string {
  const key = env.ACADEMY_SUPABASE_PUBLISHABLE_KEY ?? env.ACADEMY_SUPABASE_ANON_KEY;
  if (!key || key.length > 8192 || /[\r\n]/.test(key) ||
      /(?:service[_-]?role|secret|private|admin[_-]?key|sb_secret)/i.test(key)) unavailable();
  let valid = key.startsWith("sb_publishable_") && key.length > 25;
  if (!valid) {
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      valid = claims.role === "anon" && claims.ref === "dyyvpcntbbwbuzskiidb";
    } catch { /* Malformed or privileged keys are not allowed. */ }
  }
  if (!valid) unavailable();
  return key;
}

function configuration(env: Environment): { key: string } {
  if (!enabled(env)) unavailable();
  return { key: publicKey(env) };
}

function offsetValue(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_OFFSET) {
    throw new TeacherFoundationError(400, "invalid_pagination");
  }
  return value;
}

function providerFailure(): never {
  throw new TeacherFoundationError(503, "teacher_roster_unavailable");
}

async function providerJson(response: Response): Promise<unknown> {
  if (!response.ok) providerFailure();
  try { return await response.json(); } catch { providerFailure(); }
}

function stringField(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && ![...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
}

function timeZone(value: unknown): value is string {
  if (!stringField(value, 128)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}

function validateTeacher(value: unknown, uid: string): Teacher {
  if (!value || typeof value !== "object" || Array.isArray(value)) providerFailure();
  const row = value as Record<string, unknown>;
  if (row.id !== uid || !UUID.test(uid) || !stringField(row.display_name, 200) || !row.display_name.trim() || !timeZone(row.time_zone)) providerFailure();
  return { id: uid, display_name: row.display_name, time_zone: row.time_zone };
}

function validateLesson(value: unknown): TeacherLesson {
  if (!value || typeof value !== "object" || Array.isArray(value)) providerFailure();
  const row = value as Record<string, unknown>;
  if (!stringField(row.id, 128) || !UUID.test(row.id) || !stringField(row.child_id, 128) || !UUID.test(row.child_id) || !stringField(row.subject) || !["quran", "nur_al_bayan", "tajweed"].includes(row.subject) ||
      !timeZone(row.time_zone) || typeof row.starts_at !== "string" || typeof row.ends_at !== "string" ||
      !ISO_DATE.test(row.starts_at) || !ISO_DATE.test(row.ends_at) ||
      !Number.isFinite(Date.parse(row.starts_at)) || !Number.isFinite(Date.parse(row.ends_at)) ||
      Date.parse(row.ends_at) <= Date.parse(row.starts_at) || typeof row.status !== "string" || !LESSON_STATUSES.has(row.status)) providerFailure();
  return {
    id: row.id,
    child_id: row.child_id,
    subject: row.subject,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    time_zone: row.time_zone,
    status: row.status as TeacherLesson["status"],
  };
}

function requestInit(token: string, key: string): RequestInit {
  return {
    method: "GET",
    headers: { apikey: key, Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
}

/** Read the authenticated teacher profile and RLS-filtered assigned lessons. */
export async function read(token: string, options: TeacherReadOptions = {}): Promise<TeacherFoundationResult> {
  const env = options.env ?? process.env;
  const { key } = configuration(env);
  if (typeof token !== "string" || token.length === 0 || token.length > 8192 || /[\r\n]/.test(token)) {
    throw new TeacherFoundationError(401, "authentication_required");
  }
  const offset = offsetValue(options.offset);
  const fetchImpl = options.fetchImpl ?? fetch;
  const init = requestInit(token, key);
  const base = `${PREVIEW_URL}`;
  let identity: unknown;
  try {
    identity = await providerJson(await fetchImpl(`${base}/auth/v1/user`, init));
  } catch (error) {
    if (error instanceof TeacherFoundationError) throw error;
    throw new TeacherFoundationError(503, "teacher_roster_unavailable");
  }
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) providerFailure();
  const user = identity as Record<string, unknown>;
  const uid = user.id;
  if (typeof uid !== "string" || !UUID.test(uid) || user.is_anonymous !== false || typeof user.email_confirmed_at !== "string" || !ISO_DATE.test(user.email_confirmed_at) || !Number.isFinite(Date.parse(user.email_confirmed_at))) {
    throw new TeacherFoundationError(401, "authentication_required");
  }

  let profileData: unknown;
  try {
    profileData = await providerJson(await fetchImpl(`${base}/rest/v1/academy_teachers?id=eq.${encodeURIComponent(uid)}&status=eq.active&select=id,display_name,time_zone&limit=1`, init));
  } catch (error) {
    if (error instanceof TeacherFoundationError) throw error;
    throw new TeacherFoundationError(503, "teacher_roster_unavailable");
  }
  if (!Array.isArray(profileData) || profileData.length === 0) throw new TeacherFoundationError(403, "teacher_profile_required");
  if (profileData.length !== 1) providerFailure();
  const teacher = validateTeacher(profileData[0], uid);

  let lessonsData: unknown;
  try {
    lessonsData = await providerJson(await fetchImpl(`${base}/rest/v1/academy_individual_lessons?teacher_id=eq.${encodeURIComponent(uid)}&select=id,child_id,subject,starts_at,ends_at,time_zone,status&order=starts_at.asc,id.asc&limit=${PAGE_SIZE + 1}&offset=${offset}`, init));
  } catch (error) {
    if (error instanceof TeacherFoundationError) throw error;
    throw new TeacherFoundationError(503, "teacher_roster_unavailable");
  }
  if (!Array.isArray(lessonsData) || lessonsData.length > PAGE_SIZE + 1) providerFailure();
  const hasMore = lessonsData.length > PAGE_SIZE;
  const lessons = lessonsData.map(validateLesson).slice(0, PAGE_SIZE);
  return { teacher, lessons, has_more: hasMore, offset };
}

export const TEACHER_FOUNDATION_CONFIG = { previewUrl: PREVIEW_URL, pageSize: PAGE_SIZE, maxOffset: MAX_OFFSET } as const;
