# AgentReady — Gemini CLI Auto-Fix

Add this to your `GEMINI.md` file to enable AI Agent Readiness auto-fix with Google Gemini CLI.

## GEMINI.md Instructions

```markdown
# AgentReady — AI Agent Readiness

When asked to "make this site agent-ready":

## Scan
Run `npx webmcp-scanner <url>` to get the baseline score.

## Fix Checklist
1. **WebMCP Forms**: Add `toolname`, `tooldescription` to `<form>` tags. Add `toolparamdescription` to all visible inputs.
2. **JS Tools**: Use `navigator.modelContext.registerTool()` for non-form actions.
3. **A2A Agent Card**: Create `public/.well-known/agent.json` with name, description, skills[].
4. **MCP Discovery**: Create `public/.well-known/mcp.json` with mcpServers{}.
5. **llms.txt**: Create `public/llms.txt` — Markdown file describing the site for LLMs.
6. **agents.json**: Create `public/.well-known/agents.json` listing available agents.
7. **JSON-LD**: Add `<script type="application/ld+json">` with schema.org data.
8. **Meta tags**: Ensure title, meta description, OG tags are present.

## Verify
Run `npx webmcp-scanner <url>` again. Target: >= 80/100.
```

## How to use

1. Create `GEMINI.md` in your project root
2. Paste the instructions above
3. Run Gemini CLI and say: **"Make this site agent-ready"**
