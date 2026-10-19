import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readPrivateFile, configuration, handlePhase2, SecurityError, type PrivateFileRecord, type SecurityConfig } from "../src/lib/phase2/security";

const id = "11111111-1111-4111-8111-111111111111";
const pdf = Buffer.from("%PDF-synthetic-offline");
const baseFile: PrivateFileRecord = {
  id,
  object_path: `${id}.pdf`,
  mime_type: "application/pdf",
  size_bytes: String(pdf.length),
  sha256: createHash("sha256").update(pdf).digest("hex"),
};
const config: SecurityConfig = {
  databaseUrl: "postgresql://phase2_api@127.0.0.1:55432/phase2_provider_test",
  publicKey: "unused",
  issuer: "http://127.0.0.1:55441",
  provider: true,
  storageOrigin: "http://127.0.0.1:55442",
  storageCredential: "synthetic-service-key",
};

function response(body: Uint8Array | null, length: string, status = 200): Response {
  return new Response(body ? Buffer.from(body) : null, { status, headers: { "content-length": length } });
}
function fetchReturning(result: Response, seen: { input?: RequestInfo | URL; init?: RequestInit } = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.input = input;
    seen.init = init;
    return result;
  };
}
async function rejectsUnavailable(file: PrivateFileRecord, result: Response, configOverride: SecurityConfig = config) {
  await assert.rejects(() => readPrivateFile(file, configOverride, fetchReturning(result)), (error: unknown) => error instanceof SecurityError && error.code === "private_storage_unavailable");
}

test("native read uses the exact local origin, UUID object path, credential, and redirect error mode", async () => {
  const seen: { input?: RequestInfo | URL; init?: RequestInit } = {};
  const output = await readPrivateFile(baseFile, config, fetchReturning(response(pdf, String(pdf.length)), seen));
  assert.equal(await output.text(), pdf.toString());
  assert.equal(seen.input, `http://127.0.0.1:55442/object/authenticated/phase2-private/${id}.pdf`);
  assert.equal((seen.init?.headers as Record<string, string>).Authorization, "Bearer synthetic-service-key");
  assert.equal(seen.init?.redirect, "error");
  assert.equal(seen.init?.cache, "no-store");

  await rejectsUnavailable(baseFile, response(null, String(pdf.length), 302));
  await rejectsUnavailable(baseFile, response(pdf, String(pdf.length)), { ...config, storageOrigin: "http://localhost:55442" });
});

test("native read rejects malformed, missing, duplicate, or mismatched content lengths", async () => {
  for (const length of ["", " 21", "021", "21, 21", "not-a-number", String(pdf.length + 1)]) {
    await rejectsUnavailable(baseFile, response(pdf, length));
  }
  await rejectsUnavailable({ ...baseFile, size_bytes: "not-an-integer" }, response(pdf, String(pdf.length)));
});

test("native read bounds streams and rejects truncation or stream errors", async () => {
  await rejectsUnavailable(baseFile, response(Buffer.concat([pdf, Buffer.from("overflow")]), String(pdf.length)));
  await rejectsUnavailable(baseFile, response(pdf.subarray(0, pdf.length - 1), String(pdf.length)));
  const errorStream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(pdf); controller.error(new Error("synthetic stream failure")); },
  });
  await rejectsUnavailable(baseFile, new Response(errorStream, { headers: { "content-length": String(pdf.length) } }));
});

test("native read rejects bad hashes, signatures, and non-canonical object paths", async () => {
  await rejectsUnavailable({ ...baseFile, sha256: "0".repeat(64) }, response(pdf, String(pdf.length)));
  const badSignature = Buffer.from("not-a-pdf");
  await rejectsUnavailable({ ...baseFile, size_bytes: String(badSignature.length), sha256: createHash("sha256").update(badSignature).digest("hex") }, response(badSignature, String(badSignature.length)));
  for (const object_path of [`${id.slice(0, -1)}0.pdf`, `${id.replace("-", "")}.pdf`, `../${id}.pdf`, `${id}.png`]) {
    await rejectsUnavailable({ ...baseFile, object_path }, response(pdf, String(pdf.length)));
  }
});

test("native read rejects unsafe credential values and oversized lengths before provider access", async () => {
  const shouldNotFetch = async () => { throw new Error("provider fetch must not run"); };
  await assert.rejects(() => readPrivateFile(baseFile, { ...config, storageCredential: "bad\ncredential" }, shouldNotFetch), /private_storage_unavailable/);
  await assert.rejects(() => readPrivateFile({ ...baseFile, size_bytes: "9007199254740992" }, config, shouldNotFetch), /private_storage_unavailable/);
});


test("default-disabled API and native configuration guards fail before any database access", async () => {
  const names = ["PHASE2_LOCAL_SECURITY", "PHASE2_DATABASE_URL", "PHASE2_JWT_PUBLIC_KEY", "PHASE2_PROVIDER_STORAGE_ORIGIN", "PHASE2_PROVIDER_STORAGE_CREDENTIAL"];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.PHASE2_LOCAL_SECURITY = "disabled";
    const response = await handlePhase2(new Request("http://127.0.0.1:3403/api/phase2/me"), ["me"]);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "local_security_disabled" });
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    process.env.PHASE2_LOCAL_SECURITY = "synthetic-provider-only";
    process.env.PHASE2_JWT_PUBLIC_KEY = "synthetic-unused-public-key";
    process.env.PHASE2_PROVIDER_STORAGE_ORIGIN = config.storageOrigin;
    process.env.PHASE2_PROVIDER_STORAGE_CREDENTIAL = config.storageCredential;
    process.env.PHASE2_DATABASE_URL = config.databaseUrl;
    assert.equal(configuration().provider, true);
    for (const databaseUrl of [
      config.databaseUrl.replace("127.0.0.1", "localhost"),
      config.databaseUrl.replace("55432", "5432"),
      config.databaseUrl.replace("phase2_api@", "phase2_api:secret@"),
      config.databaseUrl.replace("phase2_provider_test", "production"),
      config.databaseUrl + "?options=unsafe",
    ]) {
      process.env.PHASE2_DATABASE_URL = databaseUrl;
      assert.throws(configuration, /local_database_required/);
    }
    process.env.PHASE2_DATABASE_URL = config.databaseUrl;
    process.env.PHASE2_PROVIDER_STORAGE_ORIGIN = "https://storage.example.invalid";
    assert.throws(configuration, /local_storage_required/);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
