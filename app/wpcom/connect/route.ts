import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function config(name: string) {
  return process.env[name]?.trim() || "";
}

export async function GET() {
  const clientId = config("WORDPRESS_COM_CLIENT_ID");
  const site = config("WORDPRESS_COM_SITE");
  const redirectUri = config("WORDPRESS_COM_REDIRECT_URI");
  if (!clientId || !site || !redirectUri) {
    return new Response(
      "WordPress.com OAuth is not configured. Set WORDPRESS_COM_CLIENT_ID, WORDPRESS_COM_SITE, and WORDPRESS_COM_REDIRECT_URI in Vercel.",
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const state = randomBytes(32).toString("hex");
  const authorize = new URL("https://public-api.wordpress.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "read");
  authorize.searchParams.set("blog", site);
  authorize.searchParams.set("state", state);

  // Response.redirect() creates immutable headers in the Vercel Node runtime.
  // Construct the redirect response with headers up front so Set-Cookie can be set safely.
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `mrk_wpcom_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/wpcom; Max-Age=600`,
      "Cache-Control": "no-store",
    },
  });
}
