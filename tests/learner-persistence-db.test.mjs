import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startHarness } from './family-registration-harness.mjs';

const schema = await readFile(new URL('../db/learner-persistence.sql', import.meta.url), 'utf8');
let h;
let childB;

before(async () => {
  h = await startHarness();
  await h.admin.query(schema);
  childB = randomUUID();
  await h.admin.query(
    `INSERT INTO public.academy_children(id, guardian_id, display_name, birth_year)
     VALUES ($1, $2, 'Child B', 2014)`,
    [childB, h.ids.guardianB],
  );
});

after(async () => { await h?.close(); });

const plan = (child, guardian, goal = 'Read independently', minutes = 30) =>
  [child, guardian, goal, minutes];
const entry = (child, guardian, activity = 'Reading', minutes = 20) =>
  [child, guardian, activity, minutes];


test('learner tables have forced RLS and only intended authenticated privileges', async () => {
  for (const table of ['academy_learning_plans', 'academy_practice_entries']) {
    const row = (await h.admin.query(`SELECT c.relrowsecurity, c.relforcerowsecurity,
      has_table_privilege('anon', $1, 'SELECT') AS anon_read,
      has_table_privilege('authenticated', $1, 'TRUNCATE') AS truncate,
      has_table_privilege('authenticated', $1, 'REFERENCES') AS refs
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $2`, [`public.${table}`, table])).rows[0];
    assert.deepEqual(row, { relrowsecurity: true, relforcerowsecurity: true, anon_read: false, truncate: false, refs: false });
  }
  const planPrivileges = (await h.admin.query(`SELECT
    has_table_privilege('authenticated', 'public.academy_learning_plans', 'SELECT') AS select,
    has_table_privilege('authenticated', 'public.academy_learning_plans', 'INSERT') AS insert,
    has_table_privilege('authenticated', 'public.academy_learning_plans', 'UPDATE') AS update,
    has_column_privilege('authenticated', 'public.academy_learning_plans', 'goal', 'UPDATE') AS goal_update,
    has_column_privilege('authenticated', 'public.academy_learning_plans', 'child_id', 'UPDATE') AS child_update`)).rows[0];
  assert.deepEqual(planPrivileges, { select: true, insert: false, update: false, goal_update: true, child_update: false });
});

test('authenticated family can CRUD a learning plan and practice entry', async () => {
  const { guardianA, childA } = h.ids;
  const p = (await h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes)
    VALUES ($1,$2,$3,$4) RETURNING *`, plan(childA, guardianA))).rows[0];
  assert.equal(p.goal, 'Read independently');
  assert.equal(p.weekly_target_minutes, 30);
  const e = (await h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on,note)
    VALUES ($1,$2,$3,$4,CURRENT_DATE,'') RETURNING *`, entry(childA, guardianA))).rows[0];
  assert.equal(e.note, '');
  await h.as(guardianA, 'UPDATE public.academy_learning_plans SET goal=$1,weekly_target_minutes=$2 WHERE child_id=$3', ['Count to 100', 45, childA]);
  await h.as(guardianA, 'UPDATE public.academy_practice_entries SET activity=$1,minutes=$2,note=$3 WHERE id=$4', ['Math', 25, 'Workbook', e.id]);
  assert.equal((await h.as(guardianA, 'SELECT goal,weekly_target_minutes FROM public.academy_learning_plans WHERE child_id=$1', [childA])).rows[0].goal, 'Count to 100');
  assert.equal((await h.as(guardianA, 'SELECT activity,note FROM public.academy_practice_entries WHERE id=$1', [e.id])).rows[0].activity, 'Math');
  await h.as(guardianA, 'DELETE FROM public.academy_practice_entries WHERE id=$1', [e.id]);
  await h.as(guardianA, 'DELETE FROM public.academy_learning_plans WHERE child_id=$1', [childA]);
});

test('anonymous access is denied and cross-family select/update/delete is isolated', async () => {
  const { guardianA, guardianB, childA } = h.ids;
  await h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'A plan',10)`, [childA, guardianA]);
  const e = (await h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'A activity',10,CURRENT_DATE) RETURNING id`, [childA, guardianA])).rows[0].id;
  await assert.rejects(() => h.anon('SELECT * FROM public.academy_learning_plans'), /permission denied/);
  await assert.rejects(() => h.anon('SELECT * FROM public.academy_practice_entries'), /permission denied/);
  assert.equal((await h.as(guardianB, 'SELECT * FROM public.academy_learning_plans')).rowCount, 0);
  assert.equal((await h.as(guardianB, 'SELECT * FROM public.academy_practice_entries')).rowCount, 0);
  assert.equal((await h.as(guardianB, 'UPDATE public.academy_learning_plans SET goal=$1 WHERE child_id=$2 RETURNING child_id', ['stolen', childA])).rowCount, 0);
  assert.equal((await h.as(guardianB, 'UPDATE public.academy_practice_entries SET note=$1 WHERE id=$2 RETURNING id', ['stolen', e])).rowCount, 0);
  assert.equal((await h.as(guardianB, 'DELETE FROM public.academy_learning_plans WHERE child_id=$1 RETURNING child_id', [childA])).rowCount, 0);
  assert.equal((await h.as(guardianB, 'DELETE FROM public.academy_practice_entries WHERE id=$1 RETURNING id', [e])).rowCount, 0);
  await h.as(guardianA, 'DELETE FROM public.academy_practice_entries WHERE id=$1', [e]);
  await h.as(guardianA, 'DELETE FROM public.academy_learning_plans WHERE child_id=$1', [childA]);
});

test('forged guardians and foreign children are rejected on insert', async () => {
  const { guardianA, guardianB, childA } = h.ids;
  await assert.rejects(() => h.as(guardianB, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'forged',10)`, [childA, guardianB]), /row-level security/);
  await assert.rejects(() => h.as(guardianB, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'forged',10,CURRENT_DATE)`, [childA, guardianB]), /row-level security/);
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'foreign',10)`, [childB, guardianA]), /row-level security/);
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'foreign',10,CURRENT_DATE)`, [childB, guardianA]), /row-level security/);
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'missing',10)`, [randomUUID(), guardianA]), /row-level security|foreign key/);
});

test('identity columns are immutable by column privileges', async () => {
  const { guardianA, childA } = h.ids;
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes,updated_at) VALUES ($1,$2,'Forged',10,'2001-01-01')`, [childA, guardianA]), /permission denied/);
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on,created_at) VALUES ($1,$2,'Forged',10,CURRENT_DATE,'2001-01-01')`, [childA, guardianA]), /permission denied/);
  const e = (await h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'Identity',10,CURRENT_DATE) RETURNING id`, [childA, guardianA])).rows[0].id;
  await h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'Identity',10)`, [childA, guardianA]);
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_learning_plans SET child_id=$1 WHERE child_id=$2', [childB, childA]), /permission denied/);
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_learning_plans SET guardian_id=$1 WHERE child_id=$2', [h.ids.guardianB, childA]), /permission denied/);
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_practice_entries SET id=$1 WHERE id=$2', [randomUUID(), e]), /permission denied/);
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_practice_entries SET child_id=$1 WHERE id=$2', [childB, e]), /permission denied/);
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_practice_entries SET guardian_id=$1 WHERE id=$2', [h.ids.guardianB, e]), /permission denied/);
  await h.as(guardianA, 'DELETE FROM public.academy_practice_entries WHERE id=$1', [e]);
  await h.as(guardianA, 'DELETE FROM public.academy_learning_plans WHERE child_id=$1', [childA]);
});

test('field and date validation rejects invalid learner data', async () => {
  const { guardianA, childA } = h.ids;
  const cases = [
    [`INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'   ',10)`, [childA, guardianA]],
    [`INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'ok',0)`, [childA, guardianA]],
    [`INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'   ',10,CURRENT_DATE)`, [childA, guardianA]],
    [`INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'ok',241,CURRENT_DATE)`, [childA, guardianA]],
    [`INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'ok',10,CURRENT_DATE + 1)`, [childA, guardianA]],
  ];
  for (const [sql, values] of cases) await assert.rejects(() => h.as(guardianA, sql, values), /check constraint|practiced_on must not be in the future/);
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on,note) VALUES ($1,$2,'ok',10,CURRENT_DATE,repeat('x',501))`, [childA, guardianA]), /check constraint/);
});

test('deleting a child cascades its plan and practice entries', async () => {
  const { guardianA } = h.ids;
  const child = randomUUID();
  await h.admin.query(`INSERT INTO public.academy_children(id,guardian_id,display_name,birth_year) VALUES ($1,$2,'Cascade child',2012)`, [child, guardianA]);
  await h.as(guardianA, `INSERT INTO public.academy_learning_plans(child_id,guardian_id,goal,weekly_target_minutes) VALUES ($1,$2,'Cascade',10)`, [child, guardianA]);
  await h.as(guardianA, `INSERT INTO public.academy_practice_entries(child_id,guardian_id,activity,minutes,practiced_on) VALUES ($1,$2,'Cascade',10,CURRENT_DATE)`, [child, guardianA]);
  await h.admin.query('DELETE FROM public.academy_children WHERE id=$1', [child]);
  assert.equal((await h.admin.query('SELECT 1 FROM public.academy_learning_plans WHERE child_id=$1', [child])).rowCount, 0);
  assert.equal((await h.admin.query('SELECT 1 FROM public.academy_practice_entries WHERE child_id=$1', [child])).rowCount, 0);
});

test('collision failure rolls back all DDL in the transaction', async () => {
  await assert.rejects(() => h.admin.query(`BEGIN;
    CREATE TABLE public.academy_collision_probe(id integer);
    CREATE TABLE public.academy_learning_plans(id integer);
    COMMIT;`), /already exists/);
  assert.equal((await h.admin.query(`SELECT to_regclass('public.academy_collision_probe') AS name`)).rows[0].name, null);
});
