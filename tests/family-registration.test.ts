import { test } from "node:test";
import assert from "node:assert/strict";
import {
  familyAdapter,
  familyBody,
  familyEnabled,
  familySecurity,
  familyToken,
  FamilyError,
  FAMILY_PROJECT,
  PREVIEW_PROJECT,
  PREVIEW_OWNER_EMAIL,
  allowedPreviewEmail,
} from "../src/lib/academy/family-registration";

type Env = Record<string, string | undefined>;
const userId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";
const token = "tok_abcdefghijklmnopqrstuvwxyz";
const env = (extra: Env = {}): Env => ({
  ACADEMY_FAMILY_REGISTRATION: "local-review",
  ACADEMY_SUPABASE_URL: FAMILY_PROJECT,
  ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  ...extra,
});

function response(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(value === undefined ? null : JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
function request(method = "GET", url = "http://localhost/", headers: Record<string, string> = {}, body?: unknown) {
  const host = new URL(url).host;
  return new Request(url, {
    method,
    headers: body === undefined ? { host, ...headers } : { host, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
function errorCode(error: unknown) {
  assert.ok(error instanceof FamilyError);
  return [error.code, error.status];
}
function mockFetch(routes: Record<string, unknown | Response | ((init: RequestInit) => unknown | Response)> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url: string | URL | Request, init: RequestInit = {}) => {
    const text = url instanceof Request ? url.url : String(url);
    calls.push({ url: text, init });
    const path = new URL(text).pathname + new URL(text).search;
    const value = routes[path];
    if (value instanceof Response) return value;
    if (typeof value === "function") {
      const result = value(init);
      return result instanceof Response ? result : response(result);
    }
    return response(value === undefined ? {} : value);
  };
  return { fetcher, calls };
}

async function rejectsCode(promise: Promise<unknown>, code: string, status?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.deepEqual(errorCode(error), [code, status ?? 400]);
    return true;
  });
}

test("feature is disabled by default and on hosted Vercel environments even when keys exist", () => {
  assert.equal(familyEnabled(env({ ACADEMY_FAMILY_REGISTRATION: undefined })), false);
  assert.equal(familyEnabled(env({ VERCEL: "1" })), false);
  assert.equal(familyEnabled(env({ VERCEL_ENV: "preview" })), false);
  assert.equal(familyEnabled(env({ VERCEL_ENV: "production" })), false);
  assert.equal(familyEnabled(env({ NETLIFY: "true" })), false);
  assert.equal(familyEnabled(env({ CF_PAGES: "1" })), false);
  assert.throws(() => familySecurity(request(), env({ VERCEL_ENV: "preview" })), (e: unknown) => errorCode(e)[0] === "registration_disabled");
});

test("security permits only loopback same-origin requests and rejects forwarding, origin, query and CSRF tricks", () => {
  familySecurity(request("GET", "http://localhost/"), env());
  for (const headers of [
    { host: "evil.example" },
    { host: "localhost", "x-forwarded-host": "evil.example" },
    { host: "localhost", "x-forwarded-proto": "https" },
    { host: "localhost", origin: "https://localhost" },
    { host: "localhost", "sec-fetch-site": "cross-site" },
  ] as Record<string, string>[]) assert.throws(() => familySecurity(request("GET", "http://localhost/", headers), env()), (e: unknown) => errorCode(e)[0] === "local_review_only" || errorCode(e)[0] === "same_origin_required");
  assert.throws(() => familySecurity(request("GET", "http://localhost/?csrf=1"), env()), (e: unknown) => errorCode(e)[0] === "invalid_request");
  assert.throws(() => familySecurity(request("POST", "http://localhost/", { origin: "http://localhost" }), env()), (e: unknown) => errorCode(e)[0] === "csrf_required");
  familySecurity(request("POST", "http://localhost/", { origin: "http://localhost", "x-family-registration": "local-review" }), env());
});

test("preview configuration requires the immutable branch, exact HTTPS origin, and one safe share", () => {
  const base = { ACADEMY_SUPABASE_URL: PREVIEW_PROJECT, ACADEMY_FAMILY_REGISTRATION: "owner-preview", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic", ACADEMY_FAMILY_ALLOWED_EMAIL: "abdelrahmanbakri113@gmail.com", ACADEMY_FAMILY_CALLBACK_URL: "https://elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app/auth/family/callback?_vercel_share=synthetic_share", ACADEMY_FAMILY_SIGNUP: "owner-test-approved" };
  assert.equal(familyEnabled(env(base)), true);
  for (const bad of [
    { VERCEL_GIT_COMMIT_REF: undefined },
    { VERCEL_GIT_COMMIT_REF: "preview/other" },
    { ACADEMY_FAMILY_CALLBACK_URL: base.ACADEMY_FAMILY_CALLBACK_URL!.replace("https://", "https://:443") },
    { ACADEMY_FAMILY_CALLBACK_URL: base.ACADEMY_FAMILY_CALLBACK_URL!.replace("synthetic_share", "short") },
    { ACADEMY_FAMILY_CALLBACK_URL: base.ACADEMY_FAMILY_CALLBACK_URL + "&extra=x" },
    { ACADEMY_FAMILY_CALLBACK_URL: base.ACADEMY_FAMILY_CALLBACK_URL!.replace("vercel.app/", "vercel.app:8443/") },
  ]) assert.equal(familyEnabled(env({ ...base, ...bad })), false);
});

test("preview signup remains closed without independent approval and makes no provider call", async () => {
  const m = mockFetch();
  await rejectsCode(familyAdapter(env({ ACADEMY_SUPABASE_URL: PREVIEW_PROJECT, ACADEMY_FAMILY_REGISTRATION: "owner-preview", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic", ACADEMY_FAMILY_ALLOWED_EMAIL: "abdelrahmanbakri113@gmail.com", ACADEMY_FAMILY_CALLBACK_URL: "https://elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app/auth/family/callback?_vercel_share=synthetic_share" }), m.fetcher).act({ action: "signup", email: PREVIEW_OWNER_EMAIL, password: "long-enough-password", display_name: "A User", locale: "en", consent: true }, null), "signup_disabled", 503);
  assert.equal(m.calls.length, 0);
});

test("preview whitelist is immutable, rejects old project, wrong branch, and production flags without calls", async () => {
  const preview = { ACADEMY_SUPABASE_URL: PREVIEW_PROJECT, ACADEMY_FAMILY_REGISTRATION: "owner-preview", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic", ACADEMY_FAMILY_ALLOWED_EMAIL: "attacker@example.test", ACADEMY_FAMILY_CALLBACK_URL: "https://elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app/auth/family/callback?_vercel_share=synthetic_share", ACADEMY_FAMILY_SIGNUP: "owner-test-approved" };
  assert.equal(familyEnabled(env(preview)), true);
  assert.equal(familyEnabled(env({ ...preview, ACADEMY_SUPABASE_URL: FAMILY_PROJECT })), false);
  await rejectsCode(Promise.resolve().then(() => familyAdapter(env({ ...preview, ACADEMY_SUPABASE_URL: FAMILY_PROJECT })).act({ action: "login", email: PREVIEW_OWNER_EMAIL, password: "long-enough-password" }, null)), "registration_disabled", 503);
  await rejectsCode(familyAdapter(env(preview), mockFetch().fetcher).act({ action: "login", email: "attacker@example.test", password: "long-enough-password" }, null), "not_allowed", 403);
  assert.equal(allowedPreviewEmail(PREVIEW_OWNER_EMAIL, env(preview)), true);
  assert.equal(allowedPreviewEmail("attacker@example.test", env(preview)), false);
  for (const flags of [{ VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "preview/other" }]) assert.equal(familyEnabled(env({ ...preview, ...flags })), false);
});



test("configuration rejects wrong project and service-role or malformed keys", async () => {
  for (const bad of [
    { ACADEMY_SUPABASE_URL: "https://wrong.supabase.co" },
    { ACADEMY_SUPABASE_PUBLISHABLE_KEY: "service_role_secret" },
    { ACADEMY_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIiwicmVmIjoid2J1bHhkbmZrbm95YmRrdWhheXoifQ.x" },
    { ACADEMY_SUPABASE_PUBLISHABLE_KEY: "" },
  ]) await rejectsCode(Promise.resolve().then(() => familyAdapter(env(bad))), "configuration_required", 503);
});

test("signup preflight requires confirmation-capable settings, strict shape, and never returns a token or role metadata", async () => {
  const badSettings = mockFetch({ "/auth/v1/settings": { mailer_autoconfirm: true, disable_signup: false } });
  await rejectsCode(familyAdapter(env(), badSettings.fetcher).act({ action: "signup", email: "a@example.com", password: "long-enough-password", display_name: "A User", locale: "en", consent: true }, null), "email_confirmation_configuration_required", 503);
  assert.equal(badSettings.calls.length, 1);

  const good = mockFetch({ "/auth/v1/settings": { mailer_autoconfirm: false, disable_signup: false, external: { email: true } }, "/auth/v1/signup": {} });
  const result = await familyAdapter(env(), good.fetcher).act({ action: "signup", email: "A@EXAMPLE.COM", password: "long-enough-password", display_name: "A User", locale: "en", consent: true }, null);
  assert.deepEqual(result.data, { status: "confirmation_required" });
  assert.equal(result.token, undefined);
  const signup = good.calls.find(c => c.url.endsWith("/auth/v1/signup"))!;
  const sent = JSON.parse(String(signup.init.body));
  assert.deepEqual(sent, { email: "a@example.com", password: "long-enough-password" });
  assert.equal("role" in sent, false);
  await rejectsCode(familyAdapter(env(), good.fetcher).act({ action: "signup", email: "a@example.com", password: "long-enough-password", display_name: "A User", locale: "en", consent: true, role: "admin" }, null), "invalid_request");
});

test("login validates the provider /user response, email confirmation and anonymous status", async () => {
  for (const user of [
    { id: userId, email_confirmed_at: null },
    { id: userId, email_confirmed_at: "2025-01-01T00:00:00Z", is_anonymous: true },
    { id: "not-a-uuid", email_confirmed_at: "2025-01-01T00:00:00Z" },
  ]) {
    const m = mockFetch({ "/auth/v1/token?grant_type=password": { access_token: token, expires_in: 99 }, "/auth/v1/user": user });
    await rejectsCode(familyAdapter(env(), m.fetcher).act({ action: "login", email: "a@example.com", password: "long-enough-password" }, null), user.is_anonymous ? "email_confirmation_required" : user.id === userId ? "email_confirmation_required" : "invalid_request", user.id === "not-a-uuid" ? 400 : 403);
    assert.ok(m.calls.some(c => c.url.endsWith("/auth/v1/user")));
  }
});

test("child mutations derive guardian identity from verified user, enforce exact shapes and bounds", async () => {
  const m = mockFetch({ "/auth/v1/user": { id: userId, email_confirmed_at: "2025-01-01T00:00:00Z" }, "/rest/v1/academy_children": {} });
  const adapter = familyAdapter(env(), m.fetcher);
  const year = new Date().getUTCFullYear();
  await rejectsCode(adapter.act({ action: "add-child", display_name: "Child", birth_year: year, guardian_id: "99999999-9999-4999-8999-999999999999", role: "admin" }, token), "invalid_request");
  await adapter.act({ action: "add-child", display_name: "Child", birth_year: year }, token);
  const sent = JSON.parse(String(m.calls.at(-1)!.init.body));
  assert.deepEqual(sent, { guardian_id: userId, display_name: "Child", birth_year: year });
  for (const body of [
    { action: "add-child", display_name: "x", birth_year: year },
    { action: "add-child", display_name: "Child", birth_year: year - 19 },
    { action: "add-child", display_name: "Child", birth_year: year + 1 },
    { action: "add-child", display_name: "C\u0000hild", birth_year: year },
  ]) await rejectsCode(adapter.act(body, token), body.display_name === "x" || body.display_name?.includes("\u0000") ? "invalid_request" : "invalid_birth_year");
});

test("read filters by verified guardian id and rejects unauthenticated mutations", async () => {
  const m = mockFetch({ "/auth/v1/user": { id: userId, email_confirmed_at: "2025-01-01T00:00:00Z" }, [`/rest/v1/academy_guardians?id=eq.${userId}&select=id,display_name,locale`]: [{ id: userId, display_name: "Parent", locale: "en" }], [`/rest/v1/academy_children?guardian_id=eq.${userId}&select=id,display_name,birth_year&order=created_at.asc`]: [{ id: childId, display_name: "Child", birth_year: 2015 }] });
  const result = await familyAdapter(env(), m.fetcher).read(token);
  assert.equal(result.authenticated, true);
  assert.equal(m.calls[1].url.includes(`id=eq.${userId}`), true);
  assert.equal(m.calls[2].url.includes(`guardian_id=eq.${userId}`), true);
  assert.deepEqual(await familyAdapter(env(), m.fetcher).read(null), { authenticated: false, guardian: null, children: [] });
  await rejectsCode(familyAdapter(env(), m.fetcher).act({ action: "add-child", display_name: "Child", birth_year: 2015 }, null), "sign_in_required", 401);
});

test("provider failures are sanitized and body/token helpers enforce limits", async () => {
  const unavailable = mockFetch({ "/auth/v1/settings": new Response("postgres password SELECT secret", { status: 500 }) });
  await rejectsCode(familyAdapter(env(), unavailable.fetcher).act({ action: "signup", email: "a@example.com", password: "long-enough-password", display_name: "A User", locale: "en", consent: true }, null), "authentication_failed", 400);
  try { await familyAdapter(env(), unavailable.fetcher).act({ action: "signup", email: "a@example.com", password: "long-enough-password", display_name: "A User", locale: "en", consent: true }, null); } catch (e) { assert.doesNotMatch(String(e), /postgres|SELECT|secret/i); }
  assert.equal(familyToken(request("GET", "http://localhost/", { cookie: `academy_family_access=${token}; x=y` })), token);
  assert.equal(familyToken(request("GET", "http://localhost/", { cookie: "academy_family_access=short" })), null);
  assert.deepEqual(await familyBody(request("POST", "http://localhost/", {}, { action: "ok" })), { action: "ok" });
  await rejectsCode(familyBody(request("POST", "http://localhost/", { "content-type": "text/plain" }, "x")), "invalid_request");
  const oversized = new Request("http://localhost/", { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(8193) });
  await rejectsCode(familyBody(oversized), "payload_too_large", 413);
});

test("guardian profile upsert uses verified identity and consent, not a client-selected account", async () => {
  const m = mockFetch({ "/auth/v1/user": { id: userId, email_confirmed_at: "2026-01-01T00:00:00Z" }, "/rest/v1/academy_guardians?on_conflict=id": {} });
  const adapter = familyAdapter(env(), m.fetcher);
  await adapter.act({ action: "save-guardian", display_name: "Guardian Test", locale: "ar", consent: true }, token);
  const payload = JSON.parse(String(m.calls.at(-1)!.init.body));
  assert.equal(payload.id, userId);
  assert.equal(payload.consent_version, "family-v1");
  assert.equal(payload.locale, "ar");
  assert.ok(Number.isFinite(Date.parse(payload.consented_at)));
  await rejectsCode(adapter.act({ action: "save-guardian", display_name: "Guardian Test", locale: "ar", consent: false }, token), "consent_required");
  await rejectsCode(adapter.act({ action: "save-guardian", id: childId, display_name: "Guardian Test", locale: "ar", consent: true }, token), "invalid_request");
});

test("child update/delete use owner filters and distinguish a zero-row result from a successful mutation", async () => {
  const path = `/rest/v1/academy_children?id=eq.${childId}&guardian_id=eq.${userId}`;
  const m = mockFetch({ "/auth/v1/user": { id: userId, email_confirmed_at: "2026-01-01T00:00:00Z" }, [path]: [{ id: childId }] });
  const adapter = familyAdapter(env(), m.fetcher);
  await adapter.act({ action: "update-child", id: childId, display_name: "Child Updated", birth_year: new Date().getUTCFullYear() - 10 }, token);
  assert.equal(m.calls.at(-1)!.init.method, "PATCH");
  assert.equal((m.calls.at(-1)!.init.headers as Record<string, string>).Prefer, "return=representation");
  await adapter.act({ action: "delete-child", id: childId }, token);
  assert.equal(m.calls.at(-1)!.init.method, "DELETE");
  const missing = mockFetch({ "/auth/v1/user": { id: userId, email_confirmed_at: "2026-01-01T00:00:00Z" }, [path]: [] });
  await rejectsCode(familyAdapter(env(), missing.fetcher).act({ action: "delete-child", id: childId }, token), "not_found", 404);
});

test("provider network exceptions and redirects cannot leak details or bypass the pinned project", async () => {
  const m = mockFetch({ "/auth/v1/settings": { mailer_autoconfirm: false, disable_signup: false, external: { email: true } } });
  await familyAdapter(env(), m.fetcher).act({ action: "signup", email: "test@example.test", password: "synthetic-password", display_name: "Guardian Test", locale: "en", consent: true }, null);
  for (const call of m.calls) {
    assert.equal(new URL(call.url).origin, FAMILY_PROJECT);
    assert.equal(call.init.redirect, "error");
    assert.equal(call.init.cache, "no-store");
  }
  const broken: typeof fetch = async () => { throw new Error("sensitive provider detail"); };
  await rejectsCode(familyAdapter(env(), broken).read(token), "provider_unavailable", 503);
});

test("readiness performs only fixed GET probes and returns no credentials or raw settings", async () => {
  const denied = () => response({ code: "42501", message: "permission denied" }, 401);
  const m = mockFetch({
    "/auth/v1/settings": { mailer_autoconfirm: false, disable_signup: false, external: { email: true } },
    "/rest/v1/academy_guardians?select=id&limit=0": denied,
    "/rest/v1/academy_children?select=id&limit=0": denied,
  });
  const result = await familyAdapter(env(), m.fetcher).readiness();
  assert.equal(result.publicLaunch, "disabled");
  assert.equal(result.authenticatedFlow, "not_tested");
  assert.equal(result.anonymousTableAccess, "denied");
  assert.equal(m.calls.length, 3);
  for (const c of m.calls) {
    assert.equal(c.init.method, "GET");
    assert.equal(c.init.body, undefined);
    assert.equal(c.init.redirect, "error");
    assert.equal(new URL(c.url).origin, FAMILY_PROJECT);
    assert.equal((c.init.headers as Record<string, string>).Authorization, undefined);
  }
  assert.doesNotMatch(JSON.stringify(result), /sb_publishable_|password|access_token|permission denied/);
  const blocked = mockFetch();
  await rejectsCode(Promise.resolve().then(() => familyAdapter(env({ VERCEL: "1" }), blocked.fetcher).readiness()), "registration_disabled", 503);
  assert.equal(blocked.calls.length, 0);
});

test("readiness rejects accessible tables, invalid API keys, missing schema and provider errors", async () => {
  for (const result of [response([]), response({ code: "PGRST205" }, 404), response({ message: "Invalid API key" }, 401), response({ code: "42501" }, 500)]) {
    const m = mockFetch({ "/auth/v1/settings": { mailer_autoconfirm: false, disable_signup: false, external: { email: true } }, "/rest/v1/academy_guardians?select=id&limit=0": result });
    await rejectsCode(familyAdapter(env(), m.fetcher).readiness(), "anonymous_access_check_failed", 503);
    assert.equal(m.calls.length, 2);
  }
});

test("signup and readiness fail closed on absent, disabled or malformed email settings", async () => {
  for (const settings of [null, {}, { mailer_autoconfirm: false }, { mailer_autoconfirm: false, disable_signup: false, external: { email: false } }, { mailer_autoconfirm: false, disable_signup: true, external: { email: true } }]) {
    const m = mockFetch({ "/auth/v1/settings": settings });
    const adapter = familyAdapter(env(), m.fetcher);
    await rejectsCode(adapter.readiness(), "email_confirmation_configuration_required", 503);
    await rejectsCode(adapter.act({ action: "signup", email: "a@example.test", password: "synthetic-password-123", display_name: "Guardian Test", locale: "en", consent: true }, null), "email_confirmation_configuration_required", 503);
    assert.ok(m.calls.every(c => c.init.method === "GET"));
  }
});
