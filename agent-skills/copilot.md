# AgentReady — GitHub Copilot Instructions

Add this to your `.github/copilot-instructions.md` to enable AI Agent Readiness auto-fix with GitHub Copilot.

## Instructions

```markdown
# AgentReady — AI Agent Readiness Auto-Fix

When asked to "make this site agent-ready":

1. **Scan**: Run `npx agentready <site-url>` to get the current score
2. **Fix forms**: Add `toolname`, `tooldescription` to every `<form>`, and `toolparamdescription` to every visible input
3. **Add JS tools**: For non-form actions, use `navigator.modelContext.registerTool()` with name, description, JSON Schema parameters, and handler
4. **Add protocols**:
   - `public/.well-known/agent.json` — A2A Agent Card with name, description, skills array
   - `public/.well-known/mcp.json` — MCP Discovery with mcpServers object
   - `public/llms.txt` — Markdown file starting with # heading, describing site features
   - `public/.well-known/agents.json` — Agent directory listing
5. **Add structured data**: JSON-LD in `<head>` with schema.org types
6. **Add meta tags**: `<title>`, `<meta name="description">`, `<meta property="og:*">`
7. **Verify**: Run `npx agentready <site-url>` again, target >= 80/100

### WebMCP Form Example
```html
<form toolname="contact_us" tooldescription="Send a message to the team">
  <input name="email" type="email" toolparamdescription="Your email address" required>
  <textarea name="message" toolparamdescription="Your message content" required></textarea>
  <button type="submit">Send</button>
</form>
```

### registerTool Example
```javascript
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "search_products",
    description: "Search the product catalog",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" }
      },
      required: ["query"]
    },
    handler: async ({ query }) => {
      const res = await fetch(`/api/search?q=${query}`);
      return res.json();
    }
  });
}
```
```

## How to use

1. Create `.github/copilot-instructions.md` in your repo root
2. Paste the instructions above
3. In VS Code with Copilot Chat, say: **"Make this site agent-ready"**
