/**
 * AgentReady — AI Agent Readiness Scanner
 * Programmatic API
 */
const protocols = require('./lib/protocols');
const pageScanner = require('./lib/page-scanner');

async function scan(url) {
  const origin = new URL(url).origin;

  const [page, protocolResults] = await Promise.all([
    pageScanner.scanPage(url),
    protocols.scan(origin)
  ]);

  const forms = page.forms;
  const hasWebMCP = forms.some(f => f.hasWebMCP) || page.scriptRegistrations.length > 0;
  const webmcpCount = forms.filter(f => f.hasWebMCP).length + page.scriptRegistrations.length;

  // Score calculation
  let score = 0;

  // Page structure (30 points)
  if (page.isHTTPS) score += 8;
  if (page.pageSignals.hasTitle) score += 3;
  if (page.pageSignals.hasMetaDescription) score += 3;
  if (page.pageSignals.hasOgTags) score += 2;
  if (page.pageSignals.hasJsonLd) score += 5;
  if (page.pageSignals.hasSemanticHTML) score += 5;
  if (page.pageSignals.hasARIA) score += 4;

  // WebMCP (40 points)
  if (forms.length > 0 && hasWebMCP) {
    const ratio = forms.filter(f => f.hasWebMCP).length / forms.length;
    score += Math.round(ratio * 30);
    // Field descriptions
    const wmForms = forms.filter(f => f.hasWebMCP);
    const totalFields = wmForms.reduce((s, f) => s + f.fieldCount, 0);
    const describedFields = wmForms.reduce((s, f) => s + f.fields.filter(ff => ff.toolparamdescription).length, 0);
    if (totalFields > 0) score += Math.round((describedFields / totalFields) * 10);
  } else if (page.scriptRegistrations.length > 0) {
    score += 25;
  }

  // Protocols (30 points)
  score += protocolResults.summary.found * 6;

  score = Math.min(100, score);

  return {
    url,
    origin,
    score,
    isHTTPS: page.isHTTPS,
    forms: {
      total: forms.length,
      webmcpReady: forms.filter(f => f.hasWebMCP).length,
      details: forms
    },
    scriptRegistrations: page.scriptRegistrations,
    webmcpCount,
    pageSignals: page.pageSignals,
    protocols: protocolResults,
    timestamp: page.timestamp
  };
}

module.exports = { scan };
