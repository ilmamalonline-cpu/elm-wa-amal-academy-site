import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startHarness } from './family-registration-harness.mjs';

const foundation = await readFile(new URL('../db/teacher-foundation.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../db/teacher-session-outcomes.sql', import.meta.url), 'utf8');
const meetingMigration = await readFile(new URL('../db/teacher-session-meeting-url.sql', import.meta.url), 'utf8');
let h;
const teacherA = randomUUID(), teacherB = randomUUID(), childB = randomUUID();
let ownLesson, otherLesson, cancelledLesson;

before(async () => {
  h = await startHarness();
  await h.admin.query(foundation);
  await h.admin.query(migration);
  await h.admin.query('CREATE ROLE postgres WITH SUPERUSER NOLOGIN');
  await h.admin.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [teacherA, teacherB]);
  await h.admin.query(`INSERT INTO public.academy_teachers(id,display_name,time_zone,status) VALUES
    ($1,'Teacher A','Africa/Cairo','active'),($2,'Teacher B','UTC','active')`, [teacherA, teacherB]);
  await h.admin.query(`INSERT INTO public.academy_children(id,guardian_id,display_name,birth_year)
    VALUES ($1,$2,'Child B',2015)`, [childB, h.ids.guardianB]);
  await h.admin.query(`INSERT INTO public.academy_teacher_assignments(teacher_id,child_id,status) VALUES
    ($1,$2,'active'),($1,$3,'active'),($4,$3,'active')`,
    [teacherA, h.ids.childA, childB, teacherB]);
  ownLesson = (await h.admin.query(`INSERT INTO public.academy_individual_lessons
    (teacher_id,child_id,subject,starts_at,ends_at,time_zone,status)
    VALUES ($1,$2,'quran','2035-01-01T09:00:00Z','2035-01-01T09:30:00Z','Africa/Cairo','scheduled') RETURNING id`,
    [teacherA, h.ids.childA])).rows[0].id;
  otherLesson = (await h.admin.query(`INSERT INTO public.academy_individual_lessons
    (teacher_id,child_id,subject,starts_at,ends_at,time_zone,status)
    VALUES ($1,$2,'tajweed','2035-01-01T10:00:00Z','2035-01-01T10:30:00Z','UTC','scheduled') RETURNING id`,
    [teacherB, childB])).rows[0].id;
  cancelledLesson = (await h.admin.query(`INSERT INTO public.academy_individual_lessons
    (teacher_id,child_id,subject,starts_at,ends_at,time_zone,status)
    VALUES ($1,$2,'quran','2035-01-01T11:00:00Z','2035-01-01T11:30:00Z','Africa/Cairo','cancelled') RETURNING id`,
    [teacherA, h.ids.childA])).rows[0].id;
});
after(async () => { await h?.close(); });

const update = (uid, id, sql = 'outcome=$1, follow_up_note=$2', values = ['attended_completed', 'Done']) =>
  h.as(uid, `UPDATE public.academy_individual_lessons SET ${sql} WHERE id=$${values.length + 1}`, [...values, id]);
const updateMeeting = (uid, id, url = 'https://meet.google.com/abc-defg-hij') =>
  h.as(uid, 'UPDATE public.academy_individual_lessons SET meeting_url=$1 WHERE id=$2', [url, id]);

async function queryAsPostgres(sql) {
  const client = await h.admin.connect();
  try {
    await client.query('SET ROLE postgres');
    return await client.query(sql);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.query('RESET ROLE').catch(() => {});
    client.release();
  }
}

test('meeting migration requires postgres, pins the guardian RPC owner, and adds only link privileges', async () => {
  const unprivileged = await h.admin.connect();
  try {
    await assert.rejects(() => unprivileged.query(meetingMigration), /apply this migration as postgres/);
    await unprivileged.query('ROLLBACK').catch(() => {});
    assert.equal((await unprivileged.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='academy_individual_lessons' AND column_name='meeting_url'")).rows[0].count, 0);
  } finally {
    unprivileged.release();
  }
  await h.admin.query('CREATE ROLE service_role NOLOGIN');
  await h.admin.query('GRANT USAGE ON SCHEMA public TO service_role');
  await h.admin.query('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role');
  await queryAsPostgres("CREATE FUNCTION public.academy_acl_default_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
  assert.equal((await h.admin.query("SELECT has_function_privilege('service_role', 'public.academy_acl_default_probe()', 'EXECUTE') AS allowed")).rows[0].allowed, true);
  await queryAsPostgres('DROP FUNCTION public.academy_acl_default_probe()');
  await queryAsPostgres(meetingMigration);

  const p = (await h.admin.query(`SELECT
    has_table_privilege('anon','public.academy_individual_lessons','SELECT') AS anon_select,
    has_table_privilege('authenticated','public.academy_individual_lessons','INSERT') AS insert_all,
    has_table_privilege('authenticated','public.academy_individual_lessons','DELETE') AS delete_all,
    has_column_privilege('authenticated','public.academy_individual_lessons','outcome','UPDATE') AS outcome_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','follow_up_note','UPDATE') AS note_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','meeting_url','SELECT') AS meeting_select,
    has_column_privilege('authenticated','public.academy_individual_lessons','meeting_url','UPDATE') AS meeting_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','teacher_id','UPDATE') AS teacher_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','created_at','SELECT') AS created_read`)).rows[0];
  assert.deepEqual(p, { anon_select: false, insert_all: false, delete_all: false, outcome_update: true, note_update: true, meeting_select: true, meeting_update: true, teacher_update: false, created_read: false });
  const security = (await h.admin.query(`SELECT
    pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef,
    p.proconfig,
    EXISTS (SELECT FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec,
    COALESCE((
      SELECT array_agg(
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type
        ORDER BY a.grantee, a.privilege_type
      )
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee <> p.proowner
    ), ARRAY[]::text[]) AS non_owner_acl,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec
    FROM pg_proc p
    WHERE p.oid='public.academy_guardian_session_summaries(uuid,integer)'::regprocedure`)).rows[0];
  assert.deepEqual(security, { owner: 'postgres', prosecdef: true, proconfig: ['search_path=pg_catalog'], public_exec: false, non_owner_acl: ['authenticated:EXECUTE'], anon_exec: false, service_role_exec: false, authenticated_exec: true });
  const serviceRole = await h.admin.connect();
  try {
    await serviceRole.query('BEGIN');
    await serviceRole.query('SET LOCAL ROLE service_role');
    await assert.rejects(
      () => serviceRole.query('SELECT * FROM public.academy_guardian_session_summaries($1)', [h.ids.childA]),
      /permission denied for function academy_guardian_session_summaries/,
    );
  } finally {
    await serviceRole.query('ROLLBACK').catch(() => {});
    serviceRole.release();
  }
  const triggerAcl = (await h.admin.query(`SELECT
    pg_get_userbyid(p.proowner) AS owner,
    COALESCE((
      SELECT array_agg(
        CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END || ':' || a.privilege_type
        ORDER BY a.grantee, a.privilege_type
      )
      FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE a.grantee <> p.proowner
    ), ARRAY[]::text[]) AS non_owner_acl,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_exec,
    has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_exec
    FROM pg_proc p
    WHERE p.oid='public.academy_individual_lesson_clear_cancelled_meeting_url()'::regprocedure
    `)).rows[0];
  assert.deepEqual(triggerAcl, { owner: 'postgres', non_owner_acl: [], anon_exec: false, authenticated_exec: false, service_role_exec: false });
  const forcedRls = (await h.admin.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c
    WHERE c.oid IN ('public.academy_children'::regclass, 'public.academy_individual_lessons'::regclass)
    ORDER BY c.relname`)).rows;
  assert.deepEqual(forcedRls, [
    { relname: 'academy_children', relrowsecurity: true, relforcerowsecurity: true },
    { relname: 'academy_individual_lessons', relrowsecurity: true, relforcerowsecurity: true },
  ]);
  await assert.rejects(() => h.as(teacherA, `INSERT INTO public.academy_individual_lessons(teacher_id,child_id,subject,starts_at,ends_at,time_zone) VALUES ($1,$2,'quran',now(),now()+interval '30 minutes','UTC')`, [teacherA, h.ids.childA]), /permission denied/);
  await assert.rejects(() => h.as(teacherA, 'DELETE FROM public.academy_individual_lessons WHERE id=$1', [ownLesson]), /permission denied/);
});

test('active assigned teacher reads own lesson and updates only outcome and meeting-link fields', async () => {
  assert.deepEqual((await h.as(teacherA, `SELECT id,teacher_id,child_id,subject,starts_at,ends_at,time_zone,status,meeting_url,outcome,follow_up_note FROM public.academy_individual_lessons WHERE id=$1`, [ownLesson])).rows.map(r => r.id), [ownLesson]);
  assert.equal((await h.as(teacherA, 'SELECT id FROM public.academy_individual_lessons WHERE teacher_id=$1', [teacherB])).rowCount, 0);
  const result = await update(teacherA, ownLesson);
  assert.equal(result.rowCount, 1);
  assert.deepEqual((await h.admin.query('SELECT outcome,follow_up_note FROM public.academy_individual_lessons WHERE id=$1', [ownLesson])).rows[0], { outcome: 'attended_completed', follow_up_note: 'Done' });
  assert.equal((await updateMeeting(teacherA, ownLesson, 'https://us02web.zoom.us/j/123456?pwd=AbC%2F12')).rowCount, 1);
  assert.equal((await h.as(teacherA, 'SELECT meeting_url FROM public.academy_individual_lessons WHERE id=$1', [ownLesson])).rows[0].meeting_url, 'https://us02web.zoom.us/j/123456?pwd=AbC%2F12');
});

test('immutable identity and schedule columns, multi-field payloads, and cancelled writes are denied atomically', async () => {
  for (const [column, value] of [['teacher_id', teacherB], ['child_id', childB], ['subject', 'tajweed'], ['starts_at', '2035-01-01T12:00:00Z'], ['ends_at', '2035-01-01T12:30:00Z'], ['time_zone', 'UTC'], ['status', 'cancelled']]) {
    await assert.rejects(() => update(teacherA, ownLesson, `${column}=$1, outcome=$2`, [value, 'absent']), /permission denied/);
    assert.deepEqual((await h.admin.query(`SELECT ${column},outcome FROM public.academy_individual_lessons WHERE id=$1`, [ownLesson])).rows[0].outcome, 'attended_completed');
  }
  await assert.rejects(() => update(teacherA, ownLesson, 'outcome=$1, teacher_id=$2', ['absent', teacherB]), /permission denied/);
  assert.equal((await update(teacherA, cancelledLesson)).rowCount, 0);
  assert.equal((await update(teacherB, ownLesson)).rowCount, 0);
  assert.equal((await updateMeeting(teacherA, cancelledLesson)).rowCount, 0);
  assert.equal((await updateMeeting(teacherB, ownLesson)).rowCount, 0);
});

test('cancelling a lesson with an existing meeting URL clears it atomically and prevents it from returning', async () => {
  const url = 'https://meet.google.com/abc-defg-hij';
  await h.admin.query("UPDATE public.academy_individual_lessons SET status='scheduled' WHERE id=$1", [cancelledLesson]);
  await h.admin.query('UPDATE public.academy_individual_lessons SET meeting_url=$1 WHERE id=$2', [url, cancelledLesson]);
  const cancelled = await h.admin.query("UPDATE public.academy_individual_lessons SET status='cancelled' WHERE id=$1 RETURNING status,meeting_url", [cancelledLesson]);
  assert.deepEqual(cancelled.rows[0], { status: 'cancelled', meeting_url: null });
  assert.equal((await h.as(teacherA, 'SELECT meeting_url FROM public.academy_individual_lessons WHERE id=$1', [cancelledLesson])).rows[0].meeting_url, null);
  const staleWrite = await h.admin.query('UPDATE public.academy_individual_lessons SET meeting_url=$1 WHERE id=$2 RETURNING meeting_url', [url, cancelledLesson]);
  assert.equal(staleWrite.rows[0].meeting_url, null);
  assert.equal((await h.as(h.ids.guardianA, 'SELECT meeting_url FROM public.academy_guardian_session_summaries($1) WHERE id=$2', [h.ids.childA, cancelledLesson])).rows[0].meeting_url, null);
  const invariant = await h.admin.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='public.academy_individual_lessons'::regclass AND conname='academy_individual_lessons_cancelled_meeting_url_check'");
  assert.equal(invariant.rowCount, 1);
  assert.match(invariant.rows[0].definition, /cancelled/);
  assert.match(invariant.rows[0].definition, /meeting_url IS NULL/i);
});

test('outcome and note constraints enforce enum, dependencies, Unicode, controls, and whitespace rules', async () => {
  const cases = [
    ['outcome=$1,follow_up_note=$2', ['unknown', '']],
    ['outcome=$1,follow_up_note=$2', [null, 'note']],
    ['outcome=$1,follow_up_note=$2', ['absent', ' '.repeat(3)]],
    ['outcome=$1,follow_up_note=$2', ['absent', '😀'.repeat(501)]],
    ['outcome=$1,follow_up_note=$2', ['absent', 'x\r']],
    ['outcome=$1,follow_up_note=$2', ['absent', 'x\u0001']],
    ['outcome=$1,follow_up_note=$2', ['absent', 'x\u0085']],
    ['outcome=$1,follow_up_note=$2', ['absent', '\u00a0\t\n']],
  ];
  for (const [index, [sql, values]] of cases.entries()) await assert.rejects(() => update(teacherA, ownLesson, sql, values), /check constraint|violates/, `validation case ${index}`);
  await update(teacherA, ownLesson, 'outcome=$1,follow_up_note=$2', [null, '']);
  await update(teacherA, ownLesson, 'outcome=$1,follow_up_note=$2', ['absent', '😀'.repeat(500)]);
  await update(teacherA, ownLesson, 'outcome=$1,follow_up_note=$2', ['attended_incomplete', 'a\tb\nc']);
});

test('meeting URL CHECK accepts allowlisted providers and rejects malformed or hostile links', async () => {
  const allowed = ['https://meet.google.com/abc-defg-hij', 'https://teams.microsoft.com/l/meetup-join/abc?context=x', 'https://teams.live.com/meet/abc?p=123', 'https://zoom.us/j/123456', 'https://us02web.zoom.us/j/123456?pwd=AbC%2F12'];
  for (const url of allowed) assert.equal((await updateMeeting(teacherA, ownLesson, url)).rowCount, 1, url);
  const rejected = ['http://meet.google.com/abc', 'https://meet.google.com', 'https://meet.google.com/', 'https://meet.google.com.evil.example/abc', 'https://meet.google.com@evil.example/abc', 'https://user@meet.google.com/abc', 'https://meet.google.com:443/abc', 'https://a.b.zoom.us/j/123', 'https://evil.example/abc', 'https://meet.google.com/a b', 'https://meet.google.com/%ZZ', `https://meet.google.com/${'a'.repeat(300)}`];
  for (const url of rejected) await assert.rejects(() => updateMeeting(teacherA, ownLesson, url), /check constraint|violates/, url);
});

test('guardian raw table is empty, RPC returns only permitted own-child summary, cross-family and anonymous calls are denied', async () => {
  assert.equal((await h.as(h.ids.guardianA, 'SELECT meeting_url FROM public.academy_individual_lessons')).rowCount, 0);
  const rows = (await h.as(h.ids.guardianA, 'SELECT * FROM public.academy_guardian_session_summaries($1)', [h.ids.childA])).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['child_id','ends_at','follow_up_note','id','meeting_url','outcome','starts_at','status','subject','time_zone'].sort());
  assert.equal(rows[0].id, ownLesson);
  assert.ok(rows[0].meeting_url);
  assert.equal(rows[1].id, cancelledLesson);
  assert.equal(rows[1].meeting_url, null);
  const guardianBRows = (await h.as(h.ids.guardianB, 'SELECT * FROM public.academy_guardian_session_summaries($1)', [childB])).rows;
  assert.deepEqual(guardianBRows.map(row => row.id), [otherLesson]);
  assert.ok(guardianBRows.every(row => row.child_id === childB));
  assert.equal((await h.as(h.ids.guardianA, 'SELECT * FROM public.academy_guardian_session_summaries($1)', [childB])).rowCount, 0);
  await assert.rejects(() => h.anon('SELECT * FROM public.academy_guardian_session_summaries($1)', [h.ids.childA]), /permission denied/);
  assert.equal((await h.as(null, 'SELECT * FROM public.academy_guardian_session_summaries($1)', [h.ids.childA])).rowCount, 0);
  assert.equal((await h.as(h.ids.guardianA, 'SELECT * FROM public.academy_guardian_session_summaries($1,$2)', [h.ids.childA, -1])).rowCount, 0);
  assert.equal((await h.as(h.ids.guardianA, 'SELECT * FROM public.academy_guardian_session_summaries($1,$2)', [h.ids.childA, 10001])).rowCount, 0);
});

test('suspension and assignment revocation immediately block reads and writes', async () => {
  await h.admin.query('UPDATE public.academy_teachers SET status=\'suspended\' WHERE id=$1', [teacherA]);
  assert.equal((await h.as(teacherA, 'SELECT id FROM public.academy_individual_lessons WHERE id=$1', [ownLesson])).rowCount, 0);
  assert.equal((await update(teacherA, ownLesson)).rowCount, 0);
  await h.admin.query('UPDATE public.academy_teachers SET status=\'active\' WHERE id=$1', [teacherA]);
  await h.admin.query('UPDATE public.academy_teacher_assignments SET status=\'inactive\' WHERE teacher_id=$1 AND child_id=$2', [teacherA, h.ids.childA]);
  assert.equal((await h.as(teacherA, 'SELECT id FROM public.academy_individual_lessons WHERE id=$1', [ownLesson])).rowCount, 0);
  assert.equal((await update(teacherA, ownLesson)).rowCount, 0);
});

test('migration is non-reapplicable and does not collide silently', async () => {
  await assert.rejects(() => h.admin.query(migration), /already exists|duplicate/);
  await h.admin.query('ROLLBACK').catch(() => {});
  await assert.rejects(() => queryAsPostgres(meetingMigration), /already exists|duplicate/);
  assert.equal((await h.admin.query('SELECT count(*)::int AS count FROM public.academy_individual_lessons')).rows[0].count, 3);
});

test('guardian, anonymous and unidentified callers cannot update or access other teacher sessions', async () => {
  assert.equal((await updateMeeting(h.ids.guardianA, ownLesson)).rowCount, 0);
  for (const uid of [h.ids.guardianA,h.ids.guardianB,null,randomUUID()]) {
    assert.equal((await update(uid,otherLesson)).rowCount,0);
    assert.equal((await h.as(uid,'SELECT id FROM public.academy_individual_lessons WHERE id=$1',[otherLesson])).rowCount,0);
  }
  await assert.rejects(() => h.anon('UPDATE public.academy_individual_lessons SET outcome=$1 WHERE id=$2',['absent',otherLesson]), /permission denied/);
  assert.equal((await updateMeeting(h.ids.guardianA, otherLesson)).rowCount, 0);
  assert.equal((await updateMeeting(teacherA, otherLesson)).rowCount, 0);
  await assert.rejects(() => h.anon('UPDATE public.academy_individual_lessons SET meeting_url=$1 WHERE id=$2',['https://meet.google.com/abc',otherLesson]), /permission denied/);
  assert.equal((await h.as(teacherA,'SELECT * FROM public.academy_guardian_session_summaries($1)',[childB])).rowCount,0);
  for(const column of ['id','created_at']) await assert.rejects(() => update(teacherB,otherLesson,`${column}=${column},outcome=$1`,['absent']),/permission denied/);
  const security=(await h.admin.query(`SELECT prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon_exec FROM pg_proc WHERE oid='public.academy_guardian_session_summaries(uuid,integer)'::regprocedure`)).rows[0];
  assert.equal(security.prosecdef,true);assert.deepEqual(security.proconfig,['search_path=pg_catalog']);assert.equal(security.anon_exec,false);
});
