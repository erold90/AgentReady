/**
 * analyzer.js — Analyze scan results (shared between extension and web app)
 * Standalone version for extension context
 */
const Analyzer = (() => {

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

  function analyzeFormCoverage(forms, scriptRegs) {
    if (forms.length === 0 && scriptRegs.length === 0) {
      return { score: 0, label: 'Forms & Tools', detail: 'No forms or WebMCP tools detected' };
    }
    const webmcpForms = forms.filter(f => f.hasWebMCP).length;
    const totalForms = forms.length;
    let score;
    if (totalForms === 0) {
      score = scriptRegs.length > 0 ? 80 : 0;
    } else {
      score = Math.round((webmcpForms / totalForms) * 100);
      if (scriptRegs.length > 0) score = Math.min(100, score + 20);
    }
    return { score, label: 'Forms & Tools', detail: `${webmcpForms}/${totalForms} forms WebMCP-ready, ${scriptRegs.length} JS registrations` };
  }

  function analyzeDescriptions(forms, scriptRegs) {
    const webmcpForms = forms.filter(f => f.hasWebMCP);
    if (webmcpForms.length === 0 && scriptRegs.length === 0) {
      return { score: 0, label: 'Descriptions', detail: 'No WebMCP tools to evaluate' };
    }
    let total = 0, passed = 0;
    webmcpForms.forEach(form => {
      total++;
      if (form.tooldescription && form.tooldescription.length > 10) passed++;
      form.fields.forEach(f => { total++; if (f.toolparamdescription && f.toolparamdescription.length > 3) passed++; });
    });
    scriptRegs.forEach(r => { if (r.name === '_provideContext') return; total++; if (r.description && r.description.length > 10) passed++; });
    return { score: total > 0 ? Math.round((passed / total) * 100) : 0, label: 'Descriptions', detail: `${passed}/${total} descriptions are meaningful` };
  }

  function analyzeSchemaQuality(forms) {
    const webmcpForms = forms.filter(f => f.hasWebMCP);
    if (webmcpForms.length === 0) return { score: 0, label: 'Schema Quality', detail: 'No WebMCP forms to evaluate' };
    let total = 0, passed = 0;
    webmcpForms.forEach(form => {
      form.fields.forEach(f => {
        total++; if (f.name) passed++;
        total++; if (f.type !== 'text' || f.name) passed++;
        total++; if (f.required) passed += 0.5;
        if (f.tagName === 'select' && f.options.length > 0) { total++; passed++; }
      });
    });
    return { score: total > 0 ? Math.min(100, Math.round((passed / total) * 100)) : 0, label: 'Schema Quality', detail: 'Input types and constraints properly defined' };
  }

  function analyzePageStructure(pageSignals, responseQuality) {
    if (!pageSignals) return { score: 0, label: 'Page Structure', detail: 'Could not analyze page structure' };
    if (responseQuality && responseQuality.quality === 'live') { /* full analysis */ }
    else if (responseQuality && (responseQuality.isCaptcha || responseQuality.isBlocked)) {
      return { score: 5, label: 'Page Structure', detail: `Proxy was ${responseQuality.isCaptcha ? 'served a CAPTCHA' : 'blocked'}` };
    } else if (responseQuality && responseQuality.isJsShell) {
      return { score: 15, label: 'Page Structure', detail: 'JavaScript-rendered site — static HTML has minimal structure' };
    }

    let score = 0;
    const details = [];
    if (pageSignals.hasTitle) score += 10;
    if (pageSignals.hasMetaDescription) { score += 10; details.push('meta description'); }
    if (pageSignals.hasOgTags) { score += 5; details.push('OG tags'); }
    if (pageSignals.hasJsonLd) { score += 15; details.push('JSON-LD'); }
    else if (pageSignals.hasMicrodata) { score += 10; details.push('microdata'); }
    score += Math.min(20, pageSignals.semanticCount * 4);
    if (pageSignals.semanticCount > 0) details.push(`${pageSignals.semanticCount} semantic elements`);
    if (pageSignals.h1Count === 1) score += 5;
    if (pageSignals.headingCount >= 3) score += 5;
    if (pageSignals.ariaCount > 0) { score += Math.min(15, pageSignals.ariaCount * 3); details.push(`${pageSignals.ariaCount} ARIA`); }
    if (pageSignals.totalImages > 0) score += Math.round((pageSignals.imagesWithAlt / pageSignals.totalImages) * 5);
    if (pageSignals.formCount > 0) { score += 10; details.push(`${pageSignals.formCount} forms`); }

    return { score: Math.min(100, score), label: 'Page Structure', detail: details.length > 0 ? `Found: ${details.join(', ')}` : 'Minimal page structure detected' };
  }

  function analyzeSecurity(security) {
    return {
      score: security.isHTTPS ? 100 : 0,
      label: 'Security',
      detail: security.isHTTPS ? 'HTTPS enabled (required for SecureContext)' : 'HTTP only — WebMCP requires HTTPS'
    };
  }

  function generateIssues(scanResult, categories) {
    const issues = [];
    const { forms, scriptRegistrations, security, responseQuality, pageSignals } = scanResult;

    if (!security.isHTTPS) {
      issues.push({ type: 'error', title: 'HTTPS Required', text: 'WebMCP requires HTTPS. AI agents cannot discover tools on HTTP pages.' });
    } else {
      issues.push({ type: 'success', title: 'HTTPS Enabled', text: 'Your site uses HTTPS, required for WebMCP.' });
    }

    const nonWM = forms.filter(f => !f.hasWebMCP);
    if (nonWM.length > 0) {
      issues.push({ type: 'warning', title: `${nonWM.length} Form${nonWM.length > 1 ? 's' : ''} Without WebMCP`, text: `Add toolname and tooldescription attributes to make them agent-accessible.` });
    }
    const wm = forms.filter(f => f.hasWebMCP);
    if (wm.length > 0) {
      issues.push({ type: 'success', title: `${wm.length} Form${wm.length > 1 ? 's' : ''} WebMCP-Ready`, text: `${wm.length} form${wm.length > 1 ? 's' : ''} already have WebMCP attributes.` });
    }
    if (scriptRegistrations.length > 0) {
      const tc = scriptRegistrations.filter(r => r.name !== '_provideContext').length;
      issues.push({ type: 'success', title: `${tc} JS Tool${tc > 1 ? 's' : ''} Registered`, text: `Found via navigator.modelContext.` });
    }
    if (forms.length === 0 && scriptRegistrations.length === 0) {
      issues.push({ type: 'warning', title: 'No Forms or Tools Detected', text: 'Use navigator.modelContext.registerTool() to expose custom actions.' });
    }

    wm.forEach(form => {
      if (!form.tooldescription || form.tooldescription.length < 10) {
        issues.push({ type: 'warning', title: `Short Description: ${form.toolname || 'Form #' + form.index}`, text: 'Tool descriptions should be at least 10 characters.' });
      }
      const noDesc = form.fields.filter(f => !f.toolparamdescription);
      if (noDesc.length > 0) {
        issues.push({ type: 'warning', title: `${noDesc.length} Fields Missing Description`, text: `In "${form.toolname || 'Form #' + form.index}": ${noDesc.map(f => f.name || f.id).join(', ')}` });
      }
    });

    if (pageSignals) {
      const good = [];
      if (pageSignals.hasJsonLd) good.push('JSON-LD');
      if (pageSignals.hasOgTags) good.push('OG tags');
      if (pageSignals.semanticCount >= 3) good.push('semantic HTML');
      if (pageSignals.ariaCount > 0) good.push('ARIA');
      if (good.length > 0) {
        issues.push({ type: 'success', title: 'Good Page Structure', text: `Found: ${good.join(', ')}.` });
      }
      if (!pageSignals.hasMetaDescription) {
        issues.push({ type: 'info', title: 'Missing Meta Description', text: 'AI agents use meta descriptions to understand pages.' });
      }
    }

    return issues;
  }

  function generateSummary(score, forms, scriptRegs, responseQuality) {
    const hasWebMCP = forms.some(f => f.hasWebMCP) || scriptRegs.length > 0;
    if (score >= 80 && hasWebMCP) return 'Excellent! Your website is well-prepared for AI agents.';
    if (score >= 50 && hasWebMCP) return 'Good start. Some improvements possible.';
    if (hasWebMCP) return 'WebMCP detected but needs significant improvements.';
    if (forms.length > 0) return 'Forms detected but no WebMCP. Add WebMCP attributes to make your site agent-ready.';
    return 'No forms or WebMCP tools detected. Use the imperative API to add agent capabilities.';
  }

  function getScoreColor(score) {
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  function getScoreClass(score) {
    if (score >= 80) return 'success';
    if (score >= 50) return 'warning';
    return 'error';
  }

  return { analyze, getScoreColor, getScoreClass };
})();
