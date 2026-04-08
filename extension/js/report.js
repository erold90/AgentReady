/**
 * report.js — Intelligent report renderer
 * Generates actionable recommendations, checklist, agent simulator, and code snippets
 */
(function() {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const PLANS = {
    free:  { pages: 3,    actions: 2    },
    pro:   { pages: 500,  actions: 9999 },
    team:  { pages: 2000, actions: 9999 }
  };
  let reportData = null;
  let currentPlan = 'free';
  let PAGE_LIMIT = 3;
  let ACTION_LIMIT = 2;

  document.addEventListener('DOMContentLoaded', async () => {
    $('#btn-download').addEventListener('click', downloadReport);
    try {
      const result = await chrome.storage.local.get('agentready_report');
      const data = result.agentready_report;
      if (!data) { showError('No report data found. Run a scan from the extension first.'); return; }
      reportData = data;
      // Set plan from license or legacy plan field
      try {
        const licenseData = await chrome.storage.local.get('agentready_license');
        const license = licenseData.agentready_license;
        if (license && license.valid && PLANS[license.plan]) {
          currentPlan = license.plan;
        } else if (data.plan && PLANS[data.plan]) {
          currentPlan = data.plan;
        }
      } catch {
        if (data.plan && PLANS[data.plan]) {
          currentPlan = data.plan;
        }
      }
      PAGE_LIMIT = PLANS[currentPlan].pages;
      ACTION_LIMIT = PLANS[currentPlan].actions;
      $('#loading').hidden = true;
      $('#report').hidden = false;
      renderReport(data);
    } catch (err) {
      showError('Failed to load: ' + (err.message || 'Unknown error'));
    }
  });

  function showError(msg) {
    $('#loading').hidden = true;
    const el = $('#error'); el.textContent = msg; el.hidden = false;
  }

  function color(score) {
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  function esc(str) {
    if (!str) return '';
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  // =============================================
  // RENDER MAIN REPORT
  // =============================================
  function renderReport(data) {
    const page0 = data.pages?.[0];
    const analysis = page0?.analysis;
    let domain = '';
    try { domain = new URL(page0.url).hostname; } catch {}

    // Hero
    $('#r-domain').textContent = domain;
    const c = color(data.avgScore);
    const circumference = 2 * Math.PI * 54;
    const ring = $('#r-ring');
    ring.style.stroke = c;
    setTimeout(() => { ring.style.strokeDashoffset = circumference - (data.avgScore / 100) * circumference; }, 100);
    const scoreEl = $('#r-score'); scoreEl.textContent = data.avgScore; scoreEl.style.color = c;

    // Verdict
    const verdict = getVerdict(data.avgScore, data.totalForms, page0);
    $('#r-verdict').textContent = verdict.title;
    $('#r-summary').textContent = verdict.text;

    // Stats
    $('#r-pages').textContent = data.totalPages;
    $('#r-forms').textContent = data.totalForms;
    const webmcpCount = data.pages.reduce((s, p) => s + (p.webmcpCount || 0), 0);
    $('#r-webmcp').textContent = webmcpCount;
    const issEl = $('#r-issues'); issEl.textContent = data.totalIssues;
    issEl.style.color = data.totalIssues > 0 ? '#ef4444' : '#10b981';

    // Protocol stats
    const protocols = data.protocols;
    if (protocols && protocols.summary) {
      const protEl = $('#r-protocols');
      if (protEl) {
        protEl.textContent = protocols.summary.found + '/' + protocols.summary.total;
        protEl.style.color = protocols.summary.found > 0 ? '#10b981' : '#ef4444';
      }
    }

    // Sections
    renderChecklist(page0, analysis, protocols);
    renderActionPlan(page0, analysis, data);
    renderAgentSimulator(page0, analysis, protocols);
    renderCategories(analysis);

    // Pages (multi-page only)
    if (data.type !== 'singlescan' && data.pages.length > 1) {
      $('#sec-pages').hidden = false;
      $('#r-pages-sub').textContent = `${data.totalPages} pages sorted by score (worst first)`;
      renderPages(data.pages);
    }

    // Plan badge in header
    const planLabel = { free: 'Free', pro: 'Pro', team: 'Team' }[currentPlan] || 'Free';
    const planColor = { free: '#94a3b8', pro: '#2563eb', team: '#7c3aed' }[currentPlan];
    const headerActions = document.querySelector('.report-actions');
    if (headerActions && currentPlan !== 'free') {
      const badge = document.createElement('span');
      badge.style.cssText = `font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;background:${planColor};color:#fff;margin-right:8px;`;
      badge.textContent = planLabel;
      headerActions.prepend(badge);
    }

    $('#r-timestamp').textContent = `Report generated ${new Date().toLocaleString()} by AgentReady (${planLabel})`;
  }

  // =============================================
  // VERDICT
  // =============================================
  function getVerdict(score, totalForms, page0) {
    if (score >= 80) return {
      title: 'Agent-Ready',
      text: 'Your website is well-prepared for AI agents. WebMCP tools are properly configured and discoverable. Keep monitoring for regressions.'
    };
    if (score >= 50) return {
      title: 'Partially Ready',
      text: 'Your site has some good foundations but AI agents can\'t fully interact with it yet. Follow the action plan below to close the gaps.'
    };
    if (totalForms > 0) return {
      title: 'Not Agent-Ready',
      text: `Your site has ${totalForms} form${totalForms > 1 ? 's' : ''} but none are exposed to AI agents. Adding WebMCP attributes takes minutes and makes your site instantly actionable by AI.`
    };
    return {
      title: 'Invisible to AI Agents',
      text: 'AI agents see your website as read-only text. They can\'t fill forms, trigger actions, or use any tools. The action plan below shows exactly how to fix this.'
    };
  }

  // =============================================
  // READINESS CHECKLIST
  // =============================================
  function renderChecklist(page, analysis, protocols) {
    const container = $('#r-checklist');
    const ps = page?.scanData?.pageSignals || {};
    const forms = page?.forms || [];
    const hasWebMCP = forms.some(f => f.hasWebMCP);
    const isHTTPS = page?.scanData?.security?.isHTTPS;

    const checks = [
      { pass: isHTTPS, label: 'HTTPS enabled (required)' },
      { pass: ps.hasTitle, label: 'Page title present' },
      { pass: ps.hasMetaDescription, label: 'Meta description' },
      { pass: ps.hasOgTags, label: 'Open Graph tags' },
      { pass: ps.hasJsonLd, label: 'JSON-LD structured data' },
      { pass: ps.semanticCount > 0, label: 'Semantic HTML elements' },
      { pass: ps.ariaCount > 0, label: 'ARIA accessibility' },
      { pass: forms.length > 0, label: 'Interactive forms' },
      { pass: hasWebMCP, label: 'WebMCP tool attributes' },
      { pass: page?.scanData?.scriptRegistrations?.length > 0, label: 'JS tool registrations' },
      { pass: protocols?.a2a?.found, label: 'A2A Agent Card' },
      { pass: protocols?.mcp?.found, label: 'MCP Discovery' },
      { pass: protocols?.agents?.found, label: 'agents.json' },
      { pass: protocols?.openapi?.found, label: 'OpenAPI / Swagger' },
      { pass: protocols?.llms?.found, label: 'llms.txt' },
    ];

    // Add bot access summary to checklist
    const rt = protocols?.robotsTxt;
    if (rt) {
      const allAllowed = rt.blockedCount === 0;
      checks.push({ pass: allAllowed, label: `AI Bot Access (${rt.totalBots - rt.blockedCount}/${rt.totalBots} bots allowed)` });
    }

    container.innerHTML = checks.map(ch => `
      <div class="check-item ${ch.pass ? 'check-pass' : 'check-fail'}">
        <div class="check-icon">${ch.pass ? '\u2713' : '\u2717'}</div>
        <div class="check-label">${ch.label}</div>
      </div>
    `).join('');

    // Render detailed bot access section
    if (rt) {
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
      let botHtml = '<h3 style="margin:24px 0 12px;font-size:15px">AI Bot Access (robots.txt)</h3>';
      if (!rt.found) {
        botHtml += '<p style="color:#94a3b8;font-size:12px">No robots.txt found — all bots allowed</p>';
      } else {
        botHtml += botList.map(b => {
          const isBlocked = rt.blockedBots.includes(b.agent);
          return `<div class="check-item ${isBlocked ? 'check-fail' : 'check-pass'}">
            <div class="check-icon">${isBlocked ? '\u2717' : '\u2713'}</div>
            <div class="check-label">${b.agent} <span style="color:#94a3b8;font-size:10px">(${b.owner})</span> — ${isBlocked ? 'blocked' : 'allowed'}</div>
          </div>`;
        }).join('');
        const allowed = rt.totalBots - rt.blockedCount;
        botHtml += `<p style="font-size:12px;color:#94a3b8;margin-top:8px">${allowed}/${rt.totalBots} AI bots allowed</p>`;
      }
      container.insertAdjacentHTML('beforeend', botHtml);
    }
  }

  // =============================================
  // ACTION PLAN — the core value
  // =============================================
  function renderActionPlan(page, analysis, data) {
    const container = $('#r-actions');
    const actions = generateActions(page, analysis, data);

    if (actions.length === 0) {
      container.innerHTML = '<div class="empty-state">No actions needed — your site is agent-ready!</div>';
      return;
    }

    actions.forEach((action, i) => {
      const card = document.createElement('div');
      card.className = 'action-card';
      const hasCode = !!action.code;
      const isLocked = hasCode && i >= ACTION_LIMIT;

      card.innerHTML = `
        <div class="action-header">
          <div class="action-priority priority-${action.priority}"></div>
          <div class="action-title">${esc(action.title)}</div>
          <div class="action-badges">
            <span class="badge badge-${action.difficulty}">${action.difficulty}</span>
            <span class="badge badge-impact">${action.impact}</span>
          </div>
          <div class="action-chevron">&#8250;</div>
        </div>
        <div class="action-body">
          <div class="action-desc">${action.description}</div>
          ${hasCode && !isLocked ? `
            <div class="action-code">
              <button class="copy-btn" data-code="${esc(action.code)}">Copy</button>
              <pre>${esc(action.code)}</pre>
            </div>
          ` : ''}
          ${isLocked ? `
            <div class="action-lock-overlay">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Upgrade to Pro to see the code fix for this action
            </div>
          ` : ''}
        </div>
      `;

      card.querySelector('.action-header').addEventListener('click', () => {
        card.classList.toggle('open');
      });

      const copyBtn = card.querySelector('.copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(action.code);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
        });
      }

      container.appendChild(card);
    });
  }

  function generateActions(page, analysis, data) {
    const actions = [];
    const forms = page?.forms || [];
    const ps = page?.scanData?.pageSignals || {};
    const regs = page?.scanData?.scriptRegistrations || [];
    const isHTTPS = page?.scanData?.security?.isHTTPS;
    const hasWebMCP = forms.some(f => f.hasWebMCP);
    const protocols = data?.protocols || {};
    let domain = '';
    try { domain = new URL(page.url).hostname; } catch {}

    // 1. HTTPS
    if (!isHTTPS) {
      actions.push({
        title: 'Enable HTTPS',
        priority: 'high', difficulty: 'medium', impact: '+20 score',
        description: 'WebMCP requires a Secure Context (HTTPS). Without it, navigator.modelContext is not available and AI agents cannot discover any tools on your site.',
        code: null
      });
    }

    // 2. Forms without WebMCP
    const nonWM = forms.filter(f => !f.hasWebMCP);
    if (nonWM.length > 0) {
      const f = nonWM[0];
      const toolName = inferToolName(f);
      const toolDesc = inferToolDescription(f, domain);
      actions.push({
        title: `Add WebMCP to "${toolName}" form`,
        priority: 'high', difficulty: 'easy', impact: '+30 score',
        description: `This form has ${f.fields.length} field${f.fields.length > 1 ? 's' : ''} but AI agents can't see it. Add two HTML attributes to make it instantly discoverable. This is the highest-impact change you can make.`,
        code: generateFormFix(f, toolName, toolDesc)
      });

      if (nonWM.length > 1) {
        const f2 = nonWM[1];
        const tn2 = inferToolName(f2);
        const td2 = inferToolDescription(f2, domain);
        actions.push({
          title: `Add WebMCP to "${tn2}" form`,
          priority: 'high', difficulty: 'easy', impact: '+15 score',
          description: `Another form with ${f2.fields.length} field${f2.fields.length > 1 ? 's' : ''} that AI agents cannot interact with.`,
          code: generateFormFix(f2, tn2, td2)
        });
      }
    }

    // 3. No forms at all — suggest registerTool
    if (forms.length === 0 && regs.length === 0) {
      actions.push({
        title: 'Register a tool via JavaScript API',
        priority: 'high', difficulty: 'easy', impact: '+35 score',
        description: 'Your page has no forms. You can still expose actions to AI agents using the imperative API. This lets agents trigger custom actions like navigation, search, or data retrieval.',
        code: generateSuggestedTool(page, domain)
      });
    }

    // 4. Missing JSON-LD
    if (!ps.hasJsonLd) {
      actions.push({
        title: 'Add JSON-LD structured data',
        priority: 'medium', difficulty: 'easy', impact: '+15 score',
        description: 'JSON-LD helps AI agents understand what your page is about — whether it\'s a product, article, business, or service. Google also uses this for rich search results.',
        code: generateJsonLd(page, domain, ps)
      });
    }

    // 5. Missing meta description
    if (!ps.hasMetaDescription) {
      actions.push({
        title: 'Add a meta description',
        priority: 'medium', difficulty: 'easy', impact: '+10 score',
        description: 'AI agents read meta descriptions to quickly understand a page\'s purpose before diving deeper. Without one, agents have to parse the full page content.',
        code: `<meta name="description" content="Brief description of what this page offers and what users can do here.">`
      });
    }

    // 6. Missing OG tags
    if (!ps.hasOgTags) {
      actions.push({
        title: 'Add Open Graph tags',
        priority: 'low', difficulty: 'easy', impact: '+5 score',
        description: 'Open Graph tags provide structured metadata that AI agents use to identify your page\'s title, description, and type at a glance.',
        code: `<meta property="og:title" content="${esc(ps.title || 'Page Title')}">\n<meta property="og:description" content="What this page does">\n<meta property="og:type" content="website">\n<meta property="og:url" content="${esc(page.url)}">`
      });
    }

    // 7. No semantic HTML
    if (ps.semanticCount === 0) {
      actions.push({
        title: 'Use semantic HTML elements',
        priority: 'low', difficulty: 'easy', impact: '+8 score',
        description: 'Replace generic <div> containers with semantic elements like <main>, <nav>, <article>, <section>. This helps AI agents understand your page layout and find relevant content faster.',
        code: null
      });
    }

    // 8. No ARIA
    if (ps.ariaCount === 0) {
      actions.push({
        title: 'Add ARIA labels to interactive elements',
        priority: 'low', difficulty: 'easy', impact: '+5 score',
        description: 'ARIA labels describe the purpose of buttons, links, and form fields. AI agents use these labels to understand what each element does.',
        code: `<!-- Example: add aria-label to buttons and links -->\n<button aria-label="Submit booking request">Book Now</button>\n<a href="/contact" aria-label="Contact us for inquiries">Contact</a>`
      });
    }

    // 9. Missing A2A Agent Card
    if (!protocols?.a2a?.found) {
      actions.push({
        title: 'Add A2A Agent Card',
        priority: 'medium', difficulty: 'easy', impact: '+15 score',
        description: 'Google\'s Agent-to-Agent protocol lets AI agents discover your site\'s capabilities. Create a JSON file at /.well-known/agent.json describing your agent\'s skills and authentication.',
        code: `// Create file: /.well-known/agent.json
{
  "name": "${esc(domain)} Agent",
  "description": "AI agent for ${esc(domain)}",
  "url": "https://${esc(domain)}",
  "version": "1.0.0",
  "capabilities": {
    "streaming": false,
    "pushNotifications": false
  },
  "skills": [
    {
      "name": "general_info",
      "description": "Get information about ${esc(domain)}",
      "tags": ["info", "help"]
    }
  ],
  "authentication": null
}`
      });
    }

    // 10. Missing MCP Discovery
    if (!protocols?.mcp?.found) {
      actions.push({
        title: 'Add MCP Discovery endpoint',
        priority: 'medium', difficulty: 'easy', impact: '+15 score',
        description: 'MCP (Model Context Protocol) discovery lets AI tools like Claude Code, Cursor, and Copilot find and connect to your MCP servers automatically.',
        code: `// Create file: /.well-known/mcp.json
{
  "mcpServers": {
    "${domain.replace(/\./g, '-')}": {
      "url": "https://${esc(domain)}/mcp",
      "transport": "streamable-http",
      "description": "MCP server for ${esc(domain)}"
    }
  }
}`
      });
    }

    // 11. Missing llms.txt
    if (!protocols?.llms?.found) {
      actions.push({
        title: 'Add llms.txt',
        priority: 'low', difficulty: 'easy', impact: '+10 score',
        description: 'llms.txt is a simple Markdown file at /llms.txt that tells LLMs what your site is about, what resources are available, and how to interact with your content. Think of it as robots.txt for AI.',
        code: generateLlmsTxt(ps, domain)
      });
    }

    // 12. Missing OpenAPI
    if (!protocols?.openapi?.found && (forms.length > 0 || regs.length > 0)) {
      actions.push({
        title: 'Add OpenAPI specification',
        priority: 'low', difficulty: 'medium', impact: '+10 score',
        description: 'An OpenAPI/Swagger specification lets AI agents understand your API endpoints, parameters, and response formats. Essential if your site has an API.',
        code: null
      });
    }

    // 13. Missing agents.json
    if (!protocols?.agents?.found) {
      actions.push({
        title: 'Add agents.json',
        priority: 'low', difficulty: 'easy', impact: '+10 score',
        description: 'agents.json lists all AI agents available on your domain, their protocols, and capabilities. It acts as a directory for multi-agent discovery.',
        code: `// Create file: /.well-known/agents.json
{
  "agents": [
    {
      "name": "${esc(domain)} Assistant",
      "description": "AI assistant for ${esc(domain)}",
      "protocol": "a2a",
      "url": "https://${esc(domain)}/.well-known/agent.json",
      "capabilities": ["chat", "search"]
    }
  ]
}`
      });
    }

    // 14. WebMCP forms with missing field descriptions
    const wmForms = forms.filter(f => f.hasWebMCP);
    wmForms.forEach(form => {
      const noDesc = form.fields.filter(f => !f.toolparamdescription);
      if (noDesc.length > 0) {
        actions.push({
          title: `Add field descriptions to "${form.toolname || 'form'}"`,
          priority: 'medium', difficulty: 'easy', impact: '+10 score',
          description: `${noDesc.length} field${noDesc.length > 1 ? 's' : ''} in this form ${noDesc.length > 1 ? 'are' : 'is'} missing toolparamdescription. AI agents need these to understand what data to provide.`,
          code: noDesc.map(f => `<input name="${f.name || f.id}" toolparamdescription="Describe what this field expects">`).join('\n')
        });
      }
    });

    return actions;
  }

  // =============================================
  // CODE GENERATORS
  // =============================================
  function inferToolName(form) {
    if (form.toolname) return form.toolname;
    if (form.name) return form.name.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (form.id) return form.id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (form.nearestHeading) return form.nearestHeading;
    const actionHints = (form.action || '').match(/\/([\w-]+)\/?$/);
    if (actionHints) return actionHints[1].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return 'Form ' + (form.index + 1);
  }

  function inferToolDescription(form, domain) {
    const name = inferToolName(form).toLowerCase();
    if (/contact|contatt/i.test(name)) return `Send a message or inquiry via the contact form on ${domain}`;
    if (/search|cerca/i.test(name)) return `Search for content on ${domain}`;
    if (/login|accedi|sign.?in/i.test(name)) return `Sign in to your account on ${domain}`;
    if (/register|registr|sign.?up/i.test(name)) return `Create a new account on ${domain}`;
    if (/book|prenot|reserv/i.test(name)) return `Make a booking or reservation on ${domain}`;
    if (/subscri|newslet|iscri/i.test(name)) return `Subscribe to updates from ${domain}`;
    if (/comment|commen/i.test(name)) return `Leave a comment on ${domain}`;
    if (/review|recens/i.test(name)) return `Submit a review on ${domain}`;
    if (/quote|preventiv/i.test(name)) return `Request a quote from ${domain}`;
    return `Submit the ${inferToolName(form)} form on ${domain}`;
  }

  function generateFormFix(form, toolName, toolDesc) {
    const slug = toolName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    let code = `<!-- Add these attributes to your <form> tag -->\n`;
    code += `<form toolname="${slug}" tooldescription="${toolDesc}"`;
    if (form.action) code += `\n      action="${form.action}" method="${form.method}"`;
    code += `>\n`;
    form.fields.forEach(f => {
      const paramDesc = inferFieldDescription(f);
      code += `  <input name="${f.name || f.id || 'field'}" type="${f.type}"`;
      code += ` toolparamdescription="${paramDesc}"`;
      if (f.required) code += ` required`;
      code += `>\n`;
    });
    code += `</form>`;
    return code;
  }

  function inferFieldDescription(field) {
    const name = (field.name || field.id || '').toLowerCase();
    const label = (field.label || field.placeholder || '').toLowerCase();
    const hint = name + ' ' + label;

    if (/email|e-mail/.test(hint)) return 'Email address';
    if (/phone|tel|cellulare/.test(hint)) return 'Phone number';
    if (/first.?name|nome/.test(hint)) return 'First name';
    if (/last.?name|cognome/.test(hint)) return 'Last name';
    if (/name|nome/.test(hint)) return 'Full name';
    if (/subject|oggetto/.test(hint)) return 'Subject of the message';
    if (/message|messaggio|body|testo/.test(hint)) return 'Message content';
    if (/date|data/.test(hint)) return 'Date selection';
    if (/check.?in|arriv/.test(hint)) return 'Check-in date';
    if (/check.?out|parten/.test(hint)) return 'Check-out date';
    if (/guest|ospit|person/.test(hint)) return 'Number of guests';
    if (/search|cerca|query/.test(hint)) return 'Search query';
    if (/password/.test(hint)) return 'Account password';
    if (/url|website|sito/.test(hint)) return 'Website URL';
    if (/company|azienda/.test(hint)) return 'Company name';
    if (/address|indirizzo/.test(hint)) return 'Street address';
    if (/city|citta/.test(hint)) return 'City';
    if (/zip|cap|postal/.test(hint)) return 'Postal code';
    if (field.label) return field.label;
    if (field.placeholder) return field.placeholder;
    return 'Describe what this field expects';
  }

  function generateSuggestedTool(page, domain) {
    const ps = page?.scanData?.pageSignals || {};
    const title = ps.title || domain;

    // Try to suggest based on page content
    if (/book|prenot|reserv|vacanz/i.test(title)) {
      return `// Add this <script> to your page
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
    }

    if (/shop|store|product|negozio|prodott/i.test(title)) {
      return `// Add this <script> to your page
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "search_products",
    description: "Search the product catalog on ${domain}",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search terms" },
        category: { type: "string", description: "Product category" },
        maxPrice: { type: "number", description: "Maximum price" }
      },
      required: ["query"]
    },
    handler: async (params) => {
      // Your search logic here
      return { results: [] };
    }
  });
}`;
    }

    // Generic
    return `// Add this <script> to your page
if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "get_info",
    description: "Get information about ${domain} — services, hours, contact details",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "What information to retrieve (e.g. services, hours, pricing, contact)" }
      },
      required: ["topic"]
    },
    handler: async (params) => {
      // Return relevant info based on topic
      return { info: "..." };
    }
  });
}`;
  }

  function generateLlmsTxt(ps, domain) {
    const title = ps.title || domain;
    if (/hotel|villa|b&b|apartment|vacanz|holiday|lodge|resort/i.test(title)) {
      return `# ${esc(title)}

> Accommodation and vacation rental in ${esc(domain)}. Book your stay, check availability, explore rooms and local attractions.

## Pages
- [Home](https://${esc(domain)}/): Overview and featured rooms
- [Rooms](https://${esc(domain)}/rooms): All available accommodations
- [Booking](https://${esc(domain)}/booking): Check availability and book
- [Contact](https://${esc(domain)}/contact): Get in touch

## Key Information
- Location: [Your location]
- Check-in: 3:00 PM | Check-out: 10:00 AM
- Languages: Italian, English`;
    }
    if (/shop|store|ecommerce|product|negozio/i.test(title)) {
      return `# ${esc(title)}

> Online store at ${esc(domain)}. Browse products, search catalog, and place orders.

## Pages
- [Home](https://${esc(domain)}/): Featured products
- [Products](https://${esc(domain)}/products): Full catalog
- [Cart](https://${esc(domain)}/cart): Shopping cart
- [Contact](https://${esc(domain)}/contact): Customer support`;
    }
    return `# ${esc(title)}

> ${esc(domain)} — describe what your site offers and what users can do here.

## Pages
- [Home](https://${esc(domain)}/): Main page
- [About](https://${esc(domain)}/about): About us
- [Contact](https://${esc(domain)}/contact): Get in touch

## Features
- Describe your main features here`;
  }

  function generateJsonLd(page, domain, ps) {
    const title = ps.title || domain;
    if (/hotel|villa|b&b|apartment|vacanz|holiday/i.test(title)) {
      return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LodgingBusiness",
  "name": "${esc(title)}",
  "url": "${esc(page.url)}",
  "description": "Your business description here",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Your City",
    "addressCountry": "IT"
  }
}
</script>`;
    }
    if (/shop|store|ecommerce/i.test(title)) {
      return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Store",
  "name": "${esc(title)}",
  "url": "${esc(page.url)}"
}
</script>`;
    }
    return `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "${esc(title)}",
  "url": "${esc(page.url)}",
  "description": "Brief description of your website"
}
</script>`;
  }

  // =============================================
  // AGENT SIMULATOR
  // =============================================
  function renderAgentSimulator(page, analysis, protocols) {
    const container = $('#r-agent');
    const forms = page?.forms || [];
    const regs = (page?.scanData?.scriptRegistrations || []).filter(r => r.name !== '_provideContext');
    const hasWebMCP = forms.some(f => f.hasWebMCP) || regs.length > 0;

    let lines = '';
    lines += `<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Navigating to</span> ${esc(page.url)}</div>`;
    lines += `<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Scanning discovery protocols...</span></div>`;
    lines += `<div class="agent-line">&nbsp;</div>`;

    // Protocol discovery lines
    if (protocols && protocols.summary) {
      const pNames = ['a2a', 'mcp', 'agents', 'openapi', 'llms'];
      const pLabels = { a2a: 'A2A Agent Card', mcp: 'MCP Discovery', agents: 'agents.json', openapi: 'OpenAPI', llms: 'llms.txt' };
      pNames.forEach(p => {
        const found = protocols[p]?.found;
        lines += `<div class="agent-line">  <span class="${found ? 'agent-ok' : 'agent-err'}">${found ? '✓' : '✗'}</span> <span class="agent-dim">${pLabels[p]}</span>`;
        if (found && protocols[p].url) lines += ` <span class="agent-dim" style="opacity:0.5">— ${esc(protocols[p].url)}</span>`;
        lines += `</div>`;
      });
      lines += `<div class="agent-line">&nbsp;</div>`;
      if (protocols.summary.found > 0) {
        lines += `<div class="agent-line"><span class="agent-ok">✓ ${protocols.summary.found} protocol${protocols.summary.found > 1 ? 's' : ''} detected</span></div>`;
      } else {
        lines += `<div class="agent-line"><span class="agent-warn">! No discovery protocols found</span></div>`;
      }
      lines += `<div class="agent-line">&nbsp;</div>`;
    }

    lines += `<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Checking navigator.modelContext...</span></div>`;
    lines += `<div class="agent-line">&nbsp;</div>`;

    if (!hasWebMCP) {
      lines += `<div class="agent-line"><span class="agent-err">✗ No WebMCP tools found.</span></div>`;
      lines += `<div class="agent-line"><span class="agent-dim">I can only read text on this page. I cannot:</span></div>`;
      lines += `<div class="agent-line"><span class="agent-dim">  - Fill or submit any forms</span></div>`;
      lines += `<div class="agent-line"><span class="agent-dim">  - Trigger any actions</span></div>`;
      lines += `<div class="agent-line"><span class="agent-dim">  - Search or query the site</span></div>`;
      lines += `<div class="agent-line">&nbsp;</div>`;

      if (forms.length > 0) {
        lines += `<div class="agent-line"><span class="agent-warn">! I see ${forms.length} form${forms.length > 1 ? 's' : ''} in the HTML, but ${forms.length > 1 ? 'they are' : 'it is'} not exposed via WebMCP.</span></div>`;
        lines += `<div class="agent-line"><span class="agent-dim">These forms are invisible to me. I would need the user to fill them manually.</span></div>`;
      } else {
        lines += `<div class="agent-line"><span class="agent-dim">This page has no forms and no registered tools.</span></div>`;
        lines += `<div class="agent-line"><span class="agent-dim">I'm limited to reading visible text content.</span></div>`;
      }
    } else {
      const toolCount = regs.length + forms.filter(f => f.hasWebMCP).length;
      lines += `<div class="agent-line"><span class="agent-ok">✓ Found ${toolCount} tool${toolCount > 1 ? 's' : ''} via WebMCP</span></div>`;
      lines += `<div class="agent-line">&nbsp;</div>`;

      regs.forEach(r => {
        lines += `<div class="agent-line"><span class="agent-ok">  tool:</span> <strong>${esc(r.name)}</strong></div>`;
        lines += `<div class="agent-line"><span class="agent-dim">  ${esc(r.description)}</span></div>`;
        lines += `<div class="agent-line">&nbsp;</div>`;
      });

      forms.filter(f => f.hasWebMCP).forEach(f => {
        lines += `<div class="agent-line"><span class="agent-ok">  tool:</span> <strong>${esc(f.toolname)}</strong></div>`;
        lines += `<div class="agent-line"><span class="agent-dim">  ${esc(f.tooldescription || 'No description')}</span></div>`;
        f.fields.forEach(field => {
          lines += `<div class="agent-line"><span class="agent-dim">    param: ${esc(field.name || field.id)} (${field.type})${field.required ? ' *required' : ''}</span></div>`;
        });
        lines += `<div class="agent-line">&nbsp;</div>`;
      });
    }

    container.innerHTML = `
      <div class="agent-console">
        <div class="agent-console-header">
          <span class="agent-dot red"></span>
          <span class="agent-dot yellow"></span>
          <span class="agent-dot green"></span>
          <span class="agent-console-title">AI Agent — Tool Discovery</span>
        </div>
        <div class="agent-console-body">${lines}</div>
      </div>
    `;
  }

  // =============================================
  // CATEGORIES
  // =============================================
  function renderCategories(analysis) {
    const container = $('#r-categories');
    if (!analysis || !analysis.categories) { container.innerHTML = '<div class="empty-state">No analysis data available.</div>'; return; }
    container.innerHTML = '';
    const protocols = reportData?.protocols;
    for (let [key, cat] of Object.entries(analysis.categories)) {
      // Override protocols with actual data
      if (key === 'protocols' && protocols?.summary) {
        const pScore = Math.min(100, protocols.summary.found * 20);
        const pDetail = protocols.summary.found > 0
          ? `Found: ${protocols.summary.protocols.join(', ')}`
          : 'No AI discovery protocols detected';
        cat = { label: 'AI Protocols', score: pScore, detail: pDetail };
      }
      const cc = color(cat.score);
      const div = document.createElement('div');
      div.className = 'cat-card';
      div.innerHTML = `
        <div class="cat-bar-wrap">
          <div class="cat-name">${esc(cat.label)}</div>
          <div class="cat-bar"><div class="cat-bar-fill" style="background:${cc};"></div></div>
          <div class="cat-detail">${esc(cat.detail)}</div>
        </div>
        <div class="cat-score" style="color:${cc}">${cat.score}</div>
      `;
      container.appendChild(div);
      setTimeout(() => { div.querySelector('.cat-bar-fill').style.width = cat.score + '%'; }, 100);
    }
  }

  // =============================================
  // PAGES (full site)
  // =============================================
  function renderPages(pages) {
    const container = $('#r-page-list');
    container.innerHTML = '';
    pages.forEach((page, i) => {
      const c2 = color(page.score);
      const isLocked = page.locked || i >= PAGE_LIMIT;
      let shortUrl = page.url;
      try { shortUrl = new URL(page.url).pathname + new URL(page.url).search || '/'; } catch {}

      const row = document.createElement('div');
      row.className = 'page-row' + (isLocked ? ' locked' : '');
      row.innerHTML = `
        <div class="page-score" style="background:${c2}">${page.score}</div>
        <div class="page-info">
          <div class="page-url" title="${esc(page.url)}">${esc(shortUrl)}</div>
          <div class="page-meta">
            <span>${page.formCount} form${page.formCount !== 1 ? 's' : ''}</span>
            <span>${page.webmcpCount} WebMCP</span>
            <span>${page.issueCount} issue${page.issueCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        ${isLocked ? '<div class="page-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' : '<div class="page-arrow">&#8250;</div>'}
      `;
      if (!isLocked && !page.error && page.analysis) {
        row.addEventListener('click', () => showPageDetail(page));
      }
      container.appendChild(row);
    });
    if (pages.length > PAGE_LIMIT) { $('#r-pro-overlay').hidden = false; }
  }

  function showPageDetail(page) {
    const detail = $('#r-detail');
    detail.hidden = false;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const analysis = page.analysis;
    const c2 = color(page.score);
    const icons = { error: '!', warning: '!', success: '\u2713', info: 'i' };

    let html = `<div class="detail-header"><button class="detail-back" id="detail-back-btn">&larr; Back</button><div class="detail-score" style="color:${c2}">${page.score}</div></div>`;
    html += `<div class="detail-url">${esc(page.url)}</div>`;

    if (analysis?.categories) {
      html += '<div class="detail-section-title">Categories</div>';
      for (const [k, cat] of Object.entries(analysis.categories)) {
        const cc = color(cat.score);
        html += `<div class="cat-card"><div class="cat-bar-wrap"><div class="cat-name">${esc(cat.label)}</div><div class="cat-bar"><div class="cat-bar-fill" style="width:${cat.score}%;background:${cc}"></div></div><div class="cat-detail">${esc(cat.detail)}</div></div><div class="cat-score" style="color:${cc}">${cat.score}</div></div>`;
      }
    }

    if (analysis?.issues?.length > 0) {
      html += '<div class="detail-section-title">Issues</div>';
      analysis.issues.forEach(is => {
        html += `<div class="issue"><div class="issue-badge ${is.type}">${icons[is.type]}</div><div class="issue-body"><div class="issue-title">${esc(is.title)}</div><div class="issue-text">${esc(is.text)}</div></div></div>`;
      });
    }

    if (page.forms?.length > 0) {
      html += '<div class="detail-section-title">Forms</div>';
      page.forms.forEach(f => {
        const nm = f.toolname || f.name || f.id || 'Form';
        html += `<div class="form-card"><div class="form-header"><span class="form-name">${esc(nm)}</span><span class="form-badge ${f.hasWebMCP ? 'ready' : 'not-ready'}">${f.hasWebMCP ? 'WebMCP' : 'No WebMCP'}</span></div>`;
        if (f.fields?.length > 0) {
          html += '<div class="form-fields">';
          f.fields.forEach(ff => { html += `<div class="form-field"><span class="ff-name">${esc(ff.name || ff.id || '?')}</span><span class="ff-type">${ff.type}${ff.required ? ' *' : ''}</span></div>`; });
          html += '</div>';
        }
        html += '</div>';
      });
    }

    detail.innerHTML = html;
    detail.querySelector('#detail-back-btn').addEventListener('click', () => { detail.hidden = true; });
  }

  // =============================================
  // DOWNLOAD
  // =============================================
  function downloadReport() {
    if (!reportData) return;
    const page0 = reportData.pages?.[0];
    const analysis = page0?.analysis;
    let domain = '';
    try { domain = new URL(page0.url).hostname; } catch {}
    const c2 = color(reportData.avgScore);
    const verdict = getVerdict(reportData.avgScore, reportData.totalForms, page0);
    const actions = generateActions(page0, analysis, reportData);

    const protocols = reportData.protocols;
    const protocolCount = protocols?.summary?.found || 0;
    const protocolTotal = protocols?.summary?.total || 5;
    const planLabel = { free: 'Free', pro: 'Pro', team: 'Team' }[currentPlan] || 'Free';

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>AgentReady Report — ${domain}</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#0f172a;line-height:1.6}
h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin:32px 0 12px;border-bottom:1px solid #e2e8f0;padding-bottom:8px}
.score{font-size:56px;font-weight:800;color:${c2}}
.verdict{font-size:18px;font-weight:600;margin:4px 0}
.summary{color:#475569;font-size:14px;margin-bottom:24px}
.stats{display:flex;gap:24px;margin:16px 0;font-size:14px;flex-wrap:wrap}.stats span{color:#475569}.stats strong{color:#0f172a}
.plan-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;color:#fff;margin-left:8px}
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
<h1>AgentReady Report <span class="plan-badge" style="background:${{ free: '#94a3b8', pro: '#2563eb', team: '#7c3aed' }[currentPlan]}">${planLabel}</span></h1>
<p style="color:#475569;font-size:14px">${domain}</p>
<div class="score">${reportData.avgScore}/100</div>
<div class="verdict">${verdict.title}</div>
<div class="summary">${verdict.text}</div>
<div class="stats">
<span><strong>${reportData.totalPages}</strong> pages</span>
<span><strong>${reportData.totalForms}</strong> forms</span>
<span><strong>${protocolCount}/${protocolTotal}</strong> protocols</span>
<span><strong>${reportData.totalIssues}</strong> issues</span>
</div>`;

    // Badge section
    if (reportData.avgScore >= 75) {
      const badgeUrl = `https://img.shields.io/badge/CrawlAudit-Score_${reportData.avgScore}%2F100-10b981?style=for-the-badge`;
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
      const wipBadgeUrl = `https://img.shields.io/badge/CrawlAudit-Score_${reportData.avgScore}%2F100-f59e0b?style=for-the-badge`;
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

    html += '<h2>Action Plan</h2>';

    actions.forEach((a, i) => {
      html += `<div class="action"><div class="action-title">${i + 1}. ${a.title} <span style="font-size:11px;color:#94a3b8">[${a.priority} priority, ${a.difficulty}]</span></div>`;
      html += `<div class="action-desc">${a.description}</div>`;
      if (a.code && i < ACTION_LIMIT) html += `<pre>${esc(a.code)}</pre>`;
      else if (a.code) html += `<p style="color:#7c3aed;font-size:12px">Code snippet available with Pro plan</p>`;
      html += '</div>';
    });

    if (analysis?.categories) {
      html += '<h2>Score Breakdown</h2><table><tr><th>Category</th><th>Score</th><th>Detail</th></tr>';
      // Ordered categories
      const catOrder = ['forms', 'descriptions', 'schema', 'pageStructure', 'security', 'protocols', 'botAccess'];
      catOrder.forEach(key => {
        let cat = analysis.categories[key];
        if (!cat) return;
        // Override protocols category with actual protocol data
        if (key === 'protocols' && protocols?.summary) {
          const pScore = Math.min(100, protocols.summary.found * 20);
          const pDetail = protocols.summary.found > 0
            ? `Found: ${protocols.summary.protocols.join(', ')}`
            : 'No AI discovery protocols detected';
          cat = { label: 'AI Protocols', score: pScore, detail: pDetail };
        }
        html += `<tr><td>${cat.label}</td><td style="font-weight:600;color:${color(cat.score)}">${cat.score}/100</td><td style="color:#475569">${cat.detail}</td></tr>`;
      });
      html += '</table>';
    }

    if (reportData.pages.length > 1) {
      const pagesToShow = reportData.pages.slice(0, PAGE_LIMIT);
      const remaining = reportData.pages.length - pagesToShow.length;
      html += '<h2>Pages</h2><table><tr><th>Score</th><th>Page</th><th>Forms</th><th>Issues</th></tr>';
      pagesToShow.forEach(p => {
        let su = p.url; try { su = new URL(p.url).pathname || '/'; } catch {}
        html += `<tr><td style="font-weight:700;color:${color(p.score)}">${p.score}</td><td>${su}</td><td>${p.formCount}</td><td>${p.issueCount}</td></tr>`;
      });
      html += '</table>';
      if (remaining > 0) {
        html += `<p style="color:#7c3aed;font-size:13px;font-weight:600">+ ${remaining} more page${remaining > 1 ? 's' : ''} available with Pro plan</p>`;
      }
    }

    html += `<div class="footer">Generated by AgentReady (${planLabel}) | ${new Date().toISOString()} | erold90.github.io/AgentReady</div></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `agentready-report-${domain}.html`;
    a.click(); URL.revokeObjectURL(url);
  }
})();
