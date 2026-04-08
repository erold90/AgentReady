/**
 * bookmarklet.js — Runs on the TARGET page to extract real DOM data
 * Loaded via bookmarklet: javascript:(function(){var s=document.createElement('script');s.src='https://erold90.github.io/AgentReady/js/bookmarklet.js?'+Date.now();document.head.appendChild(s)})();
 */
(function() {
  'use strict';

  // Prevent double execution
  if (window.__agentready_running) return;
  window.__agentready_running = true;

  const AGENTREADY_URL = 'https://erold90.github.io/AgentReady/';

  // === Extract Forms ===
  function extractForms() {
    const forms = [];
    document.querySelectorAll('form').forEach((form, index) => {
      const fields = [];
      form.querySelectorAll('input, select, textarea').forEach(input => {
        const type = input.type?.toLowerCase() || 'text';
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return;
        if (input.tagName === 'INPUT' && !input.name && !input.id) return;

        let label = '';
        if (input.id) {
          const labelEl = document.querySelector('label[for="' + input.id + '"]');
          if (labelEl) label = labelEl.textContent.trim();
        }
        if (!label) {
          const parentLabel = input.closest('label');
          if (parentLabel) label = parentLabel.textContent.replace(input.value || '', '').trim();
        }

        fields.push({
          tagName: input.tagName.toLowerCase(),
          type: type,
          name: input.name || '',
          id: input.id || '',
          placeholder: input.placeholder || '',
          label: label.substring(0, 100),
          required: input.required || input.hasAttribute('required'),
          autocomplete: input.autocomplete || '',
          ariaLabel: input.getAttribute('aria-label') || '',
          min: input.min || '',
          max: input.max || '',
          pattern: input.pattern || '',
          options: input.tagName === 'SELECT' ?
            Array.from(input.options).slice(0, 20).map(o => ({ value: o.value, text: o.textContent.trim() })).filter(o => o.value) : [],
          toolparamdescription: input.getAttribute('toolparamdescription') || '',
          toolparamtitle: input.getAttribute('toolparamtitle') || ''
        });
      });

      if (fields.length === 0) return;

      let nearestHeading = '';
      let prev = form.previousElementSibling;
      for (let i = 0; i < 3 && prev; i++) {
        if (/^H[1-6]$/.test(prev.tagName)) {
          nearestHeading = prev.textContent.trim().substring(0, 100);
          break;
        }
        prev = prev.previousElementSibling;
      }

      forms.push({
        index, id: form.id || '', name: form.name || '', className: (form.className || '').substring(0, 100),
        action: form.action || '', method: (form.method || 'get').toUpperCase(),
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
    const registrations = [];
    document.querySelectorAll('script').forEach(script => {
      const text = script.textContent || '';
      if (text.includes('navigator.modelContext') || text.includes('modelContext')) {
        const registerMatches = text.matchAll(/registerTool\s*\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g);
        for (const match of registerMatches) {
          const nameMatch = match[0].match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
          const descMatch = match[0].match(/description\s*:\s*['"`]([^'"`]+)['"`]/);
          registrations.push({
            name: nameMatch ? nameMatch[1] : 'unknown',
            description: descMatch ? descMatch[1] : '',
            raw: match[0].substring(0, 200)
          });
        }
        if (text.includes('provideContext')) {
          registrations.push({ name: '_provideContext', description: 'Uses provideContext()', raw: '' });
        }
      }
    });

    // Also check if navigator.modelContext exists at runtime
    if (window.navigator && window.navigator.modelContext) {
      registrations.push({
        name: '_runtime_modelContext',
        description: 'navigator.modelContext API is available at runtime',
        raw: ''
      });
    }

    return registrations;
  }

  // === Extract Page Signals ===
  function extractPageSignals() {
    const semanticCount = ['nav', 'main', 'article', 'section', 'header', 'footer', 'aside']
      .reduce((sum, tag) => sum + document.querySelectorAll(tag).length, 0);
    const totalImages = document.querySelectorAll('img').length;
    const imagesWithAlt = document.querySelectorAll('img[alt]:not([alt=""])').length;

    return {
      hasTitle: !!document.title && document.title.length > 2,
      title: document.title || '',
      hasMetaDescription: !!document.querySelector('meta[name="description"]'),
      hasOgTags: !!document.querySelector('meta[property^="og:"]'),
      hasJsonLd: !!document.querySelector('script[type="application/ld+json"]'),
      hasMicrodata: !!document.querySelector('[itemscope]'),
      semanticCount,
      headingCount: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
      h1Count: document.querySelectorAll('h1').length,
      totalLinks: document.querySelectorAll('a[href]').length,
      totalImages, imagesWithAlt,
      ariaCount: document.querySelectorAll('[aria-label], [role], [aria-describedby], [aria-labelledby]').length,
      formCount: document.querySelectorAll('form').length,
      inputCount: document.querySelectorAll('input, select, textarea').length
    };
  }

  // === Analyze page content for tool suggestions ===
  function suggestTools() {
    const suggestions = [];
    const text = (document.body?.textContent || '').toLowerCase();
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => (a.href + ' ' + a.textContent).toLowerCase());
    const allText = text + ' ' + links.join(' ');

    const patterns = [
      { keywords: ['book', 'reserv', 'prenota', 'check-in', 'check-out', 'availability', 'disponibil'],
        tool: { name: 'check_availability', description: 'Check availability for specific dates', params: [
          { name: 'check_in', type: 'string', format: 'date', description: 'Check-in date' },
          { name: 'check_out', type: 'string', format: 'date', description: 'Check-out date' },
          { name: 'guests', type: 'number', description: 'Number of guests' }
        ]}},
      { keywords: ['contact', 'contatt', 'email', 'phone', 'telefon', 'message', 'messaggio'],
        tool: { name: 'send_message', description: 'Send a contact message', params: [
          { name: 'name', type: 'string', description: 'Sender name' },
          { name: 'email', type: 'string', format: 'email', description: 'Sender email' },
          { name: 'message', type: 'string', description: 'Message content' }
        ]}},
      { keywords: ['search', 'cerca', 'find', 'trova', 'filter', 'filtr'],
        tool: { name: 'search_content', description: 'Search site content', params: [
          { name: 'query', type: 'string', description: 'Search query' }
        ]}},
      { keywords: ['price', 'prezz', 'cost', 'rate', 'tariff', 'pricing'],
        tool: { name: 'get_pricing', description: 'Get pricing information', params: [
          { name: 'category', type: 'string', description: 'Category or service type' }
        ]}},
      { keywords: ['cart', 'carrello', 'shop', 'buy', 'acquist', 'add to'],
        tool: { name: 'add_to_cart', description: 'Add item to shopping cart', params: [
          { name: 'product_id', type: 'string', description: 'Product identifier' },
          { name: 'quantity', type: 'number', description: 'Quantity' }
        ]}},
      { keywords: ['login', 'sign in', 'accedi', 'log in'],
        tool: { name: 'user_login', description: 'Authenticate user', params: [
          { name: 'username', type: 'string', description: 'Username or email' },
          { name: 'password', type: 'string', description: 'Password' }
        ]}},
      { keywords: ['subscribe', 'newsletter', 'iscriviti', 'notif'],
        tool: { name: 'subscribe_newsletter', description: 'Subscribe to newsletter', params: [
          { name: 'email', type: 'string', format: 'email', description: 'Email address' }
        ]}},
      { keywords: ['map', 'mappa', 'direction', 'location', 'dove siamo', 'indirizzo'],
        tool: { name: 'get_directions', description: 'Get directions to this location', params: [
          { name: 'from', type: 'string', description: 'Starting location' }
        ]}},
      { keywords: ['gallery', 'galleria', 'photo', 'foto', 'image', 'immagin'],
        tool: { name: 'browse_gallery', description: 'Browse photo gallery', params: [
          { name: 'category', type: 'string', description: 'Gallery category (optional)' }
        ]}},
      { keywords: ['review', 'recension', 'testimonial', 'feedback', 'rating'],
        tool: { name: 'get_reviews', description: 'Get customer reviews', params: [
          { name: 'sort', type: 'string', description: 'Sort order (recent, rating)' }
        ]}}
    ];

    patterns.forEach(pattern => {
      const matchCount = pattern.keywords.filter(kw => allText.includes(kw)).length;
      if (matchCount >= 1) {
        suggestions.push({ ...pattern.tool, confidence: Math.min(1, matchCount / 2) });
      }
    });

    suggestions.sort((a, b) => b.confidence - a.confidence);
    return suggestions.slice(0, 5);
  }

  // === Build scan result ===
  try {
    const scanData = {
      url: window.location.href,
      status: 200,
      forms: extractForms(),
      scriptRegistrations: extractScriptRegistrations(),
      suggestedTools: suggestTools(),
      security: {
        isHTTPS: window.location.protocol === 'https:',
        domain: window.location.hostname
      },
      responseQuality: { quality: 'live', isCaptcha: false, isBlocked: false, isJsShell: false, message: '' },
      pageSignals: extractPageSignals(),
      htmlLength: document.documentElement.outerHTML.length,
      timestamp: new Date().toISOString(),
      source: 'bookmarklet'
    };

    // Compress: remove large unnecessary data
    scanData.forms.forEach(f => {
      if (f.action && f.action.length > 200) f.action = f.action.substring(0, 200);
    });

    const encoded = encodeURIComponent(JSON.stringify(scanData));

    // If data is too large for URL (>50KB), use postMessage approach
    if (encoded.length > 50000) {
      const win = window.open(AGENTREADY_URL + '?source=bookmarklet', '_blank');
      const checkReady = setInterval(() => {
        try {
          win.postMessage({ type: 'agentready-scan', data: scanData }, '*');
        } catch(e) {}
      }, 500);
      setTimeout(() => clearInterval(checkReady), 10000);
    } else {
      window.open(AGENTREADY_URL + '?scan=' + encoded, '_blank');
    }

    // Show brief confirmation on the page
    const toast = document.createElement('div');
    toast.textContent = 'AgentReady: Analysis sent! Check the new tab.';
    toast.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;background:#10b981;color:white;padding:14px 24px;border-radius:8px;font:600 14px system-ui;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:opacity 0.3s;';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);

  } catch(err) {
    alert('AgentReady Error: ' + err.message);
  }

  window.__agentready_running = false;
})();
