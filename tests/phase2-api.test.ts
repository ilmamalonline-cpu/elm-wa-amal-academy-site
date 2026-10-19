import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, open as openFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import { Pool } from "pg";

const dbUrl = process.env.PHASE2_TEST_DATABASE_URL;
if (!dbUrl) throw new Error("PHASE2_TEST_DATABASE_URL is required; only a disposable local phase2_test database is permitted");
const parsed = new URL(dbUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) || parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/phase2_test" || parsed.search || parsed.hash) throw new Error("Disposable loopback-only phase2_test database required");
const pool = new Pool({ connectionString: dbUrl });
const base = "http://127.0.0.1:3402";
const names = ["owner", "admin", "reviewer", "teacherA", "teacherB", "guardianA", "guardianB", "adultA", "adultB"] as const;
type Actor = typeof names[number];
const users = Object.fromEntries(names.map(n => [n, randomUUID()])) as Record<Actor, string>;
const sessions = Object.fromEntries(names.map(n => [n, randomUUID()])) as Record<Actor, string>;
const ids = Object.fromEntries(["childA", "childB", "adultA", "adultB", "reportA", "reportB", "adultReportA", "adultReportB", "draftA", "noteA", "noteB", "paymentA", "paymentB", "fileA", "fileB", "quarantine", "infected", "linkA", "linkB", "assignmentA", "assignmentB"].map(n => [n, randomUUID()]));
let server: ChildProcess | undefined;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let root: string;
let log: Awaited<ReturnType<typeof openFile>>;
const pdf = Buffer.from("%PDF-1.4\n% SYNTHETIC SECURITY FIXTURE ONLY - NOT A RECEIPT\n%%EOF\n");
const hash = createHash("sha256").update(pdf).digest("hex");

async function seed() {
  await pool.query("TRUNCATE public.audit_events,public.private_files,public.payment_records,public.teacher_notes,public.published_reports,public.teacher_assignments,public.guardian_links,public.capabilities,public.user_roles,public.teachers,public.students,public.profiles,auth.sessions,auth.users CASCADE");
  for (const n of names) {
    await pool.query("INSERT INTO auth.users(id) VALUES($1)", [users[n]]);
    await pool.query("INSERT INTO public.profiles(auth_user_id,display_name,preferred_locale,timezone,status) VALUES($1,$2,'en','Africa/Cairo','active')", [users[n], `Synthetic ${n}`]);
    await pool.query("INSERT INTO auth.sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sessions[n], users[n]]);
    const role = ["owner", "admin", "reviewer"].includes(n) ? "admin" : n.startsWith("teacher") ? "teacher" : n.startsWith("guardian") ? "guardian" : "student";
    await pool.query("INSERT INTO public.user_roles(auth_user_id,role,granted_by,reason) VALUES($1,$2,$3,'synthetic fixture')", [users[n], role, users.owner]);
  }
  for (const cap of ["roles.manage", "guardian.verify"]) await pool.query("INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,$2,$1,'synthetic fixture')", [users.owner, cap]);
  await pool.query("INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,'payment.review',$2,'synthetic reviewer only')", [users.reviewer, users.owner]);
  for (const n of ["childA", "childB", "adultA", "adultB"] as const) {
    await pool.query("INSERT INTO public.students(id,auth_user_id,full_name,age_band,preferred_locale,timezone,status) VALUES($1,$2,$3,$4,'en','Africa/Cairo','active')", [ids[n], n.startsWith("adult") ? users[n as Actor] : null, `Synthetic ${n}`, n.startsWith("adult") ? "adult" : "child"]);
  }
  for (const suffix of ["A", "B"]) {
    const teacher = users[`teacher${suffix}` as Actor];
    const guardian = users[`guardian${suffix}` as Actor];
    await pool.query("INSERT INTO public.teachers(auth_user_id,display_name,status) VALUES($1,$2,'active')", [teacher, `Synthetic teacher ${suffix}`]);
    await pool.query("INSERT INTO public.teacher_assignments(id,teacher_user_id,student_id,status,assigned_by) VALUES($1,$2,$3,'active',$4)", [ids[`assignment${suffix}`], teacher, ids[`child${suffix}`], users.owner]);
    await pool.query("INSERT INTO public.guardian_links(id,guardian_user_id,student_id,relationship,verification_status,verified_by,verified_at,evidence_note,consent_version,consent_method,consent_accepted_by) VALUES($1,$2,$3,'synthetic guardian','verified',$4,now(),'INTERNAL VERIFICATION NOTE','synthetic-v1','synthetic-only',$2)", [ids[`link${suffix}`], guardian, ids[`child${suffix}`], users.owner]);
    await pool.query("INSERT INTO public.published_reports(id,student_id,body,status) VALUES($1,$2,$3,'published'),($4,$5,$6,'published')", [ids[`report${suffix}`], ids[`child${suffix}`], `Synthetic report ${suffix}`, ids[`adultReport${suffix}`], ids[`adult${suffix}`], `Synthetic adult report ${suffix}`]);
    await pool.query("INSERT INTO public.teacher_notes(id,student_id,teacher_user_id,body) VALUES($1,$2,$3,$4)", [ids[`note${suffix}`], ids[`child${suffix}`], teacher, `INTERNAL TEACHER NOTE ${suffix}`]);
    await pool.query("INSERT INTO public.payment_records(id,student_id,requested_by_user_id,reference) VALUES($1,$2,$3,$4)", [ids[`payment${suffix}`], ids.childA, guardian, `SYNTHETIC-REF-${suffix}`]);
    await pool.query("INSERT INTO public.private_files(id,owner_user_id,payment_record_id,purpose,object_path,mime_type,size_bytes,sha256,validation_status,scan_status) VALUES($1,$2,$3,'payment_evidence',$4,'application/pdf',$5,$6,'validated','clean')", [ids[`file${suffix}`], guardian, ids[`payment${suffix}`], `${ids[`file${suffix}`]}.pdf`, pdf.length, hash]);
    await writeFile(path.join(root, `${ids[`file${suffix}`]}.pdf`), pdf);
  }
  await pool.query("INSERT INTO public.published_reports(id,student_id,body,status) VALUES($1,$2,'HIDDEN DRAFT','draft')", [ids.draftA, ids.childA]);
  for (const [key, validation, scan] of [["quarantine", "quarantined", "pending"], ["infected", "rejected", "infected"]]) {
    await pool.query("INSERT INTO public.private_files(id,owner_user_id,payment_record_id,purpose,object_path,mime_type,size_bytes,sha256,validation_status,scan_status) VALUES($1,$2,$3,'payment_evidence',$4,'application/pdf',$5,$6,$7,$8)", [ids[key], users.guardianA, ids.paymentA, `${ids[key]}.pdf`, pdf.length, hash, validation, scan]);
    await writeFile(path.join(root, `${ids[key]}.pdf`), pdf);
  }
}
async function token(actor: Actor, extra: Record<string, unknown> = {}, seconds = 300, signingKey = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "authenticated", aal: "aal1", session_id: sessions[actor], ...extra }).setProtectedHeader({ alg: "ES256" }).setIssuer(`${base}/auth/v1`).setAudience("authenticated").setSubject(users[actor]).setIssuedAt(now).setExpirationTime(now + seconds).sign(signingKey);
}
async function get(endpoint: string, actor?: Actor, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/phase2/${endpoint}`, { headers: { ...(actor ? { authorization: `Bearer ${await token(actor, extra)}` } : {}), ...headers } });
}
async function expectStatus(endpoint: string, actor: Actor | undefined, expected: number) {
  const response = await get(endpoint, actor);
  assert.equal(response.status, expected, `${actor ?? 'anonymous'} ${endpoint}: ${await response.clone().text()}`);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return response;
}
before(async () => {
  keys = await generateKeyPair("ES256", { extractable: true });
  root = await mkdtemp(path.join(tmpdir(), "phase2-private-synthetic-"));
  await mkdir("docs/checks/phase2", { recursive: true });
  log = await openFile("docs/checks/phase2/api-server.log", "w");
  const apiUrl = new URL(dbUrl!); apiUrl.username = "phase2_api"; apiUrl.password = "";
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3402"], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", PHASE2_LOCAL_SECURITY: "synthetic-only", PHASE2_DATABASE_URL: apiUrl.toString(), PHASE2_JWT_PUBLIC_KEY: await exportSPKI(keys.publicKey), PHASE2_PRIVATE_ROOT: root }, stdio: ["ignore", log.fd, log.fd] });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Local Next test server exited; see docs/checks/phase2/api-server.log");
    try { const r = await fetch(`${base}/api/phase2/me`); if (r.status === 401) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Local Next API did not become ready within 10 seconds");
});
beforeEach(seed);
after(async () => {
  if (server && server.exitCode === null) { server.kill("SIGTERM"); await new Promise<void>(resolve => { server!.once("exit", () => resolve()); setTimeout(() => { server?.kill("SIGKILL"); resolve(); }, 5000).unref(); }); }
  await log?.close();
  await pool.end();
  if (root) await rm(root, { recursive: true, force: true });
});

test("anonymous, expired, tampered, wrong issuer/audience, and unknown sessions fail closed", async () => {
  await expectStatus("students", undefined, 401);
  const expired = await token("guardianA", {}, -1);
  const badKey = await generateKeyPair("ES256");
  const invalid = [expired, await token("guardianA", {}, 300, badKey.privateKey), await token("guardianA", { session_id: randomUUID() }), await token("guardianA", { role: "service_role" }), await token("guardianA", {}, 901)];
  for (const bearer of invalid) assert.equal((await fetch(`${base}/api/phase2/students`, { headers: { authorization: `Bearer ${bearer}` } })).status, 401);
  for (const changed of [{ iss: "https://invalid.example/auth/v1" }, { aud: "other-audience" }]) {
    const bad = await new SignJWT({ role: "authenticated", aal: "aal1", session_id: sessions.guardianA, iss: `${base}/auth/v1`, aud: "authenticated", ...changed }).setProtectedHeader({ alg: "ES256" }).setSubject(users.guardianA).setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    assert.equal((await fetch(`${base}/api/phase2/me`, { headers: { authorization: `Bearer ${bad}` } })).status, 401);
  }
});
test("four roles have real API access while children have no login identity", async () => {
  for (const actor of ["admin", "teacherA", "guardianA", "adultA"] as Actor[]) assert.equal((await (await expectStatus("me", actor, 200)).json()).profile.auth_user_id, users[actor]);
  const child = await pool.query("SELECT auth_user_id FROM public.students WHERE id=$1", [ids.childA]);
  assert.equal(child.rows[0].auth_user_id, null);
});
test("guardian cannot enumerate another child or unlinked sibling", async () => {
  const rows = (await (await expectStatus("students", "guardianA", 200)).json()).data;
  assert.deepEqual(rows.map((x: { id: string }) => x.id), [ids.childA]);
  await expectStatus(`students/${ids.childB}`, "guardianA", 404);
  await expectStatus(`reports/${ids.reportB}`, "guardianA", 404);
});
test("adult students are isolated from other adults and children", async () => {
  await expectStatus(`students/${ids.adultA}`, "adultA", 200);
  await expectStatus(`students/${ids.adultB}`, "adultA", 404);
  await expectStatus(`reports/${ids.adultReportA}`, "adultA", 200);
  await expectStatus(`reports/${ids.adultReportB}`, "adultA", 404);
  await expectStatus(`students/${ids.childA}`, "adultA", 404);
});
test("teachers see assigned students only, no finance or foreign private notes", async () => {
  await expectStatus(`students/${ids.childA}`, "teacherA", 200);
  await expectStatus(`students/${ids.childB}`, "teacherA", 404);
  await expectStatus(`notes/${ids.noteA}`, "teacherA", 200);
  for (const endpoint of [`notes/${ids.noteB}`, `payments/${ids.paymentA}`, `files/${ids.fileA}`]) await expectStatus(endpoint, "teacherA", 404);
});
test("guardians and students cannot read private notes or unpublished reports", async () => {
  for (const actor of ["guardianA", "adultA"] as Actor[]) {
    await expectStatus(`notes/${ids.noteA}`, actor, 404);
    await expectStatus(`reports/${ids.draftA}`, actor, 404);
  }
  const links = await (await expectStatus("guardian-links", "guardianA", 200)).text();
  assert.doesNotMatch(links, /INTERNAL|evidence_note|consent_method|verified_by/);
});
test("co-guardian status does not grant another requester's payment or receipt", async () => {
  await pool.query("INSERT INTO public.guardian_links(guardian_user_id,student_id,relationship,verification_status,verified_by,verified_at,consent_version,consent_method,consent_accepted_by) VALUES($1,$2,'synthetic','verified',$3,now(),'synthetic-v1','synthetic-only',$1)", [users.guardianB, ids.childA, users.owner]);
  await expectStatus(`students/${ids.childA}`, "guardianB", 200);
  await expectStatus(`payments/${ids.paymentA}`, "guardianA", 200);
  await expectStatus(`payments/${ids.paymentA}`, "guardianB", 404);
  await expectStatus(`files/${ids.fileA}`, "guardianB", 404);
});
test("ordinary admin is not a financial reviewer; protected capability is checked live", async () => {
  await expectStatus(`payments/${ids.paymentA}`, "admin", 404);
  await expectStatus(`files/${ids.fileA}`, "admin", 404);
  await expectStatus(`payments/${ids.paymentA}`, "reviewer", 200);
  await expectStatus(`files/${ids.fileA}`, "reviewer", 200);
  await pool.query("UPDATE public.capabilities SET revoked_at=now() WHERE auth_user_id=$1 AND capability='payment.review'", [users.reviewer]);
  await expectStatus(`files/${ids.fileA}`, "reviewer", 404);
});
test("forged metadata and identity headers cannot grant admin or reviewer", async () => {
  const response = await get(`payments/${ids.paymentA}`, "guardianB", { user_metadata: { role: "admin", capabilities: ["payment.review"] }, app_metadata: { role: "admin" } }, { "x-user-id": users.owner, "x-role": "admin", "x-site-locale": "en" });
  assert.equal(response.status, 404);
});
test("revoking guardian link denies the same already-issued JWT on the next request", async () => {
  const bearer = await token("guardianA");
  const request = () => fetch(`${base}/api/phase2/reports/${ids.reportA}`, { headers: { authorization: `Bearer ${bearer}` } });
  assert.equal((await request()).status, 200);
  await pool.query("UPDATE public.guardian_links SET verification_status='revoked',revoked_at=now() WHERE id=$1", [ids.linkA]);
  assert.equal((await request()).status, 404);
});
test("revoked assignment and ended time deny the same teacher session immediately", async () => {
  await expectStatus(`reports/${ids.reportA}`, "teacherA", 200);
  await pool.query("UPDATE public.teacher_assignments SET starts_at=now()-interval '1 hour',ends_at=now()-interval '1 second' WHERE id=$1", [ids.assignmentA]);
  await expectStatus(`reports/${ids.reportA}`, "teacherA", 404);
  await pool.query("UPDATE public.teacher_assignments SET status='revoked' WHERE id=$1", [ids.assignmentA]);
  await expectStatus(`notes/${ids.noteA}`, "teacherA", 404);
});
test("role revocation and account suspension take effect without token refresh", async () => {
  await expectStatus(`reports/${ids.reportA}`, "guardianA", 200);
  await pool.query("UPDATE public.user_roles SET revoked_at=now() WHERE auth_user_id=$1", [users.guardianA]);
  await expectStatus(`reports/${ids.reportA}`, "guardianA", 404);
  await pool.query("UPDATE public.profiles SET status='suspended' WHERE auth_user_id=$1", [users.teacherA]);
  await expectStatus("me", "teacherA", 401);
});
test("revoked, expired, and other-user sessions cannot authenticate", async () => {
  await pool.query("UPDATE auth.sessions SET revoked_at=now() WHERE id=$1", [sessions.guardianA]);
  await expectStatus("me", "guardianA", 401);
  await pool.query("UPDATE auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [sessions.teacherA]);
  await expectStatus("me", "teacherA", 401);
  assert.equal((await get("me", "guardianB", { session_id: sessions.owner })).status, 401);
});
test("dispute freeze blocks guardian, teacher and adult self educational reads", async () => {
  await pool.query("UPDATE public.students SET frozen=true WHERE id IN($1,$2)", [ids.childA, ids.adultA]);
  for (const actor of ["guardianA", "teacherA"] as Actor[]) { await expectStatus(`students/${ids.childA}`, actor, 404); await expectStatus(`reports/${ids.reportA}`, actor, 404); }
  await expectStatus(`reports/${ids.adultReportA}`, "adultA", 404);
});
test("private-file download is authenticated, integrity checked, no-store, no durable public URL", async () => {
  const response = await expectStatus(`files/${ids.fileA}`, "guardianA", 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), pdf);
  assert.match(response.headers.get("content-disposition") ?? "", /^attachment;/);
  assert.match(response.headers.get("content-security-policy") ?? "", /sandbox/);
  await expectStatus(`files/${ids.fileA}`, undefined, 401);
  await expectStatus(`files/${ids.quarantine}`, "guardianA", 404);
  await expectStatus(`files/${ids.infected}`, "reviewer", 404);
});
test("modified bytes, unsafe object paths and missing objects fail closed", async () => {
  await writeFile(path.join(root, `${ids.fileA}.pdf`), Buffer.from("X".repeat(pdf.length)));
  await expectStatus(`files/${ids.fileA}`, "guardianA", 503);
  await pool.query("UPDATE public.private_files SET object_path='../escape.pdf' WHERE id=$1", [ids.fileA]);
  await expectStatus(`files/${ids.fileA}`, "guardianA", 503);
  await rm(path.join(root, `${ids.fileB}.pdf`));
  await expectStatus(`files/${ids.fileB}`, "guardianB", 503);
});
test("uploads and all public privileged commands are disabled, never mutate records", async () => {
  for (const endpoint of ["files", "bootstrap", "roles", "guardian-links"]) {
    const response = await fetch(`${base}/api/phase2/${endpoint}`, { method: "POST", headers: { authorization: `Bearer ${await token("owner", { aal: "aal2" })}`, "content-type": "application/json" }, body: JSON.stringify({ role: "admin", auth_user_id: users.guardianB }) });
    assert.equal(response.status, 405);
  }
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM public.user_roles WHERE auth_user_id=$1 AND role='admin'", [users.guardianB])).rows[0].count, 0);
});
test("unknown versus unauthorized identifiers have identical non-enumerating errors", async () => {
  const unauthorized = await expectStatus(`students/${ids.childB}`, "guardianA", 404);
  const unknown = await expectStatus(`students/${randomUUID()}`, "guardianA", 404);
  const malformed = await expectStatus("students/not-a-uuid", "guardianA", 404);
  assert.equal(await unauthorized.text(), await unknown.text());
  assert.deepEqual(await malformed.json(), { error: "not_found" });
  assert.equal((await get("students?user_id=other", "guardianA")).status, 400);
});
test("pool reuse does not leak previous subject or capabilities under concurrency", async () => {
  const responses = await Promise.all(Array.from({ length: 16 }, (_, i) => get(`reports/${ids.reportA}`, i % 2 ? "guardianB" : "guardianA")));
  responses.forEach((response, i) => assert.equal(response.status, i % 2 ? 404 : 200));
});

test("sensitive collections are role-scoped and redact internal verification data", async () => {
  await pool.query("INSERT INTO public.audit_events(actor_user_id,action,target_id,reason) VALUES($1,'fixture.identity',$2,'synthetic-only audit')", [users.owner, ids.childA]);
  for (const actor of ["teacherA", "teacherB", "guardianA", "guardianB", "adultA", "admin"] as Actor[]) {
    const links = await (await get("guardian-links", actor)).json();
    const assignments = await (await get("assignments", actor)).json();
    const audit = await (await get("audit", actor)).json();
    assert.equal(links.data.length, actor === "admin" ? 2 : actor.startsWith("guardian") ? 1 : 0);
    assert.equal(assignments.data.length, actor === "admin" ? 2 : actor.startsWith("teacher") ? 1 : 0);
    assert.equal(audit.data.length, actor === "admin" ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(links), /evidence_note|consent_method|INTERNAL/);
  }
});
test("consent withdrawal and suspended teacher profiles remove educational access immediately", async () => {
  await pool.query("UPDATE public.guardian_links SET consent_status='withdrawn',consent_withdrawn_at=now() WHERE id=$1", [ids.linkA]);
  await expectStatus(`reports/${ids.reportA}`, "guardianA", 404);
  await pool.query("UPDATE public.teachers SET status='suspended' WHERE auth_user_id=$1", [users.teacherA]);
  await expectStatus(`reports/${ids.reportA}`, "teacherA", 404);
});
test("GET/HEAD require authentication, preflight grants no CORS, and every write verb stays disabled", async () => {
  const head = await fetch(`${base}/api/phase2/me`, { method: "HEAD" });
  assert.equal(head.status, 401); assert.equal(await head.text(), "");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await fetch(`${base}/api/phase2/students/${ids.childA}?role=admin`, { method, headers: { origin: "https://untrusted.example", authorization: `Bearer ${await token("owner")}` } });
    assert.equal(response.status, 405); assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  }
  const options = await fetch(`${base}/api/phase2/me`, { method: "OPTIONS", headers: { origin: "https://untrusted.example", "access-control-request-method": "POST" } });
  assert.equal(options.status, 204); assert.equal(options.headers.get("access-control-allow-origin"), null);
  assert.equal(options.headers.get("allow"), "GET, HEAD, OPTIONS");
});
test("symlink, oversize and signature-mismatched private fixtures are never served", async () => {
  const { symlink } = await import("node:fs/promises");
  await rm(path.join(root, `${ids.fileA}.pdf`));
  await symlink(path.join(root, `${ids.fileB}.pdf`), path.join(root, `${ids.fileA}.pdf`));
  await expectStatus(`files/${ids.fileA}`, "guardianA", 503);
  await rm(path.join(root, `${ids.fileA}.pdf`));
  await writeFile(path.join(root, `${ids.fileA}.pdf`), Buffer.alloc(5 * 1024 * 1024 + 1));
  await expectStatus(`files/${ids.fileA}`, "guardianA", 503);
  const invalid = Buffer.from("X".repeat(pdf.length));
  await writeFile(path.join(root, `${ids.fileA}.pdf`), invalid);
  await pool.query("UPDATE public.private_files SET sha256=$1 WHERE id=$2", [createHash("sha256").update(invalid).digest("hex"), ids.fileA]);
  await expectStatus(`files/${ids.fileA}`, "guardianA", 503);
});
