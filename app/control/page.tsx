"use client";

import { useState } from "react";
import { CreateMLCEngine, prebuiltAppConfig } from "@mlc-ai/web-llm";

type Msg={role:"user"|"assistant";text:string};
const pickModel=()=>prebuiltAppConfig.model_list.find((m:any)=>/0\.6B|1B/i.test(m.model_id))?.model_id || prebuiltAppConfig.model_list[0]?.model_id;

async function callControl(payload:any){
  const r=await fetch("/api/control",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const d=await r.json();
  if(!r.ok) throw new Error(d.error||"Request failed");
  return d.result;
}

function fallbackCommand(text:string){
  const t=text.toLowerCase();
  if(/\b(post|posts|article|articles)\b|پوسٹ|پوسٹس/.test(t)) return "posts";
  if(/\b(page|pages)\b|پیج|پیجز/.test(t)) return "pages";
  if(/categor(y|ies)\b|category|کیٹیگری|کیٹگری/.test(t)) return "categories";
  if(/\btag|tags\b|ٹیگ|ٹیگز/.test(t)) return "tags";
  if(/\bhealth|status|check\b|صحت|اسٹیٹس|چیک/.test(t)) return "health";
  return null;
}

export default function ControlPage(){
  const [password,setPassword]=useState("");
  const [logged,setLogged]=useState(false);
  const [msgs,setMsgs]=useState<Msg[]>([{role:"assistant",text:"السلام علیکم! میں MRK کا local AI WordPress assistant ہوں۔ پہلے Connect AI کریں یا Quick Actions استعمال کریں۔"}]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState("");
  const [engine,setEngine]=useState<any>(null);
  const [webgpu,setWebgpu]=useState<boolean|null>(null);

  async function login(){
    setBusy(true);
    try{
      const r=await fetch("/api/control/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(d.error||"Password غلط ہے");
      setLogged(true);
    }catch(e){alert(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }

  async function connectAI(){
    setBusy(true);
    try{
      const supported=typeof navigator!=="undefined" && "gpu" in navigator;
      setWebgpu(supported);
      if(!supported) throw new Error("اس browser/device میں WebGPU دستیاب نہیں۔ Quick Actions اور basic commands پھر بھی کام کریں گے۔");
      setProgress("Local AI model browser میں load ہو رہا ہے...");
      const id=pickModel();
      if(!id) throw new Error("کوئی compatible local model نہیں ملا۔");
      const e=await CreateMLCEngine(id,{initProgressCallback:(p:any)=>setProgress(`AI loading: ${Math.round((p?.progress||0)*100)}%`)});
      setEngine(e);
      setProgress("Local AI تیار ہے — کوئی AI API key استعمال نہیں ہو رہی۔");
    }catch(e){
      setEngine(null);
      setProgress("Local AI دستیاب نہیں: "+(e instanceof Error?e.message:String(e)));
    }finally{setBusy(false);}
  }

  async function run(action:string,args:any={}){
    setBusy(true);
    try{
      const result=await callControl({action,...args});
      setMsgs(m=>[...m,{role:"assistant",text:JSON.stringify(result,null,2).slice(0,7000)}]);
    }catch(e){setMsgs(m=>[...m,{role:"assistant",text:"Error: "+(e instanceof Error?e.message:String(e))}]);}
    finally{setBusy(false);}
  }

  async function send(){
    const text=input.trim(); if(!text||busy) return;
    setInput(""); setMsgs(m=>[...m,{role:"user",text}]);

    if(!engine){
      const action=fallbackCommand(text);
      if(action){
        setMsgs(m=>[...m,{role:"assistant",text:"WebGPU/local AI دستیاب نہیں، اس لیے basic command mode استعمال ہو رہا ہے۔"}]);
        await run(action);
      }else{
        setMsgs(m=>[...m,{role:"assistant",text:"Local AI ابھی connected نہیں۔ آپ Health, Posts, Pages, Categories یا Tags Quick Action استعمال کر سکتے ہیں، یا انہی commands میں سے کوئی لکھیں۔"}]);
      }
      return;
    }

    setBusy(true);
    try{
      const response=await engine.chat.completions.create({messages:[
        {role:"system",content:`You are MRK WordPress control assistant. Return ONLY JSON. Supported actions: posts, pages, categories, tags, health, create_post, create_page, publish_post, update_post, trash_post. For destructive publish/trash, ask for explicit confirmation instead of executing. For create_post/page use draft status. JSON shape: {"reply":"...","action":"posts|pages|categories|tags|health|create_post|create_page|publish_post|update_post|trash_post|none","args":{}}.`},
        {role:"user",content:text}
      ],temperature:.1,max_tokens:300});
      const raw=response.choices[0]?.message?.content||"";
      let cmd:any; try{cmd=JSON.parse(raw.replace(/\`\`\`json|\`\`\`/g,"").trim())}catch{cmd={action:"none",args:{},reply:raw};}
      if(cmd.reply) setMsgs(m=>[...m,{role:"assistant",text:cmd.reply}]);
      if(cmd.action && cmd.action!=="none" && cmd.action!=="publish_post" && cmd.action!=="trash_post"){
        const result=await callControl({action:cmd.action,...(cmd.args||{})});
        setMsgs(m=>[...m,{role:"assistant",text:JSON.stringify(result,null,2).slice(0,7000)}]);
      } else if(cmd.action==="publish_post"||cmd.action==="trash_post"){
        setMsgs(m=>[...m,{role:"assistant",text:"یہ consequential action ہے۔ براہِ کرم واضح Quick Action/confirmation کے ذریعے کریں۔"}]);
      }
    }catch(e){setMsgs(m=>[...m,{role:"assistant",text:"AI error: "+(e instanceof Error?e.message:String(e))}]);}
    finally{setBusy(false);}
  }

  if(!logged) return <main style={{maxWidth:520,margin:"60px auto",padding:24,fontFamily:"system-ui"}}>
    <h1>MRK WordPress Control</h1><p>Free local-AI control panel. Server secret browser میں expose نہیں ہوتا۔</p>
    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Dashboard password" style={{width:"100%",padding:12,boxSizing:"border-box"}}/>
    <button onClick={login} disabled={busy} style={{marginTop:12,padding:"10px 18px"}}>Login</button>
    <p style={{fontSize:13,opacity:.7}}>Dashboard کے لیے الگ <code>DASHBOARD_PASSWORD</code> استعمال ہوتا ہے؛ MCP token اب fallback password نہیں ہے۔</p>
  </main>;

  return <main style={{maxWidth:1000,margin:"0 auto",padding:24,fontFamily:"system-ui"}}>
    <h1>MRK WordPress AI Control</h1>
    <p>Zero-budget architecture: browser-local AI → secure server → WordPress.</p>
    <button onClick={connectAI} disabled={busy||!!engine}>{engine?"AI Connected":"Connect Free Local AI"}</button>
    <span style={{marginLeft:12,fontSize:13}}>{progress}</span>
    {webgpu===false && <p style={{padding:10,borderRadius:8,background:"#fff3cd"}}>WebGPU دستیاب نہیں۔ WordPress Quick Actions اور basic text commands پھر بھی چل سکتے ہیں؛ full browser-local LLM کے لیے WebGPU-compatible device/browser درکار ہے۔</p>}
    <section style={{display:"grid",gap:12,margin:"20px 0"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>run("health")} disabled={busy}>Health</button>
        <button onClick={()=>run("posts")} disabled={busy}>Posts</button>
        <button onClick={()=>run("pages")} disabled={busy}>Pages</button>
        <button onClick={()=>run("categories")} disabled={busy}>Categories</button>
        <button onClick={()=>run("tags")} disabled={busy}>Tags</button>
      <button onClick={()=>run("media")} disabled={busy}>Media</button>
      </div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",padding:12,border:"1px solid #ddd",borderRadius:10}}>
        <input id="post-id" type="number" min="1" placeholder="Post ID" style={{width:100,padding:9}}/>
        <button onClick={()=>{const id=Number((document.getElementById("post-id") as HTMLInputElement)?.value);if(!Number.isInteger(id)||id<1)return alert("Valid Post ID دیں");if(confirm(`Post #${id} کو publish کرنا ہے؟`))run("publish_post",{id})}} disabled={busy}>Publish</button>
        <button onClick={()=>{const id=Number((document.getElementById("post-id") as HTMLInputElement)?.value);if(!Number.isInteger(id)||id<1)return alert("Valid Post ID دیں");if(confirm(`Post #${id} کو Trash میں بھیجنا ہے؟`))run("trash_post",{id})}} disabled={busy}>Trash</button>
        <span style={{fontSize:12,opacity:.7}}>Publish/Trash ہمیشہ explicit confirmation کے بعد ہوگا۔</span>
      </div>
    </section>
    <section style={{display:"flex",gap:8}}>
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="مثلاً: میرے posts دکھاؤ" style={{flex:1,padding:12}}/>
      <button onClick={send} disabled={busy||!input.trim()}>Send</button>
    </section>
    <div style={{marginTop:20,display:"grid",gap:10}}>{msgs.map((m,i)=><div key={i} style={{padding:14,borderRadius:10,background:m.role==="user"?"#e8f0fe":"#f1f3f4",whiteSpace:"pre-wrap",overflow:"auto"}}><b>{m.role==="user"?"You":"MRK AI"}</b><br/>{m.text}</div>)}</div>
    <p style={{marginTop:24,fontSize:12,opacity:.65}}>WebLLM browser میں WebGPU استعمال کرتا ہے؛ پہلی model download بڑی ہو سکتی ہے اور browser cache میں محفوظ ہوتی ہے۔</p>
  </main>;
}
