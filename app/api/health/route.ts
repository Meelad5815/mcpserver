import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "MRK Digital WordPress + Blogger MCP",
    version: "1.3.0",
    endpoint: "/api/mcp",
    transport: "streamable-http",
    configured: {
      wordpress: Boolean(process.env.WORDPRESS_URL && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APP_PASSWORD),
      blogger: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
      oauth: Boolean(process.env.OAUTH_SIGNING_SECRET),
      dashboardAuth: Boolean(process.env.DASHBOARD_PASSWORD || process.env.OAUTH_PASSWORD),
    },
    timestamp: new Date().toISOString(),
  });
}
