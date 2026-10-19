import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { providerPool, dataFixture, resetData, app, rest, storage, keys, auth, fixturePdf, origins } from './provider-helpers.mjs';

// This file intentionally exercises only local synthetic providers. The helper refuses
// to run unless PHASE2_PROVIDER_TEST=synthetic-only and restricts every request to loopback.
const pool = providerPool();
let fx;
const token = (name) => fx.sessions[name].access_token;
const uid = (name) => fx.users[name].id;
const id = (name) => fx.ids[name];
async function expectApp(path, actor, status) {
  const response = await app(path, actor && token(actor));
  assert.equal(response.status, status, `${actor ?? 'anonymous'} ${path}`);
  return response;
}
async function expectRest(path, actor, status, options = {}) {
  const response = await rest(path, actor && token(actor), options);
  assert.equal(response.status, status, `${actor ?? 'anonymous'} ${path}`);
  return response;
}
async function json(response) { return response.json(); }

before(async () => { fx = await dataFixture(pool); });
beforeEach(async () => { await resetData(pool, fx); });
after(async () => { await pool.end(); });

test('real application and PostgREST providers isolate guardian, adult, teacher, and foreign child data', async () => {
  assert.equal((await (await expectApp(`students/${id('childA')}`, 'guardianA', 200)).json()).data.id, id('childA'));
  await expectApp(`students/${id('childB')}`, 'guardianA', 404);
  await expectApp(`students/${id('adultB')}`, 'adultA', 404);
  await expectApp(`notes/${id('noteB')}`, 'teacherA', 404);
  await expectApp(`payments/${id('paymentA')}`, 'teacherA', 404);
  const rows = await json(await expectRest(`/students?id=eq.${id('childA')}&select=id`, 'guardianA', 200));
  assert.deepEqual(rows.map((row) => row.id), [id('childA')]);
  assert.equal((await (await expectRest(`/students?id=eq.${id('childB')}&select=id`, 'guardianA', 200)).json()).length, 0);
});

test('adult self access is limited to the adult identity and published reports', async () => {
  await expectApp(`students/${id('adultA')}`, 'adultA', 200);
  await expectApp(`reports/${id('reportA')}`, 'adultA', 404);
  await expectApp(`students/${id('adultB')}`, 'adultA', 404);
  const self = await json(await expectRest(`/students?id=eq.${id('adultA')}&select=id,full_name`, 'adultA', 200));
  assert.equal(self.length, 1);
  assert.equal(self[0].id, id('adultA'));
});

test('guardians receive published reports only and no internal consent evidence', async () => {
  await expectApp(`reports/${id('reportA')}`, 'guardianA', 200);
  await expectApp(`reports/${id('draftA')}`, 'guardianA', 404);
  const links = await (await expectApp('guardian-links', 'guardianA', 200)).text();
  assert.doesNotMatch(links, /evidence_note|consent_method|verified_by|INTERNAL SYNTHETIC/);
  const reports = await (await expectRest(`/reports?id=eq.${id('reportA')}&select=*`, 'guardianA', 200)).json();
  assert.equal(reports.length, 1);
  assert.doesNotMatch(JSON.stringify(reports), /draft|internal|evidence|object_path|sha256/);
});

test('teacher access excludes finance and foreign private notes through both providers', async () => {
  await expectApp(`notes/${id('noteA')}`, 'teacherA', 200);
  await expectApp(`notes/${id('noteB')}`, 'teacherA', 404);
  for (const path of [`payments/${id('paymentA')}`, `files/${id('fileA')}`]) await expectApp(path, 'teacherA', 404);
  assert.equal((await (await expectRest(`/notes?id=eq.${id('noteB')}&select=id`, 'teacherA', 200)).json()).length, 0);
  assert.equal((await (await expectRest(`/payments?id=eq.${id('paymentA')}&select=id`, 'teacherA', 200)).json()).length, 0);
});

test('ordinary admin cannot read finance until live payment.review capability is granted, then revocation is immediate', async () => {
  await expectApp(`files/${id('fileA')}`, 'admin', 404);
  await pool.query("INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,'payment.review',$1,'synthetic capability test')", [uid('admin')]);
  await expectApp(`files/${id('fileA')}`, 'admin', 200);
  await pool.query("UPDATE public.capabilities SET revoked_at=now() WHERE auth_user_id=$1 AND capability='payment.review' AND revoked_at IS NULL", [uid('admin')]);
  await expectApp(`files/${id('fileA')}`, 'admin', 404);
  await expectRest(`/files?id=eq.${id('fileA')}&select=*`, 'admin', 200).then(async (r) => assert.equal((await r.json()).length, 0));
});

test('relationship revocation and consent withdrawal deny an already-issued token immediately', async () => {
  await expectApp(`reports/${id('reportA')}`, 'guardianA', 200);
  await pool.query("UPDATE public.guardian_links SET verification_status='revoked',revoked_at=now(),consent_status='withdrawn',consent_withdrawn_at=now(),freeze_reason='synthetic relationship revocation' WHERE id=$1", [id('linkA')]);
  await expectApp(`reports/${id('reportA')}`, 'guardianA', 404);
  await expectRest(`/reports?id=eq.${id('reportA')}&select=id`, 'guardianA', 200).then(async (r) => assert.equal((await r.json()).length, 0));
});

test('student freeze removes guardian and adult educational access without token refresh', async () => {
  await pool.query('UPDATE public.students SET frozen=true WHERE id IN($1,$2)', [id('childA'), id('adultA')]);
  await expectApp(`students/${id('childA')}`, 'guardianA', 404);
  await expectApp(`reports/${id('reportA')}`, 'guardianA', 404);
  await expectApp(`students/${id('adultA')}`, 'adultA', 404);
});

test('PostgREST is read-only, does not expose public tables, profile headers, or privileged RPCs', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const response = await rest(`/reports?id=eq.${id('reportA')}`, token('guardianA'), { method, body: { body: 'forged' } });
    assert.equal(response.status, 405);
  }
  const wrongSchema = await rest('/profiles?select=*', token('guardianA'), { headers: { 'Accept-Profile': 'public' } });
  assert.notEqual(wrongSchema.status, 200);
  await expectRest('/private_files?select=*', 'guardianA', 404);
  await expectRest('/rpc/grant_role', 'admin', 404, { method: 'POST', body: {} });
});

test('PostgREST safe projections omit consent evidence, object paths, hashes, and provider-private columns', async () => {
  const links = await json(await expectRest('/guardian_links?select=*', 'guardianA', 200));
  assert.ok(links.every((row) => !('evidence_note' in row) && !('consent_method' in row) && !('consent_accepted_by' in row)));
  const files = await json(await expectRest(`/files?id=eq.${id('fileA')}&select=*`, 'admin', 200));
  assert.deepEqual(files, []);
  const views = await pool.query("SELECT table_schema,table_name,is_insertable_into FROM information_schema.views WHERE table_schema='api' ORDER BY table_name");
  assert.ok(views.rows.length >= 8);
  const options=await pool.query("SELECT reloptions FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='api' AND c.relkind='v'");
  assert.ok(options.rows.every(r=>r.reloptions.includes('security_invoker=true')&&r.reloptions.includes('security_barrier=true')));
});

test('direct Storage denies anonymous and user object, public, signed, upload, list, and bucket access', async () => {
  const path = `/object/phase2-private/${id('fileA')}.pdf`;
  for (const actor of [undefined, 'guardianA']) {
    for (const suffix of [path, `/object/authenticated/phase2-private/${id('fileA')}.pdf`, `/object/public/phase2-private/${id('fileA')}.pdf`]) {
      const response = await storage(suffix, actor && token(actor));
      assert.ok([400, 401, 403, 404].includes(response.status));
    }
  }
  const signed = await storage(`/object/sign/phase2-private/${id('fileA')}.pdf`, token('guardianA'), { method: 'POST', body: JSON.stringify({ expiresIn: 60 }), headers: { 'Content-Type': 'application/json' } });
  assert.ok([400, 401, 403, 404].includes(signed.status));
  for (const actor of ['guardianA', undefined]) {
    const upload = await storage(`/object/phase2-private/${randomUUID()}.pdf`, actor && token(actor), { method: 'POST', body: fixturePdf, headers: { 'Content-Type': 'application/pdf' } });
    assert.ok([400, 401, 403, 404].includes(upload.status));
  }
  const list = await storage('/object/list/phase2-private', token('guardianA'), { method: 'POST', body: JSON.stringify({ prefix: '' }), headers: { 'Content-Type': 'application/json' } });
  if(list.status===200)assert.deepEqual(await list.json(),[]);else assert.ok([400,401,403,404].includes(list.status));
  const bucket = await storage('/bucket/phase2-private', token('guardianA'));
  assert.ok([400, 401, 403, 404].includes(bucket.status));
});

test('application private-file delivery is authenticated, owner-only, byte-correct, and no-store', async () => {
  const own = await expectApp(`files/${id('fileA')}`, 'guardianA', 200);
  const bytes=Buffer.from(await own.arrayBuffer());
  assert.deepEqual(bytes, fixturePdf);
  assert.match(own.headers.get('cache-control') ?? '', /no-store/);
  assert.match(own.headers.get('content-disposition') ?? '', /^attachment;/);
  await expectApp(`files/${id('fileA')}`, 'guardianB', 404);
  await expectApp(`files/${id('fileA')}`, 'admin', 404);
  await expectApp(`files/${id('fileA')}`, 'teacherA', 404);
  await expectApp(`files/${id('fileA')}`, undefined, 401);
  assert.doesNotMatch(bytes.toString(), /access_token|refresh_token|service_role/);
});

test('financial-review capability permits an administrator to read the owner file and is checked live', async () => {
  await expectApp(`files/${id('fileA')}`, 'admin', 404);
  await pool.query("INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,'payment.review',$1,'synthetic financial review')", [uid('admin')]);
  const response = await expectApp(`files/${id('fileA')}`, 'admin', 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), fixturePdf);
  await pool.query("UPDATE public.capabilities SET revoked_at=now() WHERE auth_user_id=$1 AND capability='payment.review' AND revoked_at IS NULL", [uid('admin')]);
  await expectApp(`files/${id('fileA')}`, 'admin', 404);
});

test('database and Storage configuration are private and have no anonymous or authenticated bucket policies', async () => {
  const bucket = await pool.query("SELECT id,public FROM storage.buckets WHERE id='phase2-private'");
  assert.equal(bucket.rows[0]?.public, false);
  const policies = await pool.query("SELECT policyname,roles,cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND ('anon'=ANY(roles) OR 'authenticated'=ANY(roles))");
  assert.deepEqual(policies.rows, []);
  const exposed = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='api' AND table_name IN ('private_files','capabilities','user_roles')");
  assert.deepEqual(exposed.rows, []);
});

test('corrupt bytes and missing provider objects fail closed with 503, then fixture bytes are restored', async () => {
  const k = await keys();
  const path = `/object/phase2-private/${id('fileA')}.pdf`;
  try {
    const corrupt = Buffer.from('corrupt synthetic bytes');
    const changed = await storage(path, k.serviceKey, { method: 'POST', body: corrupt, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' } });
    assert.equal(changed.ok, true);
    await expectApp(`files/${id('fileA')}`, 'guardianA', 503);
    const missing = await storage(path, k.serviceKey, { method: 'DELETE' });
    assert.ok([200, 204].includes(missing.status));
    await expectApp(`files/${id('fileA')}`, 'guardianA', 503);
  } finally {
    const restored = await storage(path, k.serviceKey, { method: 'POST', body: fixturePdf, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' } });
    assert.equal(restored.ok, true);
  }
});

test('quarantined and infected metadata are denied without claiming a scanner result', async () => {
  await pool.query("UPDATE public.private_files SET validation_status='quarantined',scan_status='pending' WHERE id=$1", [id('fileA')]);
  await expectApp(`files/${id('fileA')}`, 'guardianA', 404);
  await pool.query("UPDATE public.private_files SET validation_status='rejected',scan_status='infected' WHERE id=$1", [id('fileA')]);
  await expectApp(`files/${id('fileA')}`, 'guardianA', 404);
  const response = await expectApp(`files/${id('fileA')}`, 'guardianA', 404);
  assert.doesNotMatch(await response.text(), /scanner|malware|virus|infected/);
});

test('real GoTrue sessions authenticate the provider issuer and remain unmodified by data isolation tests', async () => {
  const session = fx.sessions.guardianA;
  assert.ok(session.access_token);
  const me = await auth('/user', { token: session.access_token });
  assert.equal(me.status, 200);
  const body = await me.json();
  assert.equal(body.id, uid('guardianA'));
  const sessionCheck = await pool.query('SELECT not_after FROM auth.sessions WHERE user_id=$1', [uid('guardianA')]);
  assert.ok(sessionCheck.rows.some((row) => row.not_after === null || new Date(row.not_after) > new Date()));
});
