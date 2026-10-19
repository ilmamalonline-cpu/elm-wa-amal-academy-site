import "server-only";
import { handlePhase2, privateHeaders } from "@/lib/phase2/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
type Context = { params: Promise<{ segments: string[] }> };
export async function GET(request: Request, context: Context) {
  return handlePhase2(request, (await context.params).segments);
}
export async function HEAD(request: Request, context: Context) {
  const response = await GET(new Request(request, { method: "GET" }), context);
  return new Response(null, { status: response.status, headers: response.headers });
}
export async function OPTIONS() {
  // No CORS allowance. This endpoint never accepts browser credentials/cookies.
  return new Response(null, { status: 204, headers: { ...privateHeaders, Allow: "GET, HEAD, OPTIONS" } });
}
export async function POST(request: Request, context: Context) {
  return handlePhase2(request, (await context.params).segments);
}
export async function PUT(request: Request, context: Context) {
  return handlePhase2(request, (await context.params).segments);
}
export async function PATCH(request: Request, context: Context) {
  return handlePhase2(request, (await context.params).segments);
}
export async function DELETE(request: Request, context: Context) {
  return handlePhase2(request, (await context.params).segments);
}
