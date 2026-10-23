import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startHarness } from './family-registration-harness.mjs';

const foundation = await readFile(new URL('../db/teacher-foundation.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../db/teacher-session-outcomes.sql', import.meta.url), 'utf8');
let h;
const teacherA = randomUUID(), teacherB = randomUUID(), childB = randomUUID();
let ownLesson, otherLesson, cancelledLesson;

before(async () => {
  h = await startHarness();
  await h.admin.query(foundation);
  await h.admin.query(migration);
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

 test('migration exposes only outcome fields for update and no insert/delete', async () => {
  const p = (await h.admin.query(`SELECT
    has_table_privilege('anon','public.academy_individual_lessons','SELECT') AS anon_select,
    has_table_privilege('authenticated','public.academy_individual_lessons','INSERT') AS insert_all,
    has_table_privilege('authenticated','public.academy_individual_lessons','DELETE') AS delete_all,
    has_column_privilege('authenticated','public.academy_individual_lessons','outcome','UPDATE') AS outcome_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','follow_up_note','UPDATE') AS note_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','teacher_id','UPDATE') AS teacher_update,
    has_column_privilege('authenticated','public.academy_individual_lessons','created_at','SELECT') AS created_read`)).rows[0];
  assert.deepEqual(p, { anon_select: false, insert_all: false, delete_all: false, outcome_update: true, note_update: true, teacher_update: false, created_read: false });
  await assert.rejects(() => h.as(teacherA, `INSERT INTO public.academy_individual_lessons(teacher_id,child_id,subject,starts_at,ends_at,time_zone) VALUES ($1,$2,'quran',now(),now()+interval '30 minutes','UTC')`, [teacherA, h.ids.childA]), /permission denied/);
  await assert.rejects(() => h.as(teacherA, 'DELETE FROM public.academy_individual_lessons WHERE id=$1', [ownLesson]), /permission denied/);
});

test('active assigned teacher reads own lesson and updates only outcome fields', async () => {
  assert.deepEqual((await h.as(teacherA, `SELECT id,teacher_id,child_id,subject,starts_at,ends_at,time_zone,status,outcome,follow_up_note FROM public.academy_individual_lessons WHERE id=$1`, [ownLesson])).rows.map(r => r.id), [ownLesson]);
  assert.equal((await h.as(teacherA, 'SELECT id FROM public.academy_individual_lessons WHERE teacher_id=$1', [teacherB])).rowCount, 0);
  const result = await update(teacherA, ownLesson);
  assert.equal(result.rowCount, 1);
  assert.deepEqual((await h.admin.query('SELECT outcome,follow_up_note FROM public.academy_individual_lessons WHERE id=$1', [ownLesson])).rows[0], { outcome: 'attended_completed', follow_up_note: 'Done' });
});

test('immutable identity and schedule columns, multi-field payloads, and cancelled writes are denied atomically', async () => {
  for (const [column, value] of [['teacher_id', teacherB], ['child_id', childB], ['subject', 'tajweed'], ['starts_at', '2035-01-01T12:00:00Z'], ['ends_at', '2035-01-01T12:30:00Z'], ['time_zone', 'UTC'], ['status', 'cancelled']]) {
    await assert.rejects(() => update(teacherA, ownLesson, `${column}=$1, outcome=$2`, [value, 'absent']), /permission denied/);
    assert.deepEqual((await h.admin.query(`SELECT ${column},outcome FROM public.academy_individual_lessons WHERE id=$1`, [ownLesson])).rows[0].outcome, 'attended_completed');
  }
  await assert.rejects(() => update(teacherA, ownLesson, 'outcome=$1, teacher_id=$2', ['absent', teacherB]), /permission denied/);
  assert.equal((await update(teacherA, cancelledLesson)).rowCount, 0);
  assert.equal((await update(teacherB, ownLesson)).rowCount, 0);
});

test('constraints enforce enum, note dependency, Unicode length, controls, and whitespace rules', async () => {
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

test('guardian raw table is empty, RPC returns only permitted own-child summary, cross-family and anonymous calls are denied', async () => {
  assert.equal((await h.as(h.ids.guardianA, 'SELECT id FROM public.academy_individual_lessons')).rowCount, 0);
  const rows = (await h.as(h.ids.guardianA, 'SELECT * FROM public.academy_guardian_session_summaries($1)', [h.ids.childA])).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['child_id','ends_at','follow_up_note','id','outcome','starts_at','status','subject','time_zone'].sort());
  assert.equal(rows[0].id, ownLesson);
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
  assert.equal((await h.admin.query('SELECT count(*)::int AS count FROM public.academy_individual_lessons')).rows[0].count, 3);
});

test('guardian, anonymous and unidentified callers cannot update or access other teacher sessions', async () => {
  for (const uid of [h.ids.guardianA,h.ids.guardianB,null,randomUUID()]) {
    assert.equal((await update(uid,otherLesson)).rowCount,0);
    assert.equal((await h.as(uid,'SELECT id FROM public.academy_individual_lessons WHERE id=$1',[otherLesson])).rowCount,0);
  }
  await assert.rejects(() => h.anon('UPDATE public.academy_individual_lessons SET outcome=$1 WHERE id=$2',['absent',otherLesson]), /permission denied/);
  assert.equal((await h.as(teacherA,'SELECT * FROM public.academy_guardian_session_summaries($1)',[childB])).rowCount,0);
  for(const column of ['id','created_at']) await assert.rejects(() => update(teacherB,otherLesson,`${column}=${column},outcome=$1`,['absent']),/permission denied/);
  const security=(await h.admin.query(`SELECT prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') anon_exec FROM pg_proc WHERE oid='public.academy_guardian_session_summaries(uuid,integer)'::regprocedure`)).rows[0];
  assert.equal(security.prosecdef,true);assert.deepEqual(security.proconfig,['search_path=pg_catalog']);assert.equal(security.anon_exec,false);
});
