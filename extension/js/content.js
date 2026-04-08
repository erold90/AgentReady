/**
 * content.js — Injected into the target page to extract DOM data
 */
(function() {
  'use strict';

  const d = document;

  // === Extract Forms ===
  function extractForms() {
    const forms = [];
    d.querySelectorAll('form').forEach((form, i) => {
      const fields = [];
      form.querySelectorAll('input, select, textarea').forEach(inp => {
        const t = (inp.type || 'text').toLowerCase();
        if (['hidden', 'submit', 'button', 'reset'].includes(t)) return;
        if (inp.tagName === 'INPUT' && !inp.name && !inp.id) return;

        let label = '';
        if (inp.id) {
          const le = d.querySelector(`label[for="${inp.id}"]`);
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

  // === Extract Script Registrations ===
  function extractScriptRegistrations() {
    const regs = [];
    d.querySelectorAll('script').forEach(s => {
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
    // Runtime check
    if (window.navigator && window.navigator.modelContext) {
      regs.push({ name: '_runtime_modelContext', description: 'navigator.modelContext API available at runtime', raw: '' });
    }
    return regs;
  }

  // === Page Signals ===
  function extractPageSignals() {
    const semTags = ['nav', 'main', 'article', 'section', 'header', 'footer', 'aside'];
    const semanticCount = semTags.reduce((s, t) => s + d.querySelectorAll(t).length, 0);
    const totalImages = d.querySelectorAll('img').length;
    const imagesWithAlt = d.querySelectorAll('img[alt]:not([alt=""])').length;

    return {
      hasTitle: !!d.title && d.title.length > 2,
      title: d.title || '',
      hasMetaDescription: !!d.querySelector('meta[name="description"]'),
      hasOgTags: !!d.querySelector('meta[property^="og:"]'),
      hasJsonLd: !!d.querySelector('script[type="application/ld+json"]'),
      hasMicrodata: !!d.querySelector('[itemscope]'),
      semanticCount,
      headingCount: d.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
      h1Count: d.querySelectorAll('h1').length,
      totalLinks: d.querySelectorAll('a[href]').length,
      totalImages, imagesWithAlt,
      ariaCount: d.querySelectorAll('[aria-label],[role],[aria-describedby],[aria-labelledby]').length,
      formCount: d.querySelectorAll('form').length,
      inputCount: d.querySelectorAll('input,select,textarea').length
    };
  }

  // === Suggest Tools ===
  function suggestTools() {
    const suggestions = [];
    const text = (d.body?.textContent || '').toLowerCase();
    const patterns = [
      { kw: ['book', 'reserv', 'prenota', 'check-in', 'availability', 'disponibil'], name: 'check_availability', desc: 'Check availability for specific dates' },
      { kw: ['contact', 'contatt', 'email', 'phone', 'telefon', 'message', 'messaggio'], name: 'send_message', desc: 'Send a contact message' },
      { kw: ['search', 'cerca', 'find', 'trova', 'filter'], name: 'search_content', desc: 'Search site content' },
      { kw: ['price', 'prezz', 'cost', 'tariff', 'pricing'], name: 'get_pricing', desc: 'Get pricing information' },
      { kw: ['cart', 'carrello', 'shop', 'buy', 'acquist'], name: 'add_to_cart', desc: 'Add item to cart' },
      { kw: ['login', 'sign in', 'accedi'], name: 'user_login', desc: 'Authenticate user' },
      { kw: ['subscribe', 'newsletter', 'iscriviti'], name: 'subscribe_newsletter', desc: 'Subscribe to newsletter' },
      { kw: ['map', 'mappa', 'direction', 'dove siamo', 'indirizzo'], name: 'get_directions', desc: 'Get directions' },
      { kw: ['gallery', 'galleria', 'photo', 'foto'], name: 'browse_gallery', desc: 'Browse gallery' },
      { kw: ['review', 'recension', 'feedback', 'rating'], name: 'get_reviews', desc: 'Get reviews' }
    ];

    patterns.forEach(p => {
      const mc = p.kw.filter(w => text.includes(w)).length;
      if (mc >= 1) suggestions.push({ name: p.name, description: p.desc, params: [], confidence: Math.min(1, mc / 2) });
    });

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions.slice(0, 5);
  }

  // === Run extraction ===
  const scanData = {
    url: location.href,
    status: 200,
    forms: extractForms(),
    scriptRegistrations: extractScriptRegistrations(),
    suggestedTools: suggestTools(),
    security: { isHTTPS: location.protocol === 'https:', domain: location.hostname },
    responseQuality: { quality: 'live', isCaptcha: false, isBlocked: false, isJsShell: false, message: '' },
    pageSignals: extractPageSignals(),
    htmlLength: d.documentElement.outerHTML.length,
    timestamp: new Date().toISOString(),
    source: 'extension'
  };

  // Return data to executeScript caller
  scanData;
})();
