import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as blogger from "./blogger";

const output = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

function register(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: any,
  action: (args: any) => Promise<unknown>,
) {
  // This MCP server version expects a raw Zod shape, not a ZodObject instance.
  // Keep the complete Zod schema for runtime validation (including refinements/defaults).
  const toolInputSchema = inputSchema?.shape ?? inputSchema;
  server.registerTool(name, { description, inputSchema: toolInputSchema }, async (args: any) => {
    try {
      const parsed = inputSchema?.safeParse ? inputSchema.safeParse(args) : { success: true as const, data: args };
      if (!parsed.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: parsed.error.message }, null, 2) }],
          isError: true,
        };
      }
      return output({ ok: true, result: await action(parsed.data) });
    } catch (error) {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        }],
        isError: true,
      };
    }
  });
}

const postId = z.string().trim().min(1).max(128);
const labels = z.array(z.string().trim().min(1).max(200)).max(30).optional();

function seoAudit(post: { id?: string; title?: string; content?: string; url?: string; labels?: string[] }) {
  const html = post.content || "";
  const text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  const title = (post.title || "").trim();
  const words = text ? text.split(/\s+/).length : 0;
  const headings = Array.from(html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi))
    .map((match) => ({ level: Number(match[1]), text: match[2].replace(/<[^>]+>/g, "").trim() }));
  const images = Array.from(html.matchAll(/<img\b([^>]*)>/gi)).map((match) => match[1]);
  const missingAlt = images.filter((attrs) => !/\balt\s*=\s*(['"]).*?\1/i.test(attrs));
  const links = Array.from(html.matchAll(/<a\b[^>]*href\s*=\s*(['"])(.*?)\1[^>]*>/gi)).map((match) => match[2]);
  const internalLinks = links.filter((href) => href.startsWith("/") || href.includes("mrkdigitalservices.blogspot.com"));
  const externalLinks = links.length - internalLinks.length;
  const descriptionSuggestion = text.slice(0, 160).replace(/\s+\S*$/, "").trim();
  const findings: Array<{ priority: "high" | "medium" | "low"; issue: string; recommendation: string }> = [];

  if (title.length < 30 || title.length > 65) findings.push({
    priority: "medium",
    issue: `Title is ${title.length} characters long.`,
    recommendation: "Consider a clear, specific title around 30–65 characters; this is a guideline, not a ranking guarantee.",
  });
  if (words < 300) findings.push({
    priority: "medium",
    issue: `Only ${words} words were detected in the post body.`,
    recommendation: "Check whether the topic is fully answered. Do not add filler merely to reach a word count.",
  });
  if (headings.length === 0) findings.push({
    priority: "medium",
    issue: "No H1–H6 headings were detected in the HTML.",
    recommendation: "Organize long content with descriptive H2/H3 headings where appropriate.",
  });
  if (images.length > 0 && missingAlt.length > 0) findings.push({
    priority: "medium",
    issue: `${missingAlt.length} of ${images.length} images appear to lack an alt attribute.`,
    recommendation: "Add concise, descriptive alt text to informative images; use empty alt text for purely decorative images.",
  });
  if (!post.labels?.length) findings.push({
    priority: "low",
    issue: "No Blogger labels were returned for this post.",
    recommendation: "Add a small set of relevant labels to support blog organization.",
  });
  if (links.length === 0) findings.push({
    priority: "low",
    issue: "No links were detected in the post body.",
    recommendation: "Add useful internal links and cite trustworthy external resources when they help readers.",
  });

  return {
    postId: post.id,
    title,
    url: post.url,
    metrics: {
      titleCharacters: title.length,
      approximateWordCount: words,
      headingCount: headings.length,
      headings,
      imageCount: images.length,
      imagesMissingAlt: missingAlt.length,
      linkCount: links.length,
      internalLinks: internalLinks.length,
      externalLinks,
      labels: post.labels || [],
    },
    descriptionSuggestion,
    findings,
    note: "Advisory content audit only. It does not change Blogger metadata, theme settings, or publish the post. Validate suggested changes before applying them.",
  };
}

export function registerBloggerTools(server: McpServer) {
  register(
    server,
    "blogger_health_check",
    "Read-only check of Google OAuth and access to the configured MRK Digital Blogger blog.",
    z.object({}),
    async () => {
      const blog = await blogger.getBlog();
      return { connected: true, blog };
    },
  );

  register(
    server,
    "blogger_list_posts",
    "Read Blogger posts. Use status=draft to inspect drafts, status=published for published posts, or omit status for the API default. Read-only.",
    z.object({
      maxResults: z.number().int().min(1).max(100).optional().default(20),
      pageToken: z.string().optional(),
      status: z.enum(["draft", "published"]).optional(),
      orderBy: z.enum(["published", "updated"]).optional(),
    }),
    async (args) => blogger.listPosts(args),
  );

  register(
    server,
    "blogger_get_post",
    "Read one Blogger post by its numeric/string post ID. Read-only.",
    z.object({ postId }),
    async ({ postId }) => blogger.getPost(postId),
  );

  register(
    server,
    "blogger_search_posts",
    "Search titles, body text, and labels in the first page of up to 100 Blogger posts. Read-only; request pagination separately for larger blogs.",
    z.object({
      search: z.string().trim().min(1).max(300),
      maxResults: z.number().int().min(1).max(100).optional().default(100),
    }),
    async ({ search, maxResults }) => blogger.searchPosts(search, maxResults),
  );

  register(
    server,
    "blogger_seo_audit",
    "Run a read-only on-page content SEO audit for one Blogger post. Reports title length, approximate word count, headings, image alt attributes, links, labels, and a meta-description suggestion. It does not change the post.",
    z.object({ postId }),
    async ({ postId }) => seoAudit(await blogger.getPost(postId)),
  );

  register(
    server,
    "blogger_create_draft",
    "Create a Blogger post as a draft. This tool never publishes. Review the returned post before publishing.",
    z.object({
      title: z.string().trim().min(1).max(300),
      content: z.string().min(1).max(100000),
      labels,
    }),
    async (args) => blogger.createDraft(args),
  );

  register(
    server,
    "blogger_update_draft",
    "Update an existing Blogger post while explicitly keeping it as a draft. Confirm the post ID and content before using.",
    z.object({
      postId,
      title: z.string().trim().min(1).max(300).optional(),
      content: z.string().min(1).max(100000).optional(),
      labels,
    }).refine((args) => args.title !== undefined || args.content !== undefined || args.labels !== undefined, {
      message: "Provide at least one field to update.",
    }),
    async (args) => blogger.updateDraft(args),
  );

  register(
    server,
    "blogger_publish_post",
    "Publish a Blogger post only after the user has explicitly approved publishing that exact post. This action is consequential.",
    z.object({ postId }),
    async ({ postId }) => blogger.publishPost(postId),
  );

  register(
    server,
    "blogger_full_audit",
    "Run a read-only Blogger site audit covering blog metadata, up to 100 posts and pages, pagination, and theme-editing limitations.",
    z.object({}),
    async () => blogger.auditBlog(),
  );

  register(
    server,
    "blogger_create_page_draft",
    "Create a Blogger static page as a draft. This tool does not intentionally publish the page.",
    z.object({ title: z.string().trim().min(1).max(300), content: z.string().min(1).max(100000) }),
    async (args) => blogger.createPageDraft(args),
  );

  register(
    server,
    "blogger_update_page_draft",
    "Update a Blogger static page only when its current status is DRAFT. Live pages are rejected.",
    z.object({
      pageId: postId,
      title: z.string().trim().min(1).max(300).optional(),
      content: z.string().min(1).max(100000).optional(),
    }).refine((args) => args.title !== undefined || args.content !== undefined, { message: "Provide at least one field to update." }),
    async (args) => blogger.updatePageDraft(args),
  );

  register(
    server,
    "blogger_publish_page",
    "Publish a Blogger static page only after explicit approval for that exact page. The implementation verifies that it is currently a draft.",
    z.object({ pageId: postId }),
    async ({ pageId }) => blogger.publishPage(pageId),
  );

  register(
    server,
    "blogger_list_comments",
    "List Blogger comments across the blog or for one exact post. Read-only.",
    z.object({
      maxResults: z.number().int().min(1).max(100).optional().default(20),
      pageToken: z.string().optional(),
      status: z.enum(["LIVE", "NEEDS_REVIEW", "SPAM", "TRASH"]).optional(),
      postId: postId.optional(),
    }),
    async (args) => blogger.listComments(args),
  );

  register(
    server,
    "blogger_get_pageviews",
    "Read Blogger pageview statistics for all time, the last 7 days, or the last 30 days. Read-only.",
    z.object({ range: z.enum(["all", "7days", "30days"]).optional().default("30days") }),
    async ({ range }) => blogger.getPageViews(range),
  );

  register(
    server,
    "blogger_revert_post_to_draft",
    "Move a live post back to draft only after explicit approval for that exact post; it becomes unavailable to public readers.",
    z.object({ postId }),
    async ({ postId }) => blogger.revertPostToDraft(postId),
  );

  register(
    server,
    "blogger_revert_page_to_draft",
    "Move a live page back to draft only after explicit approval for that exact page; it becomes unavailable to public readers.",
    z.object({ pageId: postId }),
    async ({ pageId }) => blogger.revertPageToDraft(pageId),
  );

  register(
    server,
    "blogger_delete_draft_post",
    "Permanently delete a Blogger draft post only after explicit approval for the exact post. Requires ID and exact title and rejects live posts.",
    z.object({ postId, expectedTitle: z.string().trim().min(1).max(300) }),
    async (args) => blogger.deleteDraftPost(args),
  );

  register(
    server,
    "blogger_delete_draft_page",
    "Permanently delete a Blogger draft page only after explicit approval for the exact page. Requires ID and exact title and rejects live pages.",
    z.object({ pageId: postId, expectedTitle: z.string().trim().min(1).max(300) }),
    async (args) => blogger.deleteDraftPage(args),
  );
}
