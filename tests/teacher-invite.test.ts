import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { GET } from "../src/app/auth/teacher/invite/route";
import { teacherInviteConfig, teacherInviteRedirectUrl, TEACHER_INVITE_APPROVED_EMAIL, TEACHER_INVITE_HOST, TEACHER_INVITE_PATH } from "../src/lib/academy/teacher-invite";
import { PREVIEW_PROJECT } from "../src/lib/academy/family-registration";

const share = "synthetic-share";
const previewEnv = {
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic",
  ACADEMY_FAMILY_REGISTRATION: "owner-preview",
  ACADEMY_SUPABASE_URL: PREVIEW_PROJECT,
  ACADEMY_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_mock_public_test_key_only",
  ACADEMY_FAMILY_CALLBACK_URL: `https://${TEACHER_INVITE_HOST}/auth/family/callback?_vercel_share=${share}`,
};
const request = (url = `https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}`, host = TEACHER_INVITE_HOST) =>
  new Request(url, { headers: { host } });
const keys = Object.keys(previewEnv);
const oldEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
function usePreviewEnv(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...previewEnv, ...overrides })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
test.afterEach(() => {
  for (const key of keys) {
    const value = oldEnv[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test("redirect is derived only from the existing Preview family callback and preserves its protection query", () => {
  assert.equal(teacherInviteRedirectUrl(previewEnv), `https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}?_vercel_share=${share}`);
  assert.equal(teacherInviteRedirectUrl({ ...previewEnv, VERCEL_ENV: "production" }), null);
  assert.equal(teacherInviteRedirectUrl({ ...previewEnv, VERCEL_GIT_COMMIT_REF: "main" }), null);
  assert.equal(teacherInviteRedirectUrl({ ...previewEnv, ACADEMY_SUPABASE_URL: "https://vbulxdnfknoybdkuhayz.supabase.co" }), null);
  assert.equal(teacherInviteRedirectUrl({ ...previewEnv, ACADEMY_FAMILY_CALLBACK_URL: `https://evil.example/auth/family/callback?_vercel_share=${share}` }), null);
  assert.equal(teacherInviteRedirectUrl({ ...previewEnv, ACADEMY_FAMILY_CALLBACK_URL: `https://${TEACHER_INVITE_HOST}/auth/family/callback?_vercel_share=wrong` }), null);
});

test("callback allows only the exact HTTPS Preview host and known share query", () => {
  const valid = teacherInviteConfig(request(), previewEnv);
  assert.equal(valid?.projectUrl, PREVIEW_PROJECT);
  assert.equal(valid?.reviewOnly, false);
  assert.equal(valid?.approvedEmail, TEACHER_INVITE_APPROVED_EMAIL);
  assert.equal(teacherInviteConfig(request(`https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}?_vercel_share=${share}`), previewEnv)?.projectUrl, PREVIEW_PROJECT);
  assert.equal(teacherInviteConfig(request(`https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}?_vercel_share=wrong`), previewEnv), null);
  assert.equal(teacherInviteConfig(request(`https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}?access_token=leaked`), previewEnv), null);
  assert.equal(teacherInviteConfig(request(`https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}`, "evil.example"), previewEnv), null);
  assert.equal(teacherInviteConfig(request(`http://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}`), previewEnv), null);
  assert.equal(teacherInviteConfig(request(), { ...previewEnv, VERCEL_ENV: "production" }), null);
  assert.equal(teacherInviteConfig(request(), { ...previewEnv, VERCEL_GIT_COMMIT_REF: "main" }), null);
});

test("review query is explicit, read-only, and does not expose the Vercel share token", async () => {
  usePreviewEnv();
  const response = await GET(request(`https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}?review=1`));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /READ-ONLY REVIEW|معاينة للقراءة فقط/);
  assert.doesNotMatch(body, new RegExp(share));
  assert.doesNotMatch(body, new RegExp(TEACHER_INVITE_APPROVED_EMAIL));
  assert.doesNotMatch(body, /refresh_token|service_role|inviteUserByEmail/);
  assert.match(body, /"reviewOnly":true/);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  const script = body.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(response.headers.get("content-security-policy")?.includes(`'sha256-${hash}'`));
});

test("live callback is no-store and never accepts tokens through the query string", async () => {
  usePreviewEnv();
  const response = await GET(request(`https://${TEACHER_INVITE_HOST}${TEACHER_INVITE_PATH}?access_token=secret`));
  assert.equal(response.status, 404);
  assert.doesNotMatch(await response.text(), /secret|access_token/);
});
