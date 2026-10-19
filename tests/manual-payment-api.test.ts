import { test, before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
// @ts-expect-error The disposable test harness is intentionally plain JavaScript.
import { startHarness } from "./manual-payment-harness.mjs";
import { handleManualPayment } from "../src/lib/phase2/manual-payment";
import { closeSecurityPool } from "../src/lib/phase2/security";

type Harness = Awaited<ReturnType<typeof startHarness>>;
let h: Harness;
let fixture: Awaited<ReturnType<Harness["seed"]>>;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const issuer = "http://127.0.0.1:3402/auth/v1";

before(async () => {
  h = await startHarness();
  keys = await generateKeyPair("ES256", { extractable: true });
  process.env.PHASE2_LOCAL_SECURITY = "synthetic-only";
  process.env.PHASE2_DATABASE_URL = h.databaseUrl;
  process.env.PHASE2_JWT_PUBLIC_KEY = await exportSPKI(keys.publicKey);
  process.env.PHASE2_MANUAL_PAYMENT = "synthetic-only";
});
beforeEach(async () => {
  process.env.PHASE2_LOCAL_SECURITY = "synthetic-only";
  process.env.PHASE2_DATABASE_URL = h.databaseUrl;
  process.env.PHASE2_MANUAL_PAYMENT = "synthetic-only";
  fixture = await h.seed();
});
after(async () => { await closeSecurityPool(); await h.close(); });

async function token(user: string, aal: "aal1" | "aal2" = "aal2", seconds = 300, extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "authenticated", aal, session_id: fixture.sessions[user], ...extra })
    .setProtectedHeader({ alg: "ES256" }).setIssuer(issuer).setAudience("authenticated")
    .setSubject(user).setIssuedAt(now).setExpirationTime(now + seconds).sign(keys.privateKey);
}
async function call(user: string | undefined, method: string, segments: string[], body?: unknown, options: { aal?: "aal1" | "aal2"; seconds?: number; headers?: Record<string, string>; url?: string } = {}) {
  const headers: Record<string, string> = { ...(user ? { Authorization: `Bearer ${await token(user, options.aal, options.seconds)}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...options.headers };
  return handleManualPayment(new Request(options.url ?? `http://127.0.0.1/api/manual-payments/${segments.join("/")}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), segments);
}
async function json(response: Response): Promise<{ error?: string; data: { activation: unknown; attempts: { status: string }[] } }> { return response.json(); }
async function expectCode(response: Response, status: number, code?: string) {
  assert.equal(response.status, status, await response.clone().text());
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  if (code) assert.equal((await json(response)).error, code);
}
const id = () => randomUUID();

 test("requester order, quote, acceptance, attempt and reviewer verification form one safe flow", async () => {
  const order = id(), quote = id(), attempt = id();
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], { id: order, studentId: fixture.ids.childA, packageId: "quran" }), 200);
  await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "quotes"], { id: quote, amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet" }), 200);
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders", order, "acceptance"], { quoteId: quote, amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet", policyVersion: "manual-payment-local-v1" }), 200);
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders", order, "attempts"], { id: attempt, quoteId: quote, amountMinor: 36000, currency: "EGP", reference: "SYNTHETIC-WALLET-1", previousAttemptId: null }), 200);
  const before = await call(fixture.ids.guardianA, "GET", ["orders", order]); assert.equal(before.status, 200); assert.equal((await json(before)).data.activation, null);
  await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "review"], { attemptId: attempt, decision: "verified", reason: "matched synthetic evidence", actualMinor: 36000, actualCurrency: "EGP", verificationSource: "SYNTHETIC-WALLET-1", capacityConfirmed: true }), 200);
  const afterReview = await call(fixture.ids.guardianA, "GET", ["orders", order]); const data = (await json(afterReview)).data;
  assert.equal(afterReview.status, 200); assert.equal(data.attempts[0].status, "verified"); assert.ok(data.activation);
 });

test("review is idempotent but a changed final decision conflicts", async () => {
  const order = id(), quote = id(), attempt = id();
  await call(fixture.ids.guardianA, "POST", ["orders"], { id: order, studentId: fixture.ids.childA, packageId: "quran" });
  await call(fixture.ids.owner, "POST", ["orders", order, "quotes"], { id: quote, amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet" });
  await call(fixture.ids.guardianA, "POST", ["orders", order, "acceptance"], { quoteId: quote, amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet", policyVersion: "manual-payment-local-v1" });
  await call(fixture.ids.guardianA, "POST", ["orders", order, "attempts"], { id: attempt, quoteId: quote, amountMinor: 36000, currency: "EGP", reference: "SYNTHETIC-REVIEW-1", previousAttemptId: null });
  const body = { attemptId: attempt, decision: "verified", reason: "ok", actualMinor: 36000, actualCurrency: "EGP", verificationSource: "SYNTHETIC-REVIEW-1", capacityConfirmed: true };
  await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "review"], body), 200);
  await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "review"], body), 200);
  await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "review"], { ...body, reason: "changed" }), 409, "payment_conflict");
});

test("ordinary admin, aal1 reviewer and forged JWT metadata cannot review", async () => {
  const response = await call(fixture.ids.reviewer, "POST", ["orders", id(), "review"], { attemptId: id(), decision: "rejected", reason: "no", actualMinor: null, actualCurrency: null, verificationSource: null, capacityConfirmed: false });
  await expectCode(response, 403, "payment_unavailable_or_forbidden");
  const aal1 = await call(fixture.ids.owner, "GET", ["orders"], undefined, { aal: "aal1" }); assert.equal(aal1.status, 200);
  const review = await call(fixture.ids.owner, "POST", ["orders", id(), "review"], { attemptId: id(), decision: "rejected", reason: "no", actualMinor: null, actualCurrency: null, verificationSource: null, capacityConfirmed: false }, { aal: "aal1" });
  await expectCode(review, 403, "payment_unavailable_or_forbidden");
  const forged = await call(fixture.ids.reviewer, "GET", ["orders"], undefined, { headers: { "x-user-id": fixture.ids.owner, "x-role": "admin" } }); assert.equal(forged.status, 200);
});

test("co-guardian cannot read or mutate an order privately requested by guardian A", async () => {
  const order = id();
  await call(fixture.ids.guardianA, "POST", ["orders"], { id: order, studentId: fixture.ids.childA, packageId: "quran" });
  await expectCode(await call(fixture.ids.guardianB, "GET", ["orders", order]), 403, "payment_unavailable_or_forbidden");
  await expectCode(await call(fixture.ids.guardianB, "POST", ["orders", order, "acceptance"], { quoteId: id(), amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet", policyVersion: "manual-payment-local-v1" }), 403, "payment_unavailable_or_forbidden");
});

test("unknown packages, extra fields, fractions, negatives, overflow and non-synthetic references are rejected", async () => {
  const order = id();
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], { id: order, studentId: fixture.ids.childA, packageId: "unknown" }), 422, "payment_transition_not_allowed");
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], { id: order, studentId: fixture.ids.childA, packageId: "quran", extra: true }), 400, "invalid_payment_request");
  const quote = id(); await call(fixture.ids.guardianA, "POST", ["orders"], { id: order, studentId: fixture.ids.childA, packageId: "quran" });
  for (const amountMinor of [1.5, 0, -1, 1_000_000_001, Number.MAX_SAFE_INTEGER + 1]) await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "quotes"], { id: quote, amountMinor, currency: "EGP", method: "synthetic-egyptian-wallet" }), 400, "invalid_payment_request");
  await expectCode(await call(fixture.ids.owner, "POST", ["orders", order, "quotes"], { id: quote, amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet" }), 200);
  await call(fixture.ids.guardianA, "POST", ["orders", order, "acceptance"], { quoteId: quote, amountMinor: 36000, currency: "EGP", method: "synthetic-egyptian-wallet", policyVersion: "manual-payment-local-v1" });
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders", order, "attempts"], { id: id(), quoteId: quote, amountMinor: 36000, currency: "EGP", reference: "BANK-REAL", previousAttemptId: null }), 400, "invalid_payment_request");
});

test("client supplied identifiers are idempotent only for the original request and tuple", async () => {
  const order = id();
  const body = { id: order, studentId: fixture.ids.childA, packageId: "quran" };
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], body), 200);
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], body), 200);
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], { ...body, packageId: "quran-noor" }), 409, "payment_conflict");
  await expectCode(await call(fixture.ids.guardianB, "POST", ["orders"], body), 409, "payment_conflict");
});

test("authentication and path validation do not leak database details", async () => {
  await expectCode(await call(undefined, "GET", ["orders"]), 401, "authentication_required");
  await expectCode(await call(fixture.ids.guardianA, "GET", ["not-orders"]), 404, "not_found");
  await expectCode(await call(fixture.ids.guardianA, "GET", ["orders", "not-a-uuid"]), 400, "invalid_payment_request");
  const malformed = await call(fixture.ids.guardianA, "GET", ["orders"], undefined, { headers: { authorization: "Bearer malformed" } });
  const leaked = await malformed.clone().text();
  await expectCode(malformed, 401, "authentication_required");
  assert.doesNotMatch(leaked, /postgres|SELECT|phase2_test|jwt/i);
});

test("expired and revoked sessions are denied, while disabling the feature fails closed", async () => {
  await expectCode(await call(fixture.ids.guardianA, "GET", ["orders"], undefined, { seconds: -1 }), 401, "authentication_required");
  await h.admin.query("UPDATE auth.sessions SET revoked_at=now() WHERE id=$1", [fixture.sessions[fixture.ids.guardianA]]);
  await expectCode(await call(fixture.ids.guardianA, "GET", ["orders"]), 401, "authentication_required");
  process.env.PHASE2_MANUAL_PAYMENT = "disabled";
  await expectCode(await call(fixture.ids.owner, "GET", ["orders"]), 503, "manual_payment_disabled");
});

test("old phase2 handler remains read-only for non-GET requests", async () => {
  const { handlePhase2 } = await import("../src/lib/phase2/security");
  const bearer = await token(fixture.ids.guardianA);
  const response = await handlePhase2(new Request("http://127.0.0.1/api/phase2/me", { method: "POST", headers: { Authorization: `Bearer ${bearer}` } }), ["me"]);
  assert.equal(response.status, 405); assert.equal((await json(response)).error, "read_only_api");
});

test("body size, content type, methods, query strings and unexpected routes are rejected", async () => {
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], { id: id(), studentId: fixture.ids.childA, packageId: "quran" }, { headers: { "content-type": "text/plain" } }), 415, "json_required");
  await expectCode(await call(fixture.ids.guardianA, "POST", ["orders"], { id: id(), studentId: fixture.ids.childA, packageId: "quran" }, { headers: { "content-length": "4097" } }), 413, "payment_request_too_large");
  await expectCode(await call(fixture.ids.guardianA, "PUT", ["orders"]), 405, "method_not_allowed");
  await expectCode(await call(fixture.ids.guardianA, "GET", ["orders"], undefined, { url: "http://127.0.0.1/api/manual-payments/orders?x=1" }), 400, "unexpected_query");
  await expectCode(await call(fixture.ids.guardianA, "POST", ["files"], {}), 405, "uploads_disabled_scanner_unavailable");
});
