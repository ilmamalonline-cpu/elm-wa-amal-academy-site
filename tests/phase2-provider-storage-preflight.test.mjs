import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { migrationManifest, assertMigrationCatalog, checkStorageCatalog, checkTarget } from '../scripts/provider/storage-preflight.mjs';
import { roleContract } from '../scripts/provider-roles.mjs';
const expected = [{ id: 1, name: 'synthetic-only', hash: 'synthetic-hash' }];
function client(overrides = {}) {
  return { async query(sql) {
    if (sql.includes('current_database()')) return { rows: [{ db: 'phase2_provider_test', host: '127.0.0.1', usr: 'supabase_storage_admin', unsafe: false, ...overrides.target }] };
    if (sql.startsWith('SELECT rolname')) return { rows: Object.entries(roleContract).map(([rolname,c]) => ({rolname,rolcanlogin:c.login,rolbypassrls:c.bypass,rolinherit:c.inherit??true,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false})) };
    if (sql.startsWith('SELECT member.rolname')) return { rows: Object.entries(roleContract).flatMap(([member,c])=>c.parents.map(parent=>({member,parent,admin_option:false,set_option:true,inherit_option:c.inherit??true}))) };
    if (sql.includes('information_schema.tables')) return { rows: [{ tables: 3, policies: false, rls: 2, ...overrides.catalog }] };
    if (sql.includes('FROM storage.buckets')) return { rows: [{ unsafe: overrides.publicBucket ?? false }] };
    if (sql.includes('FROM storage.migrations')) return { rows: overrides.migrations ?? expected };
    throw new Error('Unexpected synthetic query');
  } };
}
test('migration manifest uses numeric ordering and upstream filename+SQL hashes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(),'phase2-storage-manifest-'));
  try {
    for (const file of ['00010-ten.sql','0002-two.sql']) await writeFile(path.join(directory,file),'-- synthetic only\n');
    const manifest = migrationManifest(directory);
    assert.deepEqual(manifest.map(m=>m.id),[2,10]);
    assert.equal(manifest[0].name,'two');
    assert.equal(manifest[0].hash,createHash('sha1').update('0002-two.sql-- synthetic only\n').digest('hex'));
    assert.doesNotThrow(()=>assertMigrationCatalog(manifest,manifest));
    assert.throws(()=>assertMigrationCatalog(manifest,[...manifest].reverse()),/IDs\/names\/hashes/);
    for (const field of ['name','hash','id']) assert.throws(()=>assertMigrationCatalog(manifest,[{...manifest[0],[field]:'drift'},manifest[1]]),/IDs\/names\/hashes/);
    assert.throws(()=>assertMigrationCatalog(manifest,manifest.slice(1)),/IDs\/names\/hashes/);
  } finally { await rm(directory,{recursive:true,force:true}); }
});
test('Storage preflight accepts only canonical prepared private/RLS/zero-policy catalogs', async () => {
  await checkStorageCatalog(client(),expected);
  for (const options of [
    {catalog:{tables:2}}, {catalog:{policies:true}}, {catalog:{rls:1}}, {publicBucket:true},
    {migrations:[]}, {migrations:[{...expected[0],hash:'drift'}]},
  ]) await assert.rejects(checkStorageCatalog(client(options),expected));
});
test('Storage target guard rejects wrong identity and privileged admin attributes', async () => {
  for (const target of [{db:'production'},{host:'10.0.0.1'},{usr:'ubuntu'},{unsafe:true}]) await assert.rejects(checkTarget(client({target})),/Canonical non-superuser/);
});
test('direct config preparation and shell startup fail closed before runtime writes without opt-in', () => {
  const env={...process.env,PHASE2_PROVIDER_MIGRATE:'',PHASE2_PROVIDER_STORAGE_START:''};
  for (const [exe,args] of [
    [process.execPath,['scripts/provider/storage-preflight.mjs','prepare']],
    ['bash',['scripts/provider/storage-start.sh']],
    ['bash',['scripts/provider/storage-provision.sh']],
  ]) {
    const result=spawnSync(exe,args,{encoding:'utf8',env});
    assert.notEqual(result.status,0);
    assert.match(result.stderr,/synthetic-only|prepared-synthetic-only/);
  }
});
