import { test } from "node:test";
import assert from "node:assert/strict";
import { familyAdapter, FamilyError, PREVIEW_PROJECT, PREVIEW_OWNER_EMAIL } from "../src/lib/academy/family-registration";
import { syntheticLearnerWorkspace } from "../src/lib/academy/learner";

const guardian = "11111111-1111-4111-8111-111111111111";
const child = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const token = "synthetic_token_abcdefghijklmnopqrstuvwxyz";
const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic",
  ACADEMY_FAMILY_REGISTRATION: "owner-preview", ACADEMY_FAMILY_SIGNUP: "disabled",
  ACADEMY_SUPABASE_URL: PREVIEW_PROJECT, ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_offline_example",
  ACADEMY_FAMILY_CALLBACK_URL: "https://elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app/auth/family/callback?_vercel_share=synthetic-share",
};
function setup(options: { user?: unknown; guardians?: unknown; children?: unknown; plans?: unknown; entries?: unknown; status?: number; throws?: boolean } = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (options.throws) throw new Error("private provider detail");
    if (options.status) return new Response("private database detail", { status: options.status });
    if (url.pathname === "/auth/v1/user") return Response.json(options.user ?? { id: guardian, email: PREVIEW_OWNER_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (url.pathname.endsWith("/academy_guardians")) return Response.json(options.guardians ?? [{ id: guardian }]);
    if (url.pathname.endsWith("/academy_children")) return Response.json(options.children ?? [{ id: child, display_name: "Synthetic learner", birth_year: 2015, guardian_id: guardian }]);
    if (url.pathname.endsWith("/academy_learning_plans")) return Response.json(options.plans ?? []);
    if (url.pathname.endsWith("/academy_practice_entries")) return Response.json(options.entries ?? []);
    throw new Error("Unexpected provider endpoint");
  };
  return { adapter: familyAdapter(env, fetcher), calls };
}
const action = (extra = {}) => ({ action: "learner-workspace", child_id: child, locale: "ar", ...extra });
async function rejected(p: Promise<unknown>, code: string, status: number) {
  await assert.rejects(p, e => e instanceof FamilyError && e.code === code && e.status === status);
}

test("learner requires authenticated guardian; no anonymous child login or role escalation", async () => {
  const { adapter, calls } = setup();
  await rejected(adapter.act(action(), null), "sign_in_required", 401);
  assert.equal(calls.length, 0);
  for (const extra of [{ role: "teacher" }, { guardian_id: other }, { child: { id: child } }, { progress: 100 }, { display_name: "Injected" }]) {
    await rejected(adapter.act(action(extra), token), "invalid_request", 400);
  }
  for (const name of ["child-login", "teacher-login", "save-progress", "save-lesson"]) await rejected(adapter.act({ action: name, child_id: child }, token), "invalid_request", 400);
  assert.ok(calls.every(c => c.url.pathname === "/auth/v1/user"));
});

test("owner-scoped RLS reads use verified user token, minimal columns, explicit limits and no writes", async () => {
  const { adapter, calls } = setup();
  const result = await adapter.act(action(), token);
  assert.equal(calls.length, 5);
  assert.ok("child" in result.data);
  assert.deepEqual(result.data.child, { id: child, display_name: "Synthetic learner" });
  assert.equal(result.data.contentMode, "synthetic-only");
  const parentQuery = calls[1].url.searchParams;
  assert.equal(parentQuery.get("id"), `eq.${guardian}`);
  assert.equal(parentQuery.get("select"), "id");
  const childQuery = calls[2].url.searchParams;
  assert.equal(childQuery.get("id"), `eq.${child}`);
  assert.equal(childQuery.get("guardian_id"), `eq.${guardian}`);
  assert.equal(childQuery.get("select"), "id,display_name");
  for (const call of calls) {
    assert.equal(call.url.origin, PREVIEW_PROJECT);
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.cache, "no-store");
    assert.equal(call.init.redirect, "error");
    assert.equal(new Headers(call.init.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(call.init.body, undefined);
    if (call.url.pathname.endsWith("/academy_guardians")) assert.equal(call.url.searchParams.get("limit"), "1");
    if (call.url.pathname.endsWith("/academy_children")) assert.equal(call.url.searchParams.get("limit"), "1");
    if (call.url.pathname.endsWith("/academy_learning_plans")) assert.equal(call.url.searchParams.get("limit"), "1");
    if (call.url.pathname.endsWith("/academy_practice_entries")) assert.equal(call.url.searchParams.get("limit"), "100");
  }
  assert.doesNotMatch(JSON.stringify(result), /birth_year|guardian_id|access_token|refresh_token|publishable|email/);
});

test("different-account, deleted and nonexistent children are indistinguishable and expose no content", async () => {
  for (const requested of [child, other]) {
    const { adapter, calls } = setup({ children: [] });
    await rejected(adapter.act(action({ child_id: requested }), token), "not_found", 404);
    assert.equal(calls[2].url.searchParams.get("guardian_id"), `eq.${guardian}`);
    assert.equal(calls[2].url.searchParams.get("id"), `eq.${requested}`);
  }
});

test("missing guardian and mismatched guardian fail before child query", async () => {
  for (const guardians of [[], [{ id: other }], {}, [{ id: guardian }, { id: other }]]) {
    const { adapter, calls } = setup({ guardians });
    await rejected(adapter.act(action(), token), "not_allowed", 403);
    assert.equal(calls.length, 2);
  }
});

test("unconfirmed, anonymous, wrong-email and expired sessions never reach family data", async () => {
  for (const user of [
    { id: guardian, email: PREVIEW_OWNER_EMAIL },
    { id: guardian, email: PREVIEW_OWNER_EMAIL, email_confirmed_at: "yes", is_anonymous: true },
    { id: guardian, email: "another@example.test", email_confirmed_at: "yes" },
  ]) {
    const { adapter, calls } = setup({ user });
    await assert.rejects(adapter.act(action(), token), e => e instanceof FamilyError && e.status === 403);
    assert.equal(calls.length, 1);
  }
  const expired = setup({ status: 401 });
  await rejected(expired.adapter.act(action(), token), "sign_in_required", 401);
  assert.equal(expired.calls.length, 1);
});

test("invalid UUID, locale or request shape never reads child records", async () => {
  for (const bad of [{ child_id: `${child}&guardian_id=neq.${guardian}` }, { child_id: 3 }, { locale: "fr" }, { locale: {} }, { child_id: "" }]) {
    const { adapter, calls } = setup();
    await rejected(adapter.act(action(bad), token), "invalid_request", 400);
    assert.equal(calls.length, 1);
  }
});

test("malformed child response fails closed and upstream errors stay sanitized", async () => {
  for (const children of [{}, [null], [{ id: other, display_name: "Private" }], [{ id: child, display_name: 1 }], [{ id: child, display_name: "" }], [{ id: child, display_name: "x".repeat(201) }], [{ id: child, display_name: "A" }, { id: child, display_name: "B" }]]) {
    const { adapter } = setup({ children });
    await rejected(adapter.act(action(), token), "provider_unavailable", 503);
  }
  for (const options of [{ status: 500 }, { throws: true }]) {
    await assert.rejects(setup(options).adapter.act(action(), token), e => {
      assert.doesNotMatch(String(e), /private|database|detail/);
      return e instanceof FamilyError;
    });
  }
});

test("both locales have sample content, never real educational or payment facts", () => {
  for (const locale of ["ar", "en"] as const) {
    const value = syntheticLearnerWorkspace({ id: child, display_name: "Synthetic learner" }, locale);
    assert.equal(value.locale, locale); assert.equal(value.lessons.length, 2);
    assert.deepEqual(value.reports, []); assert.deepEqual(value.payments, []);
    for (const key of ["progress", "teacher", "nextLesson", "meetingUrl"] as const) assert.equal(value[key], null);
    assert.ok(value.lessons.every(x => locale === "ar" ? /تجربة/.test(x.title) : /Sample/.test(x.title)));
    assert.doesNotMatch(JSON.stringify(value), /https?:|zoom|completed|score|paid_at/);
  }
});

test("Production, old projects and other branches remain disabled with no provider calls", async () => {
  for (const flags of [{ VERCEL_ENV: "production" }, { VERCEL_GIT_COMMIT_REF: "main" }, { ACADEMY_SUPABASE_URL: "https://vbulxdnfknoybdkuhayz.supabase.co" }]) {
    let calls = 0;
    assert.throws(() => familyAdapter({ ...env, ...flags }, async () => { calls++; throw new Error(); }), e => e instanceof FamilyError && e.code === "registration_disabled");
    assert.equal(calls, 0);
  }
});
