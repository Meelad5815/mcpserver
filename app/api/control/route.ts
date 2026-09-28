import { NextResponse } from "next/server";
import { getPosts, getPages, getCategories, getTags, createPost, createPage, updatePost, trashPost, siteStatus, currentUser } from "@/lib/wordpress";

function authed(req: Request) {
  return req.headers.get("cookie")?.split(";").some((v) => v.trim() === "mrk_control=1") ?? false;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    switch (action) {
      case "health": return NextResponse.json({ok:true, result:{types:await siteStatus(), user:await currentUser()}});
      case "posts": return NextResponse.json({ok:true,result:await getPosts(String(body?.query||"per_page=10&context=edit"))});
      case "pages": return NextResponse.json({ok:true,result:await getPages(String(body?.query||"per_page=10&context=edit"))});
      case "categories": return NextResponse.json({ok:true,result:await getCategories(String(body?.query||"per_page=50"))});
      case "tags": return NextResponse.json({ok:true,result:await getTags(String(body?.query||"per_page=50"))});
      case "create_post": {
        const title=String(body?.title||"Untitled");
        const content=String(body?.content||"");
        const status=body?.status==="publish" ? "publish" : "draft";
        return NextResponse.json({ok:true,result:await createPost({title,content,status})});
      }
      case "update_post": {
        const id=Number(body?.id);
        if (!Number.isInteger(id)) return NextResponse.json({ok:false,error:"Valid post id required"},{status:400});
        const patch:any={};
        if (body?.title!==undefined) patch.title=String(body.title);
        if (body?.content!==undefined) patch.content=String(body.content);
        if (body?.status!==undefined) patch.status=String(body.status);
        return NextResponse.json({ok:true,result:await updatePost(id,patch)});
      }
      case "publish_post": {
        const id=Number(body?.id);
        if (!Number.isInteger(id)) return NextResponse.json({ok:false,error:"Valid post id required"},{status:400});
        return NextResponse.json({ok:true,result:await updatePost(id,{status:"publish"})});
      }
      case "trash_post": {
        const id=Number(body?.id);
        if (!Number.isInteger(id)) return NextResponse.json({ok:false,error:"Valid post id required"},{status:400});
        return NextResponse.json({ok:true,result:await trashPost(id)});
      }
      case "create_page": {
        const title=String(body?.title||"Untitled");
        const content=String(body?.content||"");
        return NextResponse.json({ok:true,result:await createPage({title,content,status:"draft"})});
      }
      default: return NextResponse.json({ok:false,error:"Unsupported action"},{status:400});
    }
  } catch (e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});
  }
}
