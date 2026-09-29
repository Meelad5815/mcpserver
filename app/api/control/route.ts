import { NextResponse } from "next/server";
import { getPosts, getPages, getPostsCount, getPagesCount, getCategories, getTags, getMedia, createPost, createPage, updatePost, trashPost, siteStatus, currentUser } from "@/lib/wordpress";

function authed(req: Request) {
  return req.headers.get("cookie")?.split(";").some((v) => v.trim() === "mrk_control=1") ?? false;
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFKC").replace(/[؟?!۔،,:;]+/g, " ").replace(/\s+/g, " ").trim();
}

function idFrom(s: string) {
  const m = s.match(/(?:post\s*(?:id)?|id|#)\s*(\d+)/i) || s.match(/\b(\d{1,7})\b/);
  return m ? Number(m[1]) : null;
}

function quoted(s: string) {
  const m = s.match(/["“”']([^"“”']+)["“”']/);
  return m?.[1]?.trim() || "";
}

async function natural(message: string) {
  const n = normalize(message);
  const site = process.env.WORDPRESS_URL?.trim();
  const isCount = /\b(total|count|how many|kitni|kitne|number|kul|کل|کتنی|کتنے)\b/i.test(n);

  if (/(web link|website link|site link|mera web|meri website|میرا ویب|ویب لنک|ویب سائٹ)/i.test(message)) {
    return { handled: true, reply: site ? `آپ کی WordPress website کا لنک: ${site}` : "WordPress website کا لنک server پر configured نہیں ہے۔" };
  }

  if (isCount && /(post|posts|پوسٹ|پوسٹس|مضامین)/i.test(message)) {
    const total = await getPostsCount();
    return { handled: true, reply: `آپ کی website پر کل ${total} posts ہیں۔` };
  }

  if (isCount && /(page|pages|پیج|پیجز|صفحات)/i.test(message)) {
    const total = await getPagesCount();
    return { handled: true, reply: `آپ کی website پر کل ${total} pages ہیں۔` };
  }

  if (/(publish|published|publish کر|پبلش|شائع)/i.test(message)) {
    const id = idFrom(message);
    if (id) return { handled: true, confirmationRequired: true, action: "publish_post", args: { id }, reply: `Post #${id} کو publish کرنا ہے؟ براہِ کرم confirmation دیں۔` };
    return { handled: true, reply: "Publish کرنے کے لیے post ID بتا دیں۔ مثال: Post 12 publish کر دو۔" };
  }

  if (/(trash|delete|remove|حذف|ڈیلیٹ|ختم)/i.test(message)) {
    const id = idFrom(message);
    if (id) return { handled: true, confirmationRequired: true, action: "trash_post", args: { id }, reply: `Post #${id} کو trash کرنا ہے؟ براہِ کرم confirmation دیں۔` };
    return { handled: true, reply: "Trash کرنے کے لیے post ID بتا دیں۔" };
  }

  if (/(create|new|make|write|draft|بنا دو|بناؤ|بنائیں|نیا پوسٹ|پوسٹ بنا)/i.test(message) && /(post|پوسٹ|مضمون)/i.test(message)) {
    const title = quoted(message) || message.replace(/.*?(?:title|عنوان)\s*[:=-]?\s*/i, "").split(/(?:content|متن|مواد)\s*[:=-]?/i)[0].trim();
    const contentMatch = message.match(/(?:content|متن|مواد)\s*[:=-]\s*(.+)$/i);
    const postTitle = title && !/^(create|new|make|write|draft)$/i.test(title) ? title : "Untitled";
    if (postTitle === "Untitled" && !contentMatch) {
      return { handled: true, reply: "ضرور۔ Post کا title اور content بتا دیں، میں اسے draft کے طور پر بنا دوں گا۔" };
    }
    const result = await createPost({ title: postTitle, content: contentMatch?.[1] || "", status: "draft" });
    const id = (result as any)?.id;
    return { handled: true, reply: `Draft post تیار ہوگئی${id ? ` (ID ${id})` : ""}۔` };
  }

  if (/(show|list|display|dikhao|dikhاؤ|دکھاؤ|دکھائیں|میرے posts|posts دکھاؤ)/i.test(message) && /(post|پوسٹ)/i.test(message)) {
    const items: any[] = await getPosts("per_page=10&context=edit") as any[];
    if (!items.length) return { handled: true, reply: "آپ کی website پر کوئی post نہیں ملی۔" };
    return { handled: true, reply: "تازہ 10 posts:\n" + items.map((p: any, i) => `${i + 1}. ${p?.title?.rendered || "Untitled"} (ID ${p?.id})`).join("\n") };
  }

  if (/(show|list|display|dikhao|دکھاؤ|دکھائیں)/i.test(message) && /(page|پیج|صفحات)/i.test(message)) {
    const items: any[] = await getPages("per_page=10&context=edit") as any[];
    if (!items.length) return { handled: true, reply: "آپ کی website پر کوئی page نہیں ملا۔" };
    return { handled: true, reply: "تازہ 10 pages:\n" + items.map((p: any, i) => `${i + 1}. ${p?.title?.rendered || "Untitled"} (ID ${p?.id})`).join("\n") };
  }

  if (/(categories|category|کیٹیگری|زمرے)/i.test(message)) {
    const items: any[] = await getCategories("per_page=50") as any[];
    return { handled: true, reply: `Website پر ${items.length} categories دستیاب ہیں۔\n` + items.slice(0, 20).map((x: any) => `• ${x?.name || "Untitled"}`).join("\n") };
  }

  if (/(tags|tag|ٹیگ)/i.test(message)) {
    const items: any[] = await getTags("per_page=50") as any[];
    return { handled: true, reply: `Website پر ${items.length} tags دستیاب ہیں۔\n` + items.slice(0, 20).map((x: any) => `• ${x?.name || "Untitled"}`).join("\n") };
  }

  if (/(media|images|photos|تصاویر|میڈیا)/i.test(message)) {
    const items: any[] = await getMedia("per_page=20&media_type=image") as any[];
    return { handled: true, reply: `تازہ ${items.length} media items یہ ہیں:\n` + items.slice(0, 20).map((x: any) => `• ${x?.title?.rendered || x?.slug || "Image"} (ID ${x?.id})`).join("\n") };
  }

  return { handled: false, reply: "" };
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok:false, error:"Unauthorized" }, { status:401 });
  if (!sameOrigin(req)) return NextResponse.json({ ok:false, error:"Cross-origin request blocked" }, { status:403 });
  try {
    const body = await req.json();
    const action = String(body?.action || "");
    switch (action) {
      case "natural":
      case "message": return NextResponse.json({ok:true,result:await natural(String(body?.message || ""))});
      case "health": return NextResponse.json({ok:true,result:{types:await siteStatus(),user:await currentUser()}});
      case "posts": return NextResponse.json({ok:true,result:await getPosts(String(body?.query||"per_page=10&context=edit"))});
      case "pages": return NextResponse.json({ok:true,result:await getPages(String(body?.query||"per_page=10&context=edit"))});
      case "categories": return NextResponse.json({ok:true,result:await getCategories(String(body?.query||"per_page=50"))});
      case "tags": return NextResponse.json({ok:true,result:await getTags(String(body?.query||"per_page=50"))});
      case "media": return NextResponse.json({ok:true,result:await getMedia(String(body?.query||"per_page=20&media_type=image"))});
      case "create_post": return NextResponse.json({ok:true,result:await createPost({title:String(body?.title||"Untitled"),content:String(body?.content||""),status:"draft"})});
      case "update_post": {
        const id=Number(body?.id);
        if(!Number.isInteger(id)) return NextResponse.json({ok:false,error:"Valid post id required"},{status:400});
        const patch:any={};
        if(body?.title!==undefined) patch.title=String(body.title);
        if(body?.content!==undefined) patch.content=String(body.content);
        if(body?.status!==undefined && ["draft","pending","private"].includes(String(body.status))) patch.status=String(body.status);
        return NextResponse.json({ok:true,result:await updatePost(id,patch)});
      }
      case "publish_post": {
        const id=Number(body?.id);
        if(!Number.isInteger(id)) return NextResponse.json({ok:false,error:"Valid post id required"},{status:400});
        return NextResponse.json({ok:true,result:await updatePost(id,{status:"publish"})});
      }
      case "trash_post": {
        const id=Number(body?.id);
        if(!Number.isInteger(id)) return NextResponse.json({ok:false,error:"Valid post id required"},{status:400});
        return NextResponse.json({ok:true,result:await trashPost(id)});
      }
      case "create_page": return NextResponse.json({ok:true,result:await createPage({title:String(body?.title||"Untitled"),content:String(body?.content||""),status:"draft"})});
      default: return NextResponse.json({ok:false,error:"Unsupported action"},{status:400});
    }
  } catch(e) {
    return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:500});
  }
}
