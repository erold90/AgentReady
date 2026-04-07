# AgentReady

**The Lighthouse for AI Agent Readiness**

Scan any website to check its [WebMCP](https://developer.chrome.com/blog/webmcp-epp) readiness. Get your Agent Readiness Score, auto-generate WebMCP code, and preview how AI agents see your site.

**[Try it now](https://erold90.github.io/AgentReady/)**

## What is WebMCP?

WebMCP is a new [W3C standard](https://webmachinelearning.github.io/webmcp/) (backed by Google & Microsoft) that lets websites expose structured actions to AI agents in the browser. Think of it as making your website "API-ready" for AI — without building an actual API.

Currently in Early Preview in Chrome 146 Canary.

## Features

**Scan** — Enter any URL. AgentReady analyzes every form, script, and security header on the page.

**Score** — Get your Agent Readiness Score (0-100) with detailed breakdown across 5 categories:
- Forms & Tools coverage
- Description quality
- Schema completeness
- Tool annotations
- Security (HTTPS)

**Generate** — Auto-generated WebMCP code for every form:
- **Declarative** (HTML attributes) — add `toolname`, `tooldescription`, `toolparamdescription` to existing forms
- **Imperative** (JavaScript) — full `navigator.modelContext.registerTool()` code with JSON Schema

**Preview** — Agent Simulator shows how AI agents see your site:
- **Before**: current state (likely: nothing discoverable)
- **After**: with WebMCP applied (all tools exposed)

**Export** — Download HTML report or share via link.

## Quick Start

Visit [erold90.github.io/AgentReady](https://erold90.github.io/AgentReady/) and enter a URL.

Or run locally:

```bash
git clone https://github.com/erold90/AgentReady.git
cd AgentReady
python3 -m http.server 8080
# Open http://localhost:8080
```

## How It Works

1. Your URL is fetched through a CORS proxy
2. The HTML is parsed client-side using DOMParser
3. All `<form>` elements are extracted with their fields
4. WebMCP attributes (`toolname`, `tooldescription`, etc.) are detected
5. JavaScript is scanned for `navigator.modelContext` usage
6. A score is calculated across 5 weighted categories
7. Code is auto-generated for each form
8. The Agent Simulator shows the before/after view

## Tech Stack

- Vanilla HTML + CSS + JavaScript (no frameworks, no build step)
- CORS proxy: [allorigins.win](https://allorigins.win)
- Hosted on GitHub Pages
- Zero dependencies

## WebMCP Resources

- [Chrome Blog: WebMCP Early Preview](https://developer.chrome.com/blog/webmcp-epp)
- [W3C Spec](https://webmachinelearning.github.io/webmcp/)
- [WebMCP vs MCP](https://developer.chrome.com/blog/webmcp-mcp-usage)
- [Patrick Brosset: Updates & Clarifications](https://patrickbrosset.com/articles/2026-02-23-webmcp-updates-clarifications-and-next-steps/)

## License

[Business Source License 1.1](LICENSE) — Free for non-commercial use. Commercial use requires a license.

---

Built with [Claude Code](https://claude.ai/claude-code)
