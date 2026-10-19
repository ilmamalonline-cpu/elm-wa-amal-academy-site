import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { startHarness } from '../tests/manual-payment-harness.mjs';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'",
};
const assetRoot = new URL('./manual-payment-demo/', import.meta.url);
async function unusedPort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
export async function startDemo() {
  if (process.env.MANUAL_PAYMENT_DEMO !== 'synthetic-only') throw new Error('Demo disabled: MANUAL_PAYMENT_DEMO=synthetic-only is required. Fixture data only.');
  // Never read or accept an existing DB, signing key, identity, or provider configuration.
  const previous = process.env.MANUAL_PAYMENT_TEST;
  process.env.MANUAL_PAYMENT_TEST = 'synthetic-only';
  let harness;
  try { harness = await startHarness(); }
  finally { if (previous === undefined) delete process.env.MANUAL_PAYMENT_TEST; else process.env.MANUAL_PAYMENT_TEST = previous; }
  const servers = [];
  let app, expiry, closing;
  function close() {
    closing ??= (async () => {
      clearTimeout(expiry);
      for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
      servers.length = 0;
      if (app && app.exitCode === null) { const exited = once(app, 'exit'); app.kill('SIGTERM'); await exited; }
      await harness.close();
    })();
    return closing;
  }
  try {
    const fixture = await harness.seed();
    const keys = await generateKeyPair('ES256', { extractable: true });
    const port = await unusedPort();
    const appUrl = `http://127.0.0.1:${port}`;
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: new URL('../', import.meta.url), stdio: ['ignore', 'ignore', 'pipe'],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', PHASE2_LOCAL_SECURITY: 'synthetic-only', PHASE2_MANUAL_PAYMENT: 'synthetic-only', PHASE2_DATABASE_URL: harness.databaseUrl, PHASE2_JWT_PUBLIC_KEY: await exportSPKI(keys.publicKey) },
    });
    // Drain without emitting potentially sensitive runtime diagnostics.
    app.stderr.resume();
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (app.exitCode !== null) throw new Error('Local app failed to start; run npm run build first.');
      try { if ((await fetch(appUrl + '/api/manual-payments/orders')).status === 401) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('Local app readiness timed out.');
    async function personaServer(persona, user) {
      let origin;
      const server = http.createServer(async (req, res) => {
        function reply(status, value, contentType = 'application/json; charset=utf-8') {
          res.writeHead(status, { ...headers, 'Content-Type': contentType });
          res.end(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
        }
        try {
          if (req.headers.host !== new URL(origin).host || req.headers['x-forwarded-host'] || req.headers['x-forwarded-for'] || req.headers['x-forwarded-proto']) return reply(403, { error: 'loopback_only' });
          const url = new URL(req.url, origin);
          if (url.origin !== origin || url.search || url.hash) return reply(400, { error: 'invalid_demo_path' });
          if (req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'same_origin_required' });
          if (req.method === 'GET') {
            const assets = { '/': ['index.html', 'text/html; charset=utf-8'], '/demo.js': ['demo.js', 'text/javascript; charset=utf-8'], '/demo.css': ['demo.css', 'text/css; charset=utf-8'] };
            if (Object.hasOwn(assets, url.pathname)) { const [file, type] = assets[url.pathname]; return reply(200, await readFile(new URL(file, assetRoot)), type); }
            if (url.pathname === '/api/context') return reply(200, { mode: 'synthetic-only', persona, studentId: fixture.ids.childA });
          }
          if (!url.pathname.startsWith('/api/manual-payments/')) return reply(404, { error: 'not_found' });
          if (req.headers.authorization || req.headers.cookie) return reply(403, { error: 'browser_credentials_not_accepted' });
          const suffix = url.pathname.slice('/api/manual-payments/'.length);
          if (suffix === 'files' || suffix.startsWith('files/')) return reply(405, { error: 'uploads_disabled_scanner_unavailable' });
          const id = '[0-9a-fA-F-]{36}';
          const readable = new RegExp(`^orders(?:/${id})?$`).test(suffix);
          const writable = persona === 'family' ? suffix === 'orders' || new RegExp(`^orders/${id}/(?:acceptance|attempts)$`).test(suffix) : new RegExp(`^orders/${id}/(?:quotes|review)$`).test(suffix);
          if (req.method !== 'GET' && req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
          if (req.method === 'GET' && !readable) return reply(404, { error: 'not_found' });
          if (req.method === 'POST' && !writable) return reply(403, { error: 'fixture_persona_forbidden' });
          let body;
          if (req.method === 'POST') {
            if (req.headers.origin !== origin) return reply(403, { error: 'same_origin_required' });
            if (req.headers['content-type'] !== 'application/json' || req.headers['content-encoding']) return reply(415, { error: 'json_required' });
            const chunks = []; let length = 0;
            for await (const chunk of req) { length += chunk.length; if (length > 4096) return reply(413, { error: 'payment_request_too_large' }); chunks.push(chunk); }
            body = Buffer.concat(chunks);
          }
          const now = Math.floor(Date.now() / 1000);
          const token = await new SignJWT({ role: 'authenticated', aal: 'aal2', session_id: fixture.sessions[user] }).setProtectedHeader({ alg: 'ES256' }).setIssuer('http://127.0.0.1:3402/auth/v1').setAudience('authenticated').setSubject(user).setIssuedAt(now).setExpirationTime(now + 300).sign(keys.privateKey);
          const upstream = await fetch(appUrl + url.pathname, { method: req.method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body, redirect: 'error', signal: AbortSignal.timeout(10000) });
          return reply(upstream.status, await upstream.text());
        } catch { if (!res.headersSent) reply(503, { error: 'synthetic_demo_unavailable' }); else res.end(); }
      });
      servers.push(server);
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
      return origin;
    }
    const familyUrl = await personaServer('family', fixture.ids.guardianA);
    const reviewerUrl = await personaServer('reviewer', fixture.ids.owner);
    // Fixed fixture sessions expire in one hour; never leave a persistent service.
    expiry = setTimeout(() => { void close(); }, 45 * 60 * 1000);
    expiry.unref();
    return { familyUrl, reviewerUrl, appUrl, close, harness, fixture };
  } catch (error) { await close(); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const demo = await startDemo();
    console.log(`SYNTHETIC ONLY — no payment instructions or real accounts. Expires in 45 minutes.\nFamily: ${demo.familyUrl}\nReviewer: ${demo.reviewerUrl}\nStop with Ctrl+C; disposable data will be removed.`);
    let stopping = false;
    const stop = async () => { if (stopping) return; stopping = true; await demo.close(); process.exit(0); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
