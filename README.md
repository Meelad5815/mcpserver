# MRK WordPress MCP

MRK middleware that exposes WordPress REST API operations to an MCP client.

Architecture:
MCP client -> /api/mcp -> MRK MCP server -> WordPress REST API

Capabilities:
- Health and authenticated-user checks
- Posts: list, search, create draft, update, publish, trash
- Pages: list, create draft, update
- Categories and tags
- Media listing, metadata and base64 upload
- Comments
- Deterministic SEO package and SEO-ready drafts

Environment variables:
WORDPRESS_URL
WORDPRESS_USERNAME
WORDPRESS_APP_PASSWORD
MCP_AUTH_TOKEN
DASHBOARD_PASSWORD

Never commit real credentials. Add them as server-side environment variables in the deployment platform.

WordPress setup:
Use a dedicated integration user and an Application Password. Give that user only the role/permissions required by the enabled operations.

Local:
npm install
npm run dev

Production:
Deploy the repository to Vercel and add all five environment variables. Keep `DASHBOARD_PASSWORD` separate from `MCP_AUTH_TOKEN`; the control panel no longer falls back to the MCP token.

Safety:
New posts/pages default to draft. Publishing and trashing are separate tools.
The SEO helper is local/deterministic; it is not an external AI model and does not provide proprietary Yoast/Rank Math scoring.
Media base64 uploads can be constrained by serverless request-body limits.

MCP endpoint:
/api/mcp
