import { test } from "node:test";
import assert from "node:assert/strict";
import { authorizeTeacherAdmin, TeacherAdminError, teacherAdminPreviewEnabled, type FetchLike } from "../src/lib/academy/teacher-admin";

const uid = "11111111-1111-4111-8111-111111111111";
const ref = "dyyvpcntbbwbuzskiidb";
const env: Record<string, string | undefined> = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic",
  ACADEMY_SUPABASE_URL: `https://${ref}.supabase.co`,
  ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mock_public_test_key_only",
  ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED: "1",
  ACADEMY_SUPABASE_SERVICE_ROLE_KEY: makeJwt("service_role", ref),
};

function makeJwt(role: string, projectRef: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, ref: projectRef })).toString("base64url");
  return `${header}.${payload}.test-signature-not-a-credential`;
}

const identity = { id: uid, email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false };
type Call = { url: string; init?: RequestInit };
function mockFetch(responses: Response[]): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let index = 0;
  return {
    calls,
    fetchImpl: async (input, init) => {
      calls.push({ url: String(input), init });
      const response = responses[index++];
      if (!response) throw new Error("unexpected request");
      return response;
    },
  };
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
async function errorCode(promise: Promise<unknown>, status: number, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof TeacherAdminError && error.status === status && error.code === code);
}

 test("admin authorization is opt-in and Preview-only", () => {
  assert.equal(teacherAdminPreviewEnabled(env), true);
  for (const altered of [
    { ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED: undefined },
    { ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED: "true" },
    { VERCEL: "0" },
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { ACADEMY_SUPABASE_URL: "https://other.supabase.co" },
  ]) assert.equal(teacherAdminPreviewEnabled({ ...env, ...altered }), false);
});

test("an absent or malformed user token is denied before any provider request", async () => {
  const mock = mockFetch([]);
  await errorCode(authorizeTeacherAdmin("", { env, fetchImpl: mock.fetchImpl }), 401, "authentication_required");
  await errorCode(authorizeTeacherAdmin(`bad\ntoken`, { env, fetchImpl: mock.fetchImpl }), 401, "authentication_required");
  assert.equal(mock.calls.length, 0);
});

test("configuration fails closed unless the explicit Preview gate and service credential are present", async () => {
  const mock = mockFetch([]);
  await errorCode(authorizeTeacherAdmin("access-token", {
    env: { ...env, ACADEMY_TEACHER_ADMIN_PREVIEW_ENABLED: undefined }, fetchImpl: mock.fetchImpl,
  }), 503, "teacher_admin_unavailable");
  await errorCode(authorizeTeacherAdmin("access-token", {
    env: { ...env, ACADEMY_SUPABASE_SERVICE_ROLE_KEY: undefined }, fetchImpl: mock.fetchImpl,
  }), 503, "teacher_admin_unavailable");
  await errorCode(authorizeTeacherAdmin("access-token", {
    env: { ...env, ACADEMY_SUPABASE_SERVICE_ROLE_KEY: makeJwt("anon", ref) }, fetchImpl: mock.fetchImpl,
  }), 503, "teacher_admin_unavailable");
  assert.equal(mock.calls.length, 0);
});

test("authenticated non-admin is denied and the browser credential is never used for the admin lookup", async () => {
  const mock = mockFetch([json(identity), json([])]);
  await errorCode(authorizeTeacherAdmin("user-access-token", { env, fetchImpl: mock.fetchImpl }), 403, "academy_admin_required");
  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls[0].url, `https://${ref}.supabase.co/auth/v1/user`);
  assert.equal(mock.calls[1].url, `https://${ref}.supabase.co/rest/v1/academy_admins?id=eq.${uid}&select=id&limit=2`);
  const authHeaders = new Headers(mock.calls[0].init?.headers);
  const adminHeaders = new Headers(mock.calls[1].init?.headers);
  assert.equal(authHeaders.get("apikey"), env.ACADEMY_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(authHeaders.get("authorization"), "Bearer user-access-token");
  assert.equal(adminHeaders.get("apikey"), env.ACADEMY_SUPABASE_SERVICE_ROLE_KEY);
  assert.equal(adminHeaders.get("authorization"), `Bearer ${env.ACADEMY_SUPABASE_SERVICE_ROLE_KEY}`);
  assert.equal(mock.calls[0].init?.cache, "no-store");
  assert.equal(mock.calls[1].init?.cache, "no-store");
  assert.equal(mock.calls[1].init?.redirect, "error");
});

test("a confirmed, non-anonymous allowlisted user is accepted without returning server credentials", async () => {
  const mock = mockFetch([json(identity), json([{ id: uid }])]);
  const result = await authorizeTeacherAdmin("user-access-token", { env, fetchImpl: mock.fetchImpl });
  assert.deepEqual(result, { adminId: uid });
  assert.equal(JSON.stringify(result).includes(env.ACADEMY_SUPABASE_SERVICE_ROLE_KEY!), false);
  assert.equal(mock.calls.length, 2);
});

test("invalid, anonymous, and unconfirmed identities never reach the administrator table", async () => {
  for (const value of [
    { ...identity, id: "not-a-uuid" },
    { ...identity, is_anonymous: true },
    { id: uid, is_anonymous: false },
  ]) {
    const mock = mockFetch([json(value)]);
    await errorCode(authorizeTeacherAdmin("user-access-token", { env, fetchImpl: mock.fetchImpl }), 401, "authentication_required");
    assert.equal(mock.calls.length, 1);
  }
});

test("provider failures and malformed admin results fail closed", async () => {
  await errorCode(authorizeTeacherAdmin("user-access-token", {
    env, fetchImpl: mockFetch([json(identity), json({ id: uid })]).fetchImpl,
  }), 503, "teacher_admin_unavailable");
  await errorCode(authorizeTeacherAdmin("user-access-token", {
    env, fetchImpl: mockFetch([json(identity), json([{ id: "22222222-2222-4222-8222-222222222222" }])]).fetchImpl,
  }), 503, "teacher_admin_unavailable");
  await errorCode(authorizeTeacherAdmin("user-access-token", {
    env, fetchImpl: mockFetch([json(identity), new Response("provider failure", { status: 500 })]).fetchImpl,
  }), 503, "teacher_admin_unavailable");
});
