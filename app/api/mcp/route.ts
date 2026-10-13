import { randomUUID } from "node:crypto";
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
  let payload;
  try {
    payload = await verifyAccessToken(bearerToken);
  } catch (error) {
    console.error("[mcp-diagnostic]", JSON.stringify({
      event: "auth_verification_exception",
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    throw error;
  }
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

async function diagnosticHandler(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  console.info("[mcp-diagnostic]", JSON.stringify({
    event: "request_start",
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
  }));
  try {
    const response = await authHandler(request);
    if (response.status >= 500) {
      const contentType = response.headers.get("content-type") || "unknown";
      let bodyPreview = "";
      try {
        bodyPreview = (await response.clone().text()).slice(0, 500)
          .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED]")
          .replace(/(access_token|refresh_token|client_secret|password|authorization)\s*[:=]\s*[^\s,;"'<>]+/gi, "$1=[REDACTED]");
      } catch {
        bodyPreview = "[unavailable]";
      }
      console.error("[mcp-diagnostic]", JSON.stringify({
        event: "server_error_response",
        requestId,
        status: response.status,
        contentType,
        bodyPreview,
      }));
    }
    console.info("[mcp-diagnostic]", JSON.stringify({
      event: "request_end",
      requestId,
      method: request.method,
      status: response.status,
      durationMs: Date.now() - startedAt,
    }));
    const headers = new Headers(response.headers);
    headers.set("x-mrk-diagnostic-id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error("[mcp-diagnostic]", JSON.stringify({
      event: "request_exception",
      requestId,
      method: request.method,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
    }));
    throw error;
  }
}

export const GET = diagnosticHandler;
export const POST = diagnosticHandler;
export const DELETE = diagnosticHandler;
