import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { startDemo } from '../scripts/manual-payment-demo.mjs';

let demo;
let browser;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const originOf = value => new URL(value).origin;

async function jsonFetch(page, path, options = {}) {
  return page.evaluate(async ({ path, options }) => {
    const response = await fetch(path, {
      ...options,
      headers: { ...(options.headers || {}), ...(options.body ? { 'content-type': 'application/json' } : {}) },
    });
    let body;
    try { body = await response.json(); } catch { body = await response.text(); }
    return { status: response.status, body, allow: response.headers.get('allow') };
  }, { path, options });
}

function ui(page, selector) { return page.locator(selector); }
async function text(page, selector) { return (await ui(page, selector).textContent()) ?? ''; }
async function orderButton(page, orderId) { return page.locator(`[data-order-id="${orderId}"]`); }

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await Promise.race([exited, wait(3000)]);
}

before(async () => {
  process.env.MANUAL_PAYMENT_TEST = 'synthetic-only';
  process.env.MANUAL_PAYMENT_DEMO = 'synthetic-only';
  demo = await startDemo();
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  await demo?.close();
  delete process.env.MANUAL_PAYMENT_DEMO;
  delete process.env.MANUAL_PAYMENT_TEST;
});

test('launcher is opt-in and its child CLI is also default-off', async () => {
  const savedDemo = process.env.MANUAL_PAYMENT_DEMO;
  delete process.env.MANUAL_PAYMENT_DEMO;
  await assert.rejects(() => startDemo(), /MANUAL_PAYMENT_DEMO=synthetic-only/);
  process.env.MANUAL_PAYMENT_DEMO = savedDemo;

  const child = spawn(process.execPath, ['scripts/manual-payment-demo.mjs'], {
    cwd: process.cwd(), env: { ...process.env, MANUAL_PAYMENT_DEMO: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0, 'the standalone launcher must not start without its opt-in flag');
});

test('two-origin family/reviewer demo completes the synthetic payment lifecycle', async () => {
  const { familyUrl, reviewerUrl, harness, fixture } = demo;
  assert.ok(familyUrl && reviewerUrl && harness && fixture?.ids?.childA);
  assert.notEqual(originOf(familyUrl), originOf(reviewerUrl));
  for (const value of [familyUrl, reviewerUrl]) {
    const url = new URL(value);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    assert.equal(url.search, '');
  }

  const family = await browser.newPage();
  const reviewer = await browser.newPage();
  await family.setViewportSize({ width: 375, height: 812 });
  await family.goto(familyUrl);
  await reviewer.goto(reviewerUrl);
  assert.equal(await family.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  for (const page of [family, reviewer]) {
    const html = await page.content();
    const script = await page.locator('script[src="/demo.js"]').getAttribute('src');
    assert.equal(script, '/demo.js');
    assert.doesNotMatch(html, /01[0125][0-9]{8}|token|jwt|Bearer/i);
    const context = await (await page.evaluate(() => fetch('/api/context').then(r => r.json())));
    assert.deepEqual(context, { mode: 'synthetic-only', persona: page === family ? 'family' : 'reviewer', studentId: fixture.ids.childA });
    const js = await page.evaluate(() => fetch('/demo.js').then(r => r.text()));
    assert.doesNotMatch(js, /01[0125][0-9]{8}|Authorization|Bearer|jwt/i);
  }

  assert.ok(await ui(family, '#create-order').isVisible());
  assert.equal(await reviewer.locator('#reviewer').getAttribute('hidden'), null);
  assert.equal(await reviewer.locator('#family').getAttribute('hidden'), '');
  assert.ok(await ui(family, '#create-order').isVisible());

  await family.locator('#create-order').click();
  await family.locator('#refresh').click();
  const orderId = await family.locator('#orders [data-order-id]').first().getAttribute('data-order-id');
  assert.match(orderId, /^[0-9a-f-]{36}$/i);
  await reviewer.locator('#refresh').click();
  await (await orderButton(reviewer, orderId)).click();

  await reviewer.locator('#amount-minor').fill('50000');
  await reviewer.locator('#currency').selectOption('SAR');
  await reviewer.locator('#method').selectOption('synthetic-manual-agreement');
  await reviewer.locator('#offer-quote').click();
  await expect(reviewer.locator('#quote')).toContainText('500');
  await family.locator('#refresh').click();
  await (await orderButton(family, orderId)).click();
  await expect(family.locator('#quote')).toContainText('500');
  const beforeAcceptance = await jsonFetch(family, `/api/manual-payments/orders/${orderId}`);
  const beforeQuote = beforeAcceptance.body.data.quotes.at(-1);
  const beforeSubmit = await jsonFetch(family, `/api/manual-payments/orders/${orderId}/attempts`, {
    method: 'POST',
    headers: { Origin: originOf(familyUrl) },
    body: JSON.stringify({ id: randomUUID(), quoteId: beforeQuote.id, amountMinor: 50000, currency: 'SAR', reference: 'SYNTHETIC-BEFORE-ACCEPT' }),
  });
  assert.ok([400, 409].includes(beforeSubmit.status));
  assert.equal(beforeAcceptance.body.data.activation, null);
  const mismatchedAcceptance = await jsonFetch(family, `/api/manual-payments/orders/${orderId}/acceptance`, {
    method: 'POST',
    headers: { Origin: originOf(familyUrl) },
    body: JSON.stringify({ id: randomUUID(), quoteId: randomUUID(), amountMinor: 50000, currency: 'SAR', method: 'synthetic-manual-agreement', policyVersion: 'manual-payment-local-v1' }),
  });
  assert.ok([400, 409].includes(mismatchedAcceptance.status));
  assert.equal((await jsonFetch(family, `/api/manual-payments/orders/${orderId}`)).body.data.activation, null);
  assert.equal(await family.locator('#accept-quote').isDisabled(), true);
  await family.locator('#accept-check').check();
  await family.locator('#accept-quote').click();

  await family.locator('#reference').fill('SYNTHETIC-DEMO-TEST');
  await family.locator('#submit-attempt').click();
  assert.match(await text(family, '#activation'), /غير مفعّل/);

  await reviewer.locator('#refresh').click();
  await (await orderButton(reviewer, orderId)).click();
  await reviewer.locator('#reason').fill('Synthetic demo independently checked');
  await reviewer.locator('#actual-minor').fill('50000');
  await reviewer.locator('#actual-currency').selectOption('SAR');
  await reviewer.locator('#verification-source').fill('SYNTHETIC-DEMO-LEDGER');
  assert.equal(await reviewer.locator('#approve').isDisabled(), true);
  await reviewer.locator('#capacity-check').check();
  await reviewer.locator('#approve-check').check();
  await reviewer.locator('#approve-check').uncheck();
  assert.equal(await reviewer.locator('#approve').isDisabled(), true);
  await reviewer.locator('#approve-check').check();
  await reviewer.locator('#approve').click();
  await expect(reviewer.locator('#activation')).toContainText('8');
  assert.match(await text(reviewer, '#activation'), /\d{4}/);

  await family.locator('#refresh').click();
  await (await orderButton(family, orderId)).click();
  assert.match(await text(family, '#activation'), /8/);

  const replayOptions = {
    method: 'POST',
    headers: { Origin: originOf(reviewerUrl) },
    body: JSON.stringify({ attemptId: (await jsonFetch(reviewer, `/api/manual-payments/orders/${orderId}`)).body.data.attempts.at(-1).id, decision: 'verified', reason: 'Synthetic demo independently checked', actualMinor: 50000, actualCurrency: 'SAR', verificationSource: 'SYNTHETIC-DEMO-LEDGER', capacityConfirmed: true }),
  };
  const replay = await jsonFetch(reviewer, `/api/manual-payments/orders/${orderId}/review`, replayOptions);
  const replayAgain = await jsonFetch(reviewer, `/api/manual-payments/orders/${orderId}/review`, replayOptions);
  assert.equal(replay.status, 200);
  assert.equal(replayAgain.status, 200);
  assert.equal(replay.body.id, replayAgain.body.id);

  const guardianBOrderId = randomUUID();
  await harness.as(fixture.ids.guardianB, 'SELECT manual_payment.create_order($1,$2,$3)', [guardianBOrderId, fixture.ids.childA, 'quran']);
  const isolated = await fetch(`${familyUrl}/api/manual-payments/orders`, { headers: { Origin: originOf(familyUrl), 'x-demo-role': 'reviewer' } });
  assert.equal(isolated.status, 200);
  const visible = await isolated.json();
  assert.ok(!visible.data?.some(order => order.order?.id === guardianBOrderId));
  const guardianBDirect = await fetch(`${familyUrl}/api/manual-payments/orders/${guardianBOrderId}`, { headers: { Origin: originOf(familyUrl) } });
  assert.equal(guardianBDirect.status, 403);
  const appUrl = demo.appUrl;
  if (appUrl) {
    const publicPage = await fetch(new URL('/ar/packages', appUrl));
    assert.equal(publicPage.status, 200);
    assert.doesNotMatch(await publicPage.text(), /01[0125][0-9]{8}/);
  }

  await family.close();
  await reviewer.close();
});

test('origin, persona, route and query guards cannot be bypassed by browser headers', async () => {
  const { familyUrl, reviewerUrl } = demo;
  const family = await browser.newPage();
  const reviewer = await browser.newPage();
  await family.goto(familyUrl);
  await reviewer.goto(reviewerUrl);
  const familyOrigin = originOf(familyUrl);
  const reviewerOrigin = originOf(reviewerUrl);

  const wrongOrigin = await fetch(`${familyUrl}/api/manual-payments/orders`, { method: 'POST', headers: { Origin: reviewerOrigin, 'content-type': 'application/json', 'x-persona': 'family' }, body: JSON.stringify({ id: randomUUID(), studentId: demo.fixture.ids.childA, packageId: 'quran' }) });
  assert.equal(wrongOrigin.status, 403);
  const spoof = await jsonFetch(family, `/api/manual-payments/orders/${randomUUID()}/review`, { method: 'POST', headers: { Origin: familyOrigin, 'x-persona': 'reviewer', Authorization: 'Bearer ignored' }, body: JSON.stringify({ decision: 'verified', reason: 'spoof', capacityConfirmed: true }) });
  assert.equal(spoof.status, 403);
  const familyQuote = await jsonFetch(family, `/api/manual-payments/orders/${randomUUID()}/quotes`, { method: 'POST', headers: { Origin: familyOrigin }, body: JSON.stringify({ id: randomUUID(), amountMinor: 50000, currency: 'SAR', method: 'synthetic-manual-agreement' }) });
  assert.equal(familyQuote.status, 403);
  const reviewerOrder = await jsonFetch(reviewer, '/api/manual-payments/orders', { method: 'POST', headers: { Origin: reviewerOrigin }, body: JSON.stringify({ id: randomUUID(), studentId: demo.fixture.ids.childA, packageId: 'quran' }) });
  assert.equal(reviewerOrder.status, 403);
  const files = await jsonFetch(family, '/api/manual-payments/files', { method: 'POST', headers: { Origin: familyOrigin }, body: '{}' });
  assert.equal(files.status, 405);
  for (const page of [family, reviewer]) {
    const query = await page.evaluate(() => fetch('/api/manual-payments/orders?x=1').then(async r => ({ status: r.status, body: await r.json() })));
    assert.ok([400, 403].includes(query.status));
  }
  await family.close();
  await reviewer.close();
});
