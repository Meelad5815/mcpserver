const API = "https://www.googleapis.com/blogger/v3";

type BloggerPost = {
  id?: string;
  title?: string;
  content?: string;
  url?: string;
  status?: string;
  labels?: string[];
  published?: string;
  updated?: string;
  [key: string]: unknown;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function accessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_CLIENT_ID"),
      client_secret: required("GOOGLE_CLIENT_SECRET"),
      refresh_token: required("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${data.error_description || data.error || "unknown error"}`);
  }
  return data.access_token;
}

async function bloggerFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    throw new Error(`Blogger API ${response.status}: ${(typeof payload === "string" ? payload : JSON.stringify(payload)).slice(0, 1200)}`);
  }
  return payload as T;
}

function blogId() {
  return process.env.BLOGGER_BLOG_ID?.trim() || "";
}

function isTargetBlogUrl(value: string | undefined) {
  if (!value) return false;
  try {
    return new URL(value).hostname.toLowerCase() === "mrkdigitalservices.blogspot.com";
  } catch {
    return false;
  }
}

export async function getBlog() {
  const configuredId = blogId();
  if (configuredId) {
    return bloggerFetch(`/blogs/${encodeURIComponent(configuredId)}`);
  }
  const result = await bloggerFetch<{ items?: Array<{ id: string; name: string; url: string }> }>("/users/self/blogs");
  const blogs = result.items || [];
  const match = blogs.find((blog) => isTargetBlogUrl(blog.url));
  if (!match) {
    throw new Error("Could not find https://mrkdigitalservices.blogspot.com in the authorized Google account. Set BLOGGER_BLOG_ID to the correct blog ID.");
  }
  return match;
}

async function resolveBlogId(): Promise<string> {
  const configured = blogId();
  if (configured) return configured;
  const blog = await getBlog() as { id?: string };
  if (!blog.id) throw new Error("Blogger blog ID was not returned.");
  return blog.id;
}

export async function listPosts(args: { maxResults?: number; pageToken?: string; status?: string; orderBy?: string } = {}) {
  const id = await resolveBlogId();
  const query = new URLSearchParams();
  query.set("maxResults", String(Math.min(100, Math.max(1, args.maxResults ?? 20))));
  query.set("fetchBodies", "true");
  query.set("fetchImages", "true");
  if (args.pageToken) query.set("pageToken", args.pageToken);
  if (args.status === "draft") query.set("status", "DRAFT");
  if (args.status === "published") query.set("status", "LIVE");
  if (args.orderBy) query.set("orderBy", args.orderBy);
  return bloggerFetch<{ items?: BloggerPost[]; nextPageToken?: string; kind?: string }>(`/blogs/${encodeURIComponent(id)}/posts?${query.toString()}`);
}

export async function getPost(postId: string) {
  const id = await resolveBlogId();
  return bloggerFetch<BloggerPost>(`/blogs/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}?fetchBodies=true`);
}

export async function searchPosts(search: string, maxResults = 100) {
  const result = await listPosts({ maxResults });
  const needle = search.trim().toLocaleLowerCase();
  const items = (result.items || []).filter((post) =>
    [post.title, post.content, ...(post.labels || [])].some((value) => String(value || "").toLocaleLowerCase().includes(needle))
  );
  return { search, matched: items.length, items };
}

export async function createDraft(args: { title: string; content: string; labels?: string[] }) {
  const id = await resolveBlogId();
  const body = { title: args.title.trim(), content: args.content, ...(args.labels?.length ? { labels: args.labels } : {}) };
  return bloggerFetch<BloggerPost>(`/blogs/${encodeURIComponent(id)}/posts/?isDraft=true`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateDraft(args: { postId: string; title?: string; content?: string; labels?: string[] }) {
  const current = await getPost(args.postId);
  const id = await resolveBlogId();
  const body = {
    title: args.title ?? current.title ?? "",
    content: args.content ?? current.content ?? "",
    ...(args.labels !== undefined ? { labels: args.labels } : current.labels ? { labels: current.labels } : {}),
  };
  return bloggerFetch<BloggerPost>(`/blogs/${encodeURIComponent(id)}/posts/${encodeURIComponent(args.postId)}?isDraft=true`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function publishPost(postId: string) {
  const id = await resolveBlogId();
  return bloggerFetch<BloggerPost>(`/blogs/${encodeURIComponent(id)}/posts/${encodeURIComponent(postId)}/publish`, {
    method: "POST",
  });
}
