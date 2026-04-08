/**
 * Protocol scanner for Node.js
 * Checks: A2A Agent Cards, MCP Discovery, agents.json, OpenAPI, llms.txt
 */
const TIMEOUT = 5000;

async function scan(origin) {
  const results = {
    a2a: null, mcp: null, agents: null, openapi: null, llms: null,
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

  const protocols = [];
  if (results.a2a.found) protocols.push('A2A');
  if (results.mcp.found) protocols.push('MCP');
  if (results.agents.found) protocols.push('agents.json');
  if (results.openapi.found) protocols.push('OpenAPI');
  if (results.llms.found) protocols.push('llms.txt');
  results.summary = { found: protocols.length, total: 5, protocols };

  return results;
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms || TIMEOUT);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json, text/plain, */*', 'User-Agent': 'AgentReady/1.0' }
    });
    return resp;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkA2A(origin) {
  try {
    const resp = await fetchWithTimeout(origin + '/.well-known/agent.json');
    if (!resp.ok) return { found: false };
    const data = await resp.json();
    if (!data.name && !data.url && !data.skills) return { found: false };
    return {
      found: true, name: data.name || '', description: data.description || '',
      version: data.version || '',
      skillCount: Array.isArray(data.skills) ? data.skills.length : 0,
      hasAuth: !!data.authentication,
      url: origin + '/.well-known/agent.json'
    };
  } catch { return { found: false }; }
}

async function checkMCP(origin) {
  try {
    const resp = await fetchWithTimeout(origin + '/.well-known/mcp.json');
    if (!resp.ok) return { found: false };
    const data = await resp.json();
    if (!data.mcpServers && !data.servers) return { found: false };
    const servers = data.mcpServers || data.servers || {};
    return {
      found: true,
      serverCount: Object.keys(servers).length,
      servers: Object.entries(servers).slice(0, 5).map(([name, cfg]) => ({
        name, url: cfg.url || '', transport: cfg.transport || 'unknown'
      })),
      url: origin + '/.well-known/mcp.json'
    };
  } catch { return { found: false }; }
}

async function checkAgentsJson(origin) {
  for (const path of ['/.well-known/agents.json', '/agents.json']) {
    try {
      const resp = await fetchWithTimeout(origin + path);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.agents && !Array.isArray(data)) continue;
      const agents = data.agents || data;
      if (!Array.isArray(agents) || agents.length === 0) continue;
      return {
        found: true, agentCount: agents.length,
        agents: agents.slice(0, 5).map(a => ({ name: a.name || '', protocol: a.protocol || '' })),
        url: origin + path
      };
    } catch { continue; }
  }
  return { found: false };
}

async function checkOpenAPI(origin) {
  const paths = [
    '/openapi.json', '/openapi.yaml', '/swagger.json',
    '/api-docs', '/api-docs.json', '/.well-known/openapi.json', '/api/openapi.json'
  ];
  for (const path of paths) {
    try {
      const resp = await fetchWithTimeout(origin + path);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.includes('"openapi"') || text.includes('"swagger"') || text.includes('openapi:')) {
        let data; try { data = JSON.parse(text); } catch { data = null; }
        return {
          found: true,
          version: data?.openapi || data?.swagger || 'unknown',
          title: data?.info?.title || '',
          pathCount: data?.paths ? Object.keys(data.paths).length : 0,
          url: origin + path
        };
      }
    } catch { continue; }
  }
  return { found: false };
}

async function checkLlmsTxt(origin) {
  for (const path of ['/llms.txt', '/.well-known/llms.txt']) {
    try {
      const resp = await fetchWithTimeout(origin + path);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (text.length < 20 || !text.trim().startsWith('#')) continue;
      const lines = text.split('\n');
      return {
        found: true,
        title: lines[0].replace(/^#+\s*/, '').trim(),
        lineCount: lines.length,
        linkCount: (text.match(/\[.*?\]\(.*?\)/g) || []).length,
        url: origin + path
      };
    } catch { continue; }
  }
  return { found: false };
}

module.exports = { scan };
