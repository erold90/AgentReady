/**
 * protocols.js — Browser-side AI protocol detection for the online demo
 * Checks via CORS proxy: A2A, MCP Discovery, agents.json, OpenAPI, llms.txt
 */
const ProtocolScanner = (() => {
  'use strict';

  const TIMEOUT = 6000;
  const PROXY = (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

  async function scan(origin) {
    const results = {
      a2a: null, mcp: null, agents: null, openapi: null, llms: null,
      summary: { found: 0, total: 5, protocols: [] }
    };

    const checks = await Promise.allSettled([
      checkA2A(origin), checkMCP(origin), checkAgentsJson(origin),
      checkOpenAPI(origin), checkLlmsTxt(origin)
    ]);

    results.a2a = checks[0].status === 'fulfilled' ? checks[0].value : { found: false };
    results.mcp = checks[1].status === 'fulfilled' ? checks[1].value : { found: false };
    results.agents = checks[2].status === 'fulfilled' ? checks[2].value : { found: false };
    results.openapi = checks[3].status === 'fulfilled' ? checks[3].value : { found: false };
    results.llms = checks[4].status === 'fulfilled' ? checks[4].value : { found: false };

    const protocols = [];
    if (results.a2a.found) protocols.push('A2A');
    if (results.mcp.found) protocols.push('MCP');
    if (results.agents.found) protocols.push('agents.json');
    if (results.openapi.found) protocols.push('OpenAPI');
    if (results.llms.found) protocols.push('llms.txt');
    results.summary = { found: protocols.length, total: 5, protocols };
    return results;
  }

  async function fetchProxy(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const resp = await fetch(PROXY(url), {
        signal: controller.signal,
        headers: { 'Accept': 'application/json, text/plain, */*' }
      });
      return resp;
    } finally { clearTimeout(timeout); }
  }

  async function checkA2A(origin) {
    try {
      const resp = await fetchProxy(origin + '/.well-known/agent.json');
      if (!resp.ok) return { found: false };
      const data = await resp.json();
      if (!data.name && !data.url && !data.skills) return { found: false };
      return { found: true, name: data.name || '', url: origin + '/.well-known/agent.json' };
    } catch { return { found: false }; }
  }

  async function checkMCP(origin) {
    try {
      const resp = await fetchProxy(origin + '/.well-known/mcp.json');
      if (!resp.ok) return { found: false };
      const data = await resp.json();
      if (!data.mcpServers && !data.servers) return { found: false };
      return { found: true, serverCount: Object.keys(data.mcpServers || data.servers || {}).length, url: origin + '/.well-known/mcp.json' };
    } catch { return { found: false }; }
  }

  async function checkAgentsJson(origin) {
    for (const path of ['/.well-known/agents.json', '/agents.json']) {
      try {
        const resp = await fetchProxy(origin + path);
        if (!resp.ok) continue;
        const data = await resp.json();
        const agents = data.agents || (Array.isArray(data) ? data : null);
        if (!agents || agents.length === 0) continue;
        return { found: true, agentCount: agents.length, url: origin + path };
      } catch { continue; }
    }
    return { found: false };
  }

  async function checkOpenAPI(origin) {
    for (const path of ['/openapi.json', '/swagger.json', '/.well-known/openapi.json', '/api-docs.json']) {
      try {
        const resp = await fetchProxy(origin + path);
        if (!resp.ok) continue;
        const text = await resp.text();
        if (text.includes('"openapi"') || text.includes('"swagger"')) {
          let data; try { data = JSON.parse(text); } catch { data = null; }
          return { found: true, version: data?.openapi || data?.swagger || '?', title: data?.info?.title || '', url: origin + path };
        }
      } catch { continue; }
    }
    return { found: false };
  }

  async function checkLlmsTxt(origin) {
    for (const path of ['/llms.txt', '/.well-known/llms.txt']) {
      try {
        const resp = await fetchProxy(origin + path);
        if (!resp.ok) continue;
        const text = await resp.text();
        if (text.length < 20 || !text.trim().startsWith('#')) continue;
        return { found: true, title: text.split('\n')[0].replace(/^#+\s*/, '').trim(), url: origin + path };
      } catch { continue; }
    }
    return { found: false };
  }

  return { scan };
})();
