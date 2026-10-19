import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { Pool } from 'pg';
import { reset, setClaims } from './phase2-fixtures.mjs';

const bin = '/workspace/phase2-tools/root/usr/lib/postgresql/16/bin';
const share = '/workspace/phase2-tools/root/usr/share/postgresql/16';
export async function startHarness() {
  if (process.env.MANUAL_PAYMENT_TEST !== 'synthetic-only') throw new Error('MANUAL_PAYMENT_TEST=synthetic-only is required; no existing database is accepted');
  const directory = await mkdtemp(path.join(tmpdir(), 'manual-payment-synthetic-'));
  let started = false, admin, pool;
  const ctl = (...args) => execFileSync(path.join(bin, 'pg_ctl'), ['-D', path.join(directory, 'data'), ...args], { encoding: 'utf8', timeout: 20000 });
  async function close() {
    await pool?.end(); await admin?.end();
    if (started) ctl('-m', 'fast', '-w', 'stop');
    await rm(directory, { recursive: true, force: true });
  }
  try {
    const port = await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once('error', reject);
      server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(error => error ? reject(error) : resolve(value)); });
    });
    await mkdir(path.join(directory, 'sock'), { mode: 0o700 });
    execFileSync(path.join(bin, 'initdb'), ['-D', path.join(directory, 'data'), '-L', share, '-A', 'trust', '--no-locale', '-U', 'ubuntu'], { encoding: 'utf8', timeout: 20000 });
    ctl('-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${path.join(directory, 'sock')} -c jit=off`, '-w', 'start');
    started = true;
    admin = new Pool({ connectionString: `postgresql://ubuntu@127.0.0.1:${port}/postgres`, max: 1 });
    await admin.query('CREATE DATABASE phase2_test'); await admin.end();
    admin = new Pool({ connectionString: `postgresql://ubuntu@127.0.0.1:${port}/phase2_test`, max: 4 });
    await admin.query(await readFile(new URL('../db/phase2.sql', import.meta.url), 'utf8'));
    await admin.query("SELECT set_config('manual_payment.install','synthetic-only',false)");
    await admin.query(await readFile(new URL('../db/manual-payment.sql', import.meta.url), 'utf8'));
    const databaseUrl = `postgresql://phase2_api@127.0.0.1:${port}/phase2_test`;
    pool = new Pool({ connectionString: databaseUrl, max: 6 });
    let fixtures;
    async function seed() {
      fixtures = await reset(admin);
      const { ids } = fixtures;
      for (const [user,role] of [[ids.owner,'admin'],[ids.reviewer,'admin'],[ids.guardianA,'guardian'],[ids.guardianB,'guardian'],[ids.adultA,'student'],[ids.adultB,'student'],[ids.teacherA,'teacher']]) {
        await admin.query('INSERT INTO public.user_roles(auth_user_id,role,granted_by,reason) VALUES($1,$2,$3,\'synthetic fixture\')', [user,role,ids.owner]);
      }
      await admin.query("INSERT INTO public.capabilities(auth_user_id,capability,granted_by,reason) VALUES($1,'payment.review',$1,'synthetic fixture')", [ids.owner]);
      for (const [guardian,child] of [[ids.guardianA,ids.childA],[ids.guardianB,ids.childA],[ids.guardianB,ids.childB]]) {
        await admin.query("INSERT INTO public.guardian_links(guardian_user_id,student_id,relationship,verification_status,verified_by,verified_at,consent_version,consent_method,consent_accepted_by) VALUES($1,$2,'synthetic guardian','verified',$3,now(),'synthetic-v1','synthetic-test',$1)", [guardian,child,ids.owner]);
      }
      return fixtures;
    }
    async function as(user, sql, values = [], aal = 'aal2') {
      const client = await pool.connect();
      try {
        await client.query('BEGIN; SET LOCAL ROLE phase2_authenticated');
        await setClaims(client, user, fixtures.sessions[user], aal);
        const result = typeof sql === 'function' ? await sql(client) : await client.query(sql, values);
        await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    console.log('Created owned temporary PostgreSQL16 cluster; no prepared/native/hosted service used.');
    return { admin, pool, databaseUrl, seed, as, close };
  } catch (error) { await close(); throw error; }
}
