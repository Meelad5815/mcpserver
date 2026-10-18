import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function githubToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("Server configuration missing: GITHUB_TOKEN");
  return token;
}

async function gh(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${data.message ?? response.statusText}`);
  return data;
}

function createServer() {
  const server = new McpServer({ name: "MRK GitHub MCP", version: "1.0.0" });

  server.tool("list_repositories", "List repositories accessible to the configured GitHub token.", {
    visibility: z.enum(["all", "public", "private"]).default("all"),
    per_page: z.number().int().min(1).max(100).default(30),
  }, async ({ visibility, per_page }) => {
    const repos = await gh(`/user/repos?visibility=${visibility}&per_page=${per_page}&sort=updated`);
    return { content: [{ type: "text", text: JSON.stringify(repos.map((r: any) => ({ name: r.full_name, description: r.description, private: r.private, default_branch: r.default_branch, html_url: r.html_url })), null, 2) }] };
  });

  server.tool("get_file_contents", "Read a UTF-8 text file from a repository branch.", {
    owner: z.string().min(1), repo: z.string().min(1), path: z.string().min(1), ref: z.string().optional(),
  }, async ({ owner, repo, path, ref }) => {
    const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const data = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}${q}`);
    if (Array.isArray(data) || data.type !== "file") throw new Error("Path is not a single file.");
    const content = data.encoding === "base64" ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8") : data.content;
    return { content: [{ type: "text", text: JSON.stringify({ path: data.path, sha: data.sha, size: data.size, content }, null, 2) }] };
  });

  server.tool("create_or_update_file", "Create or update a text file in a repository. Updating requires the current file SHA. This commits directly to the selected branch.", {
    owner: z.string().min(1), repo: z.string().min(1), path: z.string().min(1),
    content: z.string(), message: z.string().min(1), branch: z.string().optional(), sha: z.string().optional(),
  }, async ({ owner, repo, path, content, message, branch, sha }) => {
    const body: Record<string, string> = { message, content: Buffer.from(content, "utf8").toString("base64") };
    if (branch) body.branch = branch;
    if (sha) body.sha = sha;
    const data = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "PUT", body: JSON.stringify(body) });
    return { content: [{ type: "text", text: JSON.stringify({ path: data.content?.path, commit: data.commit?.html_url, sha: data.content?.sha }, null, 2) }] };
  });

  server.tool("create_branch", "Create a new branch from an existing branch.", {
    owner: z.string().min(1), repo: z.string().min(1), branch_name: z.string().min(1), base_branch: z.string().default("main"),
  }, async ({ owner, repo, branch_name, base_branch }) => {
    const base = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(base_branch)}`);
    const data = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch_name}`, sha: base.object.sha }) });
    return { content: [{ type: "text", text: JSON.stringify({ branch: data.ref, sha: data.object.sha }, null, 2) }] };
  });

  server.tool("create_issue", "Create an issue in a repository.", {
    owner: z.string().min(1), repo: z.string().min(1), title: z.string().min(1), body: z.string().optional(),
  }, async ({ owner, repo, title, body }) => {
    const data = await gh(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`, { method: "POST", body: JSON.stringify({ title, body }) });
    return { content: [{ type: "text", text: JSON.stringify({ number: data.number, title: data.title, url: data.html_url }, null, 2) }] };
  });

  server.tool("create_repository", "Create a new repository for the authenticated GitHub user.", {
    name: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/), description: z.string().optional(),
    private: z.boolean().default(true), auto_init: z.boolean().default(true),
  }, async ({ name, description, private: isPrivate, auto_init }) => {
    const data = await gh("/user/repos", { method: "POST", body: JSON.stringify({ name, description, private: isPrivate, auto_init }) });
    return { content: [{ type: "text", text: JSON.stringify({ full_name: data.full_name, private: data.private, html_url: data.html_url, default_branch: data.default_branch }, null, 2) }] };
  });

  return server;
}

export async function POST(request: Request) {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return Response.json({ error: "Server is not configured: MCP_API_KEY is missing." }, { status: 503 });
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (error) {
    console.error("MCP request failed", error);
    return Response.json({ error: "MCP request failed" }, { status: 500 });
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export async function GET() {
  return Response.json({ error: "Use authenticated Streamable HTTP POST for MCP requests." }, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
