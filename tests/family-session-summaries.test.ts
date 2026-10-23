import { test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "../src/app/api/family/session-summaries/route";
import { PREVIEW_PROJECT, PREVIEW_OWNER_EMAIL } from "../src/lib/academy/family-registration";

const guardian = "11111111-1111-4111-8111-111111111111";
const child = "22222222-2222-4222-8222-222222222222";
const token = "synthetic_token_abcdefghijklmnopqrstuvwxyz";
const host = "elm-wa-amal-academy-site-git-d39dec-ilmamalonline-cpus-projects.vercel.app";
function enable() {
  process.env.VERCEL = "1"; process.env.VERCEL_ENV = "preview"; process.env.VERCEL_GIT_COMMIT_REF = "preview/academy-synthetic";
  process.env.ACADEMY_FAMILY_REGISTRATION = "owner-preview"; process.env.ACADEMY_FAMILY_SIGNUP = "disabled";
  process.env.ACADEMY_SUPABASE_URL = PREVIEW_PROJECT; process.env.ACADEMY_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_synthetic_offline_example";
  process.env.ACADEMY_FAMILY_CALLBACK_URL = `https://${host}/auth/family/callback?_vercel_share=synthetic-share`;
}
function request(childId = child, offset = "0", cookie = token) {
  const req = new Request(`https://${host}/api/family/session-summaries?child_id=${childId}&offset=${offset}`, { headers: { host, origin: `https://${host}`, "x-forwarded-host": host, "x-forwarded-proto": "https", "x-family-registration": "local-review", ...(cookie ? { cookie: `academy_family_access=${cookie}` } : {}) } });
  return req;
}
function setup(rows: unknown = [{ id: "44444444-4444-4444-8444-444444444444", child_id: child, subject: "quran", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T11:00:00Z", time_zone: "Asia/Riyadh", status: "scheduled", outcome: "attended_completed", follow_up_note: "Practice the opening verses." }]) {
  enable();
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return Response.json({ id: guardian, email: PREVIEW_OWNER_EMAIL, email_confirmed_at: "2026-01-01T00:00:00Z" });
    if (url.pathname.endsWith("academy_guardians")) return Response.json([{ id: guardian }]);
    if (url.pathname.endsWith("academy_children")) return Response.json([{ id: child }]);
    if (url.pathname.endsWith("academy_guardians")) return Response.json([{ id: guardian }]);
    if (url.pathname.endsWith("academy_guardian_session_summaries")) { assert.equal(init?.method, "POST"); return Response.json(rows); }
    throw new Error(`unexpected ${url}`);
  };
}
test("returns only allowlisted stored summaries and bounded pagination", async () => {
  setup([{ id: "44444444-4444-4444-8444-444444444444", child_id: child, subject: "quran", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T11:00:00Z", time_zone: "Asia/Riyadh", status: "scheduled", outcome: null, follow_up_note: "" }]);
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { summaries: [{ id: "44444444-4444-4444-8444-444444444444", child_id: child, subject: "quran", starts_at: "2026-01-01T10:00:00Z", ends_at: "2026-01-01T11:00:00Z", time_zone: "Asia/Riyadh", status: "scheduled", outcome: null, follow_up_note: "" }], has_more: false, next_offset: null });
});
test("fails closed for unsigned, invalid pagination, and malformed outcome", async () => {
  setup();
  assert.equal((await GET(request(child, "0", ""))).status, 401);
  assert.equal((await GET(request(child, "10001"))).status, 400);
  setup([{ id: "44444444-4444-4444-8444-444444444444", child_id: child, subject: "quran", starts_at: "x", ends_at: "y", time_zone: "UTC", status: "scheduled", outcome: "teacher_private", follow_up_note: "" }]);
  assert.equal((await GET(request())).status, 503);
});

test("summary route rejects duplicate parameters, CSRF, wrong hosts, and Production before calls", async () => {
  setup(); let calls=0; globalThis.fetch=async()=>{calls++;throw Error("must not call provider")};
  const base=`https://${host}/api/family/session-summaries?child_id=${child}&offset=0`;
  const headers={host,origin:`https://${host}`,"x-family-registration":"local-review",cookie:`academy_family_access=${token}`};
  for(const suffix of ["&offset=1","&child_id="+child,"&unexpected=1"])assert.equal((await GET(new Request(base+suffix,{headers}))).status,400);
  for(const offset of ["01","-1","1.5","10001","1e3"])assert.equal((await GET(request(child,offset))).status,400);
  assert.equal((await GET(new Request(base,{headers:{...headers,origin:"https://untrusted.example"}}))).status,403);
  assert.equal((await GET(new Request(base,{headers:{...headers,"x-family-registration":"wrong"}}))).status,403);
  assert.equal((await GET(new Request(base,{headers:{...headers,host:"untrusted.example"}}))).status,403);
  process.env.VERCEL_ENV="production";assert.equal((await GET(request())).status,503);assert.equal(calls,0);
});
test("guardian summary denies a child not owned by caller before reading outcomes", async () => {
  setup();const original=globalThis.fetch;let rpc=false;
  globalThis.fetch=async(input,init)=>{const url=String(input);if(url.includes("academy_children"))return Response.json([]);if(url.includes("rpc/"))rpc=true;return original(input,init)};
  const response=await GET(request());assert.equal(response.status,404);assert.equal(rpc,false);
});
test("provider contract rejects malformed summaries and private fields", async () => {
  const row={id:"44444444-4444-4444-8444-444444444444",child_id:child,subject:"quran",starts_at:"2026-01-01T10:00:00Z",ends_at:"2026-01-01T10:30:00Z",time_zone:"UTC",status:"scheduled",outcome:"absent",follow_up_note:""};
  for(const patch of [{id:"fake"},{child_id:guardian},{subject:"group"},{starts_at:"invalid"},{ends_at:row.starts_at},{time_zone:"Not/Zone"},{teacher_id:guardian},{follow_up_note:"x".repeat(501)},{follow_up_note:" "},{follow_up_note:"x\u0085"},{outcome:null,follow_up_note:"note"}]){setup([{...row,...patch}]);assert.equal((await GET(request())).status,503,JSON.stringify(patch));}
  setup([{...row,follow_up_note:"😀".repeat(500)}]);assert.equal((await GET(request())).status,200);
});

test("new summary endpoint refuses local-review and old project configuration without provider calls", async () => {
  setup();delete process.env.VERCEL;delete process.env.VERCEL_ENV;delete process.env.VERCEL_GIT_COMMIT_REF;
  process.env.ACADEMY_FAMILY_REGISTRATION="local-review";process.env.ACADEMY_SUPABASE_URL="https://vbulxdnfknoybdkuhayz.supabase.co";
  let calls=0;globalThis.fetch=async()=>{calls++;throw Error("must not call old project")};
  const response=await GET(new Request(`http://localhost/api/family/session-summaries?child_id=${child}&offset=0`,{headers:{host:"localhost",origin:"http://localhost","x-family-registration":"local-review",cookie:`academy_family_access=${token}`}}));
  assert.equal(response.status,503);assert.equal(calls,0);
});
