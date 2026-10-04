const encoder = new TextEncoder();

function b64url(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function key() {
  const secret = process.env.OAUTH_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("OAUTH_SIGNING_SECRET must be at least 32 characters");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(payload: Record<string, unknown>) {
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await key(), encoder.encode(body));
  return body + "." + b64url(new Uint8Array(signature));
}

async function verifyPayload<T extends Record<string, unknown>>(token: string, expectedType: string): Promise<T | null> {
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(),
      fromB64url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
    if (payload.typ !== expectedType || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function issueAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
  resource: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    typ: "code",
    sub: "mrk786",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    scope: input.scope,
    resource: input.resource,
    iat: now,
    exp: now + 300,
    jti: crypto.randomUUID(),
  });
}

export async function consumeAuthorizationCode(
  code: string,
  input: { clientId: string; redirectUri: string; codeVerifier: string; resource?: string },
) {
  const payload = await verifyPayload<{
    typ: string; client_id: string; redirect_uri: string; code_challenge: string;
    code_challenge_method: string; scope: string; resource?: string; exp: number;
  }>(code, "code");
  if (!payload || payload.client_id !== input.clientId || payload.redirect_uri !== input.redirectUri) return null;
  if (input.resource && payload.resource && payload.resource !== input.resource) return null;

  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input.codeVerifier));
  const challenge = b64url(new Uint8Array(digest));
  if (challenge !== payload.code_challenge || payload.code_challenge_method !== "S256") return null;
  return payload;
}

export async function issueAccessToken(input: { clientId: string; scope: string; resource: string }) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600;
  return {
    access_token: await signPayload({
      typ: "access",
      sub: "mrk786",
      client_id: input.clientId,
      scope: input.scope,
      aud: input.resource,
      iat: now,
      exp: now + expiresIn,
    }),
    expires_in: expiresIn,
  };
}

export async function issueRefreshToken(input: { clientId: string; scope: string; resource: string }) {
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    typ: "refresh",
    sub: "mrk786",
    client_id: input.clientId,
    scope: input.scope,
    aud: input.resource,
    iat: now,
    exp: now + 60 * 60 * 24 * 30,
    jti: crypto.randomUUID(),
  });
}

export async function verifyAccessToken(token: string) {
  const payload = await verifyPayload<{
    typ: string; sub: string; client_id: string; scope: string; aud: string; exp: number;
  }>(token, "access");
  if (!payload) return null;
  const resource = getResourceUrl();
  if (payload.aud !== resource) return null;
  return payload;
}

export async function verifyRefreshToken(token: string) {
  return verifyPayload<{
    typ: string; sub: string; client_id: string; scope: string; aud: string; exp: number;
  }>(token, "refresh");
}

export function getIssuer() {
  return (process.env.OAUTH_ISSUER || "https://mcpserver-drab.vercel.app").replace(/\/$/, "");
}

export function getResourceUrl() {
  return (process.env.MCP_RESOURCE_URL || getIssuer() + "/api/mcp").replace(/\/$/, "");
}

export function oauthUsername() {
  return process.env.OAUTH_USERNAME || process.env.WORDPRESS_USERNAME || "mrk786";
}

export function oauthPassword() {
  return process.env.OAUTH_PASSWORD || process.env.DASHBOARD_PASSWORD || "";
}

export function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  }[char] || char));
}
