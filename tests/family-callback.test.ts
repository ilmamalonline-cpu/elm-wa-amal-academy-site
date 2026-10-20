import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/auth/family/callback/route";
const host = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
function env() { process.env.ACADEMY_FAMILY_REGISTRATION = "owner-preview"; process.env.VERCEL = "1"; process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "preview/academy-synthetic"; process.env.ACADEMY_FAMILY_ALLOWED_EMAIL = "owner@example.test"; process.env.ACADEMY_FAMILY_CALLBACK_URL = `https://${host}/auth/family/callback?_vercel_share=synthetic-share`; }
test("callback is generic, no-store, and never reflects provider tokens or errors", async () => { env(); const r = await GET(new Request(`https://${host}/auth/family/callback?access_token=secret&error=bad&_vercel_share=wrong`)); const body = await r.text(); assert.equal(r.status, 400); assert.doesNotMatch(body, /secret|bad|access_token|refresh_token/); assert.doesNotMatch(body, /history\.replaceState/); assert.match(r.headers.get("content-security-policy")!, /frame-ancestors 'none'/); assert.equal(r.headers.get("referrer-policy"), "no-referrer"); });
test("callback is unavailable outside exact preview host/config", async () => { env(); const r = await GET(new Request("https://evil.example/auth/family/callback?_vercel_share=synthetic-share")); assert.equal(r.status, 404); });

test("callback valid share is generic, HTTPS-only, and CSP-hashed", async () => { env(); const r = await GET(new Request(`https://${host}/auth/family/callback?_vercel_share=synthetic-share`)); const body = await r.text(); assert.equal(r.status, 200); assert.match(body, /history\.replaceState/); assert.match(r.headers.get("content-security-policy")!, /script-src 'sha256-/); assert.equal(r.headers.get("x-content-type-options"), "nosniff"); });
test("callback works after Vercel consumes its share query, without granting a session", async () => {
  env();
  const r = await GET(new Request(`https://${host}/auth/family/callback`));
  const body = await r.text();
  assert.equal(r.status, 200);
  assert.equal(r.headers.has("set-cookie"), false);
  const script = body.match(/<script>([^<]+)<\/script>/)?.[1];
  assert.ok(script);
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(r.headers.get("content-security-policy")?.includes(`'sha256-${hash}'`));
  assert.doesNotMatch(body, /localStorage|sessionStorage|access_token|refresh_token/);
});
