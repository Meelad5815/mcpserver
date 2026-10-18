# MRK GitHub MCP Server

A separate Next.js Streamable HTTP MCP server for GitHub repository operations. This lives in the `github-mcp/` directory so the existing WordPress/Blogger MCP service remains unchanged.

## Tools

- `list_repositories`
- `get_file_contents`
- `create_or_update_file`
- `create_branch`
- `create_issue`
- `create_repository`

## Deploy to Vercel

1. Import this GitHub repository into Vercel.
2. Set **Root Directory** to `github-mcp`.
3. Add these Environment Variables for Production (and Preview if needed):
   - `MCP_API_KEY`: a long random secret used to protect the MCP endpoint.
   - `GITHUB_TOKEN`: a GitHub fine-grained personal access token. Prefer only the repository/account permissions you need (metadata read, contents read/write, issues read/write, and repository administration only if you intend to create repositories). Never commit a real token.
4. Deploy. Health check: `/api/health`. MCP endpoint: `/api/mcp`.

## Authentication

Send `Authorization: Bearer <MCP_API_KEY>` to the MCP endpoint. GitHub credentials stay server-side in Vercel environment variables. Do not put either secret in source code or public client settings.

## Gemini compatibility note

Some Gemini Custom MCP integrations require OAuth/Dynamic Client Registration and may not accept a simple bearer-secret MCP endpoint. If the Gemini UI does not offer a supported way to send the bearer token, do not expose this endpoint without authentication; use an OAuth-compatible deployment or a client that supports bearer headers. Custom apps availability can also be region/account limited.
