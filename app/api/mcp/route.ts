import { createMcpHandler } from "mcp-handler";
import { registerWordPressTools } from "@/lib/mcp-tools";

export const runtime="nodejs";
export const dynamic="force-dynamic";

function authorized(req:Request){
 const token=process.env.MCP_AUTH_TOKEN?.trim();
 return !!token && req.headers.get("authorization")==="Bearer "+token;
}

const handler=createMcpHandler(
 server=>registerWordPressTools(server),
 {serverInfo:{name:"MRK WordPress MCP",version:"1.0.0"},instructions:"MRK WordPress MCP controls the configured WordPress site through its REST API. Prefer drafts. Publishing and deletion are consequential actions and require explicit intent."}
);

async function guarded(req:Request){
 if(!authorized(req))return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:{"Content-Type":"application/json"}});
 return handler(req);
}
export const GET=guarded;
export const POST=guarded;
export const DELETE=guarded;