import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startHarness } from './family-registration-harness.mjs';
const schema = await readFile(new URL('../db/teacher-foundation.sql', import.meta.url), 'utf8');
let h;
const teacherA = randomUUID(), teacherB = randomUUID(), childB = randomUUID();
const tables = ['academy_teachers', 'academy_teacher_assignments', 'academy_individual_lessons'];
before(async () => {
  h = await startHarness();
  await h.admin.query(schema);
});
after(async () => { await h?.close(); });
async function lesson(teacher, child, start = '2030-01-01T09:00:00Z', end = '2030-01-01T09:30:00Z', status = 'scheduled') {
  return h.admin.query(`INSERT INTO public.academy_individual_lessons(teacher_id,child_id,subject,starts_at,ends_at,time_zone,status)
    VALUES ($1,$2,'quran',$3,$4,'Africa/Cairo',$5) RETURNING id`, [teacher, child, start, end, status]);
}
test('migration creates empty forced-RLS tables with no anonymous or client write privileges', async () => {
  for (const table of tables) {
    assert.equal((await h.admin.query(`SELECT count(*)::int AS count FROM public.${table}`)).rows[0].count, 0);
    const p = (await h.admin.query(`SELECT relrowsecurity, relforcerowsecurity,
      has_table_privilege('anon',$1,'SELECT') AS anon_read,
      has_table_privilege('authenticated',$1,'SELECT') AS client_read,
      has_table_privilege('authenticated',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS client_write
      FROM pg_class WHERE oid=$1::regclass`, [`public.${table}`])).rows[0];
    assert.deepEqual(p, { relrowsecurity: true, relforcerowsecurity: true, anon_read: false, client_read: true, client_write: false });
    await assert.rejects(() => h.anon(`SELECT id FROM public.${table === 'academy_teacher_assignments' ? 'academy_teachers' : table}`), /permission denied/);
  }
  // All subsequent fixtures exist only in this disposable localhost PostgreSQL cluster.
  await h.admin.query('INSERT INTO auth.users(id) VALUES ($1),($2)', [teacherA, teacherB]);
  await h.admin.query(`INSERT INTO public.academy_teachers(id,display_name,time_zone,status) VALUES
    ($1,'Local fixture A','Africa/Cairo','active'),($2,'Local fixture B','UTC','active')`, [teacherA, teacherB]);
  await h.admin.query(`INSERT INTO public.academy_children(id,guardian_id,display_name,birth_year) VALUES ($1,$2,'Local fixture',2015)`, [childB, h.ids.guardianB]);
  await h.admin.query(`INSERT INTO public.academy_teacher_assignments(teacher_id,child_id,status) VALUES
    ($1,$3,'active'),($2,$4,'active'),($1,$4,'active'),($2,$3,'active')`, [teacherA, teacherB, h.ids.childA, childB]);
});
test('teacher reads only self, own assignments and own individual lessons; guardian only own child lessons', async () => {
  await lesson(teacherA, h.ids.childA);
  await lesson(teacherB, childB);
  assert.deepEqual((await h.as(teacherA,'SELECT id FROM public.academy_teachers')).rows, [{ id: teacherA }]);
  assert.equal((await h.as(teacherA,'SELECT teacher_id FROM public.academy_teacher_assignments')).rowCount, 2);
  for (const [uid, expectedTeacher] of [[teacherA, teacherA], [teacherB, teacherB], [h.ids.guardianA, teacherA], [h.ids.guardianB, teacherB]]) {
    const rows = (await h.as(uid,'SELECT teacher_id FROM public.academy_individual_lessons')).rows;
    assert.deepEqual(rows, [{ teacher_id: expectedTeacher }]);
  }
  assert.equal((await h.as(teacherA,'SELECT id FROM public.academy_children')).rowCount, 0);
  assert.equal((await h.as(teacherA,'SELECT id FROM public.academy_guardians')).rowCount, 0);
  assert.equal((await h.as(h.ids.guardianA,'SELECT id FROM public.academy_teachers')).rowCount, 0);
  assert.equal((await h.as(null,'SELECT id FROM public.academy_individual_lessons')).rowCount, 0);
});
test('clients cannot enroll, activate themselves, change assignments or write schedules', async () => {
  await assert.rejects(() => h.as(teacherA,`UPDATE public.academy_teachers SET status='active' WHERE id=$1`,[teacherA]), /permission denied/);
  await assert.rejects(() => h.as(teacherA,`INSERT INTO public.academy_teachers(id,display_name,time_zone) VALUES ($1,'x','UTC')`,[teacherA]), /permission denied/);
  await assert.rejects(() => h.as(teacherA,`UPDATE public.academy_teacher_assignments SET status='active'`), /permission denied/);
  await assert.rejects(() => h.as(h.ids.guardianA,`DELETE FROM public.academy_individual_lessons`), /permission denied/);
  await assert.rejects(() => h.as(teacherA,`INSERT INTO public.academy_individual_lessons(teacher_id,child_id,subject,starts_at,ends_at,time_zone) VALUES ($1,$2,'quran',now(),now()+interval '30 minutes','UTC')`,[teacherA,h.ids.childA]), /permission denied/);
});
test('overlap constraints prevent double booking teachers AND children, allow adjacency and cancellations', async () => {
  await assert.rejects(() => lesson(teacherA, childB), /exclusion constraint/);
  await assert.rejects(() => lesson(teacherB, h.ids.childA), /exclusion constraint/);
  await lesson(teacherA, h.ids.childA, '2030-01-01T09:30:00Z', '2030-01-01T10:00:00Z');
  await lesson(teacherA, childB, '2030-01-01T09:00:00Z', '2030-01-01T09:30:00Z', 'cancelled');
  await assert.rejects(() => h.admin.query(`UPDATE public.academy_individual_lessons SET status='scheduled' WHERE teacher_id=$1 AND child_id=$2`, [teacherA, childB]), /exclusion constraint/);
});
test('database constraints are atomic for concurrent overlap attempts', async () => {
  const results = await Promise.allSettled([
    lesson(teacherA, h.ids.childA, '2030-01-02T09:00:00Z', '2030-01-02T09:30:00Z'),
    lesson(teacherA, childB, '2030-01-02T09:00:00Z', '2030-01-02T09:30:00Z'),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});
test('suspension or assignment revocation immediately removes teacher reads and prevents new bookings', async () => {
  await h.admin.query(`UPDATE public.academy_teachers SET status='suspended' WHERE id=$1`, [teacherA]);
  for (const table of tables) assert.equal((await h.as(teacherA,`SELECT 1 FROM public.${table}`)).rowCount, 0);
  await assert.rejects(() => lesson(teacherA, h.ids.childA, '2030-02-01T09:00:00Z','2030-02-01T09:30:00Z'), /active teacher assignment required/);
  await h.admin.query(`UPDATE public.academy_teachers SET status='active' WHERE id=$1`, [teacherA]);
  await h.admin.query(`UPDATE public.academy_teacher_assignments SET status='inactive' WHERE teacher_id=$1 AND child_id=$2`, [teacherA,h.ids.childA]);
  assert.equal((await h.as(teacherA,`SELECT 1 FROM public.academy_individual_lessons WHERE child_id=$1`,[h.ids.childA])).rowCount, 0);
  await assert.rejects(() => lesson(teacherA,h.ids.childA,'2030-02-01T09:00:00Z','2030-02-01T09:30:00Z'), /active teacher assignment required/);
  assert.ok((await h.as(h.ids.guardianA,'SELECT 1 FROM public.academy_individual_lessons')).rowCount > 0);
  await h.admin.query(`UPDATE public.academy_teacher_assignments SET status='active' WHERE teacher_id=$1 AND child_id=$2`, [teacherA,h.ids.childA]);
});
test('invalid ranges, nonfinite instants, unknown subjects/timezones, unassigned child and missing auth identities fail', async () => {
  for (const [start,end] of [['2030-03-01T10:00:00Z','2030-03-01T09:00:00Z'],['2030-03-01T09:00:00Z','2030-03-01T09:00:00Z'],['-infinity','infinity']])
    await assert.rejects(() => lesson(teacherA,h.ids.childA,start,end), /check constraint|range lower bound/);
  await assert.rejects(() => lesson(teacherA,randomUUID(),'2030-03-01T09:00:00Z','2030-03-01T09:30:00Z'), /active teacher assignment required/);
  await assert.rejects(() => h.admin.query(`UPDATE public.academy_teachers SET time_zone='Not/AZone' WHERE id=$1`,[teacherA]), /valid IANA/);
  await assert.rejects(() => h.admin.query(`UPDATE public.academy_individual_lessons SET time_zone='Not/AZone'`), /valid IANA/);
  await assert.rejects(() => h.admin.query(`UPDATE public.academy_individual_lessons SET subject='group'`), /check constraint/);
  await assert.rejects(() => h.admin.query(`INSERT INTO public.academy_teachers(id,display_name,time_zone) VALUES ($1,'Local fixture','UTC')`,[randomUUID()]), /foreign key/);
});
test('defaults deny activity and schema reapply fails without changing existing objects', async () => {
  const id = randomUUID();
  await h.admin.query('INSERT INTO auth.users(id) VALUES ($1)', [id]);
  await h.admin.query(`INSERT INTO public.academy_teachers(id,display_name,time_zone) VALUES ($1,'Local fixture','UTC')`,[id]);
  assert.equal((await h.admin.query('SELECT status FROM public.academy_teachers WHERE id=$1',[id])).rows[0].status,'suspended');
  await h.admin.query(`INSERT INTO public.academy_teacher_assignments(teacher_id,child_id) VALUES ($1,$2)`,[id,h.ids.childA]);
  assert.equal((await h.admin.query('SELECT status FROM public.academy_teacher_assignments WHERE teacher_id=$1',[id])).rows[0].status,'inactive');
  await assert.rejects(() => h.admin.query(schema), /already exists/);
  await h.admin.query('ROLLBACK');
  assert.equal((await h.admin.query(`SELECT count(*)::int AS count FROM public.academy_teachers`)).rows[0].count,3);
});

test('workspace assignment inner join blocks revoked lessons even for a dual-role guardian/teacher', async () => {
  const uid = h.ids.guardianA;
  await h.admin.query(`INSERT INTO public.academy_teachers(id,display_name,time_zone,status) VALUES ($1,'Local dual-role fixture','UTC','active')`, [uid]);
  await h.admin.query(`INSERT INTO public.academy_teacher_assignments(teacher_id,child_id,status) VALUES ($1,$2,'active')`, [uid,h.ids.childA]);
  await lesson(uid,h.ids.childA,'2032-01-01T09:00:00Z','2032-01-01T09:30:00Z');
  const scoped = `SELECT l.id FROM public.academy_individual_lessons l INNER JOIN public.academy_teacher_assignments a ON a.teacher_id=l.teacher_id AND a.child_id=l.child_id WHERE l.teacher_id=$1 AND a.status='active' ORDER BY l.starts_at,l.id LIMIT 51 OFFSET 0`;
  assert.equal((await h.as(uid,scoped,[uid])).rowCount,1);
  await h.admin.query(`UPDATE public.academy_teacher_assignments SET status='inactive' WHERE teacher_id=$1 AND child_id=$2`,[uid,h.ids.childA]);
  // The database guardian policy correctly keeps guardian reads; the separate
  // teacher workspace must not mistake those for an active teacher assignment.
  assert.equal((await h.as(uid,`SELECT id FROM public.academy_individual_lessons WHERE teacher_id=$1`,[uid])).rowCount,1);
  assert.equal((await h.as(uid,scoped,[uid])).rowCount,0);
});
