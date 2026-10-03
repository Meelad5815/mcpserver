import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "MRK WordPress MCP",
    version: "1.2.0",
    endpoint: "/api/mcp",
    transport: "streamable-http",
    configured: {
      wordpress: Boolean(process.env.WORDPRESS_URL && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APP_PASSWORD),
      mcpAuth: Boolean(process.env.MCP_AUTH_TOKEN),
      dashboardAuth: Boolean(process.env.DASHBOARD_PASSWORD),
    },
    timestamp: new Date().toISOString(),
  });
}
