# Connect MRK Digital Blogger to the existing MCP server

This integration is additive: it registers Blogger tools beside the existing WordPress tools. It does not replace WordPress credentials or tools.

Target blog: https://mrkdigitalservices.blogspot.com/
Existing MCP endpoint: https://mcpserver-drab.vercel.app/api/mcp

## 1. Google Cloud setup

1. Open https://console.cloud.google.com/ and select or create a project.
2. In APIs & Services → Library, enable **Blogger API v3**.
3. Configure the OAuth consent screen. Use the Google account that owns or has editor access to the target Blogger blog. If the app is in Testing mode, add that account as a test user.
4. Create an OAuth Client ID of type **Desktop app** if using the OAuth Playground method below, or a Web application if using your own OAuth callback.
5. Do not publish client secrets, refresh tokens, or access tokens in GitHub, browser code, issue comments, or chat messages.

## 2. Generate a refresh token

Use Google's OAuth 2.0 Playground at https://developers.google.com/oauthplayground/ .

For a test setup using your own OAuth credentials:
1. Open the settings gear in OAuth Playground.
2. Enable **Use your own OAuth credentials** and enter the Google OAuth Client ID and Client Secret.
3. In Step 1, enter this scope: https://www.googleapis.com/auth/blogger
4. Authorize with the Google account that manages the target blog.
5. Exchange the authorization code in Step 2.
6. Copy the refresh token from the token response. Treat it as a password.
7. If Google does not return a refresh token, revoke the test grant in your Google Account's third-party access settings and repeat consent with offline access enabled. Never paste the token into chat.

Google can restrict refresh tokens for apps in Testing mode; if tokens expire after seven days, set up the OAuth consent screen and publishing status according to Google's current policies before production use.

## 3. Set Vercel environment variables

Open the existing mcpserver Vercel project → Settings → Environment Variables. Add the following to Preview first:

- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REFRESH_TOKEN

Optional:
- BLOGGER_BLOG_ID — the blog ID from Blogger API. Leave blank initially; the adapter attempts to find the blog URL in the authorized account.

Keep WordPress and MCP OAuth environment variables unchanged. Do not replace WORDPRESS_URL, WORDPRESS_USERNAME, or WORDPRESS_APP_PASSWORD.

Redeploy the Preview deployment after adding variables. Add the same Blogger variables to Production only after Preview tests pass, then redeploy Production.

## 4. Read-only validation first

After the feature branch has been deployed to Preview and connected in an MCP client, call:
1. blogger_health_check
2. blogger_list_posts with maxResults: 5
3. blogger_search_posts with a distinctive title phrase
4. blogger_get_post using a returned post ID

Check that the blog URL and returned content belong to the expected blog. If automatic blog discovery fails, set BLOGGER_BLOG_ID from the id field returned by the Blogger API.

## 5. Draft/write validation

Only after read-only tests pass:
1. Call blogger_create_draft with a clearly labeled test title, short content, and optional labels.
2. Call blogger_get_post on the returned ID and verify title/content/labels.
3. Call blogger_update_draft with a small change and verify it remains a draft.
4. Do not call blogger_publish_post until the user explicitly approves publishing that exact post.

The publish tool is intentionally separate from create/update. This code does not delete Blogger posts.

## Current tool coverage

- Read: blog health/details, list posts, get post, search first page of up to 100 posts.
- Write: create draft, update post as draft, publish an exact post after explicit approval.
- Not yet implemented: Blogger pages CRUD, deletion, bulk operations, SEO settings/template edits, Search Console metrics, and automatic meta-description/template injection.

## Security and operations

- OAuth tokens stay in Vercel server environment variables.
- Use Preview before Production and retain the existing WordPress integration.
- Rotate the Google client secret and revoke the refresh token if either is exposed.
- MCP endpoint authentication remains separate from Google Blogger authorization.
