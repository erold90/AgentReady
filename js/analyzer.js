/**
 * analyzer.js — Analyze scan results and calculate Agent Readiness Score
 */

const Analyzer = (() => {

  /**
   * Calculate Agent Readiness Score (0-100) with category breakdown
   */
  function analyze(scanResult) {
    const { forms, scriptRegistrations, security, pageSignals, responseQuality } = scanResult;
    const hasWebMCP = forms.some(f => f.hasWebMCP) || scriptRegistrations.length > 0;

    const categories = {
      forms: analyzeFormCoverage(forms, scriptRegistrations),
      descriptions: analyzeDescriptions(forms, scriptRegistrations),
      schema: analyzeSchemaQuality(forms),
      pageStructure: analyzePageStructure(pageSignals, responseQuality),
      security: analyzeSecurity(security)
    };

    // Dynamic weights — when no WebMCP, page structure matters more
    let weights;
    if (hasWebMCP) {
      weights = { forms: 30, descriptions: 25, schema: 15, pageStructure: 15, security: 15 };
    } else if (forms.length > 0) {
      weights = { forms: 25, descriptions: 10, schema: 10, pageStructure: 35, security: 20 };
    } else {
      weights = { forms: 10, descriptions: 5, schema: 5, pageStructure: 60, security: 20 };
    }

    let totalScore = 0;
    for (const [key, cat] of Object.entries(categories)) {
      totalScore += (cat.score / 100) * weights[key];
    }

    const issues = generateIssues(scanResult, categories);

    return {
      score: Math.round(totalScore),
      categories,
      issues,
      summary: generateSummary(totalScore, forms, scriptRegistrations, responseQuality)
    };
  }

  /**
   * Category: Form Coverage — how many forms have WebMCP
   */
  function analyzeFormCoverage(forms, scriptRegs) {
    if (forms.length === 0 && scriptRegs.length === 0) {
      return {
        score: 0,
        label: 'Forms & Tools',
        detail: 'No forms or WebMCP tools detected'
      };
    }

    const webmcpForms = forms.filter(f => f.hasWebMCP).length;
    const totalTools = webmcpForms + scriptRegs.filter(r => r.name !== '_provideContext').length;
    const totalForms = forms.length;

    let score;
    if (totalForms === 0) {
      score = scriptRegs.length > 0 ? 80 : 0;
    } else {
      const coverage = webmcpForms / totalForms;
      score = Math.round(coverage * 100);
      if (scriptRegs.length > 0) score = Math.min(100, score + 20);
    }

    return {
      score,
      label: 'Forms & Tools',
      detail: `${webmcpForms}/${totalForms} forms WebMCP-ready, ${scriptRegs.length} JS registrations`
    };
  }

  /**
   * Category: Description Quality
   */
  function analyzeDescriptions(forms, scriptRegs) {
    const webmcpForms = forms.filter(f => f.hasWebMCP);
    if (webmcpForms.length === 0 && scriptRegs.length === 0) {
      return { score: 0, label: 'Descriptions', detail: 'No WebMCP tools to evaluate' };
    }

    let totalChecks = 0;
    let passedChecks = 0;

    webmcpForms.forEach(form => {
      // Tool description exists and is meaningful
      totalChecks++;
      if (form.tooldescription && form.tooldescription.length > 10) passedChecks++;

      // Field descriptions
      form.fields.forEach(field => {
        totalChecks++;
        if (field.toolparamdescription && field.toolparamdescription.length > 3) passedChecks++;
      });
    });

    scriptRegs.forEach(reg => {
      if (reg.name === '_provideContext') return;
      totalChecks++;
      if (reg.description && reg.description.length > 10) passedChecks++;
    });

    const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    return {
      score,
      label: 'Descriptions',
      detail: `${passedChecks}/${totalChecks} descriptions are meaningful`
    };
  }

  /**
   * Category: Schema Quality (for declarative forms)
   */
  function analyzeSchemaQuality(forms) {
    const webmcpForms = forms.filter(f => f.hasWebMCP);
    if (webmcpForms.length === 0) {
      return { score: 0, label: 'Schema Quality', detail: 'No WebMCP forms to evaluate' };
    }

    let totalChecks = 0;
    let passedChecks = 0;

    webmcpForms.forEach(form => {
      form.fields.forEach(field => {
        // Has name attribute (required for schema)
        totalChecks++;
        if (field.name) passedChecks++;

        // Has proper type
        totalChecks++;
        if (field.type !== 'text' || field.name) passedChecks++;

        // Has required where appropriate
        totalChecks++;
        if (field.required) passedChecks += 0.5; // Partial credit

        // Select has meaningful options
        if (field.tagName === 'select' && field.options.length > 0) {
          totalChecks++;
          passedChecks++;
        }
      });
    });

    const score = totalChecks > 0 ? Math.min(100, Math.round((passedChecks / totalChecks) * 100)) : 0;

    return {
      score,
      label: 'Schema Quality',
      detail: `Input types and constraints properly defined`
    };
  }

  /**
   * Category: Page Structure — how well-structured is the page for agent comprehension
   */
  function analyzePageStructure(pageSignals, responseQuality) {
    if (!pageSignals) {
      return { score: 0, label: 'Page Structure', detail: 'Could not analyze page structure' };
    }

    // If proxy was blocked, low score
    if (responseQuality && (responseQuality.isCaptcha || responseQuality.isBlocked)) {
      return {
        score: 5,
        label: 'Page Structure',
        detail: `Proxy was ${responseQuality.isCaptcha ? 'served a CAPTCHA' : 'blocked'} — cannot assess real page structure`
      };
    }

    if (responseQuality && responseQuality.isJsShell) {
      return {
        score: 15,
        label: 'Page Structure',
        detail: 'JavaScript-rendered site — static HTML has minimal structure'
      };
    }

    let score = 0;
    const details = [];

    // Title (10pts)
    if (pageSignals.hasTitle) { score += 10; }

    // Meta description (10pts)
    if (pageSignals.hasMetaDescription) { score += 10; details.push('meta description'); }

    // OG tags (5pts)
    if (pageSignals.hasOgTags) { score += 5; details.push('OG tags'); }

    // Structured data (15pts)
    if (pageSignals.hasJsonLd) { score += 15; details.push('JSON-LD'); }
    else if (pageSignals.hasMicrodata) { score += 10; details.push('microdata'); }

    // Semantic HTML (20pts max)
    const semScore = Math.min(20, pageSignals.semanticCount * 4);
    score += semScore;
    if (semScore > 0) details.push(`${pageSignals.semanticCount} semantic elements`);

    // Headings (10pts)
    if (pageSignals.h1Count === 1) score += 5; // proper single H1
    if (pageSignals.headingCount >= 3) score += 5;

    // Accessibility (15pts)
    if (pageSignals.ariaCount > 0) {
      score += Math.min(15, pageSignals.ariaCount * 3);
      details.push(`${pageSignals.ariaCount} ARIA attributes`);
    }

    // Images with alt text (5pts)
    if (pageSignals.totalImages > 0) {
      const altRatio = pageSignals.imagesWithAlt / pageSignals.totalImages;
      score += Math.round(altRatio * 5);
    }

    // Forms present (10pts) — they represent interaction potential
    if (pageSignals.formCount > 0) {
      score += 10;
      details.push(`${pageSignals.formCount} form${pageSignals.formCount > 1 ? 's' : ''}`);
    }

    score = Math.min(100, score);

    return {
      score,
      label: 'Page Structure',
      detail: details.length > 0 ? `Found: ${details.join(', ')}` : 'Minimal page structure detected'
    };
  }

  /**
   * Category: Annotations
   */
  function analyzeAnnotations(forms, scriptRegs) {
    const webmcpForms = forms.filter(f => f.hasWebMCP);
    if (webmcpForms.length === 0 && scriptRegs.length === 0) {
      return { score: 0, label: 'Annotations', detail: 'No tools to evaluate' };
    }

    let hasAnnotations = false;
    // Check if any script registration has annotations
    scriptRegs.forEach(reg => {
      if (reg.raw && (reg.raw.includes('readOnlyHint') || reg.raw.includes('destructiveHint') ||
          reg.raw.includes('idempotentHint') || reg.raw.includes('openWorldHint'))) {
        hasAnnotations = true;
      }
    });

    // Check forms for autosubmit
    webmcpForms.forEach(form => {
      if (form.toolautosubmit) hasAnnotations = true;
    });

    const score = hasAnnotations ? 80 : 0;

    return {
      score,
      label: 'Annotations',
      detail: hasAnnotations ? 'Tool annotations found' : 'No annotations (readOnlyHint, destructiveHint, etc.)'
    };
  }

  /**
   * Category: Security
   */
  function analyzeSecurity(security) {
    const score = security.isHTTPS ? 100 : 0;
    return {
      score,
      label: 'Security',
      detail: security.isHTTPS ?
        'HTTPS enabled (required for SecureContext)' :
        'HTTP only — WebMCP requires HTTPS (SecureContext)'
    };
  }

  /**
   * Generate list of issues and suggestions
   */
  function generateIssues(scanResult, categories) {
    const issues = [];
    const { forms, scriptRegistrations, security, responseQuality, pageSignals } = scanResult;

    // Proxy quality warning
    if (responseQuality && responseQuality.quality !== 'good') {
      issues.push({
        type: responseQuality.isCaptcha || responseQuality.isBlocked ? 'error' : 'warning',
        title: responseQuality.isCaptcha ? 'CAPTCHA Detected' :
               responseQuality.isBlocked ? 'Proxy Blocked' : 'JavaScript-Only Site',
        text: responseQuality.message
      });
    }

    // Security
    if (!security.isHTTPS) {
      issues.push({
        type: 'error',
        title: 'HTTPS Required',
        text: 'WebMCP requires a Secure Context (HTTPS). Your site uses HTTP. AI agents cannot discover tools on non-HTTPS pages.'
      });
    } else {
      issues.push({
        type: 'success',
        title: 'HTTPS Enabled',
        text: 'Your site uses HTTPS, which is required for WebMCP.'
      });
    }

    // Forms without WebMCP
    const nonWebMCPForms = forms.filter(f => !f.hasWebMCP);
    if (nonWebMCPForms.length > 0) {
      issues.push({
        type: 'warning',
        title: `${nonWebMCPForms.length} Form${nonWebMCPForms.length > 1 ? 's' : ''} Without WebMCP`,
        text: `Found ${nonWebMCPForms.length} form${nonWebMCPForms.length > 1 ? 's' : ''} that could be exposed to AI agents. Add toolname and tooldescription attributes to make them agent-accessible.`
      });
    }

    // Forms with WebMCP
    const webmcpForms = forms.filter(f => f.hasWebMCP);
    if (webmcpForms.length > 0) {
      issues.push({
        type: 'success',
        title: `${webmcpForms.length} Form${webmcpForms.length > 1 ? 's' : ''} WebMCP-Ready`,
        text: `${webmcpForms.length} form${webmcpForms.length > 1 ? 's' : ''} already have WebMCP attributes.`
      });
    }

    // JS registrations
    if (scriptRegistrations.length > 0) {
      const toolCount = scriptRegistrations.filter(r => r.name !== '_provideContext').length;
      issues.push({
        type: 'success',
        title: `${toolCount} JavaScript Tool${toolCount > 1 ? 's' : ''} Registered`,
        text: `Found ${toolCount} tool${toolCount > 1 ? 's' : ''} registered via navigator.modelContext in JavaScript.`
      });
    }

    // No forms at all
    if (forms.length === 0 && scriptRegistrations.length === 0) {
      issues.push({
        type: 'warning',
        title: 'No Forms or Tools Detected',
        text: 'This page has no HTML forms and no WebMCP tools. AI agents cannot interact with this site. Use the imperative JavaScript API (navigator.modelContext.registerTool) to expose custom actions.'
      });
    }

    // Missing descriptions
    webmcpForms.forEach(form => {
      if (!form.tooldescription || form.tooldescription.length < 10) {
        issues.push({
          type: 'warning',
          title: `Short Description: ${form.toolname || 'Form #' + form.index}`,
          text: 'Tool descriptions should be at least 10 characters and clearly explain what the tool does. AI agents use this to decide when to invoke the tool.'
        });
      }

      const fieldsWithoutDesc = form.fields.filter(f => !f.toolparamdescription);
      if (fieldsWithoutDesc.length > 0) {
        issues.push({
          type: 'warning',
          title: `${fieldsWithoutDesc.length} Field${fieldsWithoutDesc.length > 1 ? 's' : ''} Missing toolparamdescription`,
          text: `In "${form.toolname || 'Form #' + form.index}": ${fieldsWithoutDesc.map(f => f.name || f.id).join(', ')}. Add toolparamdescription to help agents understand each parameter.`
        });
      }
    });

    // Missing annotations suggestion (only relevant when WebMCP tools exist)
    if (webmcpForms.length > 0 || scriptRegistrations.length > 0) {
      let hasAnnotations = false;
      scriptRegistrations.forEach(reg => {
        if (reg.raw && (reg.raw.includes('readOnlyHint') || reg.raw.includes('destructiveHint') ||
            reg.raw.includes('idempotentHint'))) hasAnnotations = true;
      });
      webmcpForms.forEach(form => { if (form.toolautosubmit) hasAnnotations = true; });
      if (!hasAnnotations) {
        issues.push({
          type: 'info',
          title: 'Consider Adding Annotations',
          text: 'Add readOnlyHint, destructiveHint, or idempotentHint to your tools. These help AI agents decide the appropriate consent level before invoking a tool.'
        });
      }
    }

    // Page structure insights
    if (pageSignals) {
      const goodSignals = [];
      if (pageSignals.hasJsonLd) goodSignals.push('JSON-LD structured data');
      if (pageSignals.hasOgTags) goodSignals.push('Open Graph tags');
      if (pageSignals.semanticCount >= 3) goodSignals.push('semantic HTML');
      if (pageSignals.ariaCount > 0) goodSignals.push('ARIA accessibility');

      if (goodSignals.length > 0) {
        issues.push({
          type: 'success',
          title: 'Good Page Structure',
          text: `Found: ${goodSignals.join(', ')}. This makes it easier for AI agents to understand your page content.`
        });
      }

      if (!pageSignals.hasMetaDescription) {
        issues.push({
          type: 'info',
          title: 'Missing Meta Description',
          text: 'Add a <meta name="description"> tag. AI agents use this to understand what your page does.'
        });
      }
    }

    return issues;
  }

  /**
   * Generate human-readable summary
   */
  function generateSummary(score, forms, scriptRegs, responseQuality) {
    const hasWebMCP = forms.some(f => f.hasWebMCP) || scriptRegs.length > 0;

    // Proxy issues take priority in summary
    if (responseQuality && responseQuality.isCaptcha) {
      return 'The site served a CAPTCHA to our proxy — results may not reflect actual content. Try a different URL or use the browser extension.';
    }
    if (responseQuality && responseQuality.isBlocked) {
      return 'The site blocked our proxy request. Results may be incomplete.';
    }
    if (responseQuality && responseQuality.isJsShell) {
      if (hasWebMCP) return 'WebMCP detected! This JS-rendered site has agent tools, but some may be missing from static analysis.';
      return 'This site renders content with JavaScript. Forms and interactions may not be visible to static analysis. Consider using the imperative API.';
    }

    if (score >= 80 && hasWebMCP) {
      return 'Excellent! Your website is well-prepared for AI agents.';
    } else if (score >= 50 && hasWebMCP) {
      return 'Good start. Some forms are agent-ready, but there is room for improvement.';
    } else if (hasWebMCP) {
      return 'WebMCP detected but needs significant improvements.';
    } else if (forms.length > 0) {
      return 'Forms detected but no WebMCP implementation. Add WebMCP attributes to make your site agent-ready.';
    } else {
      return 'No forms or WebMCP tools detected. Use the imperative API to register custom tools for this site.';
    }
  }

  /**
   * Get color for a score value
   */
  function getScoreColor(score) {
    if (score >= 80) return 'var(--green)';
    if (score >= 50) return 'var(--yellow)';
    return 'var(--red)';
  }

  function getScoreClass(score) {
    if (score >= 80) return 'success';
    if (score >= 50) return 'warning';
    return 'error';
  }

  return { analyze, getScoreColor, getScoreClass };
})();
