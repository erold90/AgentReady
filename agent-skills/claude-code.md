# AgentReady — Claude Code Auto-Fix Skill

Use this skill to scan and fix AI Agent Readiness issues in your web project.

## How to use

Add this to your project's `CLAUDE.md`:

```
When asked to "make this site agent-ready" or "fix agent readiness", follow the AgentReady auto-fix procedure in agent-skills/claude-code.md
```

Then tell Claude Code: **"Make this site agent-ready"**

## Auto-Fix Procedure

### Step 1: Scan

Run the AgentReady CLI to assess the current state:

```bash
npx @erold90/agentready https://YOUR-DOMAIN --json
```

Or if testing locally:
```bash
npx @erold90/agentready http://localhost:3000 --json
```

### Step 2: Fix WebMCP on forms

Find all `<form>` elements in the project and add WebMCP attributes:

```html
<form toolname="form_name" tooldescription="What this form does, in plain English">
  <input name="field" toolparamdescription="What this field expects">
</form>
```

**Rules:**
- `toolname`: lowercase snake_case, describes the action (e.g., `search_products`, `submit_contact`, `book_room`)
- `tooldescription`: 1-2 sentences explaining what the form does, written for an AI agent
- `toolparamdescription` on every visible input: explains what value to provide
- Add `required` attribute where applicable

### Step 3: Add registerTool for dynamic actions

If the site has actions that aren't form-based (API calls, navigation, data retrieval), add JavaScript tool registrations:

```javascript
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "action_name",
    description: "What this action does",
    parameters: {
      type: "object",
      properties: {
        param1: { type: "string", description: "What to provide" }
      },
      required: ["param1"]
    },
    handler: async (params) => {
      // Implementation
      return { result: "..." };
    }
  });
}
```

### Step 4: Add AI Discovery Protocols

Create these files in your project's public/static directory:

**/.well-known/agent.json** (A2A Agent Card):
```json
{
  "name": "Your Site Agent",
  "description": "What your agent does",
  "url": "https://your-domain.com",
  "version": "1.0.0",
  "skills": [
    { "name": "skill_name", "description": "What this skill does" }
  ]
}
```

**/.well-known/mcp.json** (MCP Discovery):
```json
{
  "mcpServers": {
    "your-server": {
      "url": "https://your-domain.com/mcp",
      "transport": "streamable-http",
      "description": "Your MCP server"
    }
  }
}
```

**/llms.txt**:
```markdown
# Your Site Name

> Brief description of your site.

## Features
- Feature 1: description
- Feature 2: description

## API
- [Endpoint](/api/endpoint): what it does
```

### Step 5: Add structured data

If missing, add JSON-LD to the `<head>`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Your Site",
  "url": "https://your-domain.com"
}
</script>
```

### Step 6: Verify

Run the scanner again to confirm improvements:

```bash
npx @erold90/agentready https://YOUR-DOMAIN
```

Target: score >= 80/100
