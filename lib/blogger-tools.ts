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
  server.registerTool(name, { description, inputSchema }, async (args: any) => {
    try {
      return output({ ok: true, result: await action(args) });
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
}
