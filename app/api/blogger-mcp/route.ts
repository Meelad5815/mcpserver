import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerBloggerTools } from "@/lib/blogger-tools";
import { getBloggerResourceUrl, verifyAccessToken } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    registerBloggerTools(server);
  },
  {
    serverInfo: { name: "MRK Digital Blogger MCP", version: "1.0.0" },
    verboseLogs: true,
    instructions:
      "This server exposes Blogger tools only for https://mrkdigitalservices.blogspot.com. Use blogger_health_check first. Read-only Blogger checks do not change posts. Draft creation, draft updates, and publishing are separate actions; publishing requires explicit user approval for the exact post.",
  },
);

const verifyToken = async (_request: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const payload = await verifyAccessToken(bearerToken, getBloggerResourceUrl());
  if (!payload) return undefined;
  return {
    token: bearerToken,
    scopes: payload.scope.split(/\s+/).filter(Boolean),
    clientId: payload.client_id,
    extra: { userId: payload.sub, resource: getBloggerResourceUrl() },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/blogger-mcp",
});

export const GET = authHandler;
export const POST = authHandler;
export const DELETE = authHandler;
