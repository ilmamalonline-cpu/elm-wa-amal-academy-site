import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { startHarness } from './family-registration-harness.mjs';

const migration = await readFile(new URL('../db/teacher-admin-foundation.sql', import.meta.url), 'utf8');
let h;
const nonAdminId = randomUUID();

before(async () => {
  h = await startHarness();
  await h.admin.query(`
    CREATE ROLE service_role NOLOGIN NOSUPERUSER NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public, auth TO service_role;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
      SELECT nullif(current_setting('request.jwt.claim.role', true), '')
    $$;
    GRANT EXECUTE ON FUNCTION auth.role() TO service_role;
  `);
  await h.admin.query(migration);
  // No administrator user or academy_admins row is created, even in this test.
});

after(async () => { await h?.close(); });

async function asService(claimRole, text, values = []) {
  const client = await h.admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE service_role');
    await client.query('SELECT set_config($1,$2,true)', ['request.jwt.claim.role', claimRole]);
    const result = await client.query(text, values);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

test('admin allowlist is forced-RLS, empty, and grants the server role read-only access', async () => {
  const privileges = (await h.admin.query(`
    SELECT c.relrowsecurity, c.relforcerowsecurity,
      has_table_privilege('anon','public.academy_admins','SELECT') AS anon_read,
      has_table_privilege('authenticated','public.academy_admins','SELECT') AS authenticated_read,
      has_table_privilege('service_role','public.academy_admins','SELECT') AS service_read,
      has_table_privilege('service_role','public.academy_admins','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS service_write,
      (SELECT count(*)::int FROM public.academy_admins) AS row_count
    FROM pg_class c WHERE c.oid='public.academy_admins'::regclass
  `)).rows[0];
  assert.deepEqual(privileges, {
    relrowsecurity: true, relforcerowsecurity: true, anon_read: false,
    authenticated_read: false, service_read: true, service_write: false, row_count: 0,
  });

  const policies = (await h.admin.query(`
    SELECT roles::text AS roles, cmd, qual FROM pg_policies
    WHERE schemaname='public' AND tablename='academy_admins'
  `)).rows;
  assert.equal(policies.length, 1);
  assert.equal(policies[0].roles, '{service_role}');
  assert.equal(policies[0].cmd, 'SELECT');
  assert.match(policies[0].qual, /auth\.role\(\)/);
  assert.match(policies[0].qual, /service_role/);
});

test('unauthenticated and authenticated non-admin callers cannot read or mutate membership', async () => {
  await assert.rejects(() => h.anon('SELECT id FROM public.academy_admins'), /permission denied/);
  await assert.rejects(() => h.as(null, 'SELECT id FROM public.academy_admins'), /permission denied/);
  await assert.rejects(() => h.as(nonAdminId, 'SELECT id FROM public.academy_admins'), /permission denied/);
  await assert.rejects(() => h.as(nonAdminId, 'INSERT INTO public.academy_admins(id) VALUES ($1)', [randomUUID()]), /permission denied/);
  await assert.rejects(() => h.as(nonAdminId, 'DELETE FROM public.academy_admins WHERE id=$1', [randomUUID()]), /permission denied/);
});

test('the server role can execute its bounded read while the table remains empty', async () => {
  assert.deepEqual((await asService('service_role', 'SELECT id FROM public.academy_admins')).rows, []);
  assert.deepEqual((await asService('authenticated', 'SELECT id FROM public.academy_admins')).rows, []);
  assert.equal((await h.admin.query('SELECT count(*)::int AS count FROM public.academy_admins')).rows[0].count, 0);
});
