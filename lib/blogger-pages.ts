const API = "https://www.googleapis.com/blogger/v3";

type BloggerPage = {
  id?: string;
  title?: string;
  content?: string;
  url?: string;
  status?: string;
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
  const body = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`Google OAuth token refresh failed (${response.status}): ${data.error || "unknown error"}`);
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
    const errorPayload = payload as { error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> } } | null;
    const message = errorPayload && typeof errorPayload === "object"
      ? errorPayload.error?.message || errorPayload.error?.errors?.[0]?.reason || errorPayload.error?.status || "unknown error"
      : "unknown error";
    throw new Error(`Blogger API ${response.status}: ${message}`);
  }
  return payload as T;
}

function blogId() {
  const id = process.env.BLOGGER_BLOG_ID?.trim();
  if (!id) throw new Error("Missing BLOGGER_BLOG_ID; refusing to write a page to an unverified blog.");
  return id;
}

export async function listPages(args: { maxResults?: number; pageToken?: string } = {}) {
  const id = blogId();
  const query = new URLSearchParams({ maxResults: String(Math.min(100, Math.max(1, args.maxResults ?? 50))) });
  if (args.pageToken) query.set("pageToken", args.pageToken);
  return bloggerFetch<{ items?: BloggerPage[]; nextPageToken?: string; kind?: string }>(
    `/blogs/${encodeURIComponent(id)}/pages?${query.toString()}`,
  );
}

export async function getPage(pageId: string) {
  return bloggerFetch<BloggerPage>(
    `/blogs/${encodeURIComponent(blogId())}/pages/${encodeURIComponent(pageId)}`,
  );
}

export async function createLivePage(args: { title: string; content: string }) {
  const id = blogId();
  return bloggerFetch<BloggerPage>(`/blogs/${encodeURIComponent(id)}/pages/`, {
    method: "POST",
    body: JSON.stringify({ title: args.title.trim(), content: args.content }),
  });
}

export async function updatePage(args: { pageId: string; title?: string; content?: string }) {
  const id = blogId();
  const current = await getPage(args.pageId);
  const body = {
    title: args.title ?? current.title ?? "",
    content: args.content ?? current.content ?? "",
  };
  return bloggerFetch<BloggerPage>(
    `/blogs/${encodeURIComponent(id)}/pages/${encodeURIComponent(args.pageId)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}
