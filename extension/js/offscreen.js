/**
 * offscreen.js — Offscreen document for DOMParser operations
 * Receives HTML strings via chrome.runtime messages, parses them,
 * and returns structured extraction data.
 *
 * This exists because DOMParser is NOT available in service workers.
 * The offscreen document provides a DOM environment for parsing.
 */
(function() {
  'use strict';

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type !== 'parse-html') return false;

    try {
      const doc = new DOMParser().parseFromString(msg.html, 'text/html');
      const result = {
        forms: extractForms(doc),
        scriptRegistrations: extractScriptRegistrations(doc),
        pageSignals: extractPageSignals(doc)
      };
      sendResponse({ success: true, data: result });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  });

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
})();
