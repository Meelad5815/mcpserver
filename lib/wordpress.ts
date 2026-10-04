const baseUrl = () => {
  const raw = process.env.WORDPRESS_URL?.trim();
  if (!raw) throw new Error("WORDPRESS_URL is not configured");
  const normalized = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
  return normalized.replace(/\/$/, "");
};

function authHeader() {
  const u = process.env.WORDPRESS_USERNAME;
  const p = process.env.WORDPRESS_APP_PASSWORD;
  if (!u || !p) throw new Error("WordPress credentials are not configured");
  return "Basic " + Buffer.from(u + ":" + p).toString("base64");
}

async function wpFetchMeta<T = unknown>(path: string, init: RequestInit = {}) {
  const h = new Headers(init.headers);
  h.set("Authorization", authHeader());
  h.set("Accept", "application/json");
  if (init.body && !h.has("Content-Type")) h.set("Content-Type", "application/json");

  const r = await fetch(baseUrl() + "/wp-json/wp/v2" + path, {
    ...init,
    headers: h,
    cache: "no-store",
  });

  const t = await r.text();
  let d: unknown = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }

  if (!r.ok) {
    throw new Error(
      "WordPress API " + r.status + ": " +
      (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 1200),
    );
  }
  return { data: d as T, headers: r.headers };
}

export async function wpFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await wpFetchMeta<T>(path, init);
  return data;
}

export const currentUser = () => wpFetch("/users/me");
export const siteStatus = () => wpFetch("/types");
export const getTypes = () => wpFetch("/types");
export const getTaxonomies = () => wpFetch("/taxonomies");
export const getSettings = () => wpFetch("/settings");

async function rootFetch<T = unknown>(path = "") {
  const h = new Headers();
  h.set("Authorization", authHeader());
  h.set("Accept", "application/json");
  const r = await fetch(baseUrl() + "/wp-json" + path, { headers: h, cache: "no-store" });
  const t = await r.text();
  let d: unknown = null;
  try { d = t ? JSON.parse(t) : null; } catch { d = t; }
  if (!r.ok) {
    throw new Error("WordPress root API " + r.status + ": " +
      (typeof d === "string" ? d : JSON.stringify(d)).slice(0, 1000));
  }
  return d as T;
}

export const apiDiscovery = () => rootFetch("/");

type AuditResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

async function auditCall(fn: () => Promise<unknown>): Promise<AuditResult> {
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

async function auditList(path: string, limit = 100): Promise<AuditResult & { total?: number }> {
  try {
    const { data, headers } = await wpFetchMeta(path + "?per_page=" + limit);
    return {
      ok: true,
      data,
      total: Number(headers.get("X-WP-Total") || 0),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fullAudit() {
  const [
    api,
    user,
    types,
    taxonomies,
    settings,
    pages,
    posts,
    categories,
    tags,
    media,
    comments,
    menus,
    menuItems,
    plugins,
    themes,
  ] = await Promise.all([
    auditCall(() => apiDiscovery()),
    auditCall(() => currentUser()),
    auditCall(() => getTypes()),
    auditCall(() => getTaxonomies()),
    auditCall(() => getSettings()),
    auditList("/pages"),
    auditList("/posts"),
    auditList("/categories"),
    auditList("/tags"),
    auditList("/media"),
    auditList("/comments"),
    auditCall(() => getMenus("per_page=100")),
    auditCall(() => getMenuItems("per_page=100")),
    auditCall(() => getPlugins("per_page=100")),
    auditCall(() => getThemes("per_page=100")),
  ]);

  const endpoint = (result: AuditResult, path: string) => ({
    status: result.ok ? "available" : "unavailable",
    path,
    error: result.ok ? undefined : result.error,
  });

  const pagesTotal = pages.total ?? 0;
  const postsTotal = posts.total ?? 0;
  const mediaTotal = media.total ?? 0;

  const findings: Array<{
    priority: "critical" | "high" | "medium" | "low";
    area: string;
    issue: string;
    evidence: string;
  }> = [];

  if (!api.ok) findings.push({priority:"critical",area:"REST API",issue:"WordPress REST API root could not be read.",evidence:api.error || "unknown error"});
  if (!user.ok) findings.push({priority:"critical",area:"Authentication",issue:"Authenticated WordPress API user could not be verified.",evidence:user.error || "unknown error"});
  if (!settings.ok) findings.push({priority:"high",area:"Settings",issue:"WordPress settings endpoint is unavailable to the integration.",evidence:settings.error || "unknown error"});
  if (!menus.ok && !menuItems.ok) findings.push({priority:"high",area:"Navigation",issue:"Neither menu endpoint is available; navigation cannot be audited through the current API.",evidence:(menus.error || "") + " | " + (menuItems.error || "")});
  if (!plugins.ok) findings.push({priority:"high",area:"Plugins",issue:"Installed plugin inventory is not available through the current REST API.",evidence:plugins.error || "unknown error"});
  if (!themes.ok) findings.push({priority:"high",area:"Themes",issue:"Theme inventory is not available through the current REST API.",evidence:themes.error || "unknown error"});
  if (pagesTotal === 0) findings.push({priority:"medium",area:"Content",issue:"No pages were returned by the REST API.",evidence:"X-WP-Total = 0"});
  if (postsTotal === 0) findings.push({priority:"medium",area:"Blog",issue:"No posts were returned by the REST API.",evidence:"X-WP-Total = 0"});

  return {
    ok: findings.every(f => f.priority !== "critical"),
    generated_at: new Date().toISOString(),
    source: "Direct WordPress REST API",
    read_only: true,
    summary: {
      pages: pagesTotal,
      posts: postsTotal,
      media: mediaTotal,
      categories: categories.ok && Array.isArray(categories.data) ? categories.data.length : null,
      tags: tags.ok && Array.isArray(tags.data) ? tags.data.length : null,
      comments: comments.ok && Array.isArray(comments.data) ? comments.data.length : null,
    },
    endpoints: {
      api_root: endpoint(api, "/wp-json/"),
      current_user: endpoint(user, "/wp-json/wp/v2/users/me"),
      types: endpoint(types, "/wp-json/wp/v2/types"),
      taxonomies: endpoint(taxonomies, "/wp-json/wp/v2/taxonomies"),
      settings: endpoint(settings, "/wp-json/wp/v2/settings"),
      pages: endpoint(pages, "/wp-json/wp/v2/pages"),
      posts: endpoint(posts, "/wp-json/wp/v2/posts"),
      categories: endpoint(categories, "/wp-json/wp/v2/categories"),
      tags: endpoint(tags, "/wp-json/wp/v2/tags"),
      media: endpoint(media, "/wp-json/wp/v2/media"),
      comments: endpoint(comments, "/wp-json/wp/v2/comments"),
      menus: endpoint(menus, "/wp-json/wp/v2/menus"),
      menu_items: endpoint(menuItems, "/wp-json/wp/v2/menu-items"),
      plugins: endpoint(plugins, "/wp-json/wp/v2/plugins"),
      themes: endpoint(themes, "/wp-json/wp/v2/themes"),
    },
    findings,
    samples: {
      pages: pages.ok ? pages.data : null,
      posts: posts.ok ? posts.data : null,
      categories: categories.ok ? categories.data : null,
      tags: tags.ok ? tags.data : null,
      media: media.ok ? media.data : null,
      menus: menus.ok ? menus.data : null,
      menu_items: menuItems.ok ? menuItems.data : null,
      plugins: plugins.ok ? plugins.data : null,
      themes: themes.ok ? themes.data : null,
    },
  };
}
export const getMenus = (q: string) => wpFetch("/menus" + (q ? "?" + q : ""));
export const getMenu = (id: number) => wpFetch("/menus/" + id);
export const getMenuItems = (q: string) => wpFetch("/menu-items" + (q ? "?" + q : ""));
export const getMenuItem = (id: number) => wpFetch("/menu-items/" + id);
export const getPlugins = (q: string) => wpFetch("/plugins" + (q ? "?" + q : ""));
export const getThemes = (q: string) => wpFetch("/themes" + (q ? "?" + q : ""));
export const getPosts = (q: string) => wpFetch("/posts" + (q ? "?" + q : ""));
export const getPost = (id: number) => wpFetch("/posts/" + id);
export const getPostsCount = async () => {
  const { headers } = await wpFetchMeta("/posts?per_page=1&context=edit");
  return Number(headers.get("X-WP-Total") || 0);
};
export const createPost = (b: unknown) => wpFetch("/posts", { method: "POST", body: JSON.stringify(b) });
export const updatePost = (id: number, b: unknown) => wpFetch("/posts/" + id, { method: "POST", body: JSON.stringify(b) });
export const trashPost = (id: number) => wpFetch("/posts/" + id, { method: "DELETE" });
export const getPages = (q: string) => wpFetch("/pages" + (q ? "?" + q : ""));
export const getPage = (id: number) => wpFetch("/pages/" + id);
export const getPagesCount = async () => {
  const { headers } = await wpFetchMeta("/pages?per_page=1&context=edit");
  return Number(headers.get("X-WP-Total") || 0);
};
export const createPage = (b: unknown) => wpFetch("/pages", { method: "POST", body: JSON.stringify(b) });
export const updatePage = (id: number, b: unknown) => wpFetch("/pages/" + id, { method: "POST", body: JSON.stringify(b) });
export const getCategories = (q: string) => wpFetch("/categories" + (q ? "?" + q : ""));
export const createCategory = (b: unknown) => wpFetch("/categories", { method: "POST", body: JSON.stringify(b) });
export const getTags = (q: string) => wpFetch("/tags" + (q ? "?" + q : ""));
export const createTag = (b: unknown) => wpFetch("/tags", { method: "POST", body: JSON.stringify(b) });
export const getMedia = (q: string) => wpFetch("/media" + (q ? "?" + q : ""));
export const getMediaItem = (id: number) => wpFetch("/media/" + id);
export const getComments = (q: string) => wpFetch("/comments" + (q ? "?" + q : ""));
export const createComment = (b: unknown) => wpFetch("/comments", { method: "POST", body: JSON.stringify(b) });

export async function uploadMedia(i: {
  filename: string;
  mimeType: string;
  base64: string;
  title?: string;
  altText?: string;
  caption?: string;
}) {
  const r = await fetch(baseUrl() + "/wp-json/wp/v2/media", {
    method: "POST",
    headers: {
      "Authorization": authHeader(),
      "Content-Disposition": 'attachment; filename="' + i.filename.replace(/"/g, "") + '"',
      "Content-Type": i.mimeType,
      "Accept": "application/json",
    },
    body: Buffer.from(i.base64, "base64"),
    cache: "no-store",
  });

  const t = await r.text();
  if (!r.ok) throw new Error("WordPress media API " + r.status + ": " + t.slice(0, 1200));

  let d: any;
  try { d = JSON.parse(t); } catch { d = t; }

  if (d?.id && (i.title || i.altText || i.caption)) {
    d = await wpFetch("/media/" + d.id, {
      method: "POST",
      body: JSON.stringify({
        ...(i.title ? { title: i.title } : {}),
        ...(i.altText ? { alt_text: i.altText } : {}),
        ...(i.caption ? { caption: i.caption } : {}),
      }),
    });
  }
  return d;
}
