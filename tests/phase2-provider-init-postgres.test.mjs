// Creates and destroys ONLY a fresh temporary cluster. Never reuses a listener,
// prepared provider cluster or existing database. Auth tables here are catalog-
// shaped synthetic stubs, NOT a native GoTrue acceptance test.
import assert from 'node:assert/strict';
import { test, before, beforeEach, after } from 'node:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { buildProviderPlan, loadSources } from '../scripts/provider-plan.mjs';
import { initializeApplication } from '../scripts/provider-init.mjs';
import { assertRuntimeReady } from '../scripts/provider/runtime-check.mjs';
import { checkStorageCatalog } from '../scripts/provider/storage-preflight.mjs';

const enabled = process.env.PHASE2_PROVIDER_INIT_TEST === 'synthetic-only';
const bin = '/workspace/phase2-tools/root/usr/lib/postgresql/16/bin';
const share = '/workspace/phase2-tools/root/usr/share/postgresql/16';
let directory, started = false, admin, pool;
const plan = buildProviderPlan(await loadSources());
const applicationRoles = ['phase2_rest', 'phase2_api', 'phase2_bootstrap', 'phase2_definer', 'phase2_authenticated'];
function ctl(...args) { return execFileSync(path.join(bin, 'pg_ctl'), args, { encoding: 'utf8', timeout: 20000 }); }
async function assertPortUnused() {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error('Port55432 already occupied; refusing to touch an existing service')));
    server.listen(55432, '127.0.0.1', () => server.close(resolve));
  });
}
before(async () => {
  if (!enabled) return;
  await assertPortUnused();
  directory = await mkdtemp(path.join(tmpdir(), 'phase2-canonical-hardening-'));
  await mkdir(path.join(directory, 'sock'), { mode: 0o700 });
  execFileSync(path.join(bin, 'initdb'), ['-D', path.join(directory, 'data'), '-L', share, '-A', 'trust', '--no-locale', '-U', 'ubuntu'], { encoding: 'utf8', timeout: 20000 });
  ctl('-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p 55432 -k ${path.join(directory, 'sock')} -c jit=off`, '-w', 'start');
  started = true;
  console.log('Fresh temporary synthetic PostgreSQL16 cluster started; no existing cluster reused.');
  admin = new Pool({ connectionString: 'postgresql://ubuntu@127.0.0.1:55432/postgres', max: 1 });
  await admin.query('CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS; CREATE ROLE supabase_storage_admin LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;');
});
beforeEach(async () => {
  if (!enabled) return;
  if (pool) await pool.end();
  await admin.query('DROP DATABASE IF EXISTS phase2_provider_test');
  for (const role of applicationRoles) await admin.query(`DROP ROLE IF EXISTS ${role}`);
  await admin.query('DROP ROLE IF EXISTS unsafe_bridge');
  await admin.query('ALTER ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION INHERIT');
  await admin.query('CREATE DATABASE phase2_provider_test');
  pool = new Pool({ connectionString: 'postgresql://ubuntu@127.0.0.1:55432/phase2_provider_test', max: 3 });
  await pool.query(`CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz);
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), not_after timestamptz, factor_id uuid, aal text);
    CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), status text, factor_type text);
    INSERT INTO auth.users(id,email_confirmed_at) VALUES('00000000-0000-4000-8000-000000000001',now());`);
});
after(async () => {
  await pool?.end(); await admin?.end();
  if (started) {
    ctl('-D', path.join(directory, 'data'), '-m', 'fast', '-w', 'stop');
    console.log('Owned temporary cluster stopped; temporary synthetic data removed.');
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function initialize(overrides = {}) {
  const client = await pool.connect();
  try { return await initializeApplication(client, { ...plan, ...overrides }); } finally { client.release(); }
}
async function assertPristine() {
  const result = (await pool.query("SELECT to_regclass('public.profiles') profiles, to_regnamespace('api') api, to_regnamespace('provider_private') private, (SELECT count(*)::int FROM auth.users) users, EXISTS(SELECT FROM pg_roles WHERE rolname='phase2_api') app_role")).rows[0];
  assert.deepEqual(result, { profiles: null, api: null, private: null, users: 1, app_role: false });
}
const options = { skip: !enabled };
test('fresh synthetic catalog initializes base+provider atomically and refuses reinitialization', options, async () => {
  await initialize();
  await assertRuntimeReady('postgresql://phase2_api@127.0.0.1:55432/phase2_provider_test');
  await assertRuntimeReady('postgresql://phase2_rest@127.0.0.1:55432/phase2_provider_test');
  const result = (await pool.query("SELECT to_regclass('public.profiles') profiles, to_regclass('api.students') view, (SELECT count(*)::int FROM auth.users) users")).rows[0];
  assert.equal(result.profiles, 'profiles'); assert.equal(result.view, 'api.students'); assert.equal(result.users, 1);
  await assert.rejects(initialize(), /existing application objects/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM auth.users')).rows[0].n, 1);
});
test('SQL error in provider tail rolls back base tables, provider schemas AND new roles', options, async () => {
  await assert.rejects(initialize({ applicationSql: plan.applicationSql + '\nSELECT 1/0;' }), { code: '22012' });
  await assertPristine();
  await initialize(); // safe retry succeeds without cleanup or destructive reset
});
test('advisory contention refuses immediately without DDL and is safely retryable', options, async () => {
  const blocker = await pool.connect();
  try {
    await blocker.query('BEGIN; SELECT pg_advisory_xact_lock(21402,1)');
    await assert.rejects(initialize(), /already in progress/);
    await assertPristine();
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  await initialize();
});
test('partially populated application namespace refuses non-destructively', options, async () => {
  await pool.query('CREATE TABLE public.preexisting_synthetic_marker(id int); INSERT INTO public.preexisting_synthetic_marker VALUES(7)');
  await assert.rejects(initialize(), /existing application objects/);
  assert.equal((await pool.query('SELECT id FROM public.preexisting_synthetic_marker')).rows[0].id, 7);
  assert.equal((await pool.query("SELECT to_regclass('public.profiles') value")).rows[0].value, null);
});
test('unsafe native role attributes refuse without repair or application DDL', options, async () => {
  await pool.query('ALTER ROLE authenticated BYPASSRLS');
  await assert.rejects(initialize(), /Unsafe canonical role attributes/);
  await assertPristine();
  assert.equal((await pool.query("SELECT rolbypassrls FROM pg_roles WHERE rolname='authenticated'")).rows[0].rolbypassrls, true);
});
test('indirect privilege bridge refuses before application initialization', options, async () => {
  await pool.query('CREATE ROLE unsafe_bridge NOLOGIN; GRANT service_role TO unsafe_bridge; GRANT unsafe_bridge TO authenticated');
  await assert.rejects(initialize(), /Unsafe canonical role membership/);
  await assertPristine();
});

test('ordinary runtime preflight refuses role drift with read-only checks', options, async () => {
  await initialize();
  await pool.query('GRANT phase2_definer TO phase2_api');
  await assert.rejects(assertRuntimeReady('postgresql://phase2_api@127.0.0.1:55432/phase2_provider_test'), /Unsafe canonical role membership/);
  assert.equal((await pool.query('SELECT count(*)::int n FROM auth.users')).rows[0].n, 1);
});

test('Storage readiness reads actual catalogs and denies policy/public/hash/RLS drift', options, async () => {
  await initialize();
  await pool.query(`CREATE SCHEMA storage AUTHORIZATION supabase_storage_admin;
    CREATE TABLE storage.buckets(id text PRIMARY KEY, public boolean);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY);
    CREATE TABLE storage.migrations(id int PRIMARY KEY,name text,hash text);
    ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
    ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
    ALTER TABLE storage.migrations OWNER TO supabase_storage_admin;
    ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    INSERT INTO storage.buckets VALUES('phase2-private',false);
    INSERT INTO storage.migrations VALUES(1,'synthetic-catalog','synthetic-hash');`);
  const storage = new Pool({connectionString:'postgresql://supabase_storage_admin@127.0.0.1:55432/phase2_provider_test',max:1});
  const expected=[{id:1,name:'synthetic-catalog',hash:'synthetic-hash'}];
  async function check() {
    const c=await storage.connect();
    try { await c.query('BEGIN READ ONLY'); await checkStorageCatalog(c,expected); }
    finally { await c.query('ROLLBACK'); c.release(); }
  }
  try {
    await check();
    await pool.query('CREATE POLICY synthetic_direct_access ON storage.objects FOR SELECT TO public USING(true)');
    await assert.rejects(check(),/zero direct/);
    await pool.query('DROP POLICY synthetic_direct_access ON storage.objects; UPDATE storage.buckets SET public=true');
    await assert.rejects(check(),/remain private/);
    await pool.query("UPDATE storage.buckets SET public=false; UPDATE storage.migrations SET hash='drift'");
    await assert.rejects(check(),/IDs\/names\/hashes/);
    await pool.query("UPDATE storage.migrations SET hash='synthetic-hash'; ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY");
    await assert.rejects(check(),/RLS Storage/);
  } finally { await storage.end(); }
});
