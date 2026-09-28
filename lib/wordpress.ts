const baseUrl=()=>{const v=process.env.WORDPRESS_URL?.trim().replace(/\/$/,"");if(!v)throw new Error("WORDPRESS_URL is not configured");return v};
function authHeader(){const u=process.env.WORDPRESS_USERNAME,p=process.env.WORDPRESS_APP_PASSWORD;if(!u||!p)throw new Error("WordPress credentials are not configured");return "Basic "+Buffer.from(u+":"+p).toString("base64")}
export async function wpFetch<T=unknown>(path:string,init:RequestInit={}):Promise<T>{
 const h=new Headers(init.headers);h.set("Authorization",authHeader());h.set("Accept","application/json");
 if(init.body&&!h.has("Content-Type"))h.set("Content-Type","application/json");
 const r=await fetch(baseUrl()+"/wp-json/wp/v2"+path,{...init,headers:h,cache:"no-store"});
 const t=await r.text();let d:unknown=null;try{d=t?JSON.parse(t):null}catch{d=t}
 if(!r.ok)throw new Error("WordPress API "+r.status+": "+(typeof d==="string"?d:JSON.stringify(d)).slice(0,1200));
 return d as T;
}
export const currentUser=()=>wpFetch("/users/me");
export const siteStatus=()=>wpFetch("/types");
export const getTypes=()=>wpFetch("/types");
export const getTaxonomies=()=>wpFetch("/taxonomies");
export const getPosts=(q:string)=>wpFetch("/posts"+(q?"?"+q:""));
export const getPost=(id:number)=>wpFetch("/posts/"+id);
export const createPost=(b:unknown)=>wpFetch("/posts",{method:"POST",body:JSON.stringify(b)});
export const updatePost=(id:number,b:unknown)=>wpFetch("/posts/"+id,{method:"POST",body:JSON.stringify(b)});
export const trashPost=(id:number)=>wpFetch("/posts/"+id,{method:"DELETE"});
export const getPages=(q:string)=>wpFetch("/pages"+(q?"?"+q:""));
export const getPage=(id:number)=>wpFetch("/pages/"+id);
export const createPage=(b:unknown)=>wpFetch("/pages",{method:"POST",body:JSON.stringify(b)});
export const updatePage=(id:number,b:unknown)=>wpFetch("/pages/"+id,{method:"POST",body:JSON.stringify(b)});
export const getCategories=(q:string)=>wpFetch("/categories"+(q?"?"+q:""));
export const createCategory=(b:unknown)=>wpFetch("/categories",{method:"POST",body:JSON.stringify(b)});
export const getTags=(q:string)=>wpFetch("/tags"+(q?"?"+q:""));
export const createTag=(b:unknown)=>wpFetch("/tags",{method:"POST",body:JSON.stringify(b)});
export const getMedia=(q:string)=>wpFetch("/media"+(q?"?"+q:""));
export const getMediaItem=(id:number)=>wpFetch("/media/"+id);
export const getComments=(q:string)=>wpFetch("/comments"+(q?"?"+q:""));
export const createComment=(b:unknown)=>wpFetch("/comments",{method:"POST",body:JSON.stringify(b)});
export async function uploadMedia(i:{filename:string;mimeType:string;base64:string;title?:string;altText?:string;caption?:string}){
 const r=await fetch(baseUrl()+"/wp-json/wp/v2/media",{method:"POST",headers:{"Authorization":authHeader(),"Content-Disposition":'attachment; filename="'+i.filename.replace(/"/g,"")+'"',"Content-Type":i.mimeType,"Accept":"application/json"},body:Buffer.from(i.base64,"base64"),cache:"no-store"});
 const t=await r.text();if(!r.ok)throw new Error("WordPress media API "+r.status+": "+t.slice(0,1200));let d:any;try{d=JSON.parse(t)}catch{d=t}
 if(d?.id&&(i.title||i.altText||i.caption))d=await wpFetch("/media/"+d.id,{method:"POST",body:JSON.stringify({...i.title?{title:i.title}:{},...i.altText?{alt_text:i.altText}:{},...i.caption?{caption:i.caption}:{}})});
 return d;
}