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
   * Full scan: fetch + parse + extract
   */
  async function scan(url) {
    const { html, status } = await fetchPage(url);
    const doc = parseHTML(html);
    const forms = extractForms(doc);
    const scriptRegistrations = extractScriptRegistrations(doc);
    const security = checkSecurity(url);

    return {
      url,
      status,
      forms,
      scriptRegistrations,
      security,
      htmlLength: html.length,
      timestamp: new Date().toISOString()
    };
  }

  return { scan, fetchPage, parseHTML, extractForms, extractScriptRegistrations, checkSecurity };
})();
