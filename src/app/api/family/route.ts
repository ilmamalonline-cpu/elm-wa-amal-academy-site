import { familyAdapter, familyBody, familySecurity, familyToken, familyMode, FamilyError, FAMILY_COOKIE, FAMILY_HEADERS } from "@/lib/academy/family-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// This limiter is intentionally only for a single-process, loopback review.
// It is NOT an internet-facing abuse-protection or production launch gate.
let authWindow = { started: 0, attempts: 0 };
function failure(err: unknown) {
  const error = err instanceof FamilyError ? err : new FamilyError("provider_unavailable", 503);
  const response = Response.json({ error: error.code }, { status: error.status, headers: FAMILY_HEADERS });
  if (error.status === 401) response.headers.append("Set-Cookie", `${FAMILY_COOKIE}=; Path=/api/family; HttpOnly; SameSite=Strict;${familyMode() === "owner-preview" ? " Secure;" : ""} Max-Age=0`);
  return response;
}
export async function GET(request: Request) {
  try {
    familySecurity(request);
    const data = await familyAdapter().read(familyToken(request));
    return Response.json(data, { headers: FAMILY_HEADERS });
  } catch (err) { return failure(err); }
}
export async function POST(request: Request) {
  try {
    familySecurity(request);
    const value = await familyBody(request);
    if (value.action === "login" || value.action === "signup") {
      if (Date.now() - authWindow.started > 60_000) authWindow = { started: Date.now(), attempts: 0 };
      if (++authWindow.attempts > 10) throw new FamilyError("try_later", 429);
    }
    const result = await familyAdapter().act(value, familyToken(request));
    const response = Response.json(result.data, { headers: FAMILY_HEADERS });
    if (result.token !== undefined) response.headers.append("Set-Cookie", `${FAMILY_COOKIE}=${result.token}; Path=/api/family; HttpOnly; SameSite=Strict;${familyMode() === "owner-preview" ? " Secure;" : ""} Max-Age=${result.maxAge}`);
    return response;
  } catch (err) { return failure(err); }
}
