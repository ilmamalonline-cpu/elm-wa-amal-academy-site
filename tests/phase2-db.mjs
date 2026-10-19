import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { reset, setClaims } from './phase2-fixtures.mjs';
const { Pool } = pg;
const url = process.env.PHASE2_TEST_DATABASE_URL;
if (!url) throw new Error('PHASE2_TEST_DATABASE_URL required');
const database = new URL(url);
if (!['postgres:', 'postgresql:'].includes(database.protocol) || database.hostname !== '127.0.0.1' || database.pathname !== '/phase2_test' || database.search || database.hash) throw new Error('Disposable loopback phase2_test database only');
let pool, fx;

before(async () => { pool = new Pool({ connectionString: url }); });
beforeEach(async () => { fx = await reset(pool); await pool.query(`INSERT INTO user_roles(auth_user_id,role,granted_by,reason) VALUES($1,'admin',$1,'synthetic test')`, [fx.ids.owner]); await pool.query(`INSERT INTO capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,'roles.manage',$1,'synthetic test'),($1,'guardian.verify',$1,'synthetic test'),($1,'payment.review',$1,'synthetic test')`, [fx.ids.owner]); });
after(async () => pool?.end());

async function as(user, fn, aal = 'aal1', session = fx.sessions[user]) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); const sid = session; await c.query('SET LOCAL ROLE phase2_authenticated'); await setClaims(c, user, sid, aal); return await fn(c); }
  finally { await c.query('ROLLBACK').catch(() => {}); c.release(); }
}
async function owner(sql, values = []) {
  const c = await pool.connect();
  try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE phase2_authenticated'); await setClaims(c, fx.ids.owner, fx.sessions[fx.ids.owner], 'aal2'); const out = await c.query(sql, values); await c.query('COMMIT'); return out; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
}
async function direct(sql, values = []) { return pool.query(sql, values); }
async function grantRole(user, role) { return owner(`SELECT grant_role($1,$2,'synthetic role')`, [user, role]); }
async function guardianLink(g, s, extra = {}) { return owner(`SELECT grant_guardian_link($1,$2,'synthetic guardian','synthetic-consent-v1','synthetic-method','synthetic-evidence')`, [g, s]); }
async function assignment(t, s) { return owner(`SELECT assign_teacher($1,$2)`, [t, s]); }

// 1
 test('catalog hardening: application roles are constrained and sensitive tables FORCE RLS', async () => {
  const r = await direct(`SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname IN ('phase2_authenticated','phase2_api','phase2_bootstrap')`);
  assert.equal(r.rows.length, 3); for (const x of r.rows) { assert.equal(x.rolsuper, false); assert.equal(x.rolbypassrls, false); assert.equal(x.rolcanlogin, x.rolname === 'phase2_api'); }
  const t = await direct(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('profiles','students','guardian_links','teacher_assignments','published_reports','teacher_notes','payment_records','private_files','audit_events')`);
  assert.equal(t.rows.length, 9); assert.ok(t.rows.every(x => x.relrowsecurity && x.relforcerowsecurity));
});
// 2
 test('definer functions use a safe search_path and dangerous routines are not public-executable', async () => {
  const f = await direct(`SELECT p.proname,pg_get_userbyid(p.proowner) owner,coalesce(p.proconfig::text,'') config FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef`);
  assert.ok(f.rows.length > 0); assert.ok(f.rows.every(x => /search_path=pg_catalog(?:,public(?:,auth)?)?/.test(x.config)));
  for (const signature of ['grant_role(uuid,text,text)','grant_capability(uuid,text,text)','grant_guardian_link(uuid,uuid,text,text,text,text)','freeze_student(uuid,text)']) {
    const g = await direct(`SELECT has_function_privilege('public',$1,'EXECUTE') AS executable`, [signature]);
    assert.equal(g.rows[0].executable, false, `${signature} must not be PUBLIC executable`);
  }
});
// 3
 test('anonymous and users without a role cannot read protected records', async () => {
  assert.equal((await as(fx.ids.reviewer, c => c.query('SELECT id FROM students'))).rows.length, 0);
  assert.equal((await as(null, c => c.query('SELECT id FROM students'), 'aal1', '')).rows.length, 0);
  assert.equal((await pool.query('SELECT count(*) FROM students')).rows[0].count, '4');
});
// 4
 test('direct writes and ungranted columns are denied under the app role', async () => {
  await assert.rejects(() => as(fx.ids.reviewer, c => c.query(`INSERT INTO students(id,full_name,age_band,preferred_locale,timezone,status) VALUES(gen_random_uuid(),'x','adult','en','UTC','active')`)));
  await assert.rejects(() => as(fx.ids.reviewer, c => c.query('SELECT evidence_note FROM guardian_links')));
});
// 5
 test('guardian links require guardian role, live verified consent, and isolate linked students', async () => {
  await grantRole(fx.ids.guardianA, 'guardian'); await grantRole(fx.ids.guardianB, 'guardian');
  await assert.rejects(() => owner(`SELECT grant_guardian_link($1,$2,'x','','','')`, [fx.ids.guardianA,fx.ids.childA]));
  await guardianLink(fx.ids.guardianA, fx.ids.childA);
  assert.equal((await as(fx.ids.guardianA, c => c.query('SELECT id FROM students'))).rows.length, 1);
  assert.equal((await as(fx.ids.guardianB, c => c.query('SELECT id FROM students'))).rows.length, 0);
});
// 6
 test('teacher assignment is time/status/teacher constrained and isolated', async () => {
  await grantRole(fx.ids.teacherA, 'teacher'); await grantRole(fx.ids.teacherB, 'teacher'); await assignment(fx.ids.teacherA, fx.ids.childA);
  await direct(`INSERT INTO published_reports(id,student_id,body,status) VALUES($1,$2,'synthetic','published')`, [fx.ids.reportA,fx.ids.childA]);
  assert.equal((await as(fx.ids.teacherA, c => c.query('SELECT id FROM students'))).rows.length, 1);
  assert.equal((await as(fx.ids.teacherB, c => c.query('SELECT id FROM students'))).rows.length, 0);
});
// 7
 test('student self access requires student role and active profile/session', async () => {
  await grantRole(fx.ids.adultA, 'student'); assert.equal((await as(fx.ids.adultA, c => c.query('SELECT id FROM students'))).rows.length, 1);
  await direct(`UPDATE profiles SET status='suspended' WHERE auth_user_id=$1`, [fx.ids.adultA]); assert.equal((await as(fx.ids.adultA, c => c.query('SELECT id FROM students'))).rows.length, 0);
});
// 8
 test('private files expose only validated clean files tied to the requester payment', async () => {
  await grantRole(fx.ids.guardianA, 'guardian'); await guardianLink(fx.ids.guardianA, fx.ids.childA);
  await direct(`INSERT INTO payment_records(id,student_id,requested_by_user_id,reference) VALUES($1,$2,$3,'synthetic')`, [fx.ids.paymentA,fx.ids.childA,fx.ids.guardianA]);
  await direct(`INSERT INTO private_files(id,owner_user_id,payment_record_id,purpose,object_path,sha256,mime_type,size_bytes,validation_status,scan_status) VALUES($1,$2,$3,'payment_evidence','clean',repeat('0',64),'image/png',2,'validated','clean'),($4,$2,$3,'payment_evidence','quarantine',repeat('0',64),'image/png',2,'quarantined','pending')`, [fx.ids.fileA,fx.ids.guardianA,fx.ids.paymentA,fx.ids.quarantineFile]);
  assert.deepEqual((await as(fx.ids.guardianA, c => c.query('SELECT object_path FROM private_files'))).rows.map(x=>x.object_path), ['clean']);
});
// 9
 test('capability and role revocation take effect immediately', async () => {
  await grantRole(fx.ids.teacherA, 'teacher'); await assignment(fx.ids.teacherA, fx.ids.childA); assert.equal((await as(fx.ids.teacherA, c => c.query('SELECT id FROM students'))).rows.length, 1);
  await owner(`SELECT revoke_role($1,'teacher','synthetic revoke')`, [fx.ids.teacherA]); assert.equal((await as(fx.ids.teacherA, c => c.query('SELECT id FROM students'))).rows.length, 0);
});
// 10
 test('expired, revoked, and other-user sessions fail caller binding', async () => {
  await direct(`UPDATE auth.sessions SET revoked_at=now() WHERE id=$1`, [fx.sessions[fx.ids.guardianA]]); assert.equal((await as(fx.ids.guardianA, c => c.query('SELECT current_active_user()'))).rows[0].current_active_user, false);
  await direct(`UPDATE auth.sessions SET expires_at=now()-interval '1 second' WHERE id=$1`, [fx.sessions[fx.ids.guardianB]]); assert.equal((await as(fx.ids.guardianB, c => c.query('SELECT current_active_user()'))).rows[0].current_active_user, false);
  assert.equal((await as(fx.ids.guardianA, c => c.query('SELECT session_is_active($1)', [fx.sessions[fx.ids.guardianB]]))).rows[0].session_is_active, false);
});
// 11
 test('freeze hides student records from every reader, including admin, and audits the event', async () => {
  await grantRole(fx.ids.guardianA, 'guardian'); await guardianLink(fx.ids.guardianA, fx.ids.childA); await owner(`SELECT freeze_student($1,'synthetic freeze')`, [fx.ids.childA]);
  assert.equal((await as(fx.ids.owner, c => c.query('SELECT id FROM students'))).rows.some(x=>x.id===fx.ids.childA), false);
  assert.ok((await direct(`SELECT 1 FROM audit_events WHERE action='student.freeze' AND target_id=$1`, [fx.ids.childA])).rowCount > 0);
});
// 12
 test('audit is append-only to app callers and consent evidence is not in DTO grants', async () => {
  await assert.rejects(() => as(fx.ids.reviewer, c => c.query(`INSERT INTO audit_events(actor_user_id,action,reason) VALUES($1,'spoof','x')`, [fx.ids.reviewer])));
  await grantRole(fx.ids.guardianA, 'guardian'); await guardianLink(fx.ids.guardianA, fx.ids.childA); await assert.rejects(() => as(fx.ids.guardianA, c => c.query('SELECT evidence_note,consent_method FROM guardian_links')));
});
// 13
 test('bootstrap control is singleton, preauthorized, one-shot, and not exposed to API roles', async () => {
  // This test owns its reset because bootstrap is intentionally one-shot.
  fx = await reset(pool);
  await direct(`UPDATE bootstrap_control SET preauthorized_owner_id=$1 WHERE id=true`, [fx.ids.owner]);
  const call = async () => { const c = await pool.connect(); try { await c.query('BEGIN'); await c.query('SET LOCAL ROLE phase2_bootstrap'); await setClaims(c, fx.ids.owner, fx.sessions[fx.ids.owner], 'aal2'); await c.query(`SELECT bootstrap_admin($1,'synthetic bootstrap')`, [fx.ids.owner]); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); } };
  const outcomes = await Promise.allSettled([call(), call()]); assert.equal(outcomes.filter(x=>x.status==='fulfilled').length, 1); assert.equal(outcomes.filter(x=>x.status==='rejected').length, 1);
  const t = await direct(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='bootstrap_control'`);
  assert.ok(t.rows.some(x=>x.column_name==='consumed_at')); assert.ok(t.rows.some(x=>x.column_name==='preauthorized_owner_id'));
  const r = await direct(`SELECT rolcanlogin FROM pg_roles WHERE rolname='phase2_bootstrap'`); assert.equal(r.rows[0].rolcanlogin, false);
  const p = await direct(`SELECT has_function_privilege('phase2_api','bootstrap_admin(uuid,text)','EXECUTE') AS executable`); assert.equal(p.rows[0].executable, false);
});
// 14
 test('published reports permit draft enum but only published rows are visible', async () => {
  await direct(`INSERT INTO published_reports(id,student_id,body,status) VALUES($1,$2,'draft','draft'),($3,$2,'published','published')`, [fx.ids.draftA,fx.ids.childA,fx.ids.reportA]);
  await grantRole(fx.ids.guardianA, 'guardian'); await guardianLink(fx.ids.guardianA, fx.ids.childA);
  assert.deepEqual((await as(fx.ids.guardianA, c => c.query('SELECT id FROM published_reports'))).rows.map(x=>x.id), [fx.ids.reportA]);
});

test('minor login is rejected by the database constraint, not just omitted by fixtures', async () => {
  await assert.rejects(() => direct('UPDATE public.students SET auth_user_id=$1 WHERE id=$2', [fx.ids.guardianA,fx.ids.childA]), error => error.code === '23514');
  assert.equal((await direct('SELECT auth_user_id FROM public.students WHERE id=$1',[fx.ids.childA])).rows[0].auth_user_id,null);
});
test('self escalation, missing MFA claim, bootstrap RPC and fabricated audit are denied', async () => {
  await assert.rejects(() => as(fx.ids.guardianA,c=>c.query("SELECT public.grant_role($1,'admin','spoof')",[fx.ids.guardianA])));
  await assert.rejects(() => as(fx.ids.owner,c=>c.query("SELECT public.grant_role($1,'guardian','missing aal2')",[fx.ids.guardianA]),'aal1'));
  await assert.rejects(() => as(fx.ids.owner,c=>c.query("SELECT public.bootstrap_admin($1,'spoof')",[fx.ids.owner]),'aal2'),error=>error.code==='42501');
  await assert.rejects(() => as(fx.ids.owner,c=>c.query("SELECT public.audit('forged',$1,'spoof')",[fx.ids.childA]),'aal2'),error=>error.code==='42501');
  assert.equal((await direct("SELECT count(*)::int n FROM public.user_roles WHERE auth_user_id=$1 AND role='admin'",[fx.ids.guardianA])).rows[0].n,0);
});
test('role history and audit cannot be rewritten, and failed commands roll back atomically', async () => {
  await grantRole(fx.ids.guardianA,'guardian');
  await assert.rejects(()=>direct("UPDATE public.user_roles SET reason='rewrite' WHERE auth_user_id=$1",[fx.ids.guardianA]));
  await assert.rejects(()=>owner("SELECT public.revoke_role($1,'guardian','')",[fx.ids.guardianA]));
  assert.equal((await direct("SELECT revoked_at FROM public.user_roles WHERE auth_user_id=$1",[fx.ids.guardianA])).rows[0].revoked_at,null);
  await assert.rejects(()=>direct("UPDATE public.audit_events SET reason='rewrite'"));
  await assert.rejects(()=>direct("DELETE FROM public.audit_events"));
  assert.equal((await direct("SELECT count(*)::int n FROM public.audit_events WHERE action='role.revoke'",[])).rows[0].n,0);
});
test('payment evidence owner must match the immutable requester relationship', async () => {
  await direct("INSERT INTO public.payment_records(id,student_id,requested_by_user_id,reference) VALUES($1,$2,$3,'synthetic-only')",[fx.ids.paymentA,fx.ids.childA,fx.ids.guardianA]);
  await assert.rejects(()=>direct("INSERT INTO public.private_files(owner_user_id,payment_record_id,purpose,object_path,mime_type,size_bytes,validation_status,scan_status) VALUES($1,$2,'payment_evidence','synthetic.pdf','application/pdf',20,'validated','clean')",[fx.ids.guardianB,fx.ids.paymentA]),error=>error.code==='23503');
});
