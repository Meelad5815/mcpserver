import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as pages from "./blogger-pages";

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
        content: [{ type: "text" as const, text: JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }, null, 2) }],
        isError: true,
      };
    }
  });
}

const pageId = z.string().trim().min(1).max(128);

export function registerBloggerPageTools(server: McpServer) {
  register(
    server,
    "blogger_list_pages",
    "List permanent Blogger pages for the configured MRK Digital blog. Read-only.",
    z.object({
      maxResults: z.number().int().min(1).max(100).optional().default(50),
      pageToken: z.string().optional(),
    }),
    async (args) => pages.listPages(args),
  );

  register(
    server,
    "blogger_get_page",
    "Read one permanent Blogger page by page ID. Read-only.",
    z.object({ pageId }),
    async ({ pageId }) => pages.getPage(pageId),
  );

  register(
    server,
    "blogger_create_live_page",
    "Create a permanent page on the configured MRK Digital Blogger blog. This creates a live page, not a post draft. Use only for page content the user has authorized.",
    z.object({
      title: z.string().trim().min(1).max(300),
      content: z.string().min(1).max(100000),
    }),
    async (args) => pages.createLivePage(args),
  );

  register(
    server,
    "blogger_update_page",
    "Update an existing permanent Blogger page. Changes affect the live page immediately; use only for changes the user has authorized.",
    z.object({
      pageId,
      title: z.string().trim().min(1).max(300).optional(),
      content: z.string().min(1).max(100000).optional(),
    }).refine((args) => args.title !== undefined || args.content !== undefined, {
      message: "Provide a title or content to update.",
    }),
    async (args) => pages.updatePage(args),
  );
}
