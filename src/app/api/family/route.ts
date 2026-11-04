import { familyAdapter, familyBody, familySecurity, familyToken, familyMode, FamilyError, FAMILY_COOKIE, FAMILY_HEADERS } from "@/lib/academy/family-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Local review keeps its single-process limiter. Production uses a bounded
// per-instance IP window; it is not distributed abuse protection.
let authWindow = { started: 0, attempts: 0 };
const productionAuthWindows = new Map<string, { started: number; attempts: number }>();
function rateLimit(request: Request, action: string) {
  if (familyMode() === "production") {
    const now = Date.now();
    const recovery = action === "request-password-reset";
    const duration = recovery ? 60 * 60_000 : 60_000;
    const limit = recovery ? 5 : 10;
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
    const address = (request.headers.get("x-real-ip") || forwarded || "unknown").slice(0, 100);
    const key = `${address}:${recovery ? "recovery" : "auth"}`;
    const current = productionAuthWindows.get(key);
    if (current && now - current.started <= duration) {
      if (++current.attempts > limit) throw new FamilyError("try_later", 429);
    } else {
      if (productionAuthWindows.size >= 10000) {
        for (const [entry, window] of productionAuthWindows) if (now - window.started > 60 * 60_000) productionAuthWindows.delete(entry);
        if (productionAuthWindows.size >= 10000) throw new FamilyError("try_later", 429);
      }
      productionAuthWindows.set(key, { started: now, attempts: 1 });
    }
    return;
  }
  if (action === "login" || action === "signup") {
    if (Date.now() - authWindow.started > 60_000) authWindow = { started: Date.now(), attempts: 0 };
    if (++authWindow.attempts > 10) throw new FamilyError("try_later", 429);
  }
}
function failure(err: unknown) {
  const error = err instanceof FamilyError ? err : new FamilyError("provider_unavailable", 503);
  const response = Response.json({ error: error.code }, { status: error.status, headers: FAMILY_HEADERS });
  if (error.status === 401) response.headers.append("Set-Cookie", `${FAMILY_COOKIE}=; Path=/api/family; HttpOnly; SameSite=Strict;${familyMode() !== "local-review" ? " Secure;" : ""} Max-Age=0`);
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
    if (["login", "signup", "request-password-reset", "update-password"].includes(String(value.action))) rateLimit(request, String(value.action));
    const result = await familyAdapter().act(value, familyToken(request));
    const response = Response.json(result.data, { headers: FAMILY_HEADERS });
    if (result.token !== undefined) response.headers.append("Set-Cookie", `${FAMILY_COOKIE}=${result.token}; Path=/api/family; HttpOnly; SameSite=Strict;${familyMode() !== "local-review" ? " Secure;" : ""} Max-Age=${result.maxAge}`);
    return response;
  } catch (err) { return failure(err); }
}
