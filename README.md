# MRK WordPress MCP

Secure MCP middleware for controlling a WordPress site through the WordPress REST API.

## Architecture

```
ChatGPT / MCP client
        ↓
Streamable HTTP
        ↓
/api/mcp
        ↓
MRK MCP tools
        ↓
WordPress REST API
        ↓
MRK WordPress
```

The repository is designed as the server-side bridge. WordPress credentials never need to be exposed to the browser or committed to Git.

## Production endpoint

- MCP endpoint: `/api/mcp`
- Health endpoint: `/api/health`
- Transport: Streamable HTTP
- Recommended deployment: Vercel with HTTPS

For the current MRK deployment, the MCP URL is:

`https://mcpserver-drab.vercel.app/api/mcp`

The endpoint is protected by `MCP_AUTH_TOKEN`. Keep that token separate from `DASHBOARD_PASSWORD`.

## Capabilities

### Read
- WordPress health/authenticated-user check
- Posts: list, search, get
- Pages: list, get
- Categories and tags
- Media listing and metadata
- Comments
- Post/page counts
- WordPress post types and taxonomies

### Write
- Create posts (draft-first)
- Update posts
- Publish posts (explicit intent)
- Trash posts (explicit intent)
- Create/update pages
- Create categories/tags
- Create comments
- Upload media
- Deterministic SEO package
- SEO-ready draft creation

Consequential operations are intentionally separated from normal read operations.

## Environment variables

Copy `.env.example` to `.env` for local development.

Required:

```env
WORDPRESS_URL=https://your-wordpress-site.com
WORDPRESS_USERNAME=your-integration-user
WORDPRESS_APP_PASSWORD=xxxx xxxx xxxx xxxx
MCP_AUTH_TOKEN=long-random-secret
DASHBOARD_PASSWORD=separate-dashboard-password
```

Never commit real values. `.gitignore` already excludes `.env`, `.env.local`, `.vercel`, and dependency/build directories.

## Local development

```bash
npm install
npm run dev
```

Then the local MCP endpoint is:

`http://localhost:3000/api/mcp`

The health endpoint is:

`http://localhost:3000/api/health`

## MCP Inspector

The current MCP Inspector supports stdio and Streamable HTTP. For a deployed MRK server, select **Streamable HTTP** and use:

`https://mcpserver-drab.vercel.app/api/mcp`

If the endpoint requires a bearer token, configure the Inspector request authorization/header according to the current Inspector UI. The Inspector is for testing/debugging; it is not itself the ChatGPT connection.

For a local server, the reference Inspector documentation supports:

```bash
npx @modelcontextprotocol/inspector
```

and then selecting Streamable HTTP in the web UI.

## ChatGPT connection

ChatGPT connects to remote MCP servers, not a local stdio process. OpenAI's current documentation requires a remotely reachable HTTPS MCP endpoint or a supported Secure MCP Tunnel for private/local servers.

For custom MCP apps, availability depends on the ChatGPT workspace/plan and developer-mode access. Full write/modify MCP support is currently rolling out to Business and Enterprise/Edu; Pro supports read/fetch MCP connections in developer mode.

When the account supports custom MCP apps:

1. Enable Developer mode.
2. Create a custom app.
3. Enter the HTTPS MCP endpoint.
4. Select the authentication mechanism.
5. Scan the tools.
6. Review permissions.
7. Test read tools first.
8. Test write tools only after reviewing confirmations and authorization.

## Security model

- WordPress Application Password is server-side only.
- MCP authentication token is separate from dashboard authentication.
- Dashboard cookie is HttpOnly, Secure and SameSite=Strict.
- Control API rejects cross-origin POST requests.
- New posts/pages default to draft.
- Publish and trash are separate actions.
- Do not expose WordPress credentials in client-side JavaScript.
- Do not put secrets in GitHub, `mcp.json`, browser storage, or chat messages.

## WordPress.com Free-site mode (read-only)

This mode is separate from the self-hosted WordPress Application Password mode above. It uses the WordPress.com REST API with a server-side OAuth access token and intentionally registers **read-only** MCP tools while the integration is being verified.

Register this exact redirect URI in the WordPress.com Developer Portal:

`https://mcpserver-drab.vercel.app/wpcom/callback`

Set these Vercel Production environment variables:

```env
WORDPRESS_PROVIDER=wordpress.com
WORDPRESS_COM_SITE=hafizmuhammadmeeladraza-dbacn.wordpress.com
WORDPRESS_COM_CLIENT_ID=your-wordpress-com-client-id
WORDPRESS_COM_CLIENT_SECRET=your-private-wordpress-com-client-secret
WORDPRESS_COM_REDIRECT_URI=https://mcpserver-drab.vercel.app/wpcom/callback
WORDPRESS_COM_ACCESS_TOKEN=your-private-wordpress-com-oauth-token
```

After the callback is deployed, open `https://mcpserver-drab.vercel.app/wpcom/connect` and authorize the WordPress.com account that owns the target site. The callback exchanges the authorization code and displays the access token once; copy it directly into the Vercel `WORDPRESS_COM_ACCESS_TOKEN` variable, save, and redeploy. Do not send the token in chat or commit it to GitHub. Keep this WordPress.com OAuth separate from the MCP OAuth used by ChatGPT.

After setting the variables, redeploy and check `/api/health`. The `configured.wordpress` value must be `true`. The WordPress.com mode currently exposes read-only site, posts, pages, categories, tags, and media tools; write actions remain disabled until API access is verified.

## WordPress setup

The WordPress site needs the MCP Adapter plugin for the separate Automattic remote-proxy architecture. This repository itself talks to the standard WordPress REST API, so it can also operate independently of the WordPress MCP Adapter.

For a direct Automattic remote-proxy setup, use:

`https://your-wordpress-site.com/wp-json/mcp/mcp-adapter-default-server`

with `@automattic/mcp-wordpress-remote`.

## Project structure

```
app/
  api/
    control/
      auth/
      route.ts
    health/
      route.ts
    mcp/
      route.ts
  control/
    page.tsx
  page.tsx

lib/
  mcp-tools.ts
  wordpress.ts

.env.example
mcp.json
next.config.ts
package.json
vercel.json
```

## Development policy

Build and test against a branch first. Keep production secrets in Vercel environment variables. Before enabling write actions in ChatGPT, verify every tool's authorization, input validation, error handling, and destructive-action confirmation.

## License

Private project code for MRK's deployment workflow.


## Blogger management capabilities

The combined MCP server exposes Blogger tools for:
- Read-only connectivity and site audit
- Listing, reading, searching, and SEO-auditing posts
- Creating and updating drafts, with a guard that refuses to update a live post
- Listing, reading, creating, updating, and publishing static-page drafts
- Listing comments and retrieving Blogger pageview statistics
- Reverting live posts/pages to drafts after explicit approval
- Draft cleanup tools that require the exact resource ID and exact current title and reject live resources

### Theme and site settings boundary

Blogger API v3 does not provide full template HTML/CSS editing through this MCP API. Theme work must use Blogger Admin's Theme editor with a backup-first workflow. The server must not claim a theme change was applied unless a supported editing path actually performed and verified it.

## Validation

Run `npm run typecheck` and `npm run build` before release. Test read-only tools against a preview deployment first. Validate Google OAuth and Blogger API connectivity before promoting a build to production.
