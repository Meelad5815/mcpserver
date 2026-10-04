import {
  getIssuer,
  getResourceUrl,
  htmlEscape,
  issueAuthorizationCode,
  oauthPassword,
  oauthUsername,
} from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ClientMetadata = {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
};

async function loadClient(clientId: string): Promise<ClientMetadata | null> {
  if (!clientId.startsWith("https://")) return null;
  try {
    const response = await fetch(clientId, {
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const metadata = await response.json() as ClientMetadata;
    if (metadata.client_id !== clientId || !Array.isArray(metadata.redirect_uris) || metadata.redirect_uris.length === 0) {
      return null;
    }
    return metadata;
  } catch {
    return null;
  }
}

function errorRedirect(redirectUri: string, error: string, description: string, state?: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", getIssuer());
  return Response.redirect(url.toString(), 302);
}

async function issueRedirect(params: URLSearchParams) {
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const codeChallenge = params.get("code_challenge") || "";
  const method = params.get("code_challenge_method") || "";
  const state = params.get("state") || "";
  const resource = params.get("resource") || getResourceUrl();
  const requestedScope = params.get("scope") || "read write offline_access";

  if (params.get("response_type") !== "code" || method !== "S256" || !codeChallenge) {
    return new Response("invalid_request: authorization code + PKCE S256 is required", { status: 400 });
  }

  const client = await loadClient(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return new Response("invalid_client or redirect_uri", { status: 400 });
  }

  const allowed = new Set(["read", "write", "offline_access"]);
  const scope = requestedScope.split(/\\s+/).filter(Boolean).filter((item) => allowed.has(item)).join(" ");
  if (!scope.includes("read")) {
    return errorRedirect(redirectUri, "invalid_scope", "The read scope is required.", state);
  }

  const code = await issueAuthorizationCode({
    clientId,
    redirectUri,
    codeChallenge,
    scope,
    resource,
  });

  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  if (state) callback.searchParams.set("state", state);
  callback.searchParams.set("iss", getIssuer());
  return Response.redirect(callback.toString(), 302);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const clientId = params.get("client_id") || "";
  const redirectUri = params.get("redirect_uri") || "";
  const state = params.get("state") || "";

  const passwordConfigured = !!oauthPassword();
  if (!passwordConfigured) {
    return new Response("OAuth is not configured: set OAUTH_PASSWORD or DASHBOARD_PASSWORD.", { status: 503 });
  }

  const client = await loadClient(clientId);
  if (!client || !redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return new Response("Invalid OAuth client or redirect_uri.", { status: 400 });
  }

  const formFields = new URLSearchParams(params);
  const escapedAction = htmlEscape(url.pathname + "?" + formFields.toString());

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>MRK WordPress MCP — Authorize</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:10vh auto;padding:24px}form{display:grid;gap:12px}input{padding:12px;font-size:16px}button{padding:12px;font-size:16px;font-weight:600}small{color:#666}</style>
</head><body>
<h1>MRK WordPress MCP</h1>
<p><strong>${htmlEscape(client.client_name || "ChatGPT")}</strong> is requesting access to your WordPress MCP server.</p>
<p>Requested permissions: <code>${htmlEscape(params.get("scope") || "read")}</code></p>
<form method="post" action="${escapedAction}">
<input type="hidden" name="oauth_params" value="${htmlEscape(params.toString())}">
<label>Username<input name="username" autocomplete="username" value="${htmlEscape(oauthUsername())}"></label>
<label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Authorize</button>
<small>This is the private MRK MCP authorization server.</small>
</form></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const rawParams = String(form.get("oauth_params") || "");
  const params = new URLSearchParams(rawParams);
  if (username !== oauthUsername() || password !== oauthPassword()) {
    return new Response("Invalid username or password.", { status: 401 });
  }
  return issueRedirect(params);
}
