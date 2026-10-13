import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const wordpressCom = process.env.WORDPRESS_PROVIDER?.trim().toLowerCase() === "wordpress.com";
  return NextResponse.json({
    ok: true,
    service: "MRK Digital WordPress + Blogger MCP",
    version: "1.3.0",
    endpoint: "/api/mcp",
    transport: "streamable-http",
    provider: wordpressCom ? "wordpress.com" : "self-hosted-wordpress",
    configured: {
      wordpress: wordpressCom
        ? Boolean(process.env.WORDPRESS_COM_SITE && process.env.WORDPRESS_COM_ACCESS_TOKEN)
        : Boolean(process.env.WORDPRESS_URL && process.env.WORDPRESS_USERNAME && process.env.WORDPRESS_APP_PASSWORD),
      blogger: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
      oauth: Boolean(process.env.OAUTH_SIGNING_SECRET),
      mcpAuth: Boolean(process.env.MCP_AUTH_TOKEN),
      dashboardAuth: Boolean(process.env.DASHBOARD_PASSWORD),
    },
    timestamp: new Date().toISOString(),
  });
}
