// Server-side adapter. Never import this module into a client component.
// No service-role key, role selection, demo identity or child credentials are accepted.
export const FAMILY_PROJECT = "https://vbulxdnfknoybdkuhayz.supabase.co";
export const FAMILY_COOKIE = "academy_family_access";
export const FAMILY_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const PREVIEW_CALLBACK_HOST = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
const CALLBACK_PATH = "/auth/family/callback";
type Env = Record<string, string | undefined>;
type Json = Record<string, unknown>;
export class FamilyError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
function validEmail(value: string | undefined) { return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value === value.toLowerCase(); }
function previewConfig(env: Env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" || env.VERCEL_GIT_COMMIT_REF !== "preview/academy-synthetic" || env.ACADEMY_FAMILY_REGISTRATION !== "owner-preview") return null;
  const email = env.ACADEMY_FAMILY_ALLOWED_EMAIL?.trim();
  const callback = env.ACADEMY_FAMILY_CALLBACK_URL;
  if (!validEmail(email) || !callback) return null;
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
    if (!host || local.pathname !== "/" || !["localhost", "127.0.0.1", "[::1]"].includes(local.hostname) || local.host !== host || local.username || local.password)
      throw new FamilyError("local_review_only", 403);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    if ((forwardedHost && forwardedHost !== host) || (forwardedProto && forwardedProto !== "http")) throw new FamilyError("local_review_only", 403);
    const origin = request.headers.get("origin"); const site = request.headers.get("sec-fetch-site");
    if ((origin && origin !== local.origin) || (site && !["same-origin", "none"].includes(site))) throw new FamilyError("same_origin_required", 403);
    if (parsed.search) throw new FamilyError("invalid_request");
    if (request.method !== "GET" && (origin !== local.origin || request.headers.get("x-family-registration") !== "local-review")) throw new FamilyError("csrf_required", 403);
    return;
  }
  const config = previewConfig(env)!;
  if (!host || host !== PREVIEW_CALLBACK_HOST || parsed.protocol !== "https:" || parsed.pathname !== "/api/family" || parsed.search) throw new FamilyError("preview_host_required", 403);
  const forwardedHost = request.headers.get("x-forwarded-host"); const forwardedProto = request.headers.get("x-forwarded-proto");
  if ((forwardedHost && forwardedHost !== PREVIEW_CALLBACK_HOST) || (forwardedProto && forwardedProto !== "https")) throw new FamilyError("preview_host_required", 403);
  const origin = request.headers.get("origin"); const site = request.headers.get("sec-fetch-site");
  if ((origin && origin !== `https://${PREVIEW_CALLBACK_HOST}`) || (site && !["same-origin", "none"].includes(site))) throw new FamilyError("same_origin_required", 403);
  if (request.method !== "GET" && (origin !== `https://${PREVIEW_CALLBACK_HOST}` || request.headers.get("x-family-registration") !== "local-review")) throw new FamilyError("csrf_required", 403);
  void config;
}
export function allowedPreviewEmail(email: string, env: Env = process.env) { const config = previewConfig(env); return !!config && email.trim().toLowerCase() === config.email; }
export function previewCallbackUrl(env: Env = process.env) { return previewConfig(env)?.callback ?? null; }
export function previewShare(env: Env = process.env) { return previewConfig(env)?.share ?? null; }
export function previewSignupEnabled(env: Env = process.env) { return familyMode(env) !== "owner-preview" || env.ACADEMY_FAMILY_SIGNUP === "owner-test-approved"; }

function configuration(env: Env) {
  if (env.ACADEMY_SUPABASE_URL !== FAMILY_PROJECT) throw new FamilyError("configuration_required", 503);
  const key = env.ACADEMY_SUPABASE_PUBLISHABLE_KEY ?? "";
  let publicKey = key.startsWith("sb_publishable_") && key.length > 25;
  if (!publicKey) {
    try {
      const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      publicKey = claims.role === "anon" && claims.ref === "vbulxdnfknoybdkuhayz";
    } catch { /* Reject absent, malformed, secret or service-role keys. */ }
  }
  if (!publicKey) throw new FamilyError("configuration_required", 503);
  return { url: FAMILY_PROJECT, key };
}
function shape(value: Json, keys: string[]) {
  if (Object.keys(value).sort().join(",") !== ["action", ...keys].sort().join(",")) throw new FamilyError("invalid_request");
}
function text(value: unknown, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new FamilyError("invalid_request");
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
  async function checkAuthSettings() {
    const settings = await call("/auth/v1/settings") as Json;
    const external = settings?.external as Json | undefined;
    if (!settings || settings.mailer_autoconfirm !== false || settings.disable_signup !== false || external?.email !== true)
      throw new FamilyError("email_confirmation_configuration_required", 503);
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
  return { read, act, readiness };
}
