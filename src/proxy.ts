import { NextRequest, NextResponse } from "next/server";
import { locales, pageKeys } from "@/content/site";

// Routing only: this is not authorization and never connects to a service.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const path = request.nextUrl.pathname;
  if (path === "/_not-found") {
    // A loopback rewrite can re-enter the proxy. Terminate it and preserve
    // the original locale header rather than recursively rewriting forever.
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  const parts = path.split("/").filter(Boolean);
  requestHeaders.set("x-site-locale", parts[0] === "en" ? "en" : "ar");

  if (path.startsWith("/api/phase2/") || path.startsWith("/api/manual-payments/") || path === "/api/academy-demo" || path === "/api/family" || path === "/auth/family/callback" || path.startsWith("/fonts/")) {
    // Identity verification and PostgreSQL RLS live in the server handler.
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const knownRoute = path === "/" || (
    (locales as readonly string[]).includes(parts[0]) &&
    (parts.length === 1 || (parts.length === 2 && (["workspace", "family"].includes(parts[1]) || (pageKeys as readonly string[]).includes(parts[1]))))
  );
  if (!knownRoute) {
    // Explicit status avoids a soft-404 when a loading boundary streams early.
    // Next normalizes request.url to localhost; keep the rewrite on the actual
    // loopback listener rather than treating it as an external proxy target.
    const destination = new URL("/_not-found", request.url);
    if (destination.hostname === "localhost") destination.hostname = "127.0.0.1";
    return NextResponse.rewrite(destination, {
      status: 404,
      request: { headers: requestHeaders },
    });
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
