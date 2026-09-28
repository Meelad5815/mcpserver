import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as wp from "./wordpress";

const out=(v:unknown)=>({content:[{type:"text" as const,text:JSON.stringify(v,null,2)}]});
const wrap=(server:McpServer,name:string,description:string,inputSchema:any,fn:(a:any)=>Promise<any>)=>{
 server.registerTool(name,{description,inputSchema},async(a:any)=>{try{return out(await fn(a))}catch(e){return out({ok:false,error:e instanceof Error?e.message:String(e)})}});
};
const id={id:z.number().int().positive()};
const q={params:z.string().optional().default("")};
const slug=(s:string)=>s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g,"").replace(/\s+/g,"-").replace(/-+/g,"-").slice(0,90);

export function registerWordPressTools(server:McpServer){
 wrap(server,"wp_health_check","Check WordPress REST connectivity and the authenticated integration user.",{},async()=>({ok:true,wordpress_url:process.env.WORDPRESS_URL,user:await wp.currentUser()}));
 wrap(server,"wp_site_status","Inspect WordPress post types.",{},async()=>wp.siteStatus());
 wrap(server,"wp_get_current_user","Get the authenticated WordPress user.",{},async()=>wp.currentUser());
 wrap(server,"wp_get_types","List WordPress post types.",{},async()=>wp.getTypes());
 wrap(server,"wp_get_taxonomies","List WordPress taxonomies.",{},async()=>wp.getTaxonomies());

 wrap(server,"wp_get_posts","List posts using standard WordPress REST query parameters.",q,async({params})=>wp.getPosts(params));
 wrap(server,"wp_get_post","Get a post by ID.",id,async({id})=>wp.getPost(id));
 wrap(server,"wp_search_posts","Search posts by text.",{search:z.string().min(1),per_page:z.number().int().min(1).max(100).optional().default(10)},async({search,per_page})=>wp.getPosts(new URLSearchParams({search,per_page:String(per_page)}).toString()));
 wrap(server,"wp_create_post","Create a post; defaults to draft.",{title:z.string().min(1),content:z.string().default(""),status:z.enum(["draft","pending","private","publish"]).optional().default("draft"),excerpt:z.string().optional(),slug:z.string().optional(),categories:z.array(z.number().int().positive()).optional(),tags:z.array(z.number().int().positive()).optional(),featured_media:z.number().int().positive().optional()},async(a)=>wp.createPost(a));
 wrap(server,"wp_update_post","Update an existing post.",{...id,title:z.string().optional(),content:z.string().optional(),status:z.enum(["draft","pending","private","publish"]).optional(),excerpt:z.string().optional(),slug:z.string().optional(),categories:z.array(z.number().int().positive()).optional(),tags:z.array(z.number().int().positive()).optional(),featured_media:z.number().int().positive().optional()},async({id,...body})=>wp.updatePost(id,body));
 wrap(server,"wp_publish_post","Publish an existing post. Use only after explicit publish intent.",id,async({id})=>wp.updatePost(id,{status:"publish"}));
 wrap(server,"wp_trash_post","Move a post to trash. Use only after explicit deletion intent.",id,async({id})=>wp.trashPost(id));

 wrap(server,"wp_get_pages","List pages.",q,async({params})=>wp.getPages(params));
 wrap(server,"wp_get_page","Get a page by ID.",id,async({id})=>wp.getPage(id));
 wrap(server,"wp_create_page","Create a page; defaults to draft.",{title:z.string().min(1),content:z.string().default(""),status:z.enum(["draft","pending","private","publish"]).optional().default("draft"),slug:z.string().optional(),parent:z.number().int().nonnegative().optional()},async(a)=>wp.createPage(a));
 wrap(server,"wp_update_page","Update an existing page.",{...id,title:z.string().optional(),content:z.string().optional(),status:z.enum(["draft","pending","private","publish"]).optional(),slug:z.string().optional()},async({id,...body})=>wp.updatePage(id,body));

 wrap(server,"wp_get_categories","List categories.",q,async({params})=>wp.getCategories(params));
 wrap(server,"wp_create_category","Create a category.",{name:z.string().min(1),description:z.string().optional(),parent:z.number().int().nonnegative().optional()},async(a)=>wp.createCategory(a));
 wrap(server,"wp_get_tags","List tags.",q,async({params})=>wp.getTags(params));
 wrap(server,"wp_create_tag","Create a tag.",{name:z.string().min(1),description:z.string().optional()},async(a)=>wp.createTag(a));

 wrap(server,"wp_get_media","List media items.",q,async({params})=>wp.getMedia(params));
 wrap(server,"wp_get_media_item","Get a media item by ID.",id,async({id})=>wp.getMediaItem(id));
 wrap(server,"wp_upload_media","Upload a base64-encoded media file.",{filename:z.string().min(1),mimeType:z.string().min(1),base64:z.string().min(1),title:z.string().optional(),altText:z.string().optional(),caption:z.string().optional()},async(a)=>wp.uploadMedia(a));

 wrap(server,"wp_get_comments","List comments.",q,async({params})=>wp.getComments(params));
 wrap(server,"wp_create_comment","Create a comment.",{post:z.number().int().positive(),content:z.string().min(1),author_name:z.string().optional(),author_email:z.string().email().optional()},async(a)=>wp.createComment(a));

 wrap(server,"wp_generate_seo_package","Generate a deterministic SEO package from supplied content.",{title:z.string().min(1),content:z.string().min(1),focus_keyword:z.string().optional()},async({title,content,focus_keyword})=>{
  const plain=content.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();const keyword=(focus_keyword||title.split(/\s+/).slice(0,4).join(" ")).trim();
  return {seo_title:title.slice(0,60),meta_description:plain.slice(0,155).trim()+(plain.length>155?"…":""),suggested_slug:slug(title),focus_keyword:keyword,word_count:plain?plain.split(/\s+/).length:0,heading_count:(content.match(/<h[1-6]\b/gi)||[]).length};
 });
 wrap(server,"wp_create_seo_draft","Create a draft with an SEO-ready slug and excerpt.",{title:z.string().min(1),content:z.string().min(1),focus_keyword:z.string().optional(),categories:z.array(z.number().int().positive()).optional(),tags:z.array(z.number().int().positive()).optional()},async({title,content,focus_keyword,categories,tags})=>{
  const plain=content.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();const keyword=(focus_keyword||title.split(/\s+/).slice(0,4).join(" ")).trim();
  return wp.createPost({title,content,status:"draft",slug:slug(title),excerpt:plain.slice(0,155).trim()+(plain.length>155?"…":""),categories,tags,meta:{_mrk_focus_keyword:keyword}});
 });
}