import { syntheticLearnerWorkspace } from "./learner";
import { emptyLearning, type LearningData, type LearningPlan, type PracticeEntry } from "./learning";

// Server-side adapter. Never import this module into a client component.
// No service-role key, role selection, demo identity or child credentials are accepted.
export const FAMILY_PROJECT = "https://vbulxdnfknoybdkuhayz.supabase.co";
export const PREVIEW_PROJECT = "https://dyyvpcntbbwbuzskiidb.supabase.co";
export const PREVIEW_OWNER_EMAIL = "abdelrahmanbakri113@gmail.com";
export const FAMILY_COOKIE = "academy_family_access";
export const FAMILY_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const PREVIEW_CALLBACK_HOST = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
const CALLBACK_PATH = "/auth/family/callback";
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export class FamilyError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
function previewConfig(env: Env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "preview/academy-synthetic" || env.ACADEMY_FAMILY_REGISTRATION !== "owner-preview" || env.ACADEMY_SUPABASE_URL !== PREVIEW_PROJECT) return null;
  const email = PREVIEW_OWNER_EMAIL;
  const callback = env.ACADEMY_FAMILY_CALLBACK_URL;
  if (!callback) return null;
  try {
    const parsed = new URL(callback);
    const shareValues = parsed.searchParams.getAll("_vercel_share");
    if (parsed.origin !== `https://${PREVIEW_CALLBACK_HOST}` || parsed.pathname !== CALLBACK_PATH || parsed.username || parsed.password || parsed.hash || [...parsed.searchParams.keys()].length !== 1 || shareValues.length !== 1 || !/^[A-Za-z0-9_-]{8,128}$/.test(shareValues[0])) return null;
    return { email, callback, share: shareValues[0] };
  } catch { return null; }
}
export function familyEnabled(env: Env = process.env) {
  return (env.ACADEMY_FAMILY_REGISTRATION === "local-review" && !env.VERCEL && !env.VERCEL_ENV && !env.NETLIFY && !env.CF_PAGES) || !!previewConfig(env);
}
export function familyMode(env: Env = process.env): "local-review" | "owner-preview" | null {
  if (env.ACADEMY_FAMILY_REGISTRATION === "local-review" && !env.VERCEL && !env.VERCEL_ENV && !env.NETLIFY && !env.CF_PAGES) return "local-review";
  return previewConfig(env) ? "owner-preview" : null;
}
export function familySecurity(request: Request, env: Env = process.env) {
  const mode = familyMode(env);
  if (!mode) throw new FamilyError("registration_disabled", 503);
  const host = request.headers.get("host");
  let parsed: URL;
  try { parsed = new URL(request.url); } catch { throw new FamilyError("host_not_allowed", 403); }
  if (mode === "local-review") {
    let local: URL;
    try { local = new URL(`http://${host}`); } catch { throw new FamilyError("local_review_only", 403); }
    if (!host || local.pathname !== "/" || !["/", "/api/family", "/api/family/session-summaries"].includes(parsed.pathname) || !["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) || local.host !== host || local.username || local.password)
      throw new FamilyError("local_review_only", 403);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if ((forwardedHost && forwardedHost !== host) || (forwardedProto && forwardedProto !== "http")) throw new FamilyError("local_review_only", 403);
    const origin = request.headers.get("origin"); const site = request.headers.get("sec-fetch-site");
    if ((origin && origin !== local.origin) || (site && !["same-origin", "none"].includes(site))) throw new FamilyError("same_origin_required", 403);
    if (parsed.pathname === "/api/family/session-summaries" && request.method !== "GET") throw new FamilyError("invalid_request");
    if (parsed.pathname !== "/api/family/session-summaries" && parsed.search) throw new FamilyError("invalid_request");
    if (request.method !== "GET" && (origin !== local.origin || request.headers.get("x-family-registration") !== "local-review")) throw new FamilyError("csrf_required", 403);
    return;
  }
  const config = previewConfig(env)!;
  if (!host || host !== PREVIEW_CALLBACK_HOST || parsed.protocol !== "https:" || !["/api/family", "/api/family/session-summaries"].includes(parsed.pathname)) throw new FamilyError("preview_host_required", 403);
  const forwardedHost = request.headers.get("x-forwarded-host"); const forwardedProto = request.headers.get("x-forwarded-proto");
  if ((forwardedHost && forwardedHost !== PREVIEW_CALLBACK_HOST) || (forwardedProto && forwardedProto !== "https")) throw new FamilyError("preview_host_required", 403);
  const origin = request.headers.get("origin"); const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== `https://${PREVIEW_CALLBACK_HOST}`) || (site && !["same-origin", "none"].includes(site))) throw new FamilyError("same_origin_required", 403);
  if (request.method !== "GET" && (origin !== `https://${PREVIEW_CALLBACK_HOST}` || request.headers.get("x-family-registration") !== "local-review")) throw new FamilyError("csrf_required", 403);
  void config;
}
export function allowedPreviewEmail(email: string, env: Env = process.env) { const config = previewConfig(env); return !!config && email.trim().toLowerCase() === PREVIEW_OWNER_EMAIL; }
export function previewCallbackUrl(env: Env = process.env) { return previewConfig(env)?.callback ?? null; }
export function previewShare(env: Env = process.env) { return previewConfig(env)?.share ?? null; }
export function previewSignupEnabled(env: Env = process.env) { return familyMode(env) !== "owner-preview" || env.ACADEMY_FAMILY_SIGNUP === "owner-test-approved"; }

function configuration(env: Env) {
  const mode = familyMode(env);
  if (!mode) throw new FamilyError("registration_disabled", 503);
  const url = mode === "owner-preview" ? PREVIEW_PROJECT : FAMILY_PROJECT;
  if (!url || env.ACADEMY_SUPABASE_URL !== url) throw new FamilyError("configuration_required", 503);
  const key = env.ACADEMY_SUPABASE_PUBLISHABLE_KEY ?? "";
  let publicKey = key.startsWith("sb_publishable_") && key.length > 25;
  if (!publicKey) {
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      const expectedRef = new URL(url).hostname.split(".")[0];
      publicKey = claims.role === "anon" && claims.ref === expectedRef;
    } catch { /* Reject absent, malformed, secret or service-role keys. */ }
  }
  if (!publicKey) throw new FamilyError("configuration_required", 503);
  return { url, key };
}
function shape(value: Json, keys: string[]) {
  if (Object.keys(value).sort().join(",") !== ["action", ...keys].sort().join(",")) throw new FamilyError("invalid_request");
}
function text(value: unknown, min: number, max: number, multiline = false) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || [...value].some((character) => (character.charCodeAt(0) < 32 && !(multiline && [10, 13].includes(character.charCodeAt(0)))) || character.charCodeAt(0) === 127)) throw new FamilyError("invalid_request");
  return value.trim();
}
function profile(value: Json) {
  if (value.consent !== true || !["ar", "en"].includes(String(value.locale))) throw new FamilyError("consent_required");
  return { display_name: text(value.display_name, 2, 100), locale: value.locale, consent_version: "family-v1", consented_at: new Date().toISOString() };
}
function credentials(value: Json) {
  const email = text(value.email, 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof value.password !== "string" || value.password.length < 12 || value.password.length > 128) throw new FamilyError("invalid_credentials");
  return { email, password: value.password };
}
function child(value: Json) {
  if (!Number.isInteger(value.birth_year) || Number(value.birth_year) < new Date().getUTCFullYear() - 18 || Number(value.birth_year) > new Date().getUTCFullYear()) throw new FamilyError("invalid_birth_year");
  return { display_name: text(value.display_name, 2, 100), birth_year: value.birth_year };
}
function uuid(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new FamilyError("invalid_request");
  return value;
}
export function familyToken(request: Request) {
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)academy_family_access=([^;]*)/)?.[1];
  return token && /^[A-Za-z0-9_.-]{20,3800}$/.test(token) ? token : null;
}
export async function familyBody(request: Request): Promise<Json> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new FamilyError("invalid_request");
  const reader = request.body?.getReader();
  if (!reader) throw new FamilyError("invalid_request");
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new FamilyError("payload_too_large", 413); }
    parts.push(value);
  }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts)));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new FamilyError("invalid_request"); }
}
export function familyAdapter(env: Env = process.env, fetcher: typeof fetch = fetch) {
  const { url, key } = configuration(env);
  async function call(path: string, method = "GET", body?: unknown, token?: string, prefer?: string): Promise<unknown> {
    let result: Response;
    try {
      result = await fetcher(`${url}${path}`, { method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000), headers: {
        apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}), ...(prefer ? { Prefer: prefer } : {}),
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new FamilyError("provider_unavailable", 503); }
    if (!result.ok) {
      if (result.status === 429) throw new FamilyError("try_later", 429);
      if (result.status === 401) throw new FamilyError("sign_in_required", 401);
      if (result.status === 403) throw new FamilyError("not_allowed", 403);
      // Never forward provider errors, email existence or database/schema details.
      throw new FamilyError(path.includes("/auth/") ? "authentication_failed" : "persistence_unavailable", path.includes("/auth/") ? 400 : 503);
    }
    if (result.status === 204 || result.headers.get("content-length") === "0") return null;
    const raw = await result.text();
    try { return raw ? JSON.parse(raw) : null; } catch { throw new FamilyError("provider_unavailable", 503); }
  }
  async function user(token: string) {
    const u = await call("/auth/v1/user", "GET", undefined, token) as Json;
    if (!u || u.is_anonymous || !u.email_confirmed_at) throw new FamilyError("email_confirmation_required", 403);
    if (familyMode(env) === "owner-preview" && (typeof u.email !== "string" || !allowedPreviewEmail(u.email, env))) throw new FamilyError("not_allowed", 403);
    return { id: uuid(u.id) };
  }
  async function ownedChild(childId: string, guardianId: string, token: string, includeName = false) {
    const guardians = await call(`/rest/v1/academy_guardians?id=eq.${guardianId}&select=id&limit=1`, "GET", undefined, token);
    if (!Array.isArray(guardians) || guardians.length !== 1 || guardians[0]?.id !== guardianId) throw new FamilyError("not_allowed", 403);
    const children = await call(`/rest/v1/academy_children?id=eq.${childId}&guardian_id=eq.${guardianId}&select=${includeName ? "id,display_name" : "id"}&limit=1`, "GET", undefined, token);
    if (!Array.isArray(children)) throw new FamilyError("provider_unavailable", 503);
    if (!children.length) throw new FamilyError("not_found", 404);
    const selected = children[0];
    if (children.length !== 1 || selected?.id !== childId || (includeName && (typeof selected.display_name !== "string" || !selected.display_name.trim() || selected.display_name.length > 200))) throw new FamilyError("provider_unavailable", 503);
    return selected;
  }
  async function learning(childId: string, guardianId: string, token: string): Promise<LearningData> {
    const scope = `child_id=eq.${childId}&guardian_id=eq.${guardianId}`;
    const plans = await call(`/rest/v1/academy_learning_plans?${scope}&select=goal,weekly_target_minutes,updated_at&limit=1`, "GET", undefined, token);
    const entries = await call(`/rest/v1/academy_practice_entries?${scope}&select=id,activity,minutes,practiced_on,note,created_at&order=practiced_on.desc,created_at.desc,id.desc&limit=100`, "GET", undefined, token);
    if (!Array.isArray(plans) || plans.length > 1 || !Array.isArray(entries) || entries.length > 100) throw new FamilyError("provider_unavailable", 503);
    if (plans.some(p => !p || typeof p.goal !== "string" || !Number.isInteger(p.weekly_target_minutes) || typeof p.updated_at !== "string") || entries.some(e => !e || typeof e.id !== "string" || typeof e.activity !== "string" || !Number.isInteger(e.minutes) || typeof e.practiced_on !== "string" || typeof e.note !== "string" || typeof e.created_at !== "string")) throw new FamilyError("provider_unavailable", 503);
    // Explicit allowlist avoids forwarding ownership IDs or unexpected provider fields.
    const plan: LearningPlan | null = plans[0] ? { goal: plans[0].goal, weekly_target_minutes: plans[0].weekly_target_minutes, updated_at: plans[0].updated_at } : null;
    const safeEntries: PracticeEntry[] = entries.map(e => ({ id: e.id, activity: e.activity, minutes: e.minutes, practiced_on: e.practiced_on, note: e.note, created_at: e.created_at }));
    return { plan, entries: safeEntries, summary: { entry_count: safeEntries.length, total_minutes: safeEntries.reduce((sum, e) => sum + e.minutes, 0), scope: "latest-100" } };
  }
  function practice(value: Json) {
    if (!Number.isInteger(value.minutes) || Number(value.minutes) < 1 || Number(value.minutes) > 240 || typeof value.practiced_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.practiced_on)) throw new FamilyError("invalid_request");
    const date = new Date(`${value.practiced_on}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.practiced_on || value.practiced_on > new Date().toISOString().slice(0, 10) || value.practiced_on < "2000-01-01") throw new FamilyError("invalid_request");
    return { activity: text(value.activity, 1, 120), minutes: value.minutes, practiced_on: value.practiced_on, note: text(value.note, 0, 500, true) };
  }
  async function checkAuthSettings() {
    const settings = await call("/auth/v1/settings") as Json;
    const external = settings?.external as Json | undefined;
    if (!settings || settings.mailer_autoconfirm !== false || settings.disable_signup !== false || external?.email !== true)
      throw new FamilyError("email_confirmation_configuration_required", 503);
  }
  async function sessionSummaries(childId: string, guardianId: string, token: string, offset = 0) {
    if (familyMode(env) !== "owner-preview" || url !== PREVIEW_PROJECT) throw new FamilyError("registration_disabled", 503);
    const selected = await ownedChild(childId, guardianId, token);
    if (selected.id !== childId) throw new FamilyError("not_allowed", 403);
    const rows = await call("/rest/v1/rpc/academy_guardian_session_summaries", "POST", { p_child_id: childId, p_offset: offset }, token) as unknown;
    if (!Array.isArray(rows) || rows.length > 51) throw new FamilyError("provider_unavailable", 503);
    const allowed = new Set(["id", "child_id", "subject", "starts_at", "ends_at", "time_zone", "status", "outcome", "follow_up_note"]);
    const subjects = new Set(["quran", "nur_al_bayan", "tajweed"]);
    const outcomes = new Set(["attended_completed", "attended_incomplete", "absent"]);
    const statuses = new Set(["scheduled", "cancelled"]);
    const safe = rows.map((row) => {
      if (!row || typeof row !== "object") throw new FamilyError("provider_unavailable", 503);
      const value = row as Record<string, unknown>;
      const starts = typeof value.starts_at === "string" ? new Date(value.starts_at) : new Date(NaN);
      const ends = typeof value.ends_at === "string" ? new Date(value.ends_at) : new Date(NaN);
      const validZone = (() => { try { if (typeof value.time_zone !== "string") throw new Error(); new Intl.DateTimeFormat("en", { timeZone: value.time_zone }).format(); return true; } catch { return false; } })();
      const note = value.follow_up_note;
      const validNote = typeof note === "string" && [...note].length <= 500 && (note === "" || note.trim().length > 0) && ![...note].some((character) => { const code = character.codePointAt(0)!; return (code >= 0 && code <= 8) || (code >= 11 && code <= 12) || (code >= 14 && code <= 31) || (code >= 127 && code <= 159); }) && (value.outcome !== null ? true : note === "");
      if (Object.keys(value).some((key) => !allowed.has(key)) || typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) || value.child_id !== childId || typeof value.subject !== "string" || !subjects.has(value.subject) || !Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || starts.getTime() >= ends.getTime() || typeof value.starts_at !== "string" || typeof value.ends_at !== "string" || typeof value.time_zone !== "string" || !validZone || typeof value.status !== "string" || !statuses.has(value.status) || (value.outcome !== null && (typeof value.outcome !== "string" || !outcomes.has(value.outcome))) || !validNote) throw new FamilyError("provider_unavailable", 503);
      return { id: value.id, child_id: childId, subject: value.subject, starts_at: value.starts_at, ends_at: value.ends_at, time_zone: value.time_zone, status: value.status, outcome: value.outcome, follow_up_note: value.follow_up_note };
    });
    return { summaries: safe.slice(0, 50), has_more: safe.length === 51, next_offset: safe.length === 51 ? offset + 50 : null };
  }

  // Operator-only probe: GET requests only, no account creation, tokens or email.
  // A denied anonymous read does NOT prove authenticated RLS or schema correctness.
  async function readiness() {
    if (!familyEnabled(env)) throw new FamilyError("registration_disabled", 503);
    await checkAuthSettings();
    const tables = ["academy_guardians", "academy_children"] as const;
    for (const table of tables) {
      let result: Response;
      try {
        result = await fetcher(`${url}/rest/v1/${table}?select=id&limit=0`, {
          method: "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10000),
          headers: { apikey: key },
        });
      } catch { throw new FamilyError("provider_unavailable", 503); }
      // Deny even a successful empty result: anon has no table SELECT grant.
      if (![401, 403].includes(result.status)) throw new FamilyError("anonymous_access_check_failed", 503);
      const detail = await result.json().catch(() => null);
      if (detail?.code !== "42501") throw new FamilyError("anonymous_access_check_failed", 503);
    }
    return { project: url, emailConfirmationRequired: true, emailSignupEnabled: true, anonymousTableAccess: "denied", authenticatedFlow: "not_tested", publicLaunch: "disabled" };
  }
  async function read(token: string | null) {
    if (!familyEnabled(env)) throw new FamilyError("registration_disabled", 503);
    if (!token) return { authenticated: false, guardian: null, children: [] };
    const u = await user(token);
    const guardians = await call(`/rest/v1/academy_guardians?id=eq.${u.id}&select=id,display_name,locale`, "GET", undefined, token) as unknown[];
    const children = await call(`/rest/v1/academy_children?guardian_id=eq.${u.id}&select=id,display_name,birth_year&order=created_at.asc`, "GET", undefined, token);
    return { authenticated: true, guardian: guardians[0] ?? null, children };
  }
  async function act(value: Json, token: string | null) {
    if (!familyEnabled(env)) throw new FamilyError("registration_disabled", 503);
    if (value.action === "signup") {
      shape(value, ["email", "password", "display_name", "locale", "consent"]);
      const c = credentials(value); profile(value);
      if (familyMode(env) === "owner-preview" && !allowedPreviewEmail(c.email, env)) throw new FamilyError("not_allowed", 403);
      if (familyMode(env) === "owner-preview" && env.ACADEMY_FAMILY_SIGNUP !== "owner-test-approved") throw new FamilyError("signup_disabled", 503);
      await checkAuthSettings();
      const redirect = familyMode(env) === "owner-preview" ? `?redirect_to=${encodeURIComponent(previewCallbackUrl(env)!)}` : "";
      await call(`/auth/v1/signup${redirect}`, "POST", c);
      return { data: { status: "confirmation_required" } };
    }
    if (value.action === "login") {
      shape(value, ["email", "password"]);
      const c = credentials(value);
      if (familyMode(env) === "owner-preview" && !allowedPreviewEmail(c.email, env)) throw new FamilyError("not_allowed", 403);
      const session = await call("/auth/v1/token?grant_type=password", "POST", c) as Json;
      if (typeof session.access_token !== "string" || !/^[A-Za-z0-9_.-]{20,3800}$/.test(session.access_token)) throw new FamilyError("authentication_failed", 401);
      await user(session.access_token);
      return { data: { status: "signed_in" }, token: session.access_token, maxAge: Math.min(3600, Math.max(1, Number(session.expires_in) || 3600)) };
    }
    if (value.action === "logout") {
      shape(value, []);
      if (token) {
        try { await call("/auth/v1/logout?scope=local", "POST", undefined, token); }
        catch (error) { if (!(error instanceof FamilyError) || error.status !== 401) throw error; }
      }
      return { data: { status: "signed_out" }, token: "", maxAge: 0 };
    }
    if (!token) throw new FamilyError("sign_in_required", 401);
    const u = await user(token);
    if (value.action === "learner-workspace") {
      shape(value, ["child_id", "locale"]);
      const childId = uuid(value.child_id);
      if (value.locale !== "ar" && value.locale !== "en") throw new FamilyError("invalid_request");
      const selected = await ownedChild(childId, u.id, token, true);
      const stored = familyMode(env) === "owner-preview" ? await learning(childId, u.id, token) : emptyLearning();
      return { data: { ...syntheticLearnerWorkspace({ id: childId, display_name: selected.display_name }, value.locale), learning: stored } };
    }
    if (["save-learning-plan", "delete-learning-plan", "add-practice", "update-practice", "delete-practice"].includes(String(value.action))) {
      // No persistence path may target the legacy/Production or local-review project.
      if (familyMode(env) !== "owner-preview" || url !== PREVIEW_PROJECT) throw new FamilyError("registration_disabled", 503);
      const isPlan = value.action === "save-learning-plan";
      const isPractice = value.action === "add-practice" || value.action === "update-practice";
      const fields = isPlan ? ["goal", "weekly_target_minutes"] : isPractice ? ["activity", "minutes", "practiced_on", "note"] : [];
      if (value.action === "update-practice" || value.action === "delete-practice") fields.push("id");
      shape(value, ["child_id", ...fields]);
      const childId = uuid(value.child_id);
      const entryId = fields.includes("id") ? uuid(value.id) : null;
      let payload: Json | undefined;
      if (isPlan) {
        if (!Number.isInteger(value.weekly_target_minutes) || Number(value.weekly_target_minutes) < 1 || Number(value.weekly_target_minutes) > 840) throw new FamilyError("invalid_request");
        payload = { goal: text(value.goal, 1, 500), weekly_target_minutes: value.weekly_target_minutes };
      } else if (isPractice) payload = practice(value);
      await ownedChild(childId, u.id, token);
      const scope = `child_id=eq.${childId}&guardian_id=eq.${u.id}`;
      if (isPlan) {
        const rows = await call(`/rest/v1/academy_learning_plans?${scope}&select=goal`, "PATCH", payload, token, "return=representation");
        if (!Array.isArray(rows) || rows.length > 1) throw new FamilyError("provider_unavailable", 503);
        if (!rows.length) await call("/rest/v1/academy_learning_plans", "POST", { child_id: childId, guardian_id: u.id, ...payload }, token, "return=minimal");
      } else if (value.action === "delete-learning-plan") {
        await call(`/rest/v1/academy_learning_plans?${scope}`, "DELETE", undefined, token, "return=minimal");
      } else if (value.action === "add-practice") {
        await call("/rest/v1/academy_practice_entries", "POST", { child_id: childId, guardian_id: u.id, ...payload }, token, "return=minimal");
      } else {
        const rows = await call(`/rest/v1/academy_practice_entries?${scope}&id=eq.${entryId}&select=id`, value.action === "update-practice" ? "PATCH" : "DELETE", payload, token, "return=representation");
        if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== entryId) throw new FamilyError("not_found", 404);
      }
      return { data: { status: "saved" } };
    }
    if (value.action === "save-guardian") {
      shape(value, ["display_name", "locale", "consent"]);
      await call("/rest/v1/academy_guardians?on_conflict=id", "POST", { id: u.id, ...profile(value) }, token, "resolution=merge-duplicates,return=minimal");
    } else if (value.action === "add-child") {
      shape(value, ["display_name", "birth_year"]);
      await call("/rest/v1/academy_children", "POST", { guardian_id: u.id, ...child(value) }, token, "return=minimal");
    } else if (value.action === "update-child") {
      shape(value, ["id", "display_name", "birth_year"]);
      const rows = await call(`/rest/v1/academy_children?id=eq.${uuid(value.id)}&guardian_id=eq.${u.id}`, "PATCH", child(value), token, "return=representation");
      if (!Array.isArray(rows) || rows.length !== 1) throw new FamilyError("not_found", 404);
    } else if (value.action === "delete-child") {
      shape(value, ["id"]);
      const rows = await call(`/rest/v1/academy_children?id=eq.${uuid(value.id)}&guardian_id=eq.${u.id}`, "DELETE", undefined, token, "return=representation");
      if (!Array.isArray(rows) || rows.length !== 1) throw new FamilyError("not_found", 404);
    } else throw new FamilyError("invalid_request");
    return { data: { status: "saved" } };
  }
  return { read, act, readiness, sessionSummaries, authenticate: user };
}
