export async function GET() {
  return Response.json({ service: "MRK GitHub MCP", status: "ok", endpoint: "/api/mcp", transport: "Streamable HTTP", authConfigured: Boolean(process.env.MCP_API_KEY), githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN) });
}
