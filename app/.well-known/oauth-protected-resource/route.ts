import { getIssuer, getResourceUrl } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    resource: getResourceUrl(),
    authorization_servers: [getIssuer()],
    scopes_supported: ["read", "write", "offline_access"],
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
