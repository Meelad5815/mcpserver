import {
  consumeAuthorizationCode,
  getIssuer,
  getResourceUrl,
  getBloggerResourceUrl,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
} from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const requestedResource = String(form.get("resource") || "");
  const allowedResources = new Set([getResourceUrl(), getBloggerResourceUrl()]);
  if (requestedResource && !allowedResources.has(requestedResource)) return json({ error: "invalid_target" }, 400);

  if (!clientId) return json({ error: "invalid_client" }, 400);

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const codeVerifier = String(form.get("code_verifier") || "");
    if (!code || !redirectUri || !codeVerifier) return json({ error: "invalid_request" }, 400);

    const payload = await consumeAuthorizationCode(code, { clientId, redirectUri, codeVerifier, ...(requestedResource ? { resource: requestedResource } : {}) });
    if (!payload) return json({ error: "invalid_grant" }, 400);

    const tokenResource = payload.resource || requestedResource || getResourceUrl();
    if (!allowedResources.has(tokenResource) || (requestedResource && requestedResource !== tokenResource)) return json({ error: "invalid_target" }, 400);
    const access = await issueAccessToken({ clientId, scope: payload.scope, resource: tokenResource });
    const refresh = payload.scope.includes("offline_access")
      ? await issueRefreshToken({ clientId, scope: payload.scope, resource: tokenResource })
      : undefined;

    return json({
      ...access,
      token_type: "Bearer",
      scope: payload.scope,
      ...(refresh ? { refresh_token: refresh } : {}),
    });
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload || payload.client_id !== clientId || !allowedResources.has(payload.aud) || (requestedResource && requestedResource !== payload.aud)) {
      return json({ error: "invalid_grant" }, 400);
    }

    const access = await issueAccessToken({ clientId, scope: payload.scope, resource: payload.aud });
    const rotated = payload.scope.includes("offline_access")
      ? await issueRefreshToken({ clientId, scope: payload.scope, resource: payload.aud })
      : undefined;

    return json({
      ...access,
      token_type: "Bearer",
      scope: payload.scope,
      ...(rotated ? { refresh_token: rotated } : {}),
    });
  }

  return json({
    error: "unsupported_grant_type",
    error_description: "Supported grants: authorization_code and refresh_token.",
  }, 400);
}
