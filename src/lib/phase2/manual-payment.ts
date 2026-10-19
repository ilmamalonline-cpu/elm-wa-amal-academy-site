import type { PoolClient } from "pg";
import { SecurityError, configuration, privateHeaders, validId, withIdentity } from "./security";

const maxBody = 4096;
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: privateHeaders });
}
function invalid(): never { throw new SecurityError(400, "invalid_payment_request"); }
function uuid(value: unknown): string {
  if (typeof value !== "string" || !validId(value)) invalid();
  return value;
}
function text(value: unknown, max = 100): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || value !== value.trim() || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) invalid();
  return value;
}
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) invalid();
  return value;
}
function currency(value: unknown): string {
  if (value !== "SAR" && value !== "EGP") invalid();
  return value;
}
function method(value: unknown): string {
  if (value !== "synthetic-egyptian-wallet" && value !== "synthetic-manual-agreement") invalid();
  return value;
}
function reference(value: unknown): string {
  const result = text(value).toUpperCase();
  if (!/^SYNTHETIC-[A-Z0-9-]{1,80}$/.test(result)) invalid();
  return result;
}
function keys(body: Record<string, unknown>, fields: string[]): void {
  if (Object.keys(body).length !== fields.length || fields.some(field => !Object.hasOwn(body, field))) invalid();
}
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || request.headers.has("content-encoding")) throw new SecurityError(415, "json_required");
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBody)) throw new SecurityError(413, "payment_request_too_large");
  if (!request.body) invalid();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBody) throw new SecurityError(413, "payment_request_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let result: unknown;
  try { result = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { invalid(); }
  if (!result || typeof result !== "object" || Array.isArray(result)) invalid();
  return result as Record<string, unknown>;
}
async function command(client: PoolClient, name: string, placeholders: string, values: unknown[]): Promise<Response> {
  // name/placeholders are fixed internal literals, never request values.
  const result = await client.query(`SELECT manual_payment.${name}(${placeholders}) AS id`, values);
  return json({ mode: "synthetic-only", id: result.rows[0].id });
}
export async function handleManualPayment(request: Request, segments: string[]): Promise<Response> {
  try {
    if (process.env.PHASE2_MANUAL_PAYMENT !== "synthetic-only") throw new SecurityError(503, "manual_payment_disabled");
    configuration(); // Retains the existing exact loopback DB/native-service boundaries.
    if (new URL(request.url).search) throw new SecurityError(400, "unexpected_query");
    if (!["GET", "POST"].includes(request.method)) return json({ error: "method_not_allowed" }, 405);
    return await withIdentity(request, async client => {
      if (segments[0] === "files") throw new SecurityError(405, "uploads_disabled_scanner_unavailable");
      if (segments[0] !== "orders") throw new SecurityError(404, "not_found");
      if (request.method === "GET") {
        if (segments.length === 1) {
          const result = await client.query("SELECT manual_payment.order_status(id) AS data FROM manual_payment.orders ORDER BY created_at DESC,id LIMIT 100");
          return json({ mode: "synthetic-only", data: result.rows.map(row => row.data) });
        }
        if (segments.length === 2) {
          const result = await client.query("SELECT manual_payment.order_status($1::uuid) AS data", [uuid(segments[1])]);
          return json({ data: result.rows[0].data });
        }
        throw new SecurityError(404, "not_found");
      }
      const body = await bodyOf(request);
      if (segments.length === 1) {
        keys(body, ["id", "studentId", "packageId"]);
        return command(client, "create_order", "$1::uuid,$2::uuid,$3::text", [uuid(body.id), uuid(body.studentId), text(body.packageId)]);
      }
      if (segments.length !== 3) throw new SecurityError(404, "not_found");
      const order = uuid(segments[1]);
      switch (segments[2]) {
        case "quotes":
          keys(body, ["id", "amountMinor", "currency", "method"]);
          return command(client, "offer_quote", "$1::uuid,$2::uuid,$3::bigint,$4::text,$5::text", [order, uuid(body.id), amount(body.amountMinor), currency(body.currency), method(body.method)]);
        case "acceptance":
          keys(body, ["quoteId", "amountMinor", "currency", "method", "policyVersion"]);
          return command(client, "accept_quote", "$1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text", [order, uuid(body.quoteId), amount(body.amountMinor), currency(body.currency), method(body.method), text(body.policyVersion)]);
        case "attempts":
          keys(body, ["id", "quoteId", "amountMinor", "currency", "reference", "previousAttemptId"]);
          return command(client, "submit_attempt", "$1::uuid,$2::uuid,$3::uuid,$4::bigint,$5::text,$6::text,$7::uuid", [order, uuid(body.id), uuid(body.quoteId), amount(body.amountMinor), currency(body.currency), reference(body.reference), body.previousAttemptId === null ? null : uuid(body.previousAttemptId)]);
        case "review": {
          keys(body, ["attemptId", "decision", "reason", "actualMinor", "actualCurrency", "verificationSource", "capacityConfirmed"]);
          if (body.decision !== "verified" && body.decision !== "rejected") invalid();
          if (typeof body.capacityConfirmed !== "boolean") invalid();
          const reason = text(body.reason, 500);
          const actual = body.actualMinor === null ? null : amount(body.actualMinor);
          const actualCurrency = body.actualCurrency === null ? null : currency(body.actualCurrency);
          const source = body.verificationSource === null ? null : reference(body.verificationSource);
          return command(client, "review_attempt", "$1::uuid,$2::uuid,$3::text,$4::text,$5::bigint,$6::text,$7::text,$8::boolean", [order, uuid(body.attemptId), body.decision, reason, actual, actualCurrency, source, body.capacityConfirmed]);
        }
        default: throw new SecurityError(404, "not_found");
      }
    });
  } catch (error) {
    if (error instanceof SecurityError) return json({ error: error.code }, error.status);
    const code = (error as { code?: string }).code;
    if (code === "42501") return json({ error: "payment_unavailable_or_forbidden" }, 403);
    if (code === "23505") return json({ error: "payment_conflict" }, 409);
    if (["22023", "23502", "23503", "23514"].includes(code ?? "")) return json({ error: "payment_transition_not_allowed" }, 422);
    return json({ error: "local_payment_unavailable" }, 503);
  }
}
