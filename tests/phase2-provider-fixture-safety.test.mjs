import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { account, auth, keys, localFetch, origins, fixtureLabels, syntheticAccountFixture } from './provider-helpers.mjs';

const originalMode = process.env.PHASE2_PROVIDER_TEST;
const originalFetch = globalThis.fetch;

after(() => {
  if (originalMode === undefined) delete process.env.PHASE2_PROVIDER_TEST;
  else process.env.PHASE2_PROVIDER_TEST = originalMode;
  globalThis.fetch = originalFetch;
});

test('provider helpers require explicit synthetic-only mode before key reads or network', async () => {
  delete process.env.PHASE2_PROVIDER_TEST;
  await assert.rejects(() => keys(), /synthetic-only/);
  await assert.rejects(() => localFetch(origins.auth + '/settings'), /synthetic-only/);
  await assert.rejects(() => account('owner'), /synthetic-only/);
});

test('fixture accounts accept only current test labels and reserved synthetic identities', async () => {
  process.env.PHASE2_PROVIDER_TEST = 'synthetic-only';
  await assert.rejects(() => account('arbitrary-user'), /Unknown synthetic fixture label/);
  await assert.rejects(
    () => auth('/recover', { method: 'POST', body: { email: 'person@example.com' } }),
    /reserved synthetic email/
  );
  await assert.rejects(
    () => auth('/token?grant_type=password', { method: 'POST', body: { email: 'person@example.com', password: 'wrong' } }),
    /reserved synthetic email/
  );
});

test('localFetch permits exact local origins only and forces credential-free manual redirects', async () => {
  process.env.PHASE2_PROVIDER_TEST = 'synthetic-only';
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await localFetch(origins.auth + '/settings');
  assert.equal(calls[0].url, origins.auth + '/settings');
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.redirect, 'manual');
  await assert.rejects(() => localFetch('http://user:pass@127.0.0.1:55441/settings'), /remote endpoints/);
  await assert.rejects(() => localFetch('http://127.0.0.1:55441/settings#external'), /remote endpoints/);
  await assert.rejects(() => localFetch('http://127.0.0.1:55441/settings', { redirect: 'follow' }), /manual redirect/);
  await assert.rejects(() => localFetch('http://127.0.0.1:55441/settings', { credentials: 'include' }), /send credentials/);
  await assert.rejects(() => localFetch('http://127.0.0.1:55440/settings'), /remote endpoints/);
  assert.equal(calls.length, 1, 'unsafe routes must be rejected before fetch');
});

test('all allowlisted fixture labels generate valid lowercase reserved identities offline', () => {
  process.env.PHASE2_PROVIDER_TEST = 'synthetic-only';
  assert.equal(Object.isFrozen(fixtureLabels), true);
  for (const label of fixtureLabels) {
    const fixture = syntheticAccountFixture(label);
    assert.match(fixture.email, /^synthetic-[a-z0-9-]+@phase2\.example\.invalid$/);
    assert.match(fixture.password, /^Synthetic-only-/);
  }
});
