import { test } from "node:test";
import assert from "node:assert/strict";
import { PREVIEW_PROJECT, PRODUCTION_PROJECT } from "../src/lib/academy/family-registration";
import { GET } from "../src/app/auth/family/callback/route";
const host = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
function env() { process.env.ACADEMY_FAMILY_REGISTRATION = "owner-preview"; process.env.ACADEMY_SUPABASE_URL = PREVIEW_PROJECT; process.env.VERCEL = "1"; process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "preview/academy-synthetic"; process.env.ACADEMY_FAMILY_ALLOWED_EMAIL = "abdelrahmanbakri113@gmail.com"; process.env.ACADEMY_FAMILY_CALLBACK_URL = `https://${host}/auth/family/callback?_vercel_share=synthetic-share`; }
const productionHost = "academy.example.test";
async function withProduction(launchApproved: boolean, run: () => Promise<void>) {
  const names = ["ACADEMY_FAMILY_REGISTRATION", "ACADEMY_FAMILY_PRODUCTION_LAUNCH", "ACADEMY_FAMILY_SITE_ORIGIN", "ACADEMY_FAMILY_CALLBACK_URL", "ACADEMY_SUPABASE_URL", "VERCEL", "VERCEL_ENV"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.ACADEMY_FAMILY_REGISTRATION = "production";
    if (launchApproved) process.env.ACADEMY_FAMILY_PRODUCTION_LAUNCH = "owner-approved";
    else delete process.env.ACADEMY_FAMILY_PRODUCTION_LAUNCH;
    process.env.ACADEMY_SUPABASE_URL = PRODUCTION_PROJECT;
    process.env.ACADEMY_FAMILY_SITE_ORIGIN = `https://${productionHost}`;
    process.env.ACADEMY_FAMILY_CALLBACK_URL = `https://${productionHost}/auth/family/callback`;
    process.env.VERCEL = "1";
    process.env.VERCEL_ENV = "production";
    await run();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}
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

test("production callback serves no-store recovery UI only on the configured HTTPS origin", async () => withProduction(true, async () => {
  const response = await GET(new Request(`https://${productionHost}/auth/family/callback`));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(body, /id="recovery"/);
  assert.match(body, /id="recovery" method="post"/);
  assert.match(body, /update-password/);
  const script = body.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(response.headers.get("content-security-policy")?.includes(`'sha256-${hash}'`));
  assert.match(response.headers.get("content-security-policy")!, /connect-src 'self'/);
  assert.match(response.headers.get("content-security-policy")!, /form-action 'self'; base-uri 'none'/);
  assert.doesNotMatch(body, /localStorage|sessionStorage|recoveryToken=synthetic/);
  const wrongOrigin = await GET(new Request(`https://evil.example/auth/family/callback`));
  assert.equal(wrongOrigin.status, 404);
  const forwardedHost = await GET(new Request(`https://${productionHost}/auth/family/callback`, { headers: { "x-forwarded-host": "evil.example" } }));
  assert.equal(forwardedHost.status, 404);
  const queryToken = await GET(new Request(`https://${productionHost}/auth/family/callback?access_token=synthetic-secret`));
  assert.equal(queryToken.status, 404);
  assert.doesNotMatch(await queryToken.text(), /synthetic-secret/);
}));

test("production callback stays unavailable without separate launch approval", async () => withProduction(false, async () => {
  const response = await GET(new Request(`https://${productionHost}/auth/family/callback`));
  assert.equal(response.status, 404);
}));
