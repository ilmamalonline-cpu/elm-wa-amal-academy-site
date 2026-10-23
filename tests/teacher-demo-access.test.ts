import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teacherDemoEnabled } from "../src/lib/academy/teacher-demo-access";

test("teacher demo fails closed except authorized Preview branch or explicit local review", () => {
  for (const env of [
    {}, { VERCEL: "1" }, { VERCEL: "1", VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic", ACADEMY_PREVIEW: "browser-synthetic-only" },
    { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL: "1", VERCEL_ENV: "preview" },
    { VERCEL: "1", VERCEL_ENV: "development", ACADEMY_PREVIEW: "browser-synthetic-only" },
  ]) assert.equal(teacherDemoEnabled(env), false, JSON.stringify(env));
  assert.equal(teacherDemoEnabled({ VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/academy-synthetic" }), true);
  const local = { NODE_ENV: "development", ACADEMY_PREVIEW: "browser-synthetic-only" };
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"]) assert.equal(teacherDemoEnabled(local, host), true);
  for (const host of [undefined, "evil.example", "localhost.evil.example", "192.168.1.1"]) assert.equal(teacherDemoEnabled(local, host), false);
  assert.equal(teacherDemoEnabled({ ...local, NODE_ENV: "production" }, "localhost:3000"), false);
});

test("teacher route and workspace entry share the fail-closed gate; route is noindex", () => {
  const route = readFileSync("src/app/[locale]/teacher-demo/page.tsx", "utf8");
  assert.match(route, /!teacherDemoEnabled\(process.env, incoming.get\("host"\)\)\) notFound\(\)/);
  assert.match(route, /index: false, follow: false/);
  assert.match(readFileSync("src/proxy.ts", "utf8"), /parts\[1\] === "teacher-demo" && teacherDemoEnabled\(process.env, request.headers.get\("host"\)\)/);
  assert.match(readFileSync("src/app/[locale]/workspace/page.tsx", "utf8"), /teacherDemoEnabled\(process.env, incoming.get\("host"\)\) &&/);
});

test("teacher UI and model have no provider, family, auth, storage or network capabilities", () => {
  for (const path of ["src/components/academy/teacher-demo.tsx", "src/lib/academy/teacher-demo.ts", "src/app/[locale]/teacher-demo/page.tsx", "src/components/academy/teacher-demo.css"]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)\s*[.(]/);
    assert.doesNotMatch(source, /document\.cookie|supabase|\/api\/|family-registration|learner-workspace|browser-preview/);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|https?:\/\//);
  }
});
