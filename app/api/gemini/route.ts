import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authed(req: Request) {
  return req.headers.get("cookie")?.split(";").some((v) => v.trim() === "mrk_control=1") ?? false;
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ ok: false, error: "Cross-origin request blocked" }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const mcpToken = process.env.MCP_AUTH_TOKEN?.trim();
  const mcpUrl = process.env.MCP_SERVER_URL?.trim() || "https://mcpserver-drab.vercel.app/api/mcp";
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";

  if (!apiKey) return NextResponse.json({ ok: false, error: "GEMINI_API_KEY is not configured." }, { status: 503 });
  if (!mcpToken) return NextResponse.json({ ok: false, error: "MCP_AUTH_TOKEN is not configured." }, { status: 503 });

  try {
    const body = await req.json();
    const input = String(body?.input || "").trim();
    if (!input) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });

    const payload: Record<string, unknown> = {
      model,
      input,
      tools: [{
        type: "mcp_server",
        name: "mrk_wordpress",
        url: mcpUrl,
        headers: { Authorization: `Bearer ${mcpToken}` },
        allowed_tools: [
          "wp_health_check","wp_site_status","wp_get_current_user","wp_get_types","wp_get_taxonomies",
          "wp_get_posts","wp_get_post","wp_search_posts","wp_create_post","wp_update_post","wp_publish_post","wp_trash_post",
          "wp_get_pages","wp_get_page","wp_create_page","wp_update_page",
          "wp_get_categories","wp_create_category","wp_get_tags","wp_create_tag",
          "wp_get_media","wp_get_media_item","wp_upload_media",
          "wp_get_comments","wp_create_comment","wp_generate_seo_package","wp_create_seo_draft"
        ]
      }]
    };

    const previousId = typeof body?.previous_interaction_id === "string" ? body.previous_interaction_id.trim() : "";
    if (previousId) payload.previous_interaction_id = previousId;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const message = typeof data?.error?.message === "string" ? data.error.message : JSON.stringify(data);
      return NextResponse.json({ ok: false, error: `Gemini API ${r.status}: ${message}` }, { status: r.status >= 400 && r.status < 600 ? r.status : 502 });
    }

    return NextResponse.json({
      ok: true,
      interaction_id: data?.id || null,
      output_text: typeof data?.output_text === "string" ? data.output_text : "",
      response: data
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
