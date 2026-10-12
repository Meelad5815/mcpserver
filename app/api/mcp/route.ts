import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerWordPressTools } from "@/lib/mcp-tools";
import { registerBloggerTools } from "@/lib/blogger-tools";
import { getResourceUrl, verifyAccessToken } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => {
    registerWordPressTools(server);
    registerBloggerTools(server);
  },
  {
    serverInfo: { name: "MRK Digital WordPress + Blogger MCP", version: "1.3.0" },
    instructions:
      "MRK MCP provides separate WordPress and Blogger tools. Blogger tools use the configured Google OAuth refresh token. Prefer draft-first editing. Publishing is consequential and requires explicit user approval for the exact post. Read-only tools should be tested before write tools.",
  },
);

const verifyToken = async (_req: Request, bearerToken?: string) => {
  if (!bearerToken) return undefined;
  const payload = await verifyAccessToken(bearerToken);
  if (!payload) return undefined;

  return {
    token: bearerToken,
    scopes: payload.scope.split(/\s+/).filter(Boolean),
    clientId: payload.client_id,
    extra: { userId: payload.sub, resource: getResourceUrl() },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export const GET = authHandler;
export const POST = authHandler;
export const DELETE = authHandler;
