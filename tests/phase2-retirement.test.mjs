import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const retiredFiles = [
  'src/lib/phase2/local-supabase.ts',
  'db/supabase-local-storage.sql',
  'scripts/provider-schema.mjs',
  'scripts/supabase-local-install.mjs',
  'tests/local-supabase.test.ts',
  'tests/provider-schema.test.mjs',
  'tests/supabase-local-safety.test.mjs',
  'tests/provider-postgres-contract.test.mjs',
  'tests/local-supabase-provider.test.ts',
];
const retiredReference = /local-supabase|supabase-local-install|provider-schema|provider-postgres-contract|PHASE2_SUPABASE_|phase2_supabase_test|phase2-synthetic-evidence/;

async function sourceFiles(directory) {
  const result = [];
  for (const item of await readdir(new URL(directory, root), { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isDirectory()) result.push(...await sourceFiles(path));
    else if (/\.(?:ts|tsx|mjs|sh|sql)$/.test(item.name)) result.push(path);
  }
  return result;
}

test('all nine inactive implementation and test files are absent', async () => {
  for (const path of retiredFiles) {
    await assert.rejects(access(new URL(path, root)), { code: 'ENOENT' }, path);
  }
});

test('alternate npm entry points are absent; canonical and original commands remain', async () => {
  const { scripts } = JSON.parse(await read('package.json'));
  assert.deepEqual(Object.keys(scripts).filter((name) => /^(?:test:supabase:|supabase:local:)/.test(name)), []);
  assert.equal(scripts['test:phase2:native'], 'node --test --test-concurrency=1 tests/phase2-provider-auth.test.mjs tests/phase2-provider-data.test.mjs');
  assert.equal(scripts['phase2:native:init'], 'node scripts/provider-init.mjs');
  assert.equal(scripts['test:phase2'], 'npm run test:phase2:db && npm run test:phase2:api');
  assert.equal(scripts['phase2:reset'], 'node scripts/phase2-reset.mjs');
  assert.equal(scripts['test:phase2:retirement'], 'node --test tests/phase2-retirement.test.mjs');
});

test('live source and remaining tests have no retired imports or configuration', async () => {
  for (const directory of ['src', 'db', 'scripts', 'tests']) {
    for (const path of await sourceFiles(directory)) {
      if (path === 'tests/phase2-retirement.test.mjs') continue;
      assert.doesNotMatch(await read(path), retiredReference, path);
    }
  }
});

test('environment examples stay default-disabled without retired settings', async () => {
  const example = await read('.env.example');
  assert.match(example, /^PHASE2_LOCAL_SECURITY=disabled$/m);
  assert.doesNotMatch(example, retiredReference);
  const readme = await read('README.md');
  assert.doesNotMatch(readme, /npm run (?:test:supabase:|supabase:local:)|docs\/supabase-local-integration\.md/);
});

test('application stays wired to canonical security and canonical artifacts exist', async () => {
  assert.match(await read('src/app/api/phase2/[...segments]/route.ts'), /from ['"]@\/lib\/phase2\/security['"]/);
  for (const path of [
    'src/lib/phase2/security.ts', 'db/phase2.sql', 'db/phase2-provider.sql',
    'db/phase2-provider-storage.sql', 'scripts/provider-init.mjs',
    'scripts/provider/auth-start.sh', 'scripts/provider/storage-start.sh',
    'scripts/provider/rest-start.mjs', 'scripts/provider/app-start.mjs',
    'scripts/provider/keys-create.mjs', 'tests/provider-helpers.mjs',
    'tests/phase2-provider-auth.test.mjs', 'tests/phase2-provider-data.test.mjs',
    'tests/phase2-db.mjs', 'tests/phase2-api.test.ts', 'tests/phase2-fixtures.mjs',
  ]) await access(new URL(path, root));
});
