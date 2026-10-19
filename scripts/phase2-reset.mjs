import { readFile } from 'node:fs/promises';
import pg from 'pg';
const raw = process.env.PHASE2_TEST_DATABASE_URL;
if (!raw || process.env.PHASE2_ALLOW_RESET !== 'synthetic-only') throw new Error('Explicit PHASE2_ALLOW_RESET=synthetic-only and PHASE2_TEST_DATABASE_URL required');
const url = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.pathname !== '/phase2_test' || url.search || url.hash || url.username === 'phase2_api') throw new Error('Reset refuses remote, application-role, or non-test databases');
const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 3000 });
try {
  await client.connect();
  const check = await client.query("SELECT current_database() AS db, host(inet_server_addr()) AS host");
  if (check.rows[0].db !== 'phase2_test' || check.rows[0].host !== '127.0.0.1') throw new Error('Disposable loopback database required');
  await client.query('BEGIN');
  await client.query('DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  // Strip the outer transaction so a failed schema application restores the old harness.
  const sql = (await readFile(new URL('../db/phase2.sql', import.meta.url), 'utf8')).replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
  await client.query(sql);
  await client.query('COMMIT');
  console.log('Reset local phase2_test synthetic schema only; no hosted service contacted.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally { await client.end(); }
