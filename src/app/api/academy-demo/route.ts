import { randomBytes } from "node:crypto";
import {
  mutate,
  readView,
  resetWorld,
  getSessionRole,
  setSessionRole,
} from "@/lib/academy/store";
import { DOMAIN_ERRORS } from "@/lib/academy/model";
import type { AcademyAction, AcademyActor, Role } from "@/lib/academy/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "academy_demo";
const MAX = 16_384;
const ROLES: readonly Role[] = ["admin", "teacher", "guardian", "student"];
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const error = (code: string, status = 400) =>
  Response.json({ error: code }, { status, headers });
function security(request: Request) {
  if (process.env.VERCEL || process.env.ACADEMY_DEMO !== "synthetic-only")
    return error("academy_demo_disabled", 503);
  const host = request.headers.get("host");
  let expected: URL;
  try {
    expected = new URL(`http://${host}`);
  } catch {
    return error("loopback_only", 403);
  }
  if (
    !host ||
    !["127.0.0.1", "localhost", "[::1]"].includes(expected.hostname) ||
    expected.host !== host ||
    expected.pathname !== "/" ||
    expected.username ||
    expected.password
  )
    return error("loopback_only", 403);
  // Next supplies forwarded headers internally even for direct loopback requests.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (
    (forwardedHost && forwardedHost !== host) ||
    (forwardedProto && forwardedProto !== "http")
  )
    return error("loopback_only", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== expected.origin)
    return error("same_origin_required", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && !["same-origin", "none"].includes(site))
    return error("same_origin_required", 403);
  if (new URL(request.url).search) return error("invalid_action_shape");
  if (
    request.method !== "GET" &&
    request.headers.get("x-academy-demo") !== "synthetic-only"
  )
    return error("csrf_header_required", 403);
  return null;
}
function session(request: Request) {
  const match = request.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)academy_demo=([^;]+)/);
  return match && /^[A-Za-z0-9_-]{32}$/.test(match[1]) ? match[1] : null;
}
function actor(role: Role): AcademyActor {
  const id =
    role === "admin"
      ? "admin-1"
      : role === "teacher"
        ? "teacher-1"
        : role === "guardian"
          ? "guardian-1"
          : "adult-1";
  return {
    role,
    userId: id,
    ...(role === "student" ? { studentId: "adult-1" } : {}),
  };
}
function response(view: unknown, key: string | null) {
  const result = Response.json({ view }, { headers });
  // HTTP is allowed solely on loopback. A hosted adapter must use Secure cookies.
  if (key)
    result.headers.append(
      "Set-Cookie",
      `${COOKIE}=${key}; Path=/; HttpOnly; SameSite=Strict`,
    );
  return result;
}
async function parse(request: Request) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("invalid_json");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX))
    throw new Error("payload_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid_json");
  let total = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX) {
      await reader.cancel();
      throw new Error("payload_too_large");
    }
    chunks.push(part.value);
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new Error("invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid_json");
  return value as Record<string, unknown>;
}
function failure(err: unknown) {
  const code = err instanceof Error ? err.message : "server_error";
  if (
    ["invalid_json", "invalid_role", "invalid_action_shape"].includes(code) ||
    DOMAIN_ERRORS.has(code)
  )
    return error(
      code,
      code === "forbidden" ? 403 : code === "not_authenticated" ? 401 : 400,
    );
  if (code === "payload_too_large") return error(code, 413);
  return error("local_storage_unavailable", 500);
}
export async function GET(request: Request) {
  const blocked = security(request);
  if (blocked) return blocked;
  try {
    const key = session(request);
    const role = key ? await getSessionRole(key) : null;
    return response(
      await readView(
        key ?? "anonymous",
        role && ROLES.includes(role as Role) ? actor(role as Role) : null,
      ),
      key,
    );
  } catch (err) {
    return failure(err);
  }
}
export async function POST(request: Request) {
  const blocked = security(request);
  if (blocked) return blocked;
  try {
    const value = await parse(request);
    let key = session(request);
    if (value.action === "enter") {
      if (Object.keys(value).sort().join(",") !== "action,role")
        return error("invalid_action_shape");
      if (typeof value.role !== "string" || !ROLES.includes(value.role as Role))
        return error("invalid_role");
      key ??= randomBytes(24).toString("base64url");
      await setSessionRole(key, value.role);
      return response(await readView(key, actor(value.role as Role)), key);
    }
    if (value.action === "logout" || value.action === "reset") {
      if (Object.keys(value).join(",") !== "action")
        return error("invalid_action_shape");
      if (value.action === "reset") {
        if (!key || !(await getSessionRole(key)))
          return error("not_authenticated", 401);
        await resetWorld(key);
      }
      if (key) await setSessionRole(key, null);
      return response(await readView(key ?? "anonymous", null), key);
    }
    if (!key) return error("not_authenticated", 401);
    const role = await getSessionRole(key);
    if (!role || !ROLES.includes(role as Role))
      return error("not_authenticated", 401);
    return response(
      await mutate(key, actor(role as Role), value as unknown as AcademyAction),
      key,
    );
  } catch (err) {
    return failure(err);
  }
}
