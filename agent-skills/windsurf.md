# AgentReady — Windsurf (Codeium) Auto-Fix

Add this to your `.windsurfrules` file to enable AI Agent Readiness auto-fix in Windsurf.

## Windsurf Rules

```
When asked to "make this site agent-ready" or "fix agent readiness":

1. Run `npx agentready <url> --json` to assess current state
2. Find all <form> elements and add WebMCP attributes:
   - toolname="snake_case_name" on <form>
   - tooldescription="Description for AI agents" on <form>
   - toolparamdescription="Field description" on every visible <input>/<select>/<textarea>
3. For non-form actions, add navigator.modelContext.registerTool() with JSON Schema params
4. Create discovery protocol files in public/:
   - .well-known/agent.json (A2A: name, description, skills[])
   - .well-known/mcp.json (MCP: mcpServers{})
   - llms.txt (Markdown: # Title, features, links)
   - .well-known/agents.json (Directory: agents[])
5. Add JSON-LD <script type="application/ld+json"> with schema.org
6. Ensure <title>, <meta name="description">, <meta property="og:*"> exist
7. Re-run `npx agentready <url>` to verify. Target >= 80/100.
```

## How to use

1. Add the rules to `.windsurfrules` in your project root
2. Open your project in Windsurf
3. Tell Cascade: **"Make this site agent-ready"**
