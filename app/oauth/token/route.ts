import {
  consumeAuthorizationCode,
  getIssuer,
  getResourceUrl,
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
  const resource = String(form.get("resource") || getResourceUrl());

  if (!clientId) return json({ error: "invalid_client" }, 400);

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const redirectUri = String(form.get("redirect_uri") || "");
    const codeVerifier = String(form.get("code_verifier") || "");
    if (!code || !redirectUri || !codeVerifier) return json({ error: "invalid_request" }, 400);

    const payload = await consumeAuthorizationCode(code, { clientId, redirectUri, codeVerifier, resource });
    if (!payload) return json({ error: "invalid_grant" }, 400);

    const access = await issueAccessToken({ clientId, scope: payload.scope, resource: getResourceUrl() });
    const refresh = payload.scope.includes("offline_access")
      ? await issueRefreshToken({ clientId, scope: payload.scope, resource: getResourceUrl() })
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
    if (!payload || payload.client_id !== clientId || payload.aud !== getResourceUrl()) {
      return json({ error: "invalid_grant" }, 400);
    }

    const access = await issueAccessToken({ clientId, scope: payload.scope, resource: getResourceUrl() });
    const rotated = payload.scope.includes("offline_access")
      ? await issueRefreshToken({ clientId, scope: payload.scope, resource: getResourceUrl() })
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
