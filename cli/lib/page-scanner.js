/**
 * Page scanner for Node.js — fetches HTML and extracts WebMCP signals
 */
const TIMEOUT = 10000;

async function scanPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'text/html', 'User-Agent': 'AgentReady/1.0' }
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();

    return {
      url,
      status: resp.status,
      htmlLength: html.length,
      isHTTPS: url.startsWith('https:'),
      forms: extractForms(html),
      scriptRegistrations: extractScriptRegs(html),
      pageSignals: extractPageSignals(html),
      timestamp: new Date().toISOString()
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractForms(html) {
  const forms = [];
  const formRegex = /<form([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  let i = 0;

  while ((match = formRegex.exec(html)) !== null) {
    const attrs = match[1];
    const body = match[2];

    const toolname = attr(attrs, 'toolname');
    const tooldescription = attr(attrs, 'tooldescription');
    const hasWebMCP = !!(toolname || tooldescription);

    const fields = [];
    const inputRegex = /<(?:input|select|textarea)([^>]*)>/gi;
    let inp;
    while ((inp = inputRegex.exec(body)) !== null) {
      const ia = inp[1];
      const type = (attr(ia, 'type') || 'text').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset'].includes(type)) continue;
      const name = attr(ia, 'name');
      const id = attr(ia, 'id');
      if (!name && !id) continue;
      fields.push({
        type, name: name || '', id: id || '',
        placeholder: attr(ia, 'placeholder') || '',
        required: /\brequired\b/.test(ia),
        toolparamdescription: attr(ia, 'toolparamdescription') || ''
      });
    }

    if (fields.length === 0) { i++; continue; }

    forms.push({
      index: i, toolname: toolname || '', tooldescription: tooldescription || '',
      hasWebMCP, name: attr(attrs, 'name') || '', id: attr(attrs, 'id') || '',
      action: attr(attrs, 'action') || '', method: (attr(attrs, 'method') || 'GET').toUpperCase(),
      fields, fieldCount: fields.length
    });
    i++;
  }
  return forms;
}

function extractScriptRegs(html) {
  const regs = [];
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const t = match[1];
    if (!t.includes('modelContext')) continue;
    const toolMatches = t.matchAll(/registerTool\s*\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g);
    for (const m of toolMatches) {
      const nm = m[0].match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
      const dm = m[0].match(/description\s*:\s*['"`]([^'"`]+)['"`]/);
      regs.push({ name: nm ? nm[1] : 'unknown', description: dm ? dm[1] : '' });
    }
  }
  return regs;
}

function extractPageSignals(html) {
  return {
    hasTitle: /<title[^>]*>.{3,}<\/title>/i.test(html),
    hasMetaDescription: /<meta[^>]+name=["']description["'][^>]*>/i.test(html),
    hasOgTags: /<meta[^>]+property=["']og:/i.test(html),
    hasJsonLd: /<script[^>]+type=["']application\/ld\+json["']/i.test(html),
    hasSemanticHTML: /<(?:nav|main|article|section|header|footer|aside)\b/i.test(html),
    hasARIA: /\baria-(?:label|describedby|labelledby)\b|\brole=["']/i.test(html),
    formCount: (html.match(/<form\b/gi) || []).length
  };
}

function attr(str, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i');
  const m = str.match(re);
  return m ? m[1] : '';
}

module.exports = { scanPage };
