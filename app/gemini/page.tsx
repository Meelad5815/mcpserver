"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; text: string };

export default function GeminiPage() {
  const [password, setPassword] = useState("");
  const [logged, setLogged] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [previousId, setPreviousId] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "السلام علیکم! یہ MRK Gemini → WordPress AI ہے۔ Gemini آپ کے MRK MCP server کے ذریعے WordPress سے معلومات لے سکتا ہے اور configured tools استعمال کر سکتا ہے۔" }
  ]);

  async function login() {
    setBusy(true);
    try {
      const r = await fetch("/api/control/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Password غلط ہے");
      setLogged(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);

    try {
      const r = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: text,
          previous_interaction_id: previousId || undefined
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Gemini request failed");
      if (d.interaction_id) setPreviousId(d.interaction_id);
      setMessages((m) => [...m, { role: "assistant", text: d.output_text || "Gemini نے کوئی text response نہیں دیا۔" }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: "Error: " + (e instanceof Error ? e.message : String(e)) }]);
    } finally {
      setBusy(false);
    }
  }

  if (!logged) {
    return (
      <main style={{ maxWidth: 520, margin: "60px auto", padding: 24, fontFamily: "system-ui" }}>
        <h1>MRK Gemini WordPress AI</h1>
        <p>Secure Gemini gateway. Gemini API key اور MCP token browser میں expose نہیں ہوتے۔</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && login()}
          placeholder="Dashboard password"
          style={{ width: "100%", padding: 12, boxSizing: "border-box" }}
        />
        <button onClick={login} disabled={busy} style={{ marginTop: 12, padding: "10px 18px" }}>Login</button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24, fontFamily: "system-ui" }}>
      <h1>MRK Gemini → WordPress AI</h1>
      <p>Gemini 3.8 Flash → Remote MCP → WordPress. Server-side secrets محفوظ ہیں۔</p>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 16 }}>
        <b>Try:</b>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["میرے تازہ posts دکھاؤ", "WordPress site status check کرو", "میری categories دکھاؤ", "ایک draft post بناؤ جس کا title Test ہو"].map((q) => (
            <button key={q} onClick={() => setInput(q)} disabled={busy}>{q}</button>
          ))}
        </div>
      </div>

      <section style={{ display: "grid", gap: 10 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") send(); }}
          placeholder="مثلاً: میری WordPress website کے تازہ 10 posts دکھاؤ"
          rows={4}
          style={{ width: "100%", padding: 12, boxSizing: "border-box" }}
        />
        <button onClick={send} disabled={busy || !input.trim()} style={{ padding: "11px 18px", width: "fit-content" }}>
          {busy ? "Gemini کام کر رہا ہے..." : "Send to Gemini"}
        </button>
      </section>

      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ padding: 14, borderRadius: 10, background: m.role === "user" ? "#e8f0fe" : "#f1f3f4", whiteSpace: "pre-wrap", overflow: "auto" }}>
            <b>{m.role === "user" ? "You" : "Gemini"}</b><br />
            {m.text}
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, opacity: .65 }}>
        MCP publishing/trash tools are available to Gemini, but consequential actions should only be performed when your explicit request reaches the server.
      </p>
    </main>
  );
}
