/**
 * protocols.js — Detect AI agent discovery protocols
 * Checks: A2A Agent Cards, MCP Discovery, agents.json, OpenAPI, llms.txt
 */
const ProtocolScanner = (() => {
  'use strict';

  const TIMEOUT = 5000;

  /**
   * Scan an origin for all known agent discovery protocols
   * @param {string} origin - e.g. "https://example.com"
   * @returns {Promise<object>} Protocol detection results
   */
  async function scan(origin) {
    const results = {
      a2a: null,
      mcp: null,
      agents: null,
      openapi: null,
      llms: null,
      summary: { found: 0, total: 5, protocols: [] }
    };

    const checks = await Promise.allSettled([
      checkA2A(origin),
      checkMCP(origin),
      checkAgentsJson(origin),
      checkOpenAPI(origin),
      checkLlmsTxt(origin)
    ]);

    results.a2a = checks[0].status === 'fulfilled' ? checks[0].value : { found: false, error: true };
    results.mcp = checks[1].status === 'fulfilled' ? checks[1].value : { found: false, error: true };
    results.agents = checks[2].status === 'fulfilled' ? checks[2].value : { found: false, error: true };
    results.openapi = checks[3].status === 'fulfilled' ? checks[3].value : { found: false, error: true };
    results.llms = checks[4].status === 'fulfilled' ? checks[4].value : { found: false, error: true };

    // Summary
    const protocols = [];
    if (results.a2a.found) protocols.push('A2A');
    if (results.mcp.found) protocols.push('MCP');
    if (results.agents.found) protocols.push('agents.json');
    if (results.openapi.found) protocols.push('OpenAPI');
    if (results.llms.found) protocols.push('llms.txt');
    results.summary = { found: protocols.length, total: 5, protocols };

    // robots.txt AI bot check (separate from protocol count)
    try {
      results.robotsTxt = await checkRobotsTxt(origin);
    } catch {
      results.robotsTxt = { found: false, blockedBots: [], allowedBots: AI_BOTS.map(b => b.agent), totalBots: AI_BOTS.length, blockedCount: 0 };
    }

    return results;
  }

  const AI_BOTS = [
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

  async function checkRobotsTxt(origin) {
    try {
      const resp = await fetchWithTimeout(origin + '/robots.txt');
      if (!resp.ok) {
        return {
          found: false,
          blockedBots: [],
          allowedBots: AI_BOTS.map(b => b.agent),
          totalBots: AI_BOTS.length,
          blockedCount: 0
        };
      }
      const text = await resp.text();
      const blocked = new Set();

      const lines = text.split('\n');
      let currentAgents = [];
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
          continue;
        }
        const uaMatch = line.match(/^User-agent\s*:\s*(.+)/i);
        if (uaMatch) {
          currentAgents.push(uaMatch[1].trim());
          continue;
        }
        const disallowMatch = line.match(/^Disallow\s*:\s*(.+)/i);
        if (disallowMatch) {
          const path = disallowMatch[1].trim();
          if (path === '/' || path === '/*') {
            const isWildcard = currentAgents.some(a => a === '*');
            for (const bot of AI_BOTS) {
              if (isWildcard || currentAgents.some(a => a.toLowerCase() === bot.agent.toLowerCase())) {
                blocked.add(bot.agent);
              }
            }
          }
        }
      }

      const blockedBots = AI_BOTS.filter(b => blocked.has(b.agent)).map(b => b.agent);
      const allowedBots = AI_BOTS.filter(b => !blocked.has(b.agent)).map(b => b.agent);

      return {
        found: true,
        blockedBots,
        allowedBots,
        totalBots: AI_BOTS.length,
        blockedCount: blockedBots.length
      };
    } catch {
      return {
        found: false,
        blockedBots: [],
        allowedBots: AI_BOTS.map(b => b.agent),
        totalBots: AI_BOTS.length,
        blockedCount: 0
      };
    }
  }

  // === A2A Agent Card ===
  async function checkA2A(origin) {
    try {
      const resp = await fetchWithTimeout(origin + '/.well-known/agent.json');
      if (!resp.ok) return { found: false };
      const data = await resp.json();
      if (!data.name && !data.url && !data.skills) return { found: false };
      return {
        found: true,
        name: data.name || '',
        description: data.description || '',
        version: data.version || '',
        skillCount: Array.isArray(data.skills) ? data.skills.length : 0,
        skills: (data.skills || []).slice(0, 5).map(s => ({ name: s.name, description: s.description })),
        hasAuth: !!data.authentication,
        capabilities: data.capabilities || {},
        url: origin + '/.well-known/agent.json'
      };
    } catch { return { found: false }; }
  }

  // === MCP Discovery ===
  async function checkMCP(origin) {
    try {
      const resp = await fetchWithTimeout(origin + '/.well-known/mcp.json');
      if (!resp.ok) return { found: false };
      const data = await resp.json();
      if (!data.mcpServers && !data.servers) return { found: false };
      const servers = data.mcpServers || data.servers || {};
      const serverList = Object.entries(servers).map(([name, cfg]) => ({
        name,
        url: cfg.url || '',
        transport: cfg.transport || 'unknown',
        description: cfg.description || ''
      }));
      return {
        found: true,
        serverCount: serverList.length,
        servers: serverList.slice(0, 5),
        version: data.version || '',
        url: origin + '/.well-known/mcp.json'
      };
    } catch { return { found: false }; }
  }

  // === agents.json ===
  async function checkAgentsJson(origin) {
    // Try .well-known first, then root
    for (const path of ['/.well-known/agents.json', '/agents.json']) {
      try {
        const resp = await fetchWithTimeout(origin + path);
        if (!resp.ok) continue;
        const data = await resp.json();
        if (!data.agents && !Array.isArray(data)) continue;
        const agents = data.agents || data;
        if (!Array.isArray(agents) || agents.length === 0) continue;
        return {
          found: true,
          agentCount: agents.length,
          agents: agents.slice(0, 5).map(a => ({
            name: a.name || '',
            description: a.description || '',
            protocol: a.protocol || '',
            capabilities: a.capabilities || []
          })),
          hasPolicies: !!data.policies,
          url: origin + path
        };
      } catch { continue; }
    }
    return { found: false };
  }

  // === OpenAPI ===
  async function checkOpenAPI(origin) {
    const paths = [
      '/openapi.json', '/openapi.yaml', '/swagger.json',
      '/api-docs', '/api-docs.json', '/.well-known/openapi.json',
      '/api/openapi.json'
    ];
    for (const path of paths) {
      try {
        const resp = await fetchWithTimeout(origin + path);
        if (!resp.ok) continue;
        const text = await resp.text();
        // Check if it looks like OpenAPI/Swagger
        if (text.includes('"openapi"') || text.includes('"swagger"') || text.includes('openapi:')) {
          let data;
          try { data = JSON.parse(text); } catch { data = null; }
          const version = data?.openapi || data?.swagger || 'unknown';
          const title = data?.info?.title || '';
          const pathCount = data?.paths ? Object.keys(data.paths).length : 0;
          return {
            found: true,
            version,
            title,
            pathCount,
            url: origin + path
          };
        }
      } catch { continue; }
    }
    return { found: false };
  }

  // === llms.txt ===
  async function checkLlmsTxt(origin) {
    for (const path of ['/llms.txt', '/.well-known/llms.txt']) {
      try {
        const resp = await fetchWithTimeout(origin + path);
        if (!resp.ok) continue;
        const text = await resp.text();
        // Must start with # (markdown heading) and have some content
        if (text.trim().length < 5 || !text.trim().startsWith('#')) continue;
        const lines = text.split('\n');
        const title = lines[0].replace(/^#+\s*/, '').trim();
        const linkCount = (text.match(/\[.*?\]\(.*?\)/g) || []).length;
        // Check for llms-full.txt
        let hasFull = false;
        try {
          const fullResp = await fetchWithTimeout(origin + '/llms-full.txt', 2000);
          hasFull = fullResp.ok;
        } catch {}
        return {
          found: true,
          title,
          lineCount: lines.length,
          linkCount,
          hasFull,
          url: origin + path
        };
      } catch { continue; }
    }
    return { found: false };
  }

  // === Helpers ===
  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms || TIMEOUT);
    return fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json, text/plain, */*' }
    }).finally(() => clearTimeout(timeout));
  }

  return { scan };
})();
