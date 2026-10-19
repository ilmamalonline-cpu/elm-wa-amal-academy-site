// No provisioning or repair here: ordinary entry points perform catalog reads only.
import { Pool } from 'pg';
import { checkRoles } from '../provider-roles.mjs';
export async function assertRuntimeReady(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1' || url.port !== '55432' || url.pathname !== '/phase2_provider_test' || !['phase2_api', 'phase2_rest'].includes(url.username) || url.password || url.search || url.hash) throw new Error('Canonical local runtime database required');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const { rows: [row] } = await client.query("SELECT current_database() db, host(inet_server_addr()) host, current_user usr, EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='profiles') ready");
      if (row?.db !== 'phase2_provider_test' || row.host !== '127.0.0.1' || row.usr !== url.username || !row.ready) throw new Error('Prepared canonical local runtime required; startup never provisions it');
      await checkRoles(client, { complete: true });
      await client.query('ROLLBACK');
    } finally { client.release(); }
  } finally { await pool.end(); }
}
