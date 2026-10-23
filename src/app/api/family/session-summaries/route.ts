import { familyAdapter, familySecurity, familyToken, familyMode, FamilyError, FAMILY_COOKIE, FAMILY_HEADERS } from "@/lib/academy/family-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function failure(err: unknown) {
  const error = err instanceof FamilyError ? err : new FamilyError("provider_unavailable", 503);
  const response = Response.json({ error: error.code }, { status: error.status, headers: FAMILY_HEADERS });
  if (error.status === 401) response.headers.append("Set-Cookie", `${FAMILY_COOKIE}=; Path=/api/family; HttpOnly; SameSite=Strict;${familyMode() === "owner-preview" ? " Secure;" : ""} Max-Age=0`);
  return response;
}
export async function GET(request: Request) {
  try {
    familySecurity(request);
    const url = new URL(request.url);
    if (request.headers.get("x-family-registration") !== "local-review") throw new FamilyError("csrf_required", 403);
    const childValues = url.searchParams.getAll("child_id");
    const offsetValues = url.searchParams.getAll("offset");
    const childId = childValues[0] ?? "";
    const rawOffset = offsetValues[0] ?? "";
    if (childValues.length !== 1 || offsetValues.length !== 1 || !UUID.test(childId) || !/^0$|^[1-9]\d*$/.test(rawOffset) || String(Number(rawOffset)) !== rawOffset || Number(rawOffset) > 10000 || url.searchParams.size !== 2) throw new FamilyError("invalid_request");
    const token = familyToken(request);
    if (!token) throw new FamilyError("sign_in_required", 401);
    if (familyMode() !== "owner-preview") throw new FamilyError("registration_disabled", 503);
    const adapter = familyAdapter();
    const authenticated = await adapter.authenticate(token);
    const data = await adapter.sessionSummaries(childId, authenticated.id, token, Number(rawOffset));
    return Response.json(data, { headers: FAMILY_HEADERS });
  } catch (err) { return failure(err); }
}
