/**
 * report-html.js — Generate self-contained HTML report from CLI scan data
 * Mirrors the extension's downloadReport() output
 */

function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function color(score) {
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function getVerdict(score, totalForms) {
  if (score >= 80) return { title: 'Agent-Ready', text: 'Your website is well-prepared for AI agents. WebMCP tools are properly configured and discoverable.' };
  if (score >= 50) return { title: 'Partially Ready', text: "Your site has some good foundations but AI agents can't fully interact with it yet. Follow the action plan below to close the gaps." };
  if (totalForms > 0) return { title: 'Not Agent-Ready', text: `Your site has ${totalForms} form${totalForms > 1 ? 's' : ''} but none are exposed to AI agents. Adding WebMCP attributes takes minutes and makes your site instantly actionable by AI.` };
  return { title: 'Invisible to AI Agents', text: "AI agents see your website as read-only text. They can't fill forms, trigger actions, or use any tools. The action plan below shows exactly how to fix this." };
}

function generateActions(pageResult, protocols, domain) {
  const actions = [];
  const forms = pageResult.forms?.details || [];
  const ps = pageResult.pageSignals || {};
  const regs = pageResult.scriptRegistrations || [];
  const hasWebMCP = forms.some(f => f.hasWebMCP);

  if (!pageResult.isHTTPS) {
    actions.push({ title: 'Enable HTTPS', priority: 'high', difficulty: 'medium', description: 'WebMCP requires a Secure Context (HTTPS). Without it, navigator.modelContext is not available.', code: null });
  }

  const nonWM = forms.filter(f => !f.hasWebMCP);
  if (nonWM.length > 0) {
    const f = nonWM[0];
    const name = f.toolname || f.name || f.id || `Form ${f.index + 1}`;
    actions.push({
      title: `Add WebMCP to "${name}" form`,
      priority: 'high', difficulty: 'easy',
      description: `This form has ${f.fieldCount} field${f.fieldCount > 1 ? 's' : ''} but AI agents can't see it. Add toolname and tooldescription attributes.`,
      code: `<form toolname="${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}" tooldescription="Submit the ${name} form on ${domain}">\n  <!-- your fields -->\n</form>`
    });
  }

  if (forms.length === 0 && regs.length === 0) {
    const title = ps.title || domain;
    let toolCode;
    if (/book|prenot|reserv|vacanz|hotel|villa|b&b|apartment/i.test(title)) {
      toolCode = `// Add this <script> to your page
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "check_availability",
    description: "Check room availability and pricing for specific dates on ${domain}",
    parameters: {
      type: "object",
      properties: {
        checkin: { type: "string", description: "Check-in date (YYYY-MM-DD)" },
        checkout: { type: "string", description: "Check-out date (YYYY-MM-DD)" },
        guests: { type: "number", description: "Number of guests" }
      },
      required: ["checkin", "checkout"]
    },
    handler: async (params) => {
      // Your availability logic here
      return { available: true, price: "..." };
    }
  });
}`;
    } else {
      toolCode = `// Add this <script> to your page
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "get_info",
    description: "Get information about ${domain}",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What information to retrieve" }
      },
      required: ["topic"]
    },
    handler: async (params) => {
      return { info: "..." };
    }
  });
}`;
    }
    actions.push({ title: 'Register a tool via JavaScript API', priority: 'high', difficulty: 'easy', description: 'Your page has no forms. Expose actions to AI agents using the imperative API.', code: toolCode });
  }

  if (ps.semanticCount === 0 && !ps.hasSemanticHTML) {
    actions.push({ title: 'Use semantic HTML elements', priority: 'low', difficulty: 'easy', description: 'Replace generic <div> containers with <main>, <nav>, <article>, <section>.', code: null });
  }

  if (!ps.hasARIA) {
    actions.push({ title: 'Add ARIA labels to interactive elements', priority: 'low', difficulty: 'easy', description: 'ARIA labels help AI agents understand what each element does.', code: `<button aria-label="Submit booking request">Book Now</button>\n<a href="/contact" aria-label="Contact us for inquiries">Contact</a>` });
  }

  if (!protocols?.a2a?.found) {
    actions.push({
      title: 'Add A2A Agent Card', priority: 'medium', difficulty: 'easy',
      description: "Google's Agent-to-Agent protocol lets AI agents discover your site's capabilities.",
      code: `// Create file: /.well-known/agent.json\n{\n  "name": "${domain} Agent",\n  "description": "AI agent for ${domain}",\n  "url": "https://${domain}",\n  "version": "1.0.0",\n  "capabilities": { "streaming": false, "pushNotifications": false },\n  "skills": [{ "name": "general_info", "description": "Get information about ${domain}", "tags": ["info", "help"] }],\n  "authentication": null\n}`
    });
  }

  if (!protocols?.mcp?.found) {
    actions.push({
      title: 'Add MCP Discovery endpoint', priority: 'medium', difficulty: 'easy',
      description: 'MCP discovery lets AI tools like Claude Code, Cursor, and Copilot find your MCP servers.',
      code: `// Create file: /.well-known/mcp.json\n{\n  "mcpServers": {\n    "${domain.replace(/\./g, '-')}": {\n      "url": "https://${domain}/mcp",\n      "transport": "streamable-http",\n      "description": "MCP server for ${domain}"\n    }\n  }\n}`
    });
  }

  if (!protocols?.llms?.found) {
    const title = ps.title || domain;
    let llmsCode;
    if (/hotel|villa|b&b|apartment|vacanz|holiday/i.test(title)) {
      llmsCode = `# ${title}\n\n> Accommodation and vacation rental. Book your stay, check availability.\n\n## Pages\n- [Home](https://${domain}/)\n- [Rooms](https://${domain}/rooms)\n- [Booking](https://${domain}/booking)\n- [Contact](https://${domain}/contact)\n\n## Key Information\n- Check-in: 3:00 PM | Check-out: 10:00 AM`;
    } else {
      llmsCode = `# ${title}\n\n> Describe what your site offers.\n\n## Pages\n- [Home](https://${domain}/)\n- [About](https://${domain}/about)\n- [Contact](https://${domain}/contact)`;
    }
    actions.push({ title: 'Add llms.txt', priority: 'low', difficulty: 'easy', description: 'llms.txt tells LLMs what your site is about. Think of it as robots.txt for AI.', code: llmsCode });
  }

  if (!protocols?.agents?.found) {
    actions.push({
      title: 'Add agents.json', priority: 'low', difficulty: 'easy',
      description: 'agents.json lists all AI agents on your domain for multi-agent discovery.',
      code: `// Create file: /.well-known/agents.json\n{\n  "agents": [{\n    "name": "${domain} Assistant",\n    "description": "AI assistant for ${domain}",\n    "protocol": "a2a",\n    "url": "https://${domain}/.well-known/agent.json",\n    "capabilities": ["chat", "search"]\n  }]\n}`
    });
  }

  return actions;
}

/**
 * Generate full HTML report from scan/crawl result
 */
function generate(result, isCrawl) {
  const firstPage = isCrawl ? result.pages[0] : result;
  let domain = '';
  try { domain = new URL(result.url || firstPage.url).hostname; } catch {}

  const score = isCrawl ? result.score : result.score;
  const totalPages = isCrawl ? result.pageCount : 1;
  const totalForms = isCrawl ? result.totalForms : (result.forms?.total || 0);
  const totalIssues = isCrawl ? result.totalIssues : result.issues.length;
  const protocols = result.protocols;
  const protocolCount = protocols?.summary?.found || 0;
  const protocolTotal = protocols?.summary?.total || 5;

  const c2 = color(score);
  const verdict = getVerdict(score, totalForms);
  const actions = generateActions(firstPage, protocols, domain);

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AgentReady Report — ${esc(domain)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#0f172a;line-height:1.6}
h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin:32px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}
.score{font-size:56px;font-weight:800;color:${c2}}
.verdict{font-size:18px;font-weight:600;margin:4px 0}
.summary{color:#475569;font-size:14px;margin-bottom:24px}
.stats{display:flex;gap:24px;margin:16px 0;font-size:14px;flex-wrap:wrap}.stats span{color:#475569}.stats strong{color:#0f172a}
.check{padding:6px 0;font-size:14px}.check-pass{color:#10b981}.check-fail{color:#ef4444}
.action{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:8px 0}
.action-title{font-weight:600;font-size:14px;margin-bottom:6px}
.action-desc{font-size:13px;color:#475569;margin-bottom:8px}
pre{background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap}
table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px}
th{font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600}
.protocol-row{display:flex;gap:8px;align-items:center;padding:4px 0;font-size:13px}
.protocol-found{color:#10b981}.protocol-missing{color:#ef4444}
.footer{margin-top:48px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}
</style></head><body>
<h1>AgentReady Report</h1>
<p style="color:#475569;font-size:14px">${esc(domain)}</p>
<div class="score">${score}/100</div>
<div class="verdict">${verdict.title}</div>
<div class="summary">${verdict.text}</div>
<div class="stats">
<span><strong>${totalPages}</strong> page${totalPages > 1 ? 's' : ''}</span>
<span><strong>${totalForms}</strong> forms</span>
<span><strong>${protocolCount}/${protocolTotal}</strong> protocols</span>
<span><strong>${totalIssues}</strong> issues</span>
</div>`;

  // Badge section
  if (score >= 75) {
    const badgeUrl = `https://img.shields.io/badge/CrawlAudit-Score_${score}%2F100-10b981?style=for-the-badge`;
    html += `
<div style="margin:24px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center">
  <div style="font-size:16px;font-weight:700;color:#166534;margin-bottom:12px">&#9989; Certified Agent-Ready</div>
  <div style="margin-bottom:16px">
    <img src="${badgeUrl}" alt="Agent-Ready Badge" style="height:28px">
  </div>
  <div style="font-size:13px;color:#475569;margin-bottom:8px">Add this badge to your site:</div>
  <pre style="text-align:left;font-size:11px">&lt;a href="https://crawlaudit.dev"&gt;&lt;img src="${badgeUrl}" alt="Agent-Ready Badge"&gt;&lt;/a&gt;</pre>
</div>`;
  } else {
    const wipBadgeUrl = `https://img.shields.io/badge/CrawlAudit-Score_${score}%2F100-f59e0b?style=for-the-badge`;
    html += `
<div style="margin:24px 0;padding:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;text-align:center">
  <div style="font-size:16px;font-weight:700;color:#92400e;margin-bottom:12px">&#128679; Work in Progress</div>
  <div style="margin-bottom:16px">
    <img src="${wipBadgeUrl}" alt="Work in Progress Badge" style="height:28px">
  </div>
  <div style="font-size:13px;color:#475569">Score 75+ to unlock the Agent-Ready certification badge.</div>
</div>`;
  }

  // Protocols section
  if (protocols) {
    html += '<h2>AI Discovery Protocols</h2>';
    const pLabels = { a2a: 'A2A Agent Card', mcp: 'MCP Discovery', agents: 'agents.json', openapi: 'OpenAPI', llms: 'llms.txt' };
    ['a2a', 'mcp', 'agents', 'openapi', 'llms'].forEach(key => {
      const r = protocols[key];
      const found = r?.found;
      html += `<div class="protocol-row"><span class="${found ? 'protocol-found' : 'protocol-missing'}">${found ? '&#10003;' : '&#10007;'}</span> <span>${pLabels[key]}</span>`;
      if (found && r.url) html += ` <span style="color:#94a3b8;font-size:11px">— ${esc(r.url)}</span>`;
      html += '</div>';
    });
  }

  // Bot Access section
  const robotsTxt = protocols?.robotsTxt;
  if (robotsTxt) {
    html += '<h2>AI Bot Access (robots.txt)</h2>';
    if (!robotsTxt.found) {
      html += '<p style="color:#475569;font-size:13px">No robots.txt found — all AI bots are allowed to crawl this site.</p>';
    } else {
      const botList = [
        { agent: 'GPTBot', owner: 'OpenAI' },
        { agent: 'ChatGPT-User', owner: 'OpenAI' },
        { agent: 'ClaudeBot', owner: 'Anthropic' },
        { agent: 'Claude-Web', owner: 'Anthropic' },
        { agent: 'Bytespider', owner: 'ByteDance' },
        { agent: 'CCBot', owner: 'Common Crawl' },
        { agent: 'Google-Extended', owner: 'Google AI' },
        { agent: 'Bingbot', owner: 'Microsoft' },
        { agent: 'PerplexityBot', owner: 'Perplexity' },
        { agent: 'Applebot-Extended', owner: 'Apple' },
        { agent: 'FacebookBot', owner: 'Meta' },
        { agent: 'cohere-ai', owner: 'Cohere' },
        { agent: 'Amazonbot', owner: 'Amazon' },
      ];
      botList.forEach(b => {
        const isBlocked = robotsTxt.blockedBots.includes(b.agent);
        html += `<div class="check check-${isBlocked ? 'fail' : 'pass'}">${isBlocked ? '&#10007;' : '&#10003;'} ${esc(b.agent)} <span style="color:#94a3b8;font-size:11px">(${esc(b.owner)})</span> — ${isBlocked ? 'blocked' : 'allowed'}</div>`;
      });
      const allowed = robotsTxt.totalBots - robotsTxt.blockedCount;
      html += `<p style="font-size:13px;color:#475569;margin-top:8px"><strong>${allowed}/${robotsTxt.totalBots}</strong> AI bots allowed</p>`;
    }
  }

  // Checklist
  html += '<h2>Readiness Checklist</h2>';
  const ps = firstPage.pageSignals || {};
  const sh = firstPage.securityHeaders || {};
  const checks = [
    { pass: firstPage.isHTTPS, label: 'HTTPS enabled' },
    { pass: !!sh.hsts, label: 'HSTS (Strict-Transport-Security)' },
    { pass: !!sh.csp, label: 'Content-Security-Policy' },
    { pass: !!sh.xContentType, label: 'X-Content-Type-Options' },
    { pass: !!sh.xFrame, label: 'X-Frame-Options' },
    { pass: !!sh.referrerPolicy, label: 'Referrer-Policy' },
    { pass: ps.hasTitle, label: 'Page title present' },
    { pass: ps.hasMetaDescription, label: 'Meta description' },
    { pass: ps.hasOgTags, label: 'Open Graph tags' },
    { pass: ps.hasJsonLd, label: 'JSON-LD structured data' },
    { pass: ps.hasSemanticHTML, label: 'Semantic HTML elements' },
    { pass: ps.hasARIA, label: 'ARIA accessibility' },
    { pass: (firstPage.forms?.total || 0) > 0, label: 'Interactive forms' },
    { pass: (firstPage.forms?.webmcpReady || 0) > 0, label: 'WebMCP tool attributes' },
    { pass: (firstPage.scriptRegistrations?.length || 0) > 0, label: 'JS tool registrations' },
    { pass: protocols?.a2a?.found, label: 'A2A Agent Card' },
    { pass: protocols?.mcp?.found, label: 'MCP Discovery' },
    { pass: protocols?.agents?.found, label: 'agents.json' },
    { pass: protocols?.openapi?.found, label: 'OpenAPI / Swagger' },
    { pass: protocols?.llms?.found, label: 'llms.txt' },
  ];
  checks.forEach(ch => {
    html += `<div class="check check-${ch.pass ? 'pass' : 'fail'}">${ch.pass ? '&#10003;' : '&#10007;'} ${ch.label}</div>`;
  });

  // Action Plan
  html += '<h2>Action Plan</h2>';
  actions.forEach((a, i) => {
    html += `<div class="action"><div class="action-title">${i + 1}. ${esc(a.title)} <span style="font-size:11px;color:#94a3b8">[${a.priority} priority, ${a.difficulty}]</span></div>`;
    html += `<div class="action-desc">${a.description}</div>`;
    if (a.code) html += `<pre>${esc(a.code)}</pre>`;
    html += '</div>';
  });

  // Score Breakdown
  if (firstPage.categories) {
    html += '<h2>Score Breakdown</h2><table><tr><th>Category</th><th>Score</th><th>Detail</th></tr>';
    const catOrder = ['forms', 'descriptions', 'schema', 'pageStructure', 'security', 'protocols', 'botAccess'];
    catOrder.forEach(key => {
      let cat = firstPage.categories[key];
      if (!cat) return;
      if (key === 'protocols' && protocols?.summary) {
        const pScore = Math.min(100, protocols.summary.found * 20);
        const pDetail = protocols.summary.found > 0
          ? `Found: ${protocols.summary.protocols.join(', ')}`
          : 'No AI discovery protocols detected';
        cat = { label: 'AI Protocols', score: pScore, detail: pDetail };
      }
      html += `<tr><td>${cat.label}</td><td style="font-weight:600;color:${color(cat.score)}">${cat.score}/100</td><td style="color:#475569">${cat.detail || ''}</td></tr>`;
    });
    html += '</table>';
  }

  // Pages table (crawl only)
  if (isCrawl && result.pages.length > 1) {
    html += '<h2>Pages</h2><table><tr><th>Score</th><th>Page</th><th>Forms</th><th>Issues</th></tr>';
    result.pages.forEach(p => {
      let path = '/';
      try { path = new URL(p.url).pathname || '/'; } catch {}
      html += `<tr><td style="font-weight:700;color:${color(p.score)}">${p.score}</td><td>${esc(path)}</td><td>${p.forms?.total || 0}</td><td>${p.issues?.length || 0}</td></tr>`;
    });
    html += '</table>';
  }

  html += `<div class="footer">Generated by AgentReady CLI | ${new Date().toISOString()} | erold90.github.io/AgentReady</div></body></html>`;

  return html;
}

module.exports = { generate };
