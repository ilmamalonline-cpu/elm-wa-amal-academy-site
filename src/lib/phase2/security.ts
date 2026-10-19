import { importSPKI, jwtVerify } from "jose";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

// Both adapters are deliberately local-only. Provider mode uses native GoTrue
// and Storage processes, never a hosted project or a production configuration.
const fixtureIssuer = "http://127.0.0.1:3402/auth/v1";
const providerIssuer = "http://127.0.0.1:55441";
const providerStorageOrigin = "http://127.0.0.1:55442";
const maxPrivateFileBytes = 5 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class SecurityError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export type Identity = { userId: string; sessionId: string; aal: "aal1" | "aal2" };
export type SecurityConfig = { databaseUrl: string; publicKey: string; issuer: string; provider: boolean; storageRoot?: string; storageOrigin?: string; storageCredential?: string };
let pool: Pool | undefined;
let poolUrl: string | undefined;

export function configuration(): SecurityConfig {
  if (process.env.VERCEL) throw new SecurityError(503, "local_security_disabled");
  const provider = process.env.PHASE2_LOCAL_SECURITY === "synthetic-provider-only";
  if (!provider && process.env.PHASE2_LOCAL_SECURITY !== "synthetic-only") throw new SecurityError(503, "local_security_disabled");
  const databaseUrl = process.env.PHASE2_DATABASE_URL;
  const publicKey = process.env.PHASE2_JWT_PUBLIC_KEY;
  if (!databaseUrl || !publicKey) throw new SecurityError(503, "local_security_unconfigured");
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new SecurityError(503, "local_security_unconfigured"); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== "127.0.0.1" || url.pathname !== (provider ? "/phase2_provider_test" : "/phase2_test") || url.username !== "phase2_api" || url.password || (provider && url.port !== "55432") || url.search || url.hash) {
    throw new SecurityError(503, "local_database_required");
  }
  const storageCredential = process.env.PHASE2_PROVIDER_STORAGE_CREDENTIAL;
  if (provider && (process.env.PHASE2_PROVIDER_STORAGE_ORIGIN !== providerStorageOrigin || !storageCredential || storageCredential.length > 8192 || /[\r\n]/.test(storageCredential))) throw new SecurityError(503, "local_storage_required");
  return { databaseUrl, publicKey, provider, issuer: provider ? providerIssuer : fixtureIssuer, storageRoot: process.env.PHASE2_PRIVATE_ROOT, storageOrigin: provider ? providerStorageOrigin : undefined, storageCredential: provider ? storageCredential : undefined };
}

export function validId(value: string): boolean { return uuidPattern.test(value); }

export async function verifyIdentity(request: Request, config: SecurityConfig): Promise<Identity> {
  const origin = new URL(request.url);
  if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new SecurityError(403, "local_request_required");
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8192) throw new SecurityError(401, "authentication_required");
  try {
    const key = await importSPKI(config.publicKey, "ES256");
    const { payload, protectedHeader } = await jwtVerify(authorization.slice(7), key, {
      algorithms: ["ES256"], issuer: config.issuer, audience: "authenticated", requiredClaims: ["sub", "exp", "iat", "session_id"], clockTolerance: 0,
    });
    if (protectedHeader.jku || protectedHeader.jwk || protectedHeader.x5u ||
        !payload.sub || !validId(payload.sub) || typeof payload.session_id !== "string" || !validId(payload.session_id) ||
        payload.role !== "authenticated" || !payload.iat || !payload.exp || payload.iat > Math.floor(Date.now() / 1000) || payload.exp - payload.iat > 900 ||
        (payload.aal !== "aal1" && payload.aal !== "aal2")) throw new Error("invalid claims");
    // Roles and capabilities in JWT metadata are NEVER used for authorization.
    return { userId: payload.sub, sessionId: payload.session_id, aal: payload.aal };
  } catch { throw new SecurityError(401, "authentication_required"); }
}

export async function withIdentity<T>(request: Request, operation: (client: PoolClient, identity: Identity, config: SecurityConfig) => Promise<T>): Promise<T> {
  const config = configuration();
  const identity = await verifyIdentity(request, config);
  if (!pool || poolUrl !== config.databaseUrl) {
    if (pool) await pool.end();
    pool = new Pool({ connectionString: config.databaseUrl, max: 4, connectionTimeoutMillis: 3000, idleTimeoutMillis: 5000, statement_timeout: 5000, application_name: "phase2-synthetic-api" });
    poolUrl = config.databaseUrl;
    // Never log driver errors or queries containing personal data or tokens.
    pool.on("error", () => {});
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE phase2_authenticated");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.aal', $2, true), set_config('request.jwt.claim.session_id', $3, true)", [identity.userId, identity.aal, identity.sessionId]);
    const active = await client.query<{ active: boolean }>("SELECT public.session_is_active($1::uuid) AS active", [identity.sessionId]);
    if (!active.rows[0]?.active) throw new SecurityError(401, "authentication_required");
    const result = await operation(client, identity, config);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function closeSecurityPool(): Promise<void> { if (pool) await pool.end(); pool = undefined; poolUrl = undefined; }

export const privateHeaders: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Vary": "Authorization",
  "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer",
};
function json(data: unknown, status = 200): Response { return Response.json(data, { status, headers: privateHeaders }); }
function unavailable(): never { throw new SecurityError(404, "not_found"); }
async function single<T extends QueryResultRow>(client: PoolClient, sql: string, id: string): Promise<T> {
  if (!validId(id)) unavailable();
  const result = await client.query<T>(sql, [id]);
  if (!result.rows[0]) unavailable();
  return result.rows[0];
}

export type PrivateFileRecord = { id: string; object_path: string; mime_type: string; size_bytes: string; sha256: string | null } & QueryResultRow;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function readPrivateFile(file: PrivateFileRecord, config: SecurityConfig, fetchImpl: FetchLike = fetch): Promise<Response> {
  if (!validId(file.id)) throw new SecurityError(503, "private_storage_unavailable");
  const extension = file.mime_type === "application/pdf" ? "pdf" : file.mime_type === "image/png" ? "png" : file.mime_type === "image/jpeg" ? "jpg" : "";
  if (!extension || file.object_path !== `${file.id}.${extension}`) throw new SecurityError(503, "private_storage_unavailable");
  const expected = Number(file.size_bytes);
  if (!/^(?:0|[1-9]\d*)$/.test(file.size_bytes) || !Number.isSafeInteger(expected) || expected < 1 || expected > maxPrivateFileBytes) throw new SecurityError(503, "private_storage_unavailable");
  if (!file.sha256 || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new SecurityError(503, "private_storage_unavailable");
  let content: Buffer;
  if (config.provider) {
    if (config.storageOrigin !== providerStorageOrigin || !config.storageCredential || /[\r\n]/.test(config.storageCredential)) throw new SecurityError(503, "private_storage_unavailable");
    const response = await fetchImpl(`${providerStorageOrigin}/object/authenticated/phase2-private/${file.id}.${extension}`, { headers: { Authorization: `Bearer ${config.storageCredential}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
    const contentLength = response.headers.get("content-length");
    if (!response.ok || !response.body || !contentLength || !/^(?:0|[1-9]\d*)$/.test(contentLength) || Number(contentLength) !== expected) {
      await response.body?.cancel().catch(() => {});
      throw new SecurityError(503, "private_storage_unavailable");
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || total > expected - value.byteLength) throw new SecurityError(503, "private_storage_unavailable");
        total += value.byteLength;
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      if (error instanceof SecurityError) throw error;
      throw new SecurityError(503, "private_storage_unavailable");
    } finally { await reader.cancel().catch(() => {}); }
    if (total !== expected) throw new SecurityError(503, "private_storage_unavailable");
    content = Buffer.concat(chunks, total);
  } else {
    if (!config.storageRoot) throw new SecurityError(503, "private_storage_unavailable");
    const root = await realpath(config.storageRoot);
    const projectRoot = await realpath(process.cwd());
    if (root === projectRoot || root.startsWith(projectRoot + path.sep)) throw new SecurityError(503, "private_storage_unavailable");
    const handle = await open(path.join(root, file.object_path), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size <= 0 || info.size > maxPrivateFileBytes || info.size !== expected) throw new SecurityError(503, "private_storage_unavailable");
      const bounded = Buffer.alloc(info.size + 1);
      let total = 0;
      while (total < bounded.length) {
        const { bytesRead } = await handle.read(bounded, total, bounded.length - total, null);
        if (!bytesRead) break;
        total += bytesRead;
      }
      if (total !== info.size) throw new SecurityError(503, "private_storage_unavailable");
      content = bounded.subarray(0, total);
    } finally { await handle.close(); }
  }
  if (createHash("sha256").update(content).digest("hex") !== file.sha256) throw new SecurityError(503, "private_storage_unavailable");
  const signatureValid = extension === "pdf" ? content.subarray(0, 5).toString() === "%PDF-" : extension === "png" ? content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : content.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (!signatureValid) throw new SecurityError(503, "private_storage_unavailable");
  return new Response(new Uint8Array(content), { headers: { ...privateHeaders, "Content-Type": file.mime_type, "Content-Disposition": `attachment; filename="${file.id}.${extension}"`, "Content-Security-Policy": "sandbox; default-src 'none'", "Content-Length": String(content.length) } });
}

async function privateFile(client: PoolClient, config: SecurityConfig, id: string): Promise<Response> {
  const file = await single<PrivateFileRecord>(client, "SELECT id, object_path, mime_type, size_bytes, sha256 FROM public.private_files WHERE id = $1", id);
  return readPrivateFile(file, config);
}

export async function handlePhase2(request: Request, segments: string[]): Promise<Response> {
  try {
    // Default disabled, including uploads and every unimplemented command.
    configuration();
    if (request.method !== "GET") {
      return Response.json({ error: segments[0] === "files" ? "uploads_disabled_scanner_unavailable" : "read_only_api" }, { status: 405, headers: { ...privateHeaders, Allow: "GET, HEAD, OPTIONS" } });
    }
    if (new URL(request.url).search) throw new SecurityError(400, "unexpected_query");
    return await withIdentity(request, async (client, identity, config) => {
      if (segments.length === 1 && segments[0] === "me") {
        const profile = await single(client, "SELECT auth_user_id, display_name, preferred_locale, timezone, status FROM public.profiles WHERE auth_user_id = $1", identity.userId);
        const roles = await client.query("SELECT role FROM public.user_roles WHERE auth_user_id = $1 AND revoked_at IS NULL", [identity.userId]);
        return json({ profile, roles: roles.rows.map(row => row.role), mode: "synthetic-only" });
      }
      if (segments.length === 1 && segments[0] === "students") return json({ data: (await client.query("SELECT id, full_name, age_band, preferred_locale, timezone, status FROM public.students ORDER BY id LIMIT 100")).rows });
      if (segments.length === 2 && segments[0] === "students") return json({ data: await single(client, "SELECT id, full_name, age_band, preferred_locale, timezone, status FROM public.students WHERE id = $1", segments[1]) });
      if (segments.length === 2 && segments[0] === "reports") return json({ data: await single(client, "SELECT id, student_id, body, status FROM public.published_reports WHERE id = $1", segments[1]) });
      if (segments.length === 2 && segments[0] === "notes") return json({ data: await single(client, "SELECT id, student_id, teacher_user_id, body FROM public.teacher_notes WHERE id = $1", segments[1]) });
      if (segments.length === 2 && segments[0] === "payments") return json({ data: await single(client, "SELECT id, student_id, requested_by_user_id, reference FROM public.payment_records WHERE id = $1", segments[1]) });
      if (segments.length === 2 && segments[0] === "files") return privateFile(client, config, segments[1]);
      if (segments.length === 1 && segments[0] === "guardian-links") return json({ data: (await client.query("SELECT id, guardian_user_id, student_id, verification_status, revoked_at FROM public.guardian_links ORDER BY id LIMIT 100")).rows });
      if (segments.length === 1 && segments[0] === "assignments") return json({ data: (await client.query("SELECT id, teacher_user_id, student_id, status FROM public.teacher_assignments ORDER BY id LIMIT 100")).rows });
      if (segments.length === 1 && segments[0] === "audit") return json({ data: (await client.query("SELECT id, actor_user_id, action, target_id, reason, created_at FROM public.audit_events ORDER BY created_at DESC LIMIT 100")).rows });
      unavailable();
    });
  } catch (error) {
    if (error instanceof SecurityError) return json({ error: error.code }, error.status);
    const code = (error as { code?: string }).code;
    if (code === "42501") return json({ error: "forbidden" }, 403);
    // Do not leak object existence, file paths, SQL text, connection URLs, or JWTs.
    return json({ error: "local_security_unavailable" }, 503);
  }
}
