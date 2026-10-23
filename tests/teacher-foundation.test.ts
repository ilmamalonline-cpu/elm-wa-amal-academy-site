import { test } from "node:test";
import assert from "node:assert/strict";
import { enabled, read, TeacherFoundationError, type FetchLike } from "../src/lib/academy/teacher-foundation";

const uid = "11111111-1111-4111-8111-111111111111";
const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic",
  ACADEMY_SUPABASE_URL: "https://dyyvpcntbbwbuzskiidb.supabase.co", ACADEMY_TEACHER_ACCOUNTS: "roster-approved",
  ACADEMY_SUPABASE_ANON_KEY: "sb_publishable_mock_public_test_key_only",
};
const teacher = { id: uid, display_name: "Teacher", time_zone: "Asia/Riyadh", secret: "must not escape" };
const lesson = (n = "1") => ({ id: `22222222-2222-4222-8222-${n.padStart(12, "0")}`, child_id: "33333333-3333-4333-8333-333333333333", subject: "quran", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T11:00:00Z", time_zone: "Asia/Riyadh", status: "scheduled", private_note: "hidden" });

type Call = { url: string; init?: RequestInit };
function mockFetch(responses: Array<Response | (() => Response)>): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  return { calls, fetchImpl: async (input, init) => { calls.push({ url: String(input), init }); const item = responses[index++]; if (!item) throw new Error("unexpected call"); return typeof item === "function" ? item() : item; } };
}
function json(value: unknown, status = 200): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
async function errorCode(promise: Promise<unknown>, status: number, code: string) { await assert.rejects(promise, (error: unknown) => error instanceof TeacherFoundationError && error.status === status && error.code === code); }

 test("enabled is fail-closed and requires every preview gate plus roster-approved", () => {
  assert.equal(enabled(env), true);
  for (const altered of [
    { VERCEL: "0" }, { VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" },
    { ACADEMY_SUPABASE_URL: "https://other.supabase.co" }, { ACADEMY_TEACHER_ACCOUNTS: "approved-roster-required" }, { ACADEMY_TEACHER_ACCOUNTS: undefined },
  ]) assert.equal(enabled({ ...env, ...altered }), false);
});

test("public key family accepts anon/publishable and rejects secret/service keys", async () => {
  const good = mockFetch([json({ id: uid, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false }), json([teacher]), json([])]);
  await read("token", { env: { ...env, ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mock_public_test_key_only" }, fetchImpl: good.fetchImpl });
  await errorCode(read("token", { env: { ...env, ACADEMY_SUPABASE_ANON_KEY: "service_role_secret" }, fetchImpl: good.fetchImpl }), 503, "teacher_roster_unavailable");
});

test("read verifies identity, never accepts a user-supplied teacher id, and returns only allowlisted fields", async () => {
  const mock = mockFetch([json({ id: uid, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false, email: "private@example.test" }), json([teacher]), json([lesson()])]);
  const result = await read("access-token", { env, fetchImpl: mock.fetchImpl });
  assert.deepEqual(result.teacher, { id: uid, display_name: "Teacher", time_zone: "Asia/Riyadh" });
  assert.deepEqual(result.lessons, [{ id: "22222222-2222-4222-8222-000000000001", child_id: "33333333-3333-4333-8333-333333333333", subject: "quran", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T11:00:00Z", time_zone: "Asia/Riyadh", status: "scheduled" }]);
  assert.equal("email" in result, false);
  assert.match(mock.calls[1].url, new RegExp(`id=eq\\.${uid}`));
  assert.doesNotMatch(mock.calls[1].url, /attacker|teacher_id/);
  assert.match(mock.calls[2].url, /teacher_id=eq\.[^&]+/);
  for (const call of mock.calls) { assert.equal(call.init?.method, "GET"); assert.equal(call.init?.cache, "no-store"); assert.equal(call.init?.redirect, "error"); assert.equal((call.init?.headers as Record<string, string>).Authorization, "Bearer access-token"); }
});

test("anonymous, inactive/missing profiles, malformed data and provider failures are denied generically", async () => {
  await errorCode(read("token", { env, fetchImpl: mockFetch([json({ id: uid, is_anonymous: true })]).fetchImpl }), 401, "authentication_required");
  await errorCode(read("token", { env, fetchImpl: mockFetch([json({ id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }), json([])]).fetchImpl }), 403, "teacher_profile_required");
  await errorCode(read("token", { env, fetchImpl: mockFetch([json({ id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }), json([{ ...teacher, display_name: 42 }])]).fetchImpl }), 503, "teacher_roster_unavailable");
  await errorCode(read("token", { env, fetchImpl: mockFetch([json({ id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }), json([teacher]), json([{ ...lesson(), starts_at: "not-a-date" }])]).fetchImpl }), 503, "teacher_roster_unavailable");
  await errorCode(read("token", { env, fetchImpl: mockFetch([json({ id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }), json([teacher]), json([{ ...lesson(), status: "unknown" }])]).fetchImpl }), 503, "teacher_roster_unavailable");
  await errorCode(read("token", { env, fetchImpl: mockFetch([new Response("upstream", { status: 500 })]).fetchImpl }), 503, "teacher_roster_unavailable");
});

test("bounded offset pagination requests limit 51, slices to 50 and exposes has_more", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => lesson(String(i + 1)));
  const mock = mockFetch([json({ id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }), json([teacher]), json(rows)]);
  const result = await read("token", { env, offset: 10000, fetchImpl: mock.fetchImpl });
  assert.equal(result.lessons.length, 50); assert.equal(result.has_more, true); assert.equal(result.offset, 10000);
  assert.match(mock.calls[2].url, /limit=51&offset=10000$/);
  for (const offset of [-1, 10001, 1.5, "1"] as unknown[]) await errorCode(read("token", { env, offset: offset as number, fetchImpl: mock.fetchImpl }), 400, "invalid_pagination");
});

test("adapter makes no write or non-GET/auth-less calls", async () => {
  const mock = mockFetch([json({ id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" }), json([teacher]), json([])]);
  await read("secret-token", { env, fetchImpl: mock.fetchImpl });
  assert.equal(mock.calls.length, 3);
  for (const call of mock.calls) { assert.equal(call.init?.method, "GET"); assert.ok((call.init?.headers as Record<string, string>).Authorization); assert.doesNotMatch(call.url, /insert|update|delete|rpc/); }
});

test("encoded privileged keys and wrong-project anon JWTs cannot bypass the key gate", async () => {
  const jwt = (role: string, ref: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, ref })).toString("base64url")}.mock-signature`;
  const identity = { id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" };
  for (const key of [jwt("service_role", "dyyvpcntbbwbuzskiidb"), jwt("anon", "wrong-project"), "arbitrary-key", "sb_secret_test"]) {
    const mock = mockFetch([]);
    await errorCode(read("token", { env: { ...env, ACADEMY_SUPABASE_ANON_KEY: key }, fetchImpl: mock.fetchImpl }), 503, "teacher_roster_unavailable");
    assert.equal(mock.calls.length, 0);
  }
  const mock = mockFetch([json(identity), json([teacher]), json([])]);
  await read("token", { env: { ...env, ACADEMY_SUPABASE_ANON_KEY: jwt("anon", "dyyvpcntbbwbuzskiidb") }, fetchImpl: mock.fetchImpl });
});

test("unconfirmed identities and malformed profile/lesson contracts are rejected", async () => {
  const identity = { id: uid, is_anonymous: false, email_confirmed_at: "2026-01-01T00:00:00Z" };
  for (const value of [{ id: uid, is_anonymous: false }, { ...identity, email_confirmed_at: null }, { ...identity, id: "not-a-uuid" }, { ...identity, is_anonymous: true }]) {
    await errorCode(read("token", { env, fetchImpl: mockFetch([json(value)]).fetchImpl }), 401, "authentication_required");
  }
  for (const rows of [[teacher, teacher], [{ ...teacher, time_zone: "Not/AZone" }]]) {
    await errorCode(read("token", { env, fetchImpl: mockFetch([json(identity), json(rows)]).fetchImpl }), 503, "teacher_roster_unavailable");
  }
  for (const patch of [{ subject: "group" }, { child_id: "fake" }, { id: "fake" }, { time_zone: "Not/AZone" }, { ends_at: lesson().starts_at }]) {
    await errorCode(read("token", { env, fetchImpl: mockFetch([json(identity), json([teacher]), json([{ ...lesson(), ...patch }])]).fetchImpl }), 503, "teacher_roster_unavailable");
  }
});
