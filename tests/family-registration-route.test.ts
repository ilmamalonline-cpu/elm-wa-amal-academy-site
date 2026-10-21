import { test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/family/route";
import { FAMILY_PROJECT, PREVIEW_PROJECT } from "../src/lib/academy/family-registration";

const id = "11111111-1111-4111-8111-111111111111";
const accessToken = "synthetic_access_token_abcdefghijklmnopqrstuvwxyz";
function req(action?: Record<string, unknown>, cookie?: string) {
  return new Request("http://127.0.0.1:3420/api/family", {
    method: action ? "POST" : "GET",
    headers: { host: "127.0.0.1:3420", origin: "http://127.0.0.1:3420", "content-type": "application/json", "x-family-registration": "local-review", ...(cookie ? { cookie } : {}) },
    ...(action ? { body: JSON.stringify(action) } : {}),
  });
}
async function isolated(run: () => Promise<void>) {
  const names = ["ACADEMY_FAMILY_REGISTRATION", "ACADEMY_SUPABASE_URL", "ACADEMY_SUPABASE_PUBLISHABLE_KEY", "ACADEMY_FAMILY_ALLOWED_EMAIL", "ACADEMY_FAMILY_CALLBACK_URL", "ACADEMY_FAMILY_SIGNUP", "VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "NETLIFY", "CF_PAGES"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const original = globalThis.fetch;
  try {
    for (const name of names) delete process.env[name];
    await run();
  } finally {
    globalThis.fetch = original;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
  }
}
function enable() {
  process.env.ACADEMY_FAMILY_REGISTRATION = "local-review";
  process.env.ACADEMY_SUPABASE_URL = FAMILY_PROJECT;
  process.env.ACADEMY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_synthetic_offline_example";
}

test("HTTP handlers fail closed before network calls, including hosted environments and missing configuration", async () => isolated(async () => {
  let calls = 0;
  globalThis.fetch = async () => { ++calls; throw new Error("unexpected network"); };
  assert.equal((await GET(req())).status, 503);
  enable();
  process.env.VERCEL = "1";
  assert.deepEqual(await (await GET(req())).json(), { error: "registration_disabled" });
  delete process.env.VERCEL;
  delete process.env.ACADEMY_SUPABASE_PUBLISHABLE_KEY;
  assert.deepEqual(await (await GET(req())).json(), { error: "configuration_required" });
  assert.equal(calls, 0);
}));

test("HTTP login stores access token only in scoped HttpOnly cookie and never returns provider credentials", async () => isolated(async () => {
  enable();
  globalThis.fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    return Response.json(path.endsWith("/token")
      ? { access_token: accessToken, refresh_token: "synthetic_refresh_never_persisted", expires_in: 99999 }
      : { id, email_confirmed_at: "2026-01-01T00:00:00Z" });
  };
  const result = await POST(req({ action: "login", email: "guardian@example.test", password: "synthetic-password-123" }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: "signed_in" });
  const cookie = result.headers.get("set-cookie")!;
  assert.match(cookie, /Path=\/api\/family; HttpOnly; SameSite=Strict; Max-Age=3600/);
  assert.match(cookie, new RegExp(accessToken));
  assert.doesNotMatch(cookie, /refresh/);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
}));

test("HTTP logout clears the session even if provider says it is expired, and expired reads clear cookies", async () => isolated(async () => {
  enable();
  globalThis.fetch = async () => new Response(null, { status: 401 });
  const cookie = `academy_family_access=${accessToken}`;
  const signedOut = await POST(req({ action: "logout" }, cookie));
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.get("set-cookie")!, /Max-Age=0/);
  const expired = await GET(req(undefined, cookie));
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie")!, /Max-Age=0/);
}));

test("HTTP mutating actions reject missing origin/header and oversized JSON without provider calls", async () => isolated(async () => {
  enable();
  let calls = 0;
  globalThis.fetch = async () => { ++calls; throw new Error("unexpected network"); };
  const unsafe = new Request("http://127.0.0.1:3420/api/family", { method: "POST", headers: { host: "127.0.0.1:3420" }, body: "{}" });
  assert.equal((await POST(unsafe)).status, 403);
  const oversized = req({ action: "signup", unknown: "x".repeat(8193) });
  assert.equal((await POST(oversized)).status, 413);
  assert.equal(calls, 0);
}));

const previewHost = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
function previewReq(action?: Record<string, unknown>, origin = `https://${previewHost}`) {
  return new Request(`https://${previewHost}/api/family`, { method: action ? "POST" : "GET", headers: { host: previewHost, origin, "x-forwarded-host": previewHost, "x-forwarded-proto": "https", "content-type": "application/json", "x-family-registration": "local-review" }, ...(action ? { body: JSON.stringify(action) } : {}) });
}
function enablePreview() {
  process.env.ACADEMY_FAMILY_REGISTRATION = "owner-preview";
  process.env.ACADEMY_SUPABASE_URL = PREVIEW_PROJECT;
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "preview/academy-synthetic";
  process.env.ACADEMY_FAMILY_ALLOWED_EMAIL = "abdelrahmanbakri113@gmail.com"; process.env.ACADEMY_FAMILY_SIGNUP = "owner-test-approved";
  process.env.ACADEMY_FAMILY_CALLBACK_URL = `https://${previewHost}/auth/family/callback?_vercel_share=synthetic-share`;
  process.env.ACADEMY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_synthetic_offline_example";
}

test("preview rejects disallowed auth before provider calls and rejects origin/host", async () => isolated(async () => {
  enablePreview();
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  assert.equal((await POST(previewReq({ action: "login", email: "other@example.test", password: "synthetic-password-123" }))).status, 403);
  assert.equal((await POST(previewReq({ action: "login", email: "abdelrahmanbakri113@gmail.com", password: "synthetic-password-123" }, "https://evil.example"))).status, 403);
  const wrongHost = new Request(`https://evil.example/api/family`, { method: "POST", headers: { host: "evil.example", origin: "https://evil.example", "x-family-registration": "local-review", "content-type": "application/json" }, body: JSON.stringify({ action: "login", email: "abdelrahmanbakri113@gmail.com", password: "synthetic-password-123" }) });
  assert.equal((await POST(wrongHost)).status, 403); assert.equal(calls, 0);
}));

test("preview signup uses immutable configured redirect and Secure cookie without refresh token", async () => isolated(async () => {
  enablePreview(); const calls: string[] = [];
  globalThis.fetch = async (input) => { calls.push(String(input)); const path = new URL(String(input)).pathname; return path.endsWith("/settings") ? Response.json({ mailer_autoconfirm: false, disable_signup: false, external: { email: true } }) : path.endsWith("/signup") ? Response.json({}) : Response.json({ access_token: accessToken, refresh_token: "synthetic_refresh_never_persisted", expires_in: 60 }); };
  const result = await POST(previewReq({ action: "signup", email: "abdelrahmanbakri113@gmail.com", password: "synthetic-password-123", display_name: "Owner", locale: "en", consent: true }));
  assert.equal(result.status, 200); const signupCall = calls.find((call) => call.includes("/auth/v1/signup"))!; assert.match(signupCall, /redirect_to=https%3A%2F%2Felm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app%2Fauth%2Ffamily%2Fcallback%3F_vercel_share%3Dsynthetic-share/);
  assert.doesNotMatch(signupCall, /evil|client/);
}));

test("preview signup rejects other emails and a closed gate without provider calls", async () => isolated(async () => {
  enablePreview(); let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  const signup = { action: "signup", email: "other@example.test", password: "synthetic-password-123", display_name: "Test", locale: "en", consent: true };
  assert.equal((await POST(previewReq(signup))).status, 403);
  delete process.env.ACADEMY_FAMILY_SIGNUP;
  const blocked = await POST(previewReq({ ...signup, email: "abdelrahmanbakri113@gmail.com" }));
  assert.equal(blocked.status, 503);
  assert.deepEqual(await blocked.json(), { error: "signup_disabled" });
  assert.equal(calls, 0);
}));

test("production stays closed even with every preview opt-in and the correct branch", async () => isolated(async () => {
  enablePreview(); process.env.VERCEL_ENV = "production"; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
  assert.deepEqual(await (await GET(previewReq())).json(), { error: "registration_disabled" });
  assert.deepEqual(await (await POST(previewReq({ action: "signup", email: "abdelrahmanbakri113@gmail.com", password: "synthetic-password-123", display_name: "Test", locale: "en", consent: true }))).json(), { error: "registration_disabled" });
  assert.equal(calls, 0);
}));

test("preview login validates provider email and stores only a Secure HttpOnly access cookie", async () => isolated(async () => {
  enablePreview();
  let email = "abdelrahmanbakri113@gmail.com";
  globalThis.fetch = async input => new URL(String(input)).pathname.endsWith("/token")
    ? Response.json({ access_token: accessToken, refresh_token: "synthetic_refresh_never_persisted", expires_in: 3600 })
    : Response.json({ id, email, email_confirmed_at: "2026-01-01T00:00:00Z" });
  const login = { action: "login", email: "abdelrahmanbakri113@gmail.com", password: "synthetic-password-123" };
  const success = await POST(previewReq(login));
  assert.equal(success.status, 200);
  assert.match(success.headers.get("set-cookie")!, /HttpOnly; SameSite=Strict; Secure;/);
  assert.doesNotMatch(await success.text(), /access_token|refresh_token|synthetic_access/);
  email = "other@example.test";
  const denied = await POST(previewReq(login));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.has("set-cookie"), false);
}));
