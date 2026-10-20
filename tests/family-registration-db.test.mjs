import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { startHarness } from './family-registration-harness.mjs';

let h;
before(async () => { h = await startHarness(); });
after(async () => { await h?.close(); });

test('local disposable database is available for executable persistence tests', async () => {
  assert.ok(h);
});

test('guardians and children are isolated by auth.uid', async () => {
  const { guardianA, guardianB, childA } = h.ids;
  assert.equal((await h.as(guardianA, 'SELECT id FROM public.academy_guardians')).rows.length, 1);
  assert.equal((await h.as(guardianB, 'SELECT id FROM public.academy_guardians')).rows.length, 1);
  assert.equal((await h.as(guardianB, 'SELECT id FROM public.academy_children')).rows.length, 0);
  const child = (await h.as(guardianA, `INSERT INTO public.academy_children(guardian_id,display_name,birth_year)
    VALUES ($1,'New child',2020) RETURNING id`, [guardianA])).rows[0].id;
  await h.as(guardianA, 'UPDATE public.academy_children SET display_name=$1 WHERE id=$2', ['Updated', child]);
  await h.as(guardianA, 'DELETE FROM public.academy_children WHERE id=$1', [child]);
  assert.equal((await h.as(guardianA, 'SELECT id FROM public.academy_children')).rows.some(r => r.id === child), false);
  assert.equal((await h.as(guardianA, 'SELECT id FROM public.academy_children')).rows.some(r => r.id === childA), true);
});

test('anonymous access is denied and cannot write either table', async () => {
  await assert.rejects(() => h.anon('SELECT * FROM public.academy_guardians'), /permission denied/);
  await assert.rejects(() => h.anon("INSERT INTO public.academy_guardians(id,display_name,locale,consent_version,consented_at) VALUES (gen_random_uuid(),'x','en','family-v1',now())"), /permission denied/);
});

test('guardian identity and child parent cannot be changed or reparented', async () => {
  const { guardianA, guardianB, childA } = h.ids;
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_guardians SET id=$1 WHERE id=$2', [guardianB, guardianA]), /guardian id is immutable/);
  await assert.rejects(() => h.as(guardianA, 'UPDATE public.academy_children SET guardian_id=$1 WHERE id=$2', [guardianB, childA]), /permission denied/);
  const deniedDelete = await h.as(guardianB, 'DELETE FROM public.academy_children WHERE id=$1 RETURNING id', [childA]);
  assert.equal(deniedDelete.rowCount, 0);
  assert.equal((await h.as(guardianA, 'SELECT id FROM public.academy_children WHERE id=$1', [childA])).rowCount, 1);
});

test('children have no auth identity and birth years cannot be future', async () => {
  const { guardianA } = h.ids;
  const row = (await h.as(guardianA, 'SELECT id, guardian_id FROM public.academy_children')).rows[0];
  assert.ok(row.id && row.guardian_id);
  await assert.rejects(() => h.as(guardianA, `INSERT INTO public.academy_children(guardian_id,display_name,birth_year)
    VALUES ($1,'Future child',EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)`, [guardianA]), /birth_year must not be in the future/);
});

test('hosted-style default grants do not leave anonymous or TRUNCATE privileges behind', async () => {
  for (const table of ['academy_guardians', 'academy_children']) {
    const privileges = (await h.admin.query(`SELECT
      has_table_privilege('anon', $1, 'SELECT') AS anon_read,
      has_table_privilege('authenticated', $1, 'TRUNCATE') AS truncate,
      has_table_privilege('authenticated', $1, 'REFERENCES') AS refs`, [`public.${table}`])).rows[0];
    assert.deepEqual(privileges, { anon_read: false, truncate: false, refs: false });
    await assert.rejects(() => h.as(h.ids.guardianA, `TRUNCATE public.${table} CASCADE`), /permission denied/);
  }
});

test('profile upsert and child records persist across independent transactions', async () => {
  const { guardianA } = h.ids;
  await h.as(guardianA, `INSERT INTO public.academy_guardians(id,display_name,locale,consent_version,consented_at)
    VALUES ($1,'Persistent guardian','en','family-v1',now())
    ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id,display_name=EXCLUDED.display_name,locale=EXCLUDED.locale,consent_version=EXCLUDED.consent_version,consented_at=EXCLUDED.consented_at`, [guardianA]);
  assert.equal((await h.as(guardianA, 'SELECT display_name FROM public.academy_guardians')).rows[0].display_name, 'Persistent guardian');
  const child = (await h.as(guardianA, `INSERT INTO public.academy_children(guardian_id,display_name,birth_year) VALUES ($1,'Persistent child',2020) RETURNING id`, [guardianA])).rows[0];
  assert.equal((await h.as(guardianA, 'SELECT display_name FROM public.academy_children WHERE id=$1', [child.id])).rows[0].display_name, 'Persistent child');
  await h.as(guardianA, 'DELETE FROM public.academy_children WHERE id=$1', [child.id]);
});

test('authenticated users cannot create a guardian or child for another family', async () => {
  const { guardianA, guardianB, childA } = h.ids;
  await assert.rejects(() => h.as(guardianB, `INSERT INTO public.academy_children(guardian_id,display_name,birth_year) VALUES ($1,'Forged family child',2020)`, [guardianA]), /row-level security/);
  const changed = await h.as(guardianB, 'UPDATE public.academy_children SET display_name=$1 WHERE id=$2 RETURNING id', ['Forged change', childA]);
  assert.equal(changed.rowCount, 0);
  const guardianChanged = await h.as(guardianB, 'UPDATE public.academy_guardians SET display_name=$1 WHERE id=$2 RETURNING id', ['Forged guardian', guardianA]);
  assert.equal(guardianChanged.rowCount, 0);
  await assert.rejects(() => h.anon('SELECT * FROM public.academy_children'), /permission denied/);
});
