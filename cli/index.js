/**
 * AgentReady — AI Agent Readiness Scanner
 * Programmatic API with multi-page crawl support
 */
const protocols = require('./lib/protocols');
const pageScanner = require('./lib/page-scanner');

const TIMEOUT = 10000;

/**
 * Scan a single page + protocols
 */
async function scan(url) {
  const origin = new URL(url).origin;

  const [page, protocolResults] = await Promise.all([
    pageScanner.scanPage(url),
    protocols.scan(origin)
  ]);

  const result = analyzePage(page, protocolResults);
  result.protocols = protocolResults;
  return result;
}

/**
 * Full site crawl — discovers pages from sitemap/HTML links, scans each
 */
async function crawl(url, { maxPages = 20, onProgress } = {}) {
  const origin = new URL(url).origin;

  // Protocol scan runs once (per-origin)
  const protocolResults = await protocols.scan(origin);

  // Discover pages
  const discovered = await discoverPages(url, origin, maxPages);

  const pages = [];
  const failedPages = [];
  for (let i = 0; i < discovered.length; i++) {
    const pageUrl = discovered[i];
    if (onProgress) onProgress(i + 1, discovered.length, pageUrl);
    try {
      const page = await pageScanner.scanPage(pageUrl);
      const result = analyzePage(page, protocolResults);
      pages.push(result);
    } catch (err) {
      failedPages.push({ url: pageUrl, error: err.message || 'Failed to scan' });
    }
  }

  // Aggregate
  const avgScore = pages.length > 0
    ? Math.round(pages.reduce((s, p) => s + p.score, 0) / pages.length)
    : 0;
  const totalForms = pages.reduce((s, p) => s + p.forms.total, 0);
  const totalIssues = pages.reduce((s, p) => s + p.issues.length, 0);

  return {
    url,
    origin,
    score: avgScore,
    pageCount: pages.length,
    totalForms,
    totalIssues,
    pages,
    failedPages,
    failedCount: failedPages.length,
    protocols: protocolResults,
    timestamp: new Date().toISOString()
  };
}

/**
 * Analyze a page using the same 6-category weighted system as the extension
 */
function analyzePage(page, protocolResults) {
  const forms = page.forms;
  const scriptRegs = page.scriptRegistrations;
  const hasWebMCP = forms.some(f => f.hasWebMCP) || scriptRegs.length > 0;

  // --- Category scores (same as extension/js/analyzer.js) ---

  // 1. Forms & Tools
  let formsScore = 0;
  if (forms.length === 0 && scriptRegs.length === 0) {
    formsScore = 0;
  } else if (forms.length === 0) {
    formsScore = scriptRegs.length > 0 ? 80 : 0;
  } else {
    const wmCount = forms.filter(f => f.hasWebMCP).length;
    formsScore = Math.round((wmCount / forms.length) * 100);
    if (scriptRegs.length > 0) formsScore = Math.min(100, formsScore + 20);
  }

  // 2. Descriptions
  let descScore = 0;
  const wmForms = forms.filter(f => f.hasWebMCP);
  if (wmForms.length > 0 || scriptRegs.length > 0) {
    let total = 0, passed = 0;
    wmForms.forEach(form => {
      total++;
      if (form.tooldescription && form.tooldescription.length > 10) passed++;
      form.fields.forEach(f => { total++; if (f.toolparamdescription && f.toolparamdescription.length > 3) passed++; });
    });
    scriptRegs.forEach(r => { total++; if (r.description && r.description.length > 10) passed++; });
    descScore = total > 0 ? Math.round((passed / total) * 100) : 0;
  }

  // 3. Schema Quality
  let schemaScore = 0;
  if (wmForms.length > 0) {
    let total = 0, passed = 0;
    wmForms.forEach(form => {
      form.fields.forEach(f => {
        total++; if (f.name) passed++;
        total++; if (f.type !== 'text' || f.name) passed++;
        total++; if (f.required) passed += 0.5;
      });
    });
    schemaScore = total > 0 ? Math.min(100, Math.round((passed / total) * 100)) : 0;
  }

  // 4. Page Structure
  let pageStructureScore = 0;
  const ps = page.pageSignals;
  const details = [];
  if (ps.hasTitle) pageStructureScore += 10;
  if (ps.hasMetaDescription) { pageStructureScore += 10; details.push('meta description'); }
  if (ps.hasOgTags) { pageStructureScore += 5; details.push('OG tags'); }
  if (ps.hasJsonLd) { pageStructureScore += 15; details.push('JSON-LD'); }
  // semanticCount: CLI uses boolean, convert
  const semanticCount = ps.hasSemanticHTML ? 3 : 0;
  pageStructureScore += Math.min(20, semanticCount * 4);
  if (semanticCount > 0) details.push('semantic HTML');
  // ARIA
  const ariaCount = ps.hasARIA ? 3 : 0;
  if (ariaCount > 0) { pageStructureScore += Math.min(15, ariaCount * 3); details.push('ARIA'); }
  if (ps.formCount > 0) { pageStructureScore += 10; details.push(`${ps.formCount} forms`); }
  pageStructureScore = Math.min(100, pageStructureScore);

  // 5. Security (HTTPS + security headers)
  const sh = page.securityHeaders || {};
  let securityScore = 0;
  const securityDetails = [];
  if (page.isHTTPS) { securityScore += 40; securityDetails.push('HTTPS'); }
  if (sh.hsts) { securityScore += 15; securityDetails.push('HSTS'); }
  if (sh.csp) { securityScore += 15; securityDetails.push('CSP'); }
  if (sh.xContentType) { securityScore += 10; securityDetails.push('X-Content-Type-Options'); }
  if (sh.xFrame) { securityScore += 10; securityDetails.push('X-Frame-Options'); }
  if (sh.referrerPolicy) { securityScore += 10; securityDetails.push('Referrer-Policy'); }

  // 6. Protocols
  const protocolScore = protocolResults?.summary ? Math.min(100, protocolResults.summary.found * 20) : 0;

  // 7. Bot Access (robots.txt AI bot blocking)
  const rt = protocolResults?.robotsTxt;
  let botAccessScore = 100; // default: all allowed
  let botAccessDetail = 'No robots.txt — all bots allowed';
  if (rt && rt.found) {
    botAccessScore = rt.totalBots > 0 ? Math.round(((rt.totalBots - rt.blockedCount) / rt.totalBots) * 100) : 100;
    botAccessDetail = rt.blockedCount > 0
      ? `${rt.blockedCount}/${rt.totalBots} bots blocked: ${rt.blockedBots.join(', ')}`
      : `All ${rt.totalBots} bots allowed`;
  }

  // --- Weighted total (same weights as extension) ---
  const categories = {
    forms: { score: formsScore, label: 'Forms & Tools' },
    descriptions: { score: descScore, label: 'Descriptions' },
    schema: { score: schemaScore, label: 'Schema Quality' },
    pageStructure: { score: pageStructureScore, label: 'Page Structure', detail: details.join(', ') },
    security: { score: securityScore, label: 'Security', detail: securityDetails.join(', ') || 'No security headers' },
    protocols: { score: protocolScore, label: 'AI Protocols' },
    botAccess: { score: botAccessScore, label: 'Bot Access', detail: botAccessDetail }
  };

  let weights;
  if (hasWebMCP) {
    weights = { forms: 23, descriptions: 18, schema: 10, pageStructure: 12, security: 10, protocols: 17, botAccess: 10 };
  } else if (forms.length > 0) {
    weights = { forms: 20, descriptions: 7, schema: 7, pageStructure: 27, security: 15, protocols: 14, botAccess: 10 };
  } else {
    weights = { forms: 7, descriptions: 3, schema: 3, pageStructure: 47, security: 15, protocols: 14, botAccess: 11 };
  }

  let totalScore = 0;
  for (const [key, cat] of Object.entries(categories)) {
    totalScore += (cat.score / 100) * weights[key];
  }
  const score = Math.round(totalScore);

  // Issues
  const issues = [];
  if (!page.isHTTPS) issues.push('HTTPS required');
  if (forms.length === 0 && scriptRegs.length === 0) issues.push('No forms or tools');
  if (!ps.hasSemanticHTML) issues.push('No semantic HTML');
  if (!ps.hasARIA) issues.push('No ARIA labels');

  return {
    url: page.url,
    score,
    isHTTPS: page.isHTTPS,
    forms: {
      total: forms.length,
      webmcpReady: forms.filter(f => f.hasWebMCP).length,
      details: forms
    },
    scriptRegistrations: scriptRegs,
    webmcpCount: forms.filter(f => f.hasWebMCP).length + scriptRegs.length,
    securityHeaders: page.securityHeaders || {},
    pageSignals: ps,
    categories,
    issues,
    timestamp: page.timestamp
  };
}

/**
 * Discover pages — same strategy as extension sitemap.js:
 * 1. /sitemap.xml  2. /sitemap_index.xml  3. robots.txt  4. HTML links fallback
 */
async function discoverPages(url, origin, maxPages) {
  const urls = new Set();

  // Strategy 1: /sitemap.xml
  try {
    const found = await fetchAndParseSitemap(origin + '/sitemap.xml');
    found.forEach(u => urls.add(u));
  } catch { /* ignore */ }

  // Strategy 2: /sitemap_index.xml
  if (urls.size === 0) {
    try {
      const found = await fetchAndParseSitemap(origin + '/sitemap_index.xml');
      found.forEach(u => urls.add(u));
    } catch { /* ignore */ }
  }

  // Strategy 3: robots.txt Sitemap: directives
  if (urls.size === 0) {
    try {
      const resp = await fetchUrl(origin + '/robots.txt');
      if (resp.ok) {
        const text = await resp.text();
        const sitemapUrls = [];
        text.split('\n').forEach(line => {
          const match = line.match(/^\s*Sitemap\s*:\s*(.+)/i);
          if (match) {
            const u = match[1].trim();
            if (u.startsWith('http')) sitemapUrls.push(u);
          }
        });
        for (const smUrl of sitemapUrls) {
          if (urls.size >= maxPages) break;
          try {
            const found = await fetchAndParseSitemap(smUrl);
            found.forEach(u => urls.add(u));
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  // Strategy 4: Fallback — extract links from homepage HTML
  if (urls.size === 0) {
    urls.add(url);
    try {
      const resp = await fetchUrl(url);
      if (resp.ok) {
        const html = await resp.text();
        const linkRegex = /href=["']([^"'#]*)/gi;
        let match;
        while ((match = linkRegex.exec(html)) !== null && urls.size < maxPages) {
          let href = match[1].trim();
          if (!href || href.startsWith('//') || href.startsWith('mailto:') ||
              href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('data:')) continue;
          if (href.startsWith('/')) href = origin + href;
          if (!href.startsWith(origin)) continue;
          if (href.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|pdf|zip|woff|woff2|ttf|xml|json)$/i)) continue;
          href = href.split('?')[0].split('#')[0];
          if (href && href !== origin && href !== origin + '/') urls.add(href);
        }
      }
    } catch { /* ignore */ }
  }

  // Filter to same origin + limit
  const result = [...urls]
    .filter(u => { try { return new URL(u).origin === origin; } catch { return false; } })
    .slice(0, maxPages);

  if (!result.includes(url)) result.unshift(url);
  return result;
}

function fetchUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  return fetch(url, {
    signal: controller.signal,
    headers: { 'User-Agent': 'AgentReady/2.1 (+https://erold90.github.io/AgentReady)', 'Accept': 'text/html, application/xml, text/xml, */*' }
  }).finally(() => clearTimeout(timeout));
}

async function fetchAndParseSitemap(url) {
  const resp = await fetchUrl(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  const urls = [];

  if (text.trim().startsWith('<?xml') || text.trim().startsWith('<')) {
    // Sitemap index?
    const sitemapLocs = [...text.matchAll(/<sitemap[^>]*>[\s\S]*?<loc[^>]*>\s*(.*?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)];
    if (sitemapLocs.length > 0) {
      for (const m of sitemapLocs) {
        if (urls.length >= 500) break;
        try {
          const sub = await fetchAndParseSitemap(m[1].trim());
          sub.forEach(u => urls.push(u));
        } catch { /* skip */ }
      }
      return urls;
    }
    // Regular urlset
    const locMatches = text.matchAll(/<url[^>]*>[\s\S]*?<loc[^>]*>\s*(.*?)\s*<\/loc>[\s\S]*?<\/url>/gi);
    for (const m of locMatches) {
      const u = m[1].trim();
      if (u.startsWith('http')) urls.push(u);
      if (urls.length >= 500) break;
    }
    return urls;
  }

  // Plain text sitemap
  text.split('\n').forEach(line => {
    const t = line.trim();
    if (t.startsWith('http') && urls.length < 500) urls.push(t);
  });
  return urls;
}

module.exports = { scan, crawl };
