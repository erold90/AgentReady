/**
 * crawler.js — Sequential page crawler for full-site scanning
 * Fetches HTML via fetch(), parses with DOMParser, extracts forms/signals/WebMCP
 */
const SiteCrawler = (() => {
  'use strict';

  const DELAY_MS = 1500;

  /**
   * Crawl an array of URLs sequentially
   * @param {string[]} urls - URLs to scan
   * @param {function} onProgress - Callback: (current, total, url) => void
   * @returns {Promise<object>} Aggregated results
   */
  async function crawl(urls, onProgress) {
    const pageResults = [];

    // Protocol scan once per origin (non-blocking, runs in parallel)
    let protocolResults = null;
    try {
      const origin = new URL(urls[0]).origin;
      ProtocolScanner.scan(origin).then(p => { protocolResults = p; }).catch(() => {});
    } catch {}

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      if (onProgress) onProgress(i + 1, urls.length, url);

      try {
        const result = await scanPage(url);
        pageResults.push(result);
      } catch (e) {
        pageResults.push({
          url,
          error: e.message || 'Failed to fetch',
          score: 0,
          forms: [],
          formCount: 0,
          webmcpCount: 0,
          issueCount: 0,
          pageSignals: null,
          scriptRegistrations: []
        });
      }

      // Delay between requests (skip after last)
      if (i < urls.length - 1) {
        await sleep(DELAY_MS);
      }
    }

    const aggregated = aggregate(pageResults);
    aggregated.protocols = protocolResults;
    return aggregated;
  }

  /**
   * Fetch and scan a single page
   */
  async function scanPage(url) {
    const resp = await fetch(url, {
      headers: { 'Accept': 'text/html' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const forms = extractForms(doc);
    const scriptRegistrations = extractScriptRegistrations(doc);
    const pageSignals = extractPageSignals(doc);

    // Build a scan result compatible with Analyzer
    const scanData = {
      url,
      status: resp.status,
      forms,
      scriptRegistrations,
      suggestedTools: [],
      security: {
        isHTTPS: url.startsWith('https:'),
        domain: new URL(url).hostname
      },
      responseQuality: { quality: 'fetched', isCaptcha: false, isBlocked: false, isJsShell: false, message: '' },
      pageSignals,
      htmlLength: html.length,
      timestamp: new Date().toISOString(),
      source: 'crawler'
    };

    // Analyze with the shared Analyzer
    const analysis = Analyzer.analyze(scanData);
    const issueCount = analysis.issues.filter(i => i.type === 'warning' || i.type === 'error').length;

    return {
      url,
      score: analysis.score,
      forms,
      formCount: forms.length,
      webmcpCount: forms.filter(f => f.hasWebMCP).length + scriptRegistrations.length,
      issueCount,
      pageSignals,
      scriptRegistrations,
      analysis,
      scanData
    };
  }

  /**
   * Extract forms from a parsed Document (mirrors content.js logic)
   */
  function extractForms(doc) {
    const forms = [];
    doc.querySelectorAll('form').forEach((form, i) => {
      const fields = [];
      form.querySelectorAll('input, select, textarea').forEach(inp => {
        const t = (inp.type || 'text').toLowerCase();
        if (['hidden', 'submit', 'button', 'reset'].includes(t)) return;
        if (inp.tagName === 'INPUT' && !inp.name && !inp.id) return;

        let label = '';
        if (inp.id) {
          const le = doc.querySelector(`label[for="${inp.id}"]`);
          if (le) label = le.textContent.trim();
        }
        if (!label) {
          const pl = inp.closest('label');
          if (pl) label = pl.textContent.trim();
        }

        fields.push({
          tagName: inp.tagName.toLowerCase(), type: t,
          name: inp.name || '', id: inp.id || '',
          placeholder: inp.placeholder || '',
          label: label.substring(0, 100),
          required: inp.required || inp.hasAttribute('required'),
          autocomplete: inp.autocomplete || '',
          ariaLabel: inp.getAttribute('aria-label') || '',
          min: inp.min || '', max: inp.max || '', pattern: inp.pattern || '',
          options: inp.tagName === 'SELECT'
            ? Array.from(inp.options).slice(0, 20).map(o => ({ value: o.value, text: o.textContent.trim() })).filter(o => o.value)
            : [],
          toolparamdescription: inp.getAttribute('toolparamdescription') || '',
          toolparamtitle: inp.getAttribute('toolparamtitle') || ''
        });
      });

      if (!fields.length) return;

      let nearestHeading = '';
      let prev = form.previousElementSibling;
      for (let j = 0; j < 3 && prev; j++) {
        if (/^H[1-6]$/.test(prev.tagName)) { nearestHeading = prev.textContent.trim().substring(0, 100); break; }
        prev = prev.previousElementSibling;
      }

      forms.push({
        index: i, id: form.id || '', name: form.name || '',
        className: (form.className || '').substring(0, 100),
        action: (form.action || '').substring(0, 200),
        method: (form.method || 'get').toUpperCase(),
        nearestHeading, fields, fieldCount: fields.length,
        toolname: form.getAttribute('toolname') || '',
        tooldescription: form.getAttribute('tooldescription') || '',
        toolautosubmit: form.hasAttribute('toolautosubmit'),
        hasWebMCP: !!(form.getAttribute('toolname') || form.getAttribute('tooldescription'))
      });
    });
    return forms;
  }

  /**
   * Extract script-based WebMCP registrations (mirrors content.js logic)
   */
  function extractScriptRegistrations(doc) {
    const regs = [];
    doc.querySelectorAll('script').forEach(s => {
      const t = s.textContent || '';
      if (!t.includes('modelContext')) return;
      const matches = t.matchAll(/registerTool\s*\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g);
      for (const m of matches) {
        const nm = m[0].match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
        const dm = m[0].match(/description\s*:\s*['"`]([^'"`]+)['"`]/);
        regs.push({ name: nm ? nm[1] : 'unknown', description: dm ? dm[1] : '', raw: m[0].substring(0, 200) });
      }
      if (t.includes('provideContext')) {
        regs.push({ name: '_provideContext', description: 'Uses provideContext()', raw: '' });
      }
    });
    return regs;
  }

  /**
   * Extract page signals (mirrors content.js logic)
   */
  function extractPageSignals(doc) {
    const semTags = ['nav', 'main', 'article', 'section', 'header', 'footer', 'aside'];
    const semanticCount = semTags.reduce((s, t) => s + doc.querySelectorAll(t).length, 0);
    const totalImages = doc.querySelectorAll('img').length;
    const imagesWithAlt = doc.querySelectorAll('img[alt]:not([alt=""])').length;

    return {
      hasTitle: !!doc.title && doc.title.length > 2,
      title: doc.title || '',
      hasMetaDescription: !!doc.querySelector('meta[name="description"]'),
      hasOgTags: !!doc.querySelector('meta[property^="og:"]'),
      hasJsonLd: !!doc.querySelector('script[type="application/ld+json"]'),
      hasMicrodata: !!doc.querySelector('[itemscope]'),
      semanticCount,
      headingCount: doc.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      h1Count: doc.querySelectorAll('h1').length,
      totalLinks: doc.querySelectorAll('a[href]').length,
      totalImages, imagesWithAlt,
      ariaCount: doc.querySelectorAll('[aria-label],[role],[aria-describedby],[aria-labelledby]').length,
      formCount: doc.querySelectorAll('form').length,
      inputCount: doc.querySelectorAll('input,select,textarea').length
    };
  }

  /**
   * Aggregate per-page results into a summary
   */
  function aggregate(pageResults) {
    const successful = pageResults.filter(p => !p.error);
    const totalPages = pageResults.length;
    const scannedPages = successful.length;
    const failedPages = totalPages - scannedPages;

    const totalForms = successful.reduce((s, p) => s + p.formCount, 0);
    const totalWebMCP = successful.reduce((s, p) => s + p.webmcpCount, 0);
    const totalIssues = successful.reduce((s, p) => s + p.issueCount, 0);

    const avgScore = scannedPages > 0
      ? Math.round(successful.reduce((s, p) => s + p.score, 0) / scannedPages)
      : 0;

    // Sort by score ascending (worst first)
    const sorted = [...pageResults].sort((a, b) => a.score - b.score);
    const worstPages = sorted.slice(0, 5);
    const bestPages = sorted.slice(-5).reverse();

    return {
      totalPages,
      scannedPages,
      failedPages,
      totalForms,
      totalWebMCP,
      totalIssues,
      avgScore,
      worstPages,
      bestPages,
      pages: sorted // all pages sorted worst-first
    };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return { crawl };
})();
