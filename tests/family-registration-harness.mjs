import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const bin = '/usr/lib/postgresql/16/bin';
const share = '/usr/share/postgresql/16';
const schema = await readFile(new URL('../db/family-registration.sql', import.meta.url), 'utf8');

function unusedPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

export async function startHarness() {
  const directory = await mkdtemp(path.join(tmpdir(), 'family-registration-test-'));
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  const log = path.join(directory, 'postgres.log');
  const port = await unusedPort();
  let started = false;
  let admin;
  const ctl = (...args) => execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, ...args], { encoding: 'utf8', timeout: 20_000 });
  const close = async () => {
    await admin?.end().catch(() => {});
    if (started) ctl('-m', 'fast', '-w', 'stop');
    await rm(directory, { recursive: true, force: true });
  };
  try {
    execFileSync(path.join(bin, 'initdb'), ['-D', data, '-L', share, '-A', 'trust', '--no-locale', '-E', 'UTF8', '-U', 'ubuntu'], { encoding: 'utf8', timeout: 20_000 });
    await mkdir(socket, { mode: 0o700 });
    ctl('-l', log, '-o', `-h 127.0.0.1 -p ${port} -k ${socket} -c jit=off`, '-w', 'start');
    started = true;
    const baseUrl = `postgresql://ubuntu@127.0.0.1:${port}`;
    const postgres = new Pool({ connectionString: `${baseUrl}/postgres`, max: 1 });
    execFileSync(path.join(bin, 'createdb'), ['-h', '127.0.0.1', '-p', String(port), '-U', 'ubuntu', 'family_registration_test'], { encoding: 'utf8', timeout: 20_000 });
    await postgres.end();
    admin = new Pool({ connectionString: `${baseUrl}/family_registration_test`, max: 4 });
    await admin.query(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated;
      GRANT USAGE ON SCHEMA public TO anon;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
    `);
    await admin.query(schema);
    const ids = { guardianA: randomUUID(), guardianB: randomUUID(), childA: randomUUID() };
    await admin.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [ids.guardianA, ids.guardianB]);
    await admin.query("INSERT INTO public.academy_guardians(id,display_name,locale,consent_version,consented_at) VALUES ($1,'A','en','family-v1',now()),($2,'B','ar','family-v1',now())", [ids.guardianA, ids.guardianB]);
    await admin.query("INSERT INTO public.academy_children(id,guardian_id,display_name,birth_year) VALUES ($1,$2,'Child A',2015)", [ids.childA, ids.guardianA]);

    async function as(user, text, values = []) {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE authenticated');
        await client.query('SELECT set_config($1,$2,true)', ['request.jwt.claim.sub', user ?? '']);
        const result = await client.query(text, values);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally { client.release(); }
    }
    async function anon(text, values = []) {
      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE anon');
        return await client.query(text, values);
      } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
    }
    console.log('Created owned temporary PostgreSQL 16 cluster on 127.0.0.1; no hosted database used.');
    return { admin, ids, as, anon, close };
  } catch (error) {
    await close();
    throw error;
  }
}
