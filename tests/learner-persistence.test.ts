import { test } from "node:test";
import assert from "node:assert/strict";
import { familyAdapter, FamilyError, PREVIEW_OWNER_EMAIL, PREVIEW_PROJECT } from "../src/lib/academy/family-registration";

const guardian = "11111111-1111-4111-8111-111111111111";
const child = "22222222-2222-4222-8222-222222222222";
const otherChild = "33333333-3333-4333-8333-333333333333";
const entry = "44444444-4444-4444-8444-444444444444";
const token = "synthetic_token_abcdefghijklmnopqrstuvwxyz";
const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic",
  ACADEMY_FAMILY_REGISTRATION: "owner-preview", ACADEMY_FAMILY_SIGNUP: "disabled",
  ACADEMY_SUPABASE_URL: PREVIEW_PROJECT, ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_offline_example",
  ACADEMY_FAMILY_CALLBACK_URL: "https://elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app/auth/family/callback?_vercel_share=synthetic-share",
};

type Call = { url: URL; init: RequestInit };
function setup(options: { children?: unknown; plans?: unknown; entries?: unknown; status?: number; throws?: boolean } = {}) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input)); calls.push({ url, init });
    if (options.throws) throw new Error("private database detail");
    if (url.pathname === "/auth/v1/user") return Response.json({ id: guardian, email: PREVIEW_OWNER_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (url.pathname.endsWith("/academy_guardians")) return Response.json([{ id: guardian }]);
    if (url.pathname.endsWith("/academy_children")) return Response.json(options.children ?? [{ id: child, display_name: "Synthetic learner" }]);
    if (options.status) return new Response("private database detail", { status: options.status });
    if (url.pathname.endsWith("/academy_learning_plans")) {
      if (init.method === "PATCH") return Response.json(options.plans ?? [{ goal: "Old goal" }]);
      if (init.method === "POST" || init.method === "DELETE") return Response.json([]);
      return Response.json(options.plans ?? []);
    }
    if (url.pathname.endsWith("/academy_practice_entries")) {
      if (init.method === "PATCH" || init.method === "DELETE") return Response.json(options.entries ?? [{ id: entry }]);
      if (init.method === "POST") return Response.json([]);
      return Response.json(options.entries ?? []);
    }
    throw new Error(`Unexpected provider endpoint ${url}`);
  };
  return { adapter: familyAdapter(env, fetcher), calls };
}
const base = (action: string, extra: Record<string, unknown> = {}) => ({ action, child_id: child, ...extra });
async function rejects(p: Promise<unknown>, code: string, status: number) {
  await assert.rejects(p, e => e instanceof FamilyError && e.code === code && e.status === status);
}
function assertRequest(call: Call, method: string, tokenValue = token) {
  assert.equal(call.init.method, method);
  assert.equal(call.init.cache, "no-store");
  assert.equal(call.init.redirect, "error");
  assert.equal(new Headers(call.init.headers).get("authorization"), `Bearer ${tokenValue}`);
}

const cases = [
  ["save-learning-plan", { goal: "Read", weekly_target_minutes: 30 }],
  ["delete-learning-plan", {}],
  ["add-practice", { activity: "Reading", minutes: 20, practiced_on: "2026-01-15", note: "" }],
  ["update-practice", { id: entry, activity: "Math", minutes: 25, practiced_on: "2026-01-15", note: "Workbook" }],
  ["delete-practice", { id: entry }],
] as const;

test("learner CRUD uses exact scoped request shapes and the verified token on every request", async () => {
  for (const [name, fields] of cases) {
    const { adapter, calls } = setup({ plans: name === "save-learning-plan" ? [{ goal: "Existing" }] : [] });
    await adapter.act(base(name, fields), token);
    assert.equal(calls.length, 4);
    assertRequest(calls[0], "GET"); assertRequest(calls[1], "GET"); assertRequest(calls[2], "GET");
    const operation = calls[3]; assertRequest(operation, name === "save-learning-plan" ? "PATCH" : name === "delete-learning-plan" || name === "delete-practice" ? "DELETE" : name === "add-practice" ? "POST" : "PATCH");
    assert.equal(operation.url.origin, PREVIEW_PROJECT);
    if (name !== "add-practice") {
      assert.equal(operation.url.searchParams.get("child_id"), `eq.${child}`);
      assert.equal(operation.url.searchParams.get("guardian_id"), `eq.${guardian}`);
    }
    const body = operation.init.body ? JSON.parse(String(operation.init.body)) : undefined;
    if (name === "save-learning-plan") assert.deepEqual(body, { goal: "Read", weekly_target_minutes: 30 });
    if (name === "add-practice") assert.deepEqual(body, { child_id: child, guardian_id: guardian, activity: "Reading", minutes: 20, practiced_on: "2026-01-15", note: "" });
    if (name === "update-practice") assert.deepEqual(body, { activity: "Math", minutes: 25, practiced_on: "2026-01-15", note: "Workbook" });
    if (name === "delete-practice") assert.equal(operation.url.searchParams.get("id"), `eq.${entry}`);
    if (name === "delete-learning-plan") assert.equal(body, undefined);
  }
});

test("plan PATCH falls back to INSERT with immutable identity and no client guardian fields", async () => {
  const { adapter, calls } = setup({ plans: [] });
  await adapter.act(base("save-learning-plan", { goal: "New plan", weekly_target_minutes: 45, guardian_id: otherChild, role: "teacher" }), token).catch(e => assert.equal(e.code, "invalid_request"));
  assert.equal(calls.length, 1);
  const run = setup({ plans: [] });
  await run.adapter.act(base("save-learning-plan", { goal: "New plan", weekly_target_minutes: 45 }), token);
  assert.equal(run.calls.length, 5);
  assert.equal(run.calls[3].init.method, "PATCH"); assert.equal(run.calls[4].init.method, "POST");
  assert.deepEqual(JSON.parse(String(run.calls[4].init.body)), { child_id: child, guardian_id: guardian, goal: "New plan", weekly_target_minutes: 45 });
});

test("wrong child, foreign child, and missing CRUD targets cannot write", async () => {
  for (const requested of [otherChild, "55555555-5555-4555-8555-555555555555"]) {
    const { adapter, calls } = setup({ children: [] });
    await rejects(adapter.act(base("add-practice", { child_id: requested, activity: "Reading", minutes: 10, practiced_on: "2026-01-15", note: "" }), token), "not_found", 404);
    assert.equal(calls.length, 3);
  }
  for (const action of ["update-practice", "delete-practice"] as const) {
    const run = setup({ entries: [] });
    await rejects(run.adapter.act(base(action, { id: entry, ...(action === "update-practice" ? { activity: "x", minutes: 1, practiced_on: "2026-01-15", note: "" } : {}) }), token), "not_found", 404);
    assert.equal(run.calls.length, 4);
  }
});

test("request validation rejects role escalation, forged identity, and malformed dates before writes", async () => {
  const invalid = [
    base("add-practice", { activity: "x", minutes: 10, practiced_on: "2024-02-30", note: "" }),
    base("add-practice", { activity: "x", minutes: 10, practiced_on: "2023-02-29", note: "" }),
    base("add-practice", { activity: "x", minutes: 10, practiced_on: "2024-02-29", note: "", role: "teacher" }),
    base("add-practice", { activity: "x", minutes: 10, practiced_on: "2999-01-01", note: "", guardian_id: guardian }),
    base("save-learning-plan", { goal: "x", weekly_target_minutes: 0 }),
    base("save-learning-plan", { goal: "x", weekly_target_minutes: 30, child: { id: otherChild } }),
  ];
  for (const value of invalid) {
    const { adapter, calls } = setup();
    await rejects(adapter.act(value, token), "invalid_request", 400);
    assert.equal(calls.length, 1);
  }
});

test("provider failures are sanitized and all persistence requests carry the user token", async () => {
  for (const options of [{ status: 500 }, { throws: true }]) {
    const { adapter } = setup(options);
    await assert.rejects(adapter.act(base("add-practice", { activity: "x", minutes: 1, practiced_on: "2026-01-15", note: "" }), token), e => {
      assert.ok(e instanceof FamilyError); assert.equal(e.status, 503); assert.doesNotMatch(String(e), /private|database|detail/); return true;
    });
  }
  const run = setup({ plans: [] });
  await run.adapter.act(base("save-learning-plan", { goal: "x", weekly_target_minutes: 1 }), token);
  for (const call of run.calls) assert.equal(new Headers(call.init.headers).get("authorization"), `Bearer ${token}`);
});

test("fetched learning summary is sourced from explicit latest-100 rows and sanitized", async () => {
  const entries = [{ id: entry, activity: "Read", minutes: 12, practiced_on: "2026-01-15", note: "", created_at: "2026-01-15T00:00:00Z", guardian_id: otherChild }];
  const { adapter, calls } = setup({ plans: [{ goal: "Focus", weekly_target_minutes: 30, updated_at: "2026-01-15T00:00:00Z", child_id: otherChild }], entries });
  const result = await adapter.act({ action: "learner-workspace", child_id: child, locale: "en" }, token);
  assert.equal(calls.length, 5);
  assert.equal(calls[3].url.searchParams.get("limit"), "1");
  assert.equal(calls[4].url.searchParams.get("limit"), "100");
  assert.equal(calls[4].url.searchParams.get("order"), "practiced_on.desc,created_at.desc,id.desc");
  assert.ok("learning" in result.data);
  assert.deepEqual(result.data.learning.summary, { entry_count: 1, total_minutes: 12, scope: "latest-100" });
  assert.deepEqual(result.data.learning.plan, { goal: "Focus", weekly_target_minutes: 30, updated_at: "2026-01-15T00:00:00Z" });
  assert.deepEqual(result.data.learning.entries[0], { id: entry, activity: "Read", minutes: 12, practiced_on: "2026-01-15", note: "", created_at: "2026-01-15T00:00:00Z" });
  assert.doesNotMatch(JSON.stringify(result), /guardian_id|child_id|private/);
});
