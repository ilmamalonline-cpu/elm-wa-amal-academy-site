#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { checkRoles } from '../provider-roles.mjs';

const ROOT = '/workspace/phase2-provider-runtime';
const SRC = path.join(ROOT, 'storage-src');
const DATA = path.join(ROOT, 'storage-data');
const KEYS = path.join(ROOT, 'keys.json');
const ENVFILE = path.join(ROOT, 'storage.env');
export const DB_URL = 'postgresql://supabase_storage_admin@127.0.0.1:55432/phase2_provider_test';
function refuseSymlink(file) {
  try { if (fs.lstatSync(file).isSymbolicLink()) throw new Error('Refusing runtime symlink'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
function mode(file, expected) {
  if ((fs.statSync(file).mode & 0o777) !== expected) throw new Error(`Runtime permissions must be mode ${expected.toString(8)}`);
}
function fixedEnv(keys) {
  const jwks = keys.jwksVerify || keys.jwtJwks || keys.publicJwks;
  const quote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
  return [
    'SERVER_HOST=127.0.0.1', 'SERVER_PORT=55442', 'SERVER_ADMIN_PORT=55447',
    `DATABASE_URL=${DB_URL}`, `DATABASE_POOL_URL=${DB_URL}`, 'DATABASE_SEARCH_PATH=',
    `AUTH_JWT_SECRET=${quote(keys.jwtSecret)}`, 'AUTH_JWT_ALGORITHM=HS256', `JWT_JWKS=${quote(jwks ? JSON.stringify(jwks) : '')}`,
    `ANON_KEY=${quote(keys.anonKey)}`, `SERVICE_KEY=${quote(keys.serviceKey)}`,
    'DB_INSTALL_ROLES=false', 'DB_ALLOW_MIGRATION_REFRESH=false',
    'DB_ANON_ROLE=anon', 'DB_AUTHENTICATED_ROLE=authenticated', 'DB_SERVICE_ROLE=service_role',
    'DB_SUPER_USER=supabase_storage_admin', 'DB_MIGRATIONS_STRATEGY=on_request',
    'MULTI_TENANT=false', 'IS_MULTITENANT=false', 'VECTOR_STORE_MIGRATIONS_ENABLED=false', 'VECTOR_DATABASE_URL=',
    'STORAGE_BACKEND=file', `STORAGE_FILE_BACKEND_PATH=${DATA}`, 'STORAGE_FILE_ETAG_ALGORITHM=md5',
    'STORAGE_VERSIONING_ENABLED=false', 'STORAGE_LIFECYCLE_ENABLED=false', 'IMAGE_TRANSFORMATION_ENABLED=false', 'IMGPROXY_URL=',
    'LOGFLARE_ENABLED=false', 'OTEL_METRICS_ENABLED=false', 'PROMETHEUS_METRICS_ENABLED=false',
    'RATE_LIMITER_ENABLED=false', 'PG_QUEUE_ENABLE=false', 'LOG_LEVEL=error', 'NODE_ENV=production',
  ].join('\n') + '\n';
}
function prepare() {
  if (process.env.PHASE2_PROVIDER_MIGRATE !== 'synthetic-only' && process.env.PHASE2_PROVIDER_STORAGE_START !== 'prepared-synthetic-only') throw new Error('Explicit synthetic-only preparation required');
  for (const file of [ROOT, KEYS, ENVFILE, DATA]) refuseSymlink(file);
  mode(ROOT, 0o700); mode(KEYS, 0o600);
  if (fs.existsSync(ENVFILE)) mode(ENVFILE, 0o600);
  for (const file of ['.env', '.env.local', '.env.production']) if (fs.existsSync(path.join(SRC, file))) throw new Error('Unexpected upstream dotenv file; review before local launch');
  const keys = JSON.parse(fs.readFileSync(KEYS, 'utf8'));
  for (const name of ['jwtSecret', 'serviceKey', 'anonKey']) if (!keys[name] || typeof keys[name] !== 'string' || /[\r\n]/.test(keys[name])) throw new Error('Invalid local runtime key material');
  fs.mkdirSync(DATA, { recursive: true, mode: 0o700 });
  mode(DATA, 0o700);
  const temp = `${ENVFILE}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temp, fixedEnv(keys), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, ENVFILE);
  } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
}
export function migrationManifest(directory) {
  const migrations = fs.readdirSync(directory).filter(name => /^\d+-.*\.sql$/.test(name)).map(file => ({
    id: Number(file.match(/^\d+/)[0]), name: file.replace(/^\d+-/, '').replace(/\.sql$/, ''),
    // Match the installed postgres-migrations library: sha1(filename + raw SQL).
    hash: createHash('sha1').update(file + fs.readFileSync(path.join(directory, file), 'utf8')).digest('hex'),
  })).sort((a, b) => a.id - b.id);
  if (!migrations.length || new Set(migrations.map(m => m.id)).size !== migrations.length) throw new Error('Invalid Storage migration source manifest');
  return migrations;
}
export function assertMigrationCatalog(expected, applied) {
  if (expected.length !== applied.length || expected.some((m, index) => Number(applied[index]?.id) !== m.id || applied[index].name !== m.name || applied[index].hash !== m.hash)) throw new Error('Storage migration IDs/names/hashes do not match the active source');
}
export async function checkTarget(client) {
  const { rows: [row] } = await client.query("SELECT current_database() db,host(inet_server_addr()) host,current_user usr,(SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication FROM pg_roles WHERE rolname=current_user) unsafe");
  if (row?.db !== 'phase2_provider_test' || row.host !== '127.0.0.1' || row.usr !== 'supabase_storage_admin' || row.unsafe !== false) throw new Error('Canonical non-superuser local Storage database required');
}
export async function checkStorageCatalog(client, expected) {
  await checkTarget(client);
  await checkRoles(client, { complete: true });
  const { rows: [row] } = await client.query(`SELECT
    (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='storage' AND table_name IN('buckets','objects','migrations')) tables,
    EXISTS(SELECT FROM pg_policies WHERE schemaname='storage' AND tablename IN('buckets','objects')) policies,
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname IN('buckets','objects') AND c.relrowsecurity) rls`);
  if (row?.tables !== 3 || row.policies !== false || row.rls !== 2) throw new Error('Prepared RLS Storage tables with zero direct object/bucket policies required');
  const { rows: [bucket] } = await client.query("SELECT EXISTS(SELECT FROM storage.buckets WHERE id='phase2-private' AND public) unsafe");
  if (bucket?.unsafe !== false) throw new Error('phase2-private must remain private when present');
  const applied = await client.query('SELECT id,name,hash FROM storage.migrations ORDER BY id');
  assertMigrationCatalog(expected, applied.rows);
}
async function withReadOnlyCheck(check) {
  const pool = new Pool({ connectionString: DB_URL, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
  try {
    const client = await pool.connect();
    try { await client.query('BEGIN READ ONLY'); await check(client); await client.query('ROLLBACK'); }
    finally { client.release(); }
  } finally { await pool.end(); }
}
export async function main(command = process.argv[2]) {
  if (command === 'prepare') prepare();
  else if (command === 'check-target') await withReadOnlyCheck(checkTarget);
  else if (command === 'check-db') {
    const expected = migrationManifest(path.join(SRC, 'migrations/tenant'));
    await withReadOnlyCheck(client => checkStorageCatalog(client, expected));
  } else if (command === 'assert-env') {
    if (process.env.DATABASE_URL !== DB_URL || process.env.DATABASE_POOL_URL !== DB_URL || process.env.DB_SUPER_USER !== 'supabase_storage_admin' || process.env.DB_ALLOW_MIGRATION_REFRESH !== 'false') throw new Error('Refusing non-canonical Storage environment');
  } else throw new Error('Usage: storage-preflight.mjs [prepare|check-target|check-db|assert-env]');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.code ? `Local Storage preflight failed (${error.code})` : error.message); process.exitCode = 2; });
