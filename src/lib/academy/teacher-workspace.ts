import { enabled, read, teacherConfiguration, TeacherFoundationError, TEACHER_FOUNDATION_CONFIG, type FetchLike, type TeacherFoundationResult } from "./teacher-foundation";

type Env = Record<string, string | undefined>;
const HOST = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
export const TEACHER_COOKIE = "academy_teacher_access";
export const TEACHER_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const fail = (status: number, code: string): never => { throw new TeacherFoundationError(status, code); };
export function teacherWorkspaceHost(host: string | null): boolean {
  if (host === HOST) return true;
  try {
    const url = new URL(`http://${host}`);
    return !!host && url.host === host && url.pathname === "/" && !url.username && !url.password && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch { return false; }
}
export function teacherSecurity(request: Request, env: Env = process.env): number {
  if (!enabled(env)) fail(503, "teacher_roster_unavailable");
  const host = request.headers.get("host");
  const url = new URL(request.url);
  if (!teacherWorkspaceHost(host) || url.pathname !== "/api/teacher" || (host === HOST ? url.protocol !== "https:" : url.protocol !== "http:")) fail(403, "host_not_allowed");
  const forwardedHost = request.headers.get("x-forwarded-host"), forwardedProto = request.headers.get("x-forwarded-proto");
  if ((forwardedHost && forwardedHost !== host) || (forwardedProto && forwardedProto !== url.protocol.slice(0, -1))) fail(403, "host_not_allowed");
  // Next normalizes request.url to localhost behind its local proxy. The
  // explicitly allowlisted Host and matching forwarded headers are authoritative.
  const expectedOrigin = `${host === HOST ? "https" : "http"}://${host}`;
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== expectedOrigin) || (site && !["same-origin", "none"].includes(site))) fail(403, "same_origin_required");
  if (request.headers.get("x-teacher-workspace") !== "real-preview" || (request.method !== "GET" && origin !== expectedOrigin)) fail(403, "csrf_required");
  const keys = [...url.searchParams.keys()];
  if ((request.method !== "GET" && keys.length) || keys.some(key => key !== "offset") || url.searchParams.getAll("offset").length > 1) fail(400, "invalid_pagination");
  const raw = url.searchParams.get("offset");
  if (raw !== null && !/^(0|[1-9]\d{0,4})$/.test(raw)) fail(400, "invalid_pagination");
  const offset = Number(raw ?? 0);
  if (offset > TEACHER_FOUNDATION_CONFIG.maxOffset) fail(400, "invalid_pagination");
  return offset;
}
export function teacherToken(request: Request): string | null {
  const matches = (request.headers.get("cookie") ?? "").split(";").map(x => x.trim()).filter(x => x.startsWith(`${TEACHER_COOKIE}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(TEACHER_COOKIE.length + 1);
  return /^[A-Za-z0-9_.-]{20,3800}$/.test(token) ? token : null;
}
export function teacherCookie(token: string, maxAge: number, host: string | null): string {
  return `${TEACHER_COOKIE}=${token}; Path=/api/teacher; HttpOnly; SameSite=Strict;${host === HOST ? " Secure;" : ""} Max-Age=${maxAge}`;
}
export function teacherPublicData(result: TeacherFoundationResult) {
  return {
    teacher: result.teacher,
    lessons: result.lessons.map(({ id, subject, starts_at, ends_at, time_zone, status }) => ({ id, subject, starts_at, ends_at, time_zone, status })),
    has_more: result.has_more && result.offset < TEACHER_FOUNDATION_CONFIG.maxOffset,
    offset: result.offset,
  };
}
export async function teacherBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") fail(400, "invalid_request");
  const reader = request.body?.getReader();
  if (!reader) return fail(400, "invalid_request");
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); fail(413, "payload_too_large"); }
    parts.push(value);
  }
  try {
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
    if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "invalid_request");
    return body;
  } catch { return fail(400, "invalid_request"); }
}
export async function teacherLogin(body: Record<string, unknown>, env: Env = process.env, fetchImpl: FetchLike = fetch) {
  const { key } = teacherConfiguration(env);
  if (Object.keys(body).sort().join(",") !== "action,email,password" || body.action !== "login" || typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || typeof body.password !== "string" || body.password.length < 1 || body.password.length > 128) fail(400, "invalid_credentials");
  let response: Response;
  try {
    response = await fetchImpl(`${TEACHER_FOUNDATION_CONFIG.previewUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify({ email: body.email, password: body.password }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
  } catch { return fail(503, "teacher_roster_unavailable"); }
  if (response.status === 429) fail(429, "try_later");
  if (!response.ok) return fail(response.status >= 500 ? 503 : 401, response.status >= 500 ? "teacher_roster_unavailable" : "authentication_required");
  let session: Record<string, unknown>;
  try { session = await response.json(); } catch { return fail(503, "teacher_roster_unavailable"); }
  if (!session || typeof session.access_token !== "string" || !/^[A-Za-z0-9_.-]{20,3800}$/.test(session.access_token) || typeof session.expires_in !== "number" || !Number.isFinite(session.expires_in) || session.expires_in <= 0) return fail(503, "teacher_roster_unavailable");
  // Do not issue a teacher cookie until the stored active profile is verified.
  // Ignore refresh tokens entirely: no signup, refresh, invitations or auth-admin.
  const result = await read(session.access_token, { env, fetchImpl });
  return { data: teacherPublicData(result), token: session.access_token, maxAge: Math.min(3600, Math.floor(session.expires_in)) };
}
