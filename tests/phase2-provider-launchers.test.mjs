import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const launcher = (name) => resolve(root, 'scripts/provider', name);
const read = (name) => readFile(launcher(name), 'utf8');

for (const name of ['auth-start.sh', 'storage-start.sh', 'storage-provision.sh']) {
  test(`${name} passes offline shell syntax`, () => {
    execFileSync('bash', ['-n', launcher(name)]);
  });
}

test('Storage preflight helper passes syntax and has no service side effects', async () => {
  execFileSync(process.execPath, ['--check', launcher('storage-preflight.mjs')]);
  const text = await read('storage-preflight.mjs');
  assert.match(text, /127\.0\.0\.1/);
  assert.match(text, /55432/);
  assert.match(text, /supabase_storage_admin/);
  assert.match(text, /DB_ALLOW_MIGRATION_REFRESH=false/);
  assert.match(text, /mode: 0o600/);
  assert.match(text, /0o700/);
  assert.match(text, /isSymbolicLink/);
  assert.doesNotMatch(text, /npm\s+(ci|run\s+(build|start))/);
});

test('Auth migration is a separate synthetic-only operation', async () => {
  const text = await read('auth-start.sh');
  assert.match(text, /ACTION="\$\{1:-serve\}"/);
  assert.match(text, /PHASE2_PROVIDER_MIGRATE:-.*synthetic-only/);
  assert.match(text, /migrate\)\s*\n\s*\[\[/s);
  assert.match(text, /serve\)\s*\n\s*# GoTrue v2\.197\.0/s);
  assert.doesNotMatch(text, /npm\s+(ci|run\s+build)/);
  assert.match(text, /PORT=55441/);
});

test('Storage ordinary startup only consumes prepared artifacts', async () => {
  const text = await read('storage-start.sh');
  assert.match(text, /PHASE2_PROVIDER_STORAGE_START:-.*prepared-synthetic-only/);
  assert.match(text, /before any runtime write/i);
  assert.match(text, /node_modules/);
  assert.match(text, /dist\/start\/server\.js/);
  assert.match(text, /missing prepared Storage/);
  assert.doesNotMatch(text, /npm\s+ci/);
  assert.doesNotMatch(text, /npm\s+run\s+build/);
  assert.match(text, /storage-preflight\.mjs/);
  assert.match(text, /check-db/);
  assert.match(text, /always calls runMigrationsOnTenant/);
  assert.match(text, /no migration-free.*strategy exists.*on_request\/progressive\/full_fleet/s);
});

test('Storage provisioning requires explicit synthetic opt-in and invokes only migration script', async () => {
  const text = await read('storage-provision.sh');
  assert.match(text, /PHASE2_PROVIDER_MIGRATE:-.*synthetic-only/);
  assert.match(text, /storage-preflight\.mjs.*prepare/s);
  assert.match(text, /assert-env/);
  assert.match(text, /check-target/);
  assert.doesNotMatch(text, /check-db/);
  assert.match(text, /env -i/);
  assert.match(text, /npm run migration:run/);
  assert.doesNotMatch(text, /npm\s+ci/);
  assert.doesNotMatch(text, /npm\s+run\s+start/);
});
