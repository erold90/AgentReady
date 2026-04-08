# AgentReady — Cursor Auto-Fix Rules

Add this to your `.cursor/rules` file to enable AI Agent Readiness auto-fix in Cursor.

## Cursor Rules

```
# AgentReady — AI Agent Readiness
# Trigger: "make this site agent-ready" or "fix agent readiness"

## Scan first
Run `npx @erold90/agentready <url> --json` to assess the current state.

## WebMCP Forms
Every <form> must have:
- toolname="snake_case_action_name"
- tooldescription="Plain English description for AI agents"
Every visible <input>, <select>, <textarea> must have:
- toolparamdescription="What value to provide"

## registerTool for non-form actions
Wrap in: if (navigator.modelContext) { navigator.modelContext.registerTool({...}) }
Parameters follow JSON Schema format.

## Discovery Protocols
Create these files in the public/static directory:
- /.well-known/agent.json — A2A Agent Card (name, description, skills)
- /.well-known/mcp.json — MCP server discovery (mcpServers object)
- /llms.txt — Markdown overview for LLMs (starts with # heading)
- /.well-known/agents.json — Agent directory (agents array)

## Structured Data
Add JSON-LD <script type="application/ld+json"> to <head> with:
- @context: https://schema.org
- @type: WebSite, Organization, Product, etc.
- name, url, description

## Meta Tags
Ensure: <title>, <meta name="description">, <meta property="og:*">

## Verification
Run `npx @erold90/agentready <url>` after fixes. Target: >= 80/100.
```

## How to use

1. Copy the rules above into your `.cursor/rules` file
2. Open your web project in Cursor
3. Tell Cursor: **"Make this site agent-ready"**
4. Cursor will scan, identify issues, and apply fixes automatically
