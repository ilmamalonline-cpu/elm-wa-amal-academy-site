import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildProviderPlan, loadSources, sha256, sourceFingerprints } from '../scripts/provider-plan.mjs';
import { assertRoleContract, roleContract } from '../scripts/provider-roles.mjs';
import { initializeApplication, validateDatabaseUrl } from '../scripts/provider-init.mjs';

const sources = await loadSources();
const plan = buildProviderPlan(sources);
function safeCatalog() {
  return Object.entries(roleContract).map(([rolname, c]) => ({ rolname, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolcanlogin: c.login, rolbypassrls: c.bypass, rolinherit: c.inherit ?? true }));
}
function safeEdges() {
  return Object.entries(roleContract).flatMap(([member, c]) => c.parents.map(parent => ({ member, parent, admin_option: false, set_option: true, inherit_option: c.inherit ?? true })));
}
test('canonical plan pins all SQL inputs and preserves native Auth / safe API contract', () => {
  assert.equal(plan.contract, 'canonical-native-v1');
  assert.equal(plan.applicationSha256, sha256(plan.applicationSql));
  assert.equal(plan.bucket, 'phase2-private');
  assert.doesNotMatch(plan.applicationSql, /^BEGIN;|^COMMIT;|CREATE SCHEMA auth;|DROP SCHEMA|CREATE TABLE auth\./m);
  assert.match(plan.applicationSql, /CREATE TABLE public.profiles/);
  assert.match(plan.applicationSql, /security_invoker=true/);
  assert.match(plan.applicationSql, /s\.not_after IS NULL/);
  assert.match(plan.applicationSql, /f\.status='verified'/);
});
for (const file of Object.keys(sourceFingerprints)) {
  test('any source drift is rejected before planning: ' + file, () => {
    assert.throws(() => buildProviderPlan({ ...sources, [file]: sources[file] + '\n-- drift\n' }), /source drift/);
    assert.throws(() => buildProviderPlan({ ...sources, [file]: undefined }), /source drift/);
  });
}
test('default and explicit plan are offline even with hostile apply environment', async () => {
  for (const args of [[], ['--plan']]) {
    const result = spawnSync(process.execPath, ['scripts/provider-init.mjs', ...args], { encoding: 'utf8', env: { ...process.env, PHASE2_PROVIDER_DATABASE_URL: 'postgresql://secret:secret@not-local.invalid/live', PHASE2_PROVIDER_ALLOW_INIT: 'synthetic-only', PHASE2_PROVIDER_RENDER_SQL: '' } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).mode, 'offline-only');
    assert.doesNotMatch(result.stdout + result.stderr, /secret|not-local/);
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'phase2-plan-'));
  try {
    const file = path.join(dir, 'plan.sql');
    const result = spawnSync(process.execPath, ['scripts/provider-init.mjs', '--plan'], { encoding: 'utf8', env: { ...process.env, PHASE2_PROVIDER_RENDER_SQL: file } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(file, 'utf8'), plan.applicationSql);
    const again = spawnSync(process.execPath, ['scripts/provider-init.mjs', '--plan'], { encoding: 'utf8', env: { ...process.env, PHASE2_PROVIDER_RENDER_SQL: file } });
    assert.notEqual(again.status, 0, 'must never overwrite an existing plan');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('apply needs explicit opt-in and rejects unknown modes before connecting', () => {
  for (const args of [['--apply'], ['--reset'], ['--plan', '--apply']]) {
    const result = spawnSync(process.execPath, ['scripts/provider-init.mjs', ...args], { encoding: 'utf8', env: { ...process.env, PHASE2_PROVIDER_ALLOW_INIT: '', PHASE2_PROVIDER_RENDER_SQL: '' } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /synthetic-only|Usage:/);
  }
});
test('apply URL contract refuses remote, other DB/port/user, passwords and options', () => {
  const good = 'postgresql://ubuntu@127.0.0.1:55432/phase2_provider_test';
  assert.equal(validateDatabaseUrl(good), good);
  for (const bad of [undefined, good.replace('127.0.0.1', 'localhost'), good.replace('55432', '5432'), good.replace('phase2_provider_test', 'production'), good.replace('ubuntu', 'phase2_api'), good.replace('ubuntu@', 'ubuntu:password@'), good + '?options=unsafe', good + '#x']) assert.throws(() => validateDatabaseUrl(bad), /Disposable/);
});
test('safe complete role catalog is accepted; missing native roles fail closed', () => {
  assert.doesNotThrow(() => assertRoleContract(safeCatalog(), safeEdges(), { complete: true }));
  assert.throws(() => assertRoleContract([], []), /missing/);
});
test('unsafe attributes and login/bypass mismatch are refused, never repaired', () => {
  for (const role of safeCatalog()) {
    for (const flag of ['rolsuper', 'rolcreatedb', 'rolcreaterole', 'rolreplication', 'rolcanlogin', 'rolbypassrls']) {
      const roles = safeCatalog();
      const changed = roles.find(r => r.rolname === role.rolname);
      changed[flag] = !changed[flag];
      assert.throws(() => assertRoleContract(roles, safeEdges()), /Unsafe/, role.rolname + ':' + flag);
    }
  }
  for (const name of ['phase2_api', 'phase2_rest', 'authenticated']) {
    const roles = safeCatalog(); const role = roles.find(r => r.rolname === name); role.rolinherit = !role.rolinherit;
    assert.throws(() => assertRoleContract(roles, safeEdges()), /Unsafe/);
  }
});
test('unexpected direct/transitive inheritance and privileged entry paths are refused', () => {
  for (const edge of [
    { member: 'phase2_api', parent: 'service_role' },
    { member: 'phase2_rest', parent: 'bridge_to_superuser' },
    { member: 'phase2_authenticated', parent: 'phase2_definer' },
    { member: 'bridge', parent: 'phase2_bootstrap' },
    { member: 'bridge', parent: 'phase2_authenticated' },
    { member: 'phase2_rest', parent: 'authenticated', admin_option: true },
    { member: 'authenticated', parent: 'phase2_authenticated', inherit_option: false },
    { member: 'phase2_api', parent: 'phase2_authenticated', set_option: false },
  ]) assert.throws(() => assertRoleContract(safeCatalog(), [...safeEdges(), edge]), /Unsafe|Unexpected/);
});
function fakeClient({ locked = true, occupied = false, failSql = false } = {}) {
  const queries = [];
  return { queries, async query(sql) {
    queries.push(sql);
    if (sql === plan.applicationSql && failSql) throw new Error('synthetic DDL failure');
    if (sql.includes('pg_try_advisory')) return { rows: [{ acquired: locked }] };
    if (sql.includes('current_database()')) return { rows: [{ db: 'phase2_provider_test', usr: 'ubuntu', addr: '127.0.0.1/32', version: 160015, users: 'auth.users', sessions: 'auth.sessions', factors: 'auth.mfa_factors', occupied }] };
    if (sql.startsWith('SELECT rolname')) return { rows: safeCatalog() };
    if (sql.startsWith('SELECT member.rolname')) return { rows: safeEdges() };
    return { rows: [] };
  } };
}
test('one connection wraps base plus provider SQL in one transaction and commits last', async () => {
  const client = fakeClient(); await initializeApplication(client, plan);
  assert.equal(client.queries[0], 'BEGIN'); assert.equal(client.queries.at(-1), 'COMMIT');
  assert.equal(client.queries.filter(sql => sql === plan.applicationSql).length, 1);
  assert.equal(client.queries.filter(sql => sql === 'COMMIT').length, 1);
});
for (const [label, options] of [['contention', { locked: false }], ['occupied DB', { occupied: true }], ['provider SQL failure', { failSql: true }]]) {
  test('initialization rolls back without partial commit on ' + label, async () => {
    const client = fakeClient(options); await assert.rejects(initializeApplication(client, plan));
    assert.equal(client.queries.at(-1), 'ROLLBACK'); assert.ok(!client.queries.includes('COMMIT'));
    if (!options.failSql) assert.ok(!client.queries.includes(plan.applicationSql));
  });
}
