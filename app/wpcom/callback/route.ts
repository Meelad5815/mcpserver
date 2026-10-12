import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function config(name: string) {
  return process.env[name]?.trim() || "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

function html(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><meta name="robots" content="noindex,nofollow"><style>body{font:16px system-ui,sans-serif;max-width:760px;margin:8vh auto;padding:24px;line-height:1.55}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:16px;border-radius:8px}code{overflow-wrap:anywhere}.note{color:#555}</style></head><body><h1>${escapeHtml(title)}</h1>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const oauthError = url.searchParams.get("error") || "";
  const cookieHeader = request.headers.get("cookie") || "";
  const savedState = cookieHeader.match(/(?:^|;\\s*)mrk_wpcom_oauth_state=([a-f0-9]+)/)?.[1] || "";
  const clearCookie = "mrk_wpcom_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/wpcom; Max-Age=0";

  if (oauthError) {
    const response = html("WordPress.com authorization was not completed", `<p>WordPress.com returned: <code>${escapeHtml(oauthError)}</code>.</p><p>Return to the MRK MCP setup and try again.</p>`, 400);
    response.headers.append("Set-Cookie", clearCookie);
    return response;
  }

  const expected = Buffer.from(savedState);
  const received = Buffer.from(state);
  if (!savedState || !state || expected.length !== received.length || !timingSafeEqual(expected, received)) {
    const response = html("Authorization state check failed", "<p>The security state did not match or has expired. Please restart from the MRK connect link.</p>", 400);
    response.headers.append("Set-Cookie", clearCookie);
    return response;
  }
  if (!code) {
    const response = html("Missing authorization code", "<p>WordPress.com did not return an authorization code. Please restart the connection.</p>", 400);
    response.headers.append("Set-Cookie", clearCookie);
    return response;
  }

  const clientId = config("WORDPRESS_COM_CLIENT_ID");
  const clientSecret = config("WORDPRESS_COM_CLIENT_SECRET");
  const redirectUri = config("WORDPRESS_COM_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    const response = html("Server configuration incomplete", "<p>Set WORDPRESS_COM_CLIENT_ID, WORDPRESS_COM_CLIENT_SECRET, and WORDPRESS_COM_REDIRECT_URI in Vercel, then redeploy.</p>", 503);
    response.headers.append("Set-Cookie", clearCookie);
    return response;
  }

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    grant_type: "authorization_code",
  });
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch("https://public-api.wordpress.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
      cache: "no-store",
    });
  } catch {
    const response = html("Token exchange failed", "<p>The WordPress.com token endpoint could not be reached. Try again later.</p>", 502);
    response.headers.append("Set-Cookie", clearCookie);
    return response;
  }

  const raw = await tokenResponse.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!tokenResponse.ok || typeof data.access_token !== "string" || !data.access_token) {
    const detail = typeof data.error_description === "string" ? data.error_description : (typeof data.error === "string" ? data.error : "WordPress.com did not return an access token.");
    const response = html("WordPress.com token exchange failed", `<p>${escapeHtml(detail)}</p><p>Check the Client ID, Client Secret, and exact registered Redirect URL in Vercel and WordPress.com.</p>`, 502);
    response.headers.append("Set-Cookie", clearCookie);
    return response;
  }

  const token = escapeHtml(data.access_token);
  const response = html("WordPress.com connected", `<p>Authorization succeeded. Copy this access token into the Vercel Environment Variable <code>WORDPRESS_COM_ACCESS_TOKEN</code>. This page does not save the token automatically.</p><pre>${token}</pre><p class="note">Keep this token private. Do not send it in chat or commit it to GitHub. After adding it in Vercel, redeploy the production project and open <code>/api/health</code> to verify configuration.</p><p>For safety, close this page after copying the token.</p>`);
  response.headers.append("Set-Cookie", clearCookie);
  return response;
}
