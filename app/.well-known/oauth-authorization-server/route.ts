import { getIssuer, getResourceUrl } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const issuer = getIssuer();
  return Response.json({
    issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: issuer + "/oauth/authorize",
    token_endpoint: issuer + "/oauth/token",
    client_id_metadata_document_supported: true,
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["read", "write", "offline_access"],
    resource: getResourceUrl(),
  }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
