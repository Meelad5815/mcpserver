export default function Home() {
  return <main style={{maxWidth:900,margin:"0 auto",padding:40}}>
    <h1>MRK WordPress MCP</h1>
    <p>MCP middleware for securely controlling a WordPress site through the WordPress REST API.</p>
    <h2>Endpoint</h2><code>/api/mcp</code>
    <h2>Capabilities</h2>
    <ul><li>Posts, pages, categories and tags</li><li>Media and comments</li><li>SEO helpers</li><li>Health diagnostics</li><li>Draft-first publishing workflow</li></ul>
  </main>;
}