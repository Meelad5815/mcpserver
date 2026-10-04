import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerWordPressTools } from "@/lib/mcp-tools";
import { getResourceUrl, verifyAccessToken } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(
  (server) => registerWordPressTools(server),
  {
    serverInfo: { name: "MRK WordPress MCP", version: "1.2.0" },
    instructions:
      "MRK WordPress MCP controls the configured WordPress site through its REST API. Prefer drafts. Publishing and deletion are consequential actions and require explicit intent.",
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
