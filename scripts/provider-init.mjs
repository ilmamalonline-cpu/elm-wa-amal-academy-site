// LOCAL SYNTHETIC ONLY. Never a hosted/production migration.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildProviderPlan, loadSources } from './provider-plan.mjs';
import { checkRoles } from './provider-roles.mjs';

export function validateDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Disposable loopback provider database only'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/phase2_provider_test' || url.username !== 'ubuntu' || url.search || url.hash || url.password) throw new Error('Disposable loopback provider database only');
  return value;
}

export async function initializeApplication(client, plan) {
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s'");
    const lock = await client.query('SELECT pg_try_advisory_xact_lock(21402,1) AS acquired');
    if (!lock.rows[0]?.acquired) throw new Error('Canonical provider initialization already in progress');
    const check = (await client.query(`SELECT current_database() db, current_user usr, inet_server_addr()::text addr,
      current_setting('server_version_num')::int version,
      to_regclass('auth.users') users, to_regclass('auth.sessions') sessions, to_regclass('auth.mfa_factors') factors,
      EXISTS(SELECT FROM pg_namespace WHERE nspname IN('api','provider_private')) OR
      EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p','v','m','f','S')) occupied`)).rows[0];
    if (check?.db !== 'phase2_provider_test' || check.usr !== 'ubuntu' || !['127.0.0.1', '127.0.0.1/32'].includes(check.addr) || check.version < 160000 || !check.users || !check.sessions || !check.factors || check.occupied) throw new Error('Fresh local PostgreSQL16+ provider DB with native Auth migrations required; existing application objects are never reset');
    await checkRoles(client);
    // Both original SQL files have their checked outer transactions removed by the
    // pure planner. One dedicated connection owns ALL app DDL/grants and the lock.
    await client.query(plan.applicationSql);
    await checkRoles(client, { complete: true });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function main(args = process.argv.slice(2)) {
  const mode = args[0] ?? '--plan';
  if (!['--plan', '--apply'].includes(mode) || args.length > 1) throw new Error('Usage: provider-init.mjs [--plan|--apply]');
  // Load and fingerprint all inputs before importing pg or creating any socket.
  const plan = buildProviderPlan(await loadSources());
  if (mode === '--plan') {
    if (process.env.PHASE2_PROVIDER_RENDER_SQL) await writeFile(process.env.PHASE2_PROVIDER_RENDER_SQL, plan.applicationSql, { mode: 0o600, flag: 'wx' });
    const { applicationSql: _sql, ...summary } = plan;
    void _sql;
    console.log(JSON.stringify({ mode: 'offline-only', ...summary }, null, 2));
    return;
  }
  if (process.env.PHASE2_PROVIDER_ALLOW_INIT !== 'synthetic-only') throw new Error('Explicit synthetic-only initialization required');
  const value = validateDatabaseUrl(process.env.PHASE2_PROVIDER_DATABASE_URL);
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: value, max: 1, connectionTimeoutMillis: 3000, application_name: 'phase2-native-synthetic-init' });
  try {
    const client = await pool.connect();
    try { await initializeApplication(client, plan); } finally { client.release(); }
    console.log('Initialized canonical application schema atomically; native Auth preserved. Storage provisioning/guard is a separate explicit step.');
  } finally { await pool.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.code ? `Canonical initialization failed (${error.code}); transaction rolled back; inspect local synthetic setup.` : error.message);
    process.exitCode = 1;
  });
}
