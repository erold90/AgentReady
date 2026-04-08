/**
 * scanner.js — Fetch and parse remote URLs for WebMCP analysis
 */

const Scanner = (() => {
  // Multiple proxy fallbacks for reliability
  const PROXIES = [
    {
      name: 'codetabs',
      url: (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
      parse: (response) => response.text()
    },
    {
      name: 'allorigins',
      url: (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
      parse: (response) => response.text()
    },
    {
      name: 'corsproxy-org',
      url: (target) => `https://corsproxy.org/?url=${encodeURIComponent(target)}`,
      parse: (response) => response.text()
    }
  ];
  const TIMEOUT = 20000;

  /**
   * Fetch a URL through CORS proxy with fallbacks, return HTML string
   */
  async function fetchPage(url) {
    // Validate URL
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid URL. Please enter a valid URL starting with https://');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP/HTTPS URLs are supported.');
    }

    let lastError = null;

    for (const proxy of PROXIES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT);

      try {
        const proxyUrl = proxy.url(url);
        const response = await fetch(proxyUrl, {
          signal: controller.signal,
          headers: { 'Accept': 'text/html' }
        });

        if (!response.ok) {
          lastError = new Error(`${proxy.name}: HTTP ${response.status}`);
          continue;
        }

        const html = await proxy.parse(response);

        if (!html || html.length < 50 || html.includes('"error"')) {
          lastError = new Error(`${proxy.name}: Empty or error response`);
          continue;
        }

        return {
          html: html,
          url: url,
          status: 200,
          contentType: 'text/html',
          proxy: proxy.name
        };
      } catch (err) {
        if (err.name === 'AbortError') {
          lastError = new Error(`${proxy.name}: timed out`);
        } else {
          lastError = err;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error(`Failed to fetch the URL. ${lastError?.message || 'All proxies failed.'} The site may be blocking automated access.`);
  }

  /**
   * Parse HTML string into a Document
   */
  function parseHTML(html) {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  }

  /**
   * Extract all forms and their fields from a Document
   */
  function extractForms(doc) {
    const forms = [];
    const formElements = doc.querySelectorAll('form');

    formElements.forEach((form, index) => {
      const fields = [];
      const inputs = form.querySelectorAll('input, select, textarea');

      inputs.forEach(input => {
        // Skip hidden and submit inputs
        const type = input.type?.toLowerCase() || 'text';
        if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return;
        if (input.tagName === 'INPUT' && !input.name && !input.id) return;

        // Find associated label
        let label = '';
        if (input.id) {
          const labelEl = doc.querySelector(`label[for="${input.id}"]`);
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
          label: label,
          required: input.required || input.hasAttribute('required'),
          autocomplete: input.autocomplete || '',
          ariaLabel: input.getAttribute('aria-label') || '',
          min: input.min || '',
          max: input.max || '',
          pattern: input.pattern || '',
          options: input.tagName === 'SELECT' ?
            Array.from(input.options).map(o => ({ value: o.value, text: o.textContent.trim() })).filter(o => o.value) : [],
          // WebMCP attributes
          toolparamdescription: input.getAttribute('toolparamdescription') || '',
          toolparamtitle: input.getAttribute('toolparamtitle') || ''
        });
      });

      // Only include forms with at least 1 visible field
      if (fields.length === 0) return;

      // Infer form purpose from context
      const formAction = form.action || '';
      const formMethod = (form.method || 'get').toUpperCase();
      const formId = form.id || '';
      const formName = form.name || '';
      const formClass = form.className || '';

      // Check for heading near the form
      let nearestHeading = '';
      let prev = form.previousElementSibling;
      for (let i = 0; i < 3 && prev; i++) {
        if (/^H[1-6]$/.test(prev.tagName)) {
          nearestHeading = prev.textContent.trim();
          break;
        }
        prev = prev.previousElementSibling;
      }

      forms.push({
        index: index,
        id: formId,
        name: formName,
        className: formClass,
        action: formAction,
        method: formMethod,
        nearestHeading: nearestHeading,
        fields: fields,
        fieldCount: fields.length,
        // WebMCP attributes on form
        toolname: form.getAttribute('toolname') || '',
        tooldescription: form.getAttribute('tooldescription') || '',
        toolautosubmit: form.hasAttribute('toolautosubmit'),
        hasWebMCP: !!(form.getAttribute('toolname') || form.getAttribute('tooldescription'))
      });
    });

    return forms;
  }

  /**
   * Extract WebMCP JavaScript registrations from scripts
   */
  function extractScriptRegistrations(doc) {
    const registrations = [];
    const scripts = doc.querySelectorAll('script');

    scripts.forEach(script => {
      const text = script.textContent || '';

      // Check for navigator.modelContext usage
      if (text.includes('navigator.modelContext') || text.includes('modelContext')) {
        // Look for registerTool calls
        const registerMatches = text.matchAll(/registerTool\s*\(\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g);
        for (const match of registerMatches) {
          // Try to extract tool name and description
          const nameMatch = match[0].match(/name\s*:\s*['"`]([^'"`]+)['"`]/);
          const descMatch = match[0].match(/description\s*:\s*['"`]([^'"`]+)['"`]/);
          registrations.push({
            name: nameMatch ? nameMatch[1] : 'unknown',
            description: descMatch ? descMatch[1] : '',
            raw: match[0].substring(0, 200)
          });
        }

        // Look for provideContext calls
        if (text.includes('provideContext')) {
          registrations.push({
            name: '_provideContext',
            description: 'Uses provideContext() for batch tool registration',
            raw: ''
          });
        }
      }
    });

    return registrations;
  }

  /**
   * Analyze response quality — detect captchas, JS shells, blocked pages
   */
  function analyzeResponseQuality(html) {
    const lower = html.toLowerCase();
    const scriptCount = (lower.match(/<script/g) || []).length;
    const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, '')
                         .replace(/<style[\s\S]*?<\/style>/gi, '')
                         .replace(/<[^>]+>/g, '').trim();

    const isCaptcha = lower.includes('captcha') || lower.includes('challenge-platform') ||
                      lower.includes('verify you are human') || lower.includes('captcha-form') ||
                      lower.includes('recaptcha') || lower.includes('hcaptcha');
    const isBlocked = lower.includes('access denied') || lower.includes('403 forbidden') ||
                      lower.includes('just a moment') || lower.includes('cloudflare');
    const isJsShell = html.length > 500 && scriptCount > 3 && textOnly.length < 200;

    let quality = 'good';
    let message = '';
    if (isCaptcha) { quality = 'captcha'; message = 'The site served a CAPTCHA to our proxy. Results may not reflect the actual page content.'; }
    else if (isBlocked) { quality = 'blocked'; message = 'The site blocked our proxy request. Results may be incomplete.'; }
    else if (isJsShell) { quality = 'js-only'; message = 'This site renders content with JavaScript. Our proxy can only read static HTML, so some forms and content may be missing.'; }

    return { quality, isCaptcha, isBlocked, isJsShell, message, textContentLength: textOnly.length };
  }

  /**
   * Extract page structure signals for readiness scoring
   */
  function extractPageSignals(doc) {
    const semanticCount = ['nav', 'main', 'article', 'section', 'header', 'footer', 'aside']
      .reduce((sum, tag) => sum + doc.querySelectorAll(tag).length, 0);
    const h1Count = doc.querySelectorAll('h1').length;
    const headingCount = doc.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
    const totalImages = doc.querySelectorAll('img').length;
    const imagesWithAlt = doc.querySelectorAll('img[alt]:not([alt=""])').length;
    const ariaCount = doc.querySelectorAll('[aria-label], [role], [aria-describedby], [aria-labelledby]').length;
    const totalLinks = doc.querySelectorAll('a[href]').length;

    return {
      hasTitle: !!doc.title && doc.title.length > 2,
      title: doc.title || '',
      hasMetaDescription: !!doc.querySelector('meta[name="description"]'),
      hasOgTags: !!doc.querySelector('meta[property^="og:"]'),
      hasJsonLd: !!doc.querySelector('script[type="application/ld+json"]'),
      hasMicrodata: !!doc.querySelector('[itemscope]'),
      semanticCount,
      headingCount,
      h1Count,
      totalLinks,
      totalImages,
      imagesWithAlt,
      ariaCount,
      formCount: doc.querySelectorAll('form').length,
      inputCount: doc.querySelectorAll('input, select, textarea').length
    };
  }

  /**
   * Check security aspects
   */
  function checkSecurity(url) {
    const parsed = new URL(url);
    return {
      isHTTPS: parsed.protocol === 'https:',
      domain: parsed.hostname
    };
  }

  /**
   * Analyze page content to suggest potential tools (for sites without forms)
   */
  function analyzPageContent(doc, url) {
    const suggestions = [];
    const text = (doc.body?.textContent || '').toLowerCase();
    const html = doc.body?.innerHTML || '';
    const hostname = new URL(url).hostname.toLowerCase();

    // Detect page type and suggest relevant tools
    const patterns = [
      {
        keywords: ['book', 'reserv', 'prenota', 'check-in', 'check-out', 'availability', 'disponibil'],
        tool: { name: 'check_availability', description: 'Check availability for specific dates', params: [
          { name: 'check_in', type: 'string', format: 'date', description: 'Check-in date' },
          { name: 'check_out', type: 'string', format: 'date', description: 'Check-out date' },
          { name: 'guests', type: 'number', description: 'Number of guests' }
        ]}
      },
      {
        keywords: ['contact', 'contatt', 'email', 'phone', 'telefon', 'message', 'messaggio', 'write us', 'scrivici'],
        tool: { name: 'send_message', description: 'Send a contact message', params: [
          { name: 'name', type: 'string', description: 'Sender name' },
          { name: 'email', type: 'string', format: 'email', description: 'Sender email' },
          { name: 'message', type: 'string', description: 'Message content' }
        ]}
      },
      {
        keywords: ['search', 'cerca', 'find', 'trova', 'filter', 'filtr'],
        tool: { name: 'search_content', description: 'Search site content', params: [
          { name: 'query', type: 'string', description: 'Search query' }
        ]}
      },
      {
        keywords: ['price', 'prezz', 'cost', 'rate', 'tariff', 'pricing'],
        tool: { name: 'get_pricing', description: 'Get pricing information', params: [
          { name: 'category', type: 'string', description: 'Category or service type' }
        ]}
      },
      {
        keywords: ['cart', 'carrello', 'shop', 'buy', 'acquist', 'add to', 'aggiungi'],
        tool: { name: 'add_to_cart', description: 'Add item to shopping cart', params: [
          { name: 'product_id', type: 'string', description: 'Product identifier' },
          { name: 'quantity', type: 'number', description: 'Quantity' }
        ]}
      },
      {
        keywords: ['login', 'sign in', 'accedi', 'log in'],
        tool: { name: 'user_login', description: 'Authenticate user', params: [
          { name: 'username', type: 'string', description: 'Username or email' },
          { name: 'password', type: 'string', description: 'Password' }
        ]}
      },
      {
        keywords: ['subscribe', 'newsletter', 'iscriviti', 'notif'],
        tool: { name: 'subscribe_newsletter', description: 'Subscribe to newsletter', params: [
          { name: 'email', type: 'string', format: 'email', description: 'Email address' }
        ]}
      },
      {
        keywords: ['map', 'mappa', 'direction', 'location', 'dove siamo', 'indicazion', 'address', 'indirizzo'],
        tool: { name: 'get_directions', description: 'Get directions to this location', params: [
          { name: 'from', type: 'string', description: 'Starting location' }
        ]}
      },
      {
        keywords: ['gallery', 'galleria', 'photo', 'foto', 'image', 'immagin'],
        tool: { name: 'browse_gallery', description: 'Browse photo gallery', params: [
          { name: 'category', type: 'string', description: 'Gallery category (optional)' }
        ]}
      },
      {
        keywords: ['review', 'recension', 'testimonial', 'feedback', 'rating', 'valutazion'],
        tool: { name: 'get_reviews', description: 'Get customer reviews', params: [
          { name: 'sort', type: 'string', description: 'Sort order (recent, rating)' }
        ]}
      }
    ];

    // Check links for more signals
    const links = Array.from(doc.querySelectorAll('a[href]')).map(a => (a.href + ' ' + a.textContent).toLowerCase());
    const allText = text + ' ' + links.join(' ');

    patterns.forEach(pattern => {
      const matchCount = pattern.keywords.filter(kw => allText.includes(kw)).length;
      if (matchCount >= 1) {
        suggestions.push({ ...pattern.tool, confidence: Math.min(1, matchCount / 2) });
      }
    });

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Return top 5 most relevant
    return suggestions.slice(0, 5);
  }

  /**
   * Full scan: fetch + parse + extract
   */
  async function scan(url) {
    const { html, status } = await fetchPage(url);
    const doc = parseHTML(html);
    const responseQuality = analyzeResponseQuality(html);
    const forms = extractForms(doc);
    const scriptRegistrations = extractScriptRegistrations(doc);
    const security = checkSecurity(url);
    const pageSignals = extractPageSignals(doc);
    const suggestedTools = analyzPageContent(doc, url);

    // Filter out captcha forms
    const realForms = responseQuality.isCaptcha
      ? forms.filter(f => !f.id?.includes('captcha') && !f.className?.includes('captcha'))
      : forms;

    return {
      url,
      status,
      forms: realForms,
      scriptRegistrations,
      suggestedTools,
      security,
      responseQuality,
      pageSignals,
      htmlLength: html.length,
      timestamp: new Date().toISOString()
    };
  }

  return { scan, fetchPage, parseHTML, extractForms, extractScriptRegistrations, checkSecurity };
})();
