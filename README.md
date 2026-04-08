# AgentReady

**The Lighthouse for AI Agent Readiness**

Scan any website for [WebMCP](https://developer.chrome.com/blog/webmcp-epp) compliance and AI discovery protocols. Get your Agent Readiness Score (0-100), auto-generate fix code, and preview how AI agents see your site.

**[Try it now](https://erold90.github.io/AgentReady/)** &middot; **[Install Extension](#chrome-extension)** &middot; **[CLI Scanner](#cli-scanner)**

## What It Checks

| Protocol | Endpoint | Description |
|---|---|---|
| **WebMCP** | HTML forms + JS scripts | `toolname`, `tooldescription`, `registerTool()` |
| **A2A Agent Card** | `/.well-known/agent.json` | Google's Agent-to-Agent protocol |
| **MCP Discovery** | `/.well-known/mcp.json` | Model Context Protocol server discovery |
| **agents.json** | `/.well-known/agents.json` | Multi-agent directory |
| **OpenAPI** | `/openapi.json`, `/swagger.json` | API specification |
| **llms.txt** | `/llms.txt` | LLM-readable site description |

Plus: HTTPS, page structure, meta tags, JSON-LD, semantic HTML, ARIA, and more.

## Score Categories (6)

1. **Forms & Tools** — WebMCP form coverage + JS registrations
2. **Descriptions** — Quality of tool/parameter descriptions
3. **Schema Quality** — Input types, constraints, required fields
4. **Page Structure** — Title, meta, OG tags, JSON-LD, semantic HTML, ARIA
5. **Security** — HTTPS (required for SecureContext)
6. **AI Protocols** — A2A, MCP, agents.json, OpenAPI, llms.txt

## Chrome Extension

One-click scan on any page. Full site crawl. Intelligent report with actionable code fixes.

**Features:**
- Instant single-page scan with score ring
- Full site crawl (sitemap discovery, progress overlay, ETA)
- Protocol detection (5 AI discovery protocols)
- Full report with readiness checklist (15 checks), action plan with copy-paste code, agent simulator
- Freemium gate (3 pages free, 2 code snippets free)

Install from the [Chrome Web Store](https://chromewebstore.google.com) (coming soon) or load unpacked from `extension/`.

## CLI Scanner

Zero-dependency terminal scanner. Node 18+.

```bash
npx webmcp-scanner https://example.com
npx webmcp-scanner https://stripe.com --json       # JSON output for CI/CD
npx webmcp-scanner https://api.openai.com --protocols  # Protocols only
```

See [cli/README.md](cli/README.md) for full documentation.

## Agent Skills (Auto-Fix)

Drop one file in your project, tell your AI coding tool **"Make this site agent-ready"**, and it will scan + fix automatically:

| Tool | Config File | Skill |
|---|---|---|
| **Claude Code** | `CLAUDE.md` | [claude-code.md](agent-skills/claude-code.md) |
| **Cursor** | `.cursor/rules` | [cursor.md](agent-skills/cursor.md) |
| **GitHub Copilot** | `.github/copilot-instructions.md` | [copilot.md](agent-skills/copilot.md) |
| **Windsurf** | `.windsurfrules` | [windsurf.md](agent-skills/windsurf.md) |
| **Gemini CLI** | `GEMINI.md` | [gemini-cli.md](agent-skills/gemini-cli.md) |

## Online Demo

Visit [erold90.github.io/AgentReady](https://erold90.github.io/AgentReady/) and enter any URL. Scans via CORS proxy with protocol detection.

## Architecture

```
AgentReady/
├── index.html              # Landing page + online demo
├── css/style.css           # Styles (light/dark theme)
├── js/
│   ├── scanner.js          # CORS proxy fetch + HTML parser
│   ├── analyzer.js         # Score engine (6 categories)
│   ├── protocols.js        # AI protocol detection (browser)
│   ├── generator.js        # WebMCP code generator
│   └── app.js              # Demo UI controller
├── extension/
│   ├── manifest.json       # Chrome MV3
│   ├── js/
│   │   ├── content.js      # DOM extractor (injected)
│   │   ├── analyzer.js     # Score engine (extension)
│   │   ├── protocols.js    # Protocol scanner
│   │   ├── crawler.js      # Full site crawler
│   │   ├── sitemap.js      # Sitemap discovery
│   │   ├── popup.js        # Popup controller
│   │   └── report.js       # Report renderer
│   ├── popup.html          # Extension popup
│   └── report.html         # Full report page
├── cli/
│   ├── package.json        # npm: agentready
│   ├── bin/agentready.js   # CLI entry point
│   ├── index.js            # Programmatic API
│   └── lib/                # Scanner + protocol modules
├── agent-skills/           # Auto-fix instructions (5 tools)
└── worker/                 # Cloudflare CORS proxy
```

## Tech Stack

- Vanilla HTML + CSS + JavaScript (zero dependencies, no build step)
- Chrome Extension: Manifest V3
- CLI: Node.js 18+ (zero npm dependencies)
- Hosting: GitHub Pages
- CORS Proxy: allorigins.win fallback chain + optional Cloudflare Worker

## License

[Business Source License 1.1](LICENSE) — Free for non-commercial use. Commercial use requires a license.

---

Built with [Claude Code](https://claude.ai/claude-code)
