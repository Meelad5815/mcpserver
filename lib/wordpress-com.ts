import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

const out = (v: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }],
});

function siteSlug() {
  const site = process.env.WORDPRESS_COM_SITE?.trim();
  if (!site) throw new Error("WORDPRESS_COM_SITE is not configured");
  return site.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function token() {
  const value = process.env.WORDPRESS_COM_ACCESS_TOKEN?.trim();
  if (!value) throw new Error("WORDPRESS_COM_ACCESS_TOKEN is not configured");
  return value;
}

async function api<T = unknown>(path: string, query = ""): Promise<T> {
  if (!path.startsWith("/") || path.includes("..")) throw new Error("Invalid API path");
  const url = "https://public-api.wordpress.com/wp/v2/sites/" +
    encodeURIComponent(siteSlug()) + path + (query ? "?" + query : "");
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const body = await response.text();
  let data: unknown;
  try { data = body ? JSON.parse(body) : null; } catch { data = body; }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error("WordPress.com API " + response.status + ": " + detail.slice(0, 1000));
  }
  return data as T;
}

function register(server: McpServer, name: string, description: string, schema: any, run: (args: any) => Promise<unknown>) {
  server.registerTool(name, { description, inputSchema: schema }, async (args: any) => {
    try { return out(await run(args)); }
    catch (error) {
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

const querySchema = z.object({
  per_page: z.number().int().min(1).max(100).optional().default(10),
  page: z.number().int().min(1).max(100).optional().default(1),
  search: z.string().max(200).optional(),
  status: z.enum(["publish", "draft", "pending", "private"]).optional(),
});

function toQuery(args: z.infer<typeof querySchema>) {
  const params = new URLSearchParams({
    per_page: String(args.per_page),
    page: String(args.page),
  });
  if (args.search) params.set("search", args.search);
  if (args.status) params.set("status", args.status);
  return params.toString();
}

export function registerWordPressComTools(server: McpServer) {
  register(server, "wpcom_health_check", "Check read-only connectivity to the configured WordPress.com site.", z.object({}), async () => {
    const response = await fetch("https://public-api.wordpress.com/rest/v1.1/sites/" + encodeURIComponent(siteSlug()), {
      headers: { Authorization: "Bearer " + token(), Accept: "application/json" },
      cache: "no-store",
    });
    const body = await response.text();
    let data: any;
    try { data = body ? JSON.parse(body) : null; } catch { data = body; }
    if (!response.ok) throw new Error("WordPress.com site check " + response.status + ": " + String(typeof data === "string" ? data : JSON.stringify(data)).slice(0, 1000));
    return { ok: true, provider: "wordpress.com", site: siteSlug(), name: data?.name, URL: data?.URL, is_private: data?.is_private };
  });

  register(server, "wpcom_get_posts", "Read published posts from the configured WordPress.com site. Read-only.", querySchema, async (args) => api("/posts", toQuery(args)));
  register(server, "wpcom_get_pages", "Read pages from the configured WordPress.com site. Read-only.", querySchema, async (args) => api("/pages", toQuery(args)));
  register(server, "wpcom_get_categories", "Read categories from the configured WordPress.com site. Read-only.", z.object({ per_page: z.number().int().min(1).max(100).optional().default(100) }), async ({ per_page }) => api("/categories", "per_page=" + per_page));
  register(server, "wpcom_get_tags", "Read tags from the configured WordPress.com site. Read-only.", z.object({ per_page: z.number().int().min(1).max(100).optional().default(100) }), async ({ per_page }) => api("/tags", "per_page=" + per_page));
  register(server, "wpcom_get_media", "Read media metadata from the configured WordPress.com site. Read-only.", z.object({ per_page: z.number().int().min(1).max(100).optional().default(20), page: z.number().int().min(1).max(100).optional().default(1) }), async ({ per_page, page }) => api("/media", new URLSearchParams({ per_page: String(per_page), page: String(page) }).toString()));
  register(server, "wpcom_get_post", "Read a single post by ID from the configured WordPress.com site. Read-only.", z.object({ id: z.number().int().positive() }), async ({ id }) => api("/posts/" + id));
  register(server, "wpcom_get_page", "Read a single page by ID from the configured WordPress.com site. Read-only.", z.object({ id: z.number().int().positive() }), async ({ id }) => api("/pages/" + id));
}
