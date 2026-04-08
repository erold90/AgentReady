# agentready

**Scan any website for AI Agent Readiness from the terminal.**

Checks WebMCP forms, JavaScript tools, and 5 AI discovery protocols (A2A Agent Cards, MCP Discovery, agents.json, OpenAPI, llms.txt).

Zero dependencies. Node 18+.

## Install & Use

```bash
npx @erold90/agentready https://example.com
```

## Flags

```
agentready <url>              Full scan with colored output
agentready <url> --json       Raw JSON output (for CI/CD)
agentready <url> --protocols  Only check discovery protocols
agentready --help             Show help
```

## Example Output

```
  ⚡ AgentReady Scanner v1.0.0
  Scanning https://stripe.com...

  Score: 36/100 ███████░░░░░░░░░░░░░
  HTTPS: ✓ Yes

  Page Structure
    Title:            ✓
    Meta Description: ✓
    Open Graph:       ✓
    JSON-LD:          ✓
    Semantic HTML:    ✓
    ARIA:             ✓

  WebMCP
    Forms:         0
    WebMCP-ready:  0
    JS tools:      0

  AI Discovery Protocols
    ✗ A2A Agent Card
    ✗ MCP Discovery
    ✗ agents.json
    ✗ OpenAPI
    ✓ llms.txt — Stripe

    1/5 protocols detected

  Verdict: Invisible to AI Agents
```

## Programmatic API

```javascript
const { scan } = require('@erold90/agentready');

const result = await scan('https://example.com');
console.log(result.score);        // 0-100
console.log(result.protocols);     // A2A, MCP, OpenAPI, agents.json, llms.txt
console.log(result.forms.total);   // number of forms
```

## What it checks

| Check | Description |
|---|---|
| **WebMCP Forms** | `<form>` elements with `toolname`, `tooldescription`, `toolparamdescription` |
| **JS Tools** | `navigator.modelContext.registerTool()` calls |
| **A2A Agent Card** | `/.well-known/agent.json` (Google A2A protocol) |
| **MCP Discovery** | `/.well-known/mcp.json` (Model Context Protocol) |
| **agents.json** | `/.well-known/agents.json` (multi-agent directory) |
| **OpenAPI** | `/openapi.json`, `/swagger.json`, etc. |
| **llms.txt** | `/llms.txt` (LLM-readable site info) |
| **Page Structure** | Title, meta, OG tags, JSON-LD, semantic HTML, ARIA |

## Links

- [Chrome Extension](https://erold90.github.io/AgentReady)
- [Agent Skills](https://github.com/erold90/AgentReady/tree/main/agent-skills) (auto-fix for Claude Code, Cursor, Copilot)
- [GitHub](https://github.com/erold90/AgentReady)

## License

[BSL-1.1](https://github.com/erold90/AgentReady/blob/main/LICENSE) — Free for non-commercial use.
