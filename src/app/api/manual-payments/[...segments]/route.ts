import "server-only";
import { handleManualPayment } from "@/lib/phase2/manual-payment";
import { privateHeaders } from "@/lib/phase2/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ segments: string[] }> };
async function handle(request: Request, context: Context) {
  return handleManualPayment(request, (await context.params).segments);
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export async function HEAD(request: Request, context: Context) {
  const result = await handle(new Request(request, { method: "GET" }), context);
  return new Response(null, { status: result.status, headers: result.headers });
}
export async function OPTIONS() {
  // No cookie authorization or CORS grants. All writes require a verified bearer.
  return new Response(null, { status: 204, headers: { ...privateHeaders, Allow: "GET, HEAD, POST, OPTIONS" } });
}
