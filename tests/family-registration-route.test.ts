import { test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/family/route";
import { FAMILY_PROJECT } from "../src/lib/academy/family-registration";

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
  const names = ["ACADEMY_FAMILY_REGISTRATION", "ACADEMY_SUPABASE_URL", "ACADEMY_SUPABASE_PUBLISHABLE_KEY", "VERCEL", "VERCEL_ENV", "NETLIFY", "CF_PAGES"];
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
