#!/usr/bin/env node
/**
 * AgentReady CLI — Scan any URL for AI Agent Readiness
 *
 * Usage:
 *   npx webmcp-scanner https://example.com
 *   npx webmcp-scanner https://example.com --crawl
 *   npx webmcp-scanner https://example.com --json
 *   npx webmcp-scanner https://example.com --protocols
 */

const { scan, crawl } = require('../index');
const reportHtml = require('../lib/report-html');
const license = require('../lib/license');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { execSync } = require('child_process');

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const urls = args.filter(a => !a.startsWith('--'));

if (urls.length === 0 || flags.has('--help')) {
  console.log(`
  ⚡ AgentReady — AI Agent Readiness Scanner

  Usage:
    agentready <url>              Scan homepage
    agentready <url> --crawl      Full site crawl (up to 20 pages)
    agentready <url> --report     Generate HTML report and open in browser
    agentready <url> --json       Output raw JSON
    agentready <url> --protocols  Only check discovery protocols
    agentready <url> --key=KEY    Activate Pro license (unlocks all pages + code)
    agentready --help             Show this help

  Free: 3 pages, 2 code snippets. Pro: unlimited.
  Get a license at https://crawlaudit.dev

  Examples:
    agentready https://example.com
    agentready https://villamareblu.it --crawl --report
    agentready https://villamareblu.it --crawl --key=YOUR_KEY
    agentready https://stripe.com --json
    agentready https://api.openai.com --protocols
  `);
  process.exit(0);
}

const isJson = flags.has('--json');
const isCrawl = flags.has('--crawl');
const isReport = flags.has('--report');
const protocolsOnly = flags.has('--protocols') || flags.has('--protocols-only');

// License key
const keyArg = args.find(a => a.startsWith('--key='));
const licenseKey = keyArg ? keyArg.split('=')[1] : process.env.CRAWLAUDIT_KEY || '';

// Plan limits
const FREE_PAGE_LIMIT = 3;
const FREE_CODE_LIMIT = 2;

async function main() {
  const url = urls[0];

  // Validate URL
  let parsed;
  try {
    parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    console.error(`Error: Invalid URL "${url}". Use format: https://example.com`);
    process.exit(1);
  }

  const finalUrl = parsed.href;

  // Validate license key
  let plan = 'free';
  if (licenseKey) {
    if (!isJson) process.stdout.write('  Validating license key...');
    const result = await license.validate(licenseKey);
    if (result.valid) {
      plan = result.plan;
      if (!isJson) console.log(` ✓ ${plan.toUpperCase()} plan activated`);
    } else {
      if (!isJson) console.log(` ✗ Invalid key${result.error ? ': ' + result.error : ''}`);
    }
  }

  const isPro = plan !== 'free';

  if (!isJson) {
    console.log(`\n  ⚡ AgentReady Scanner v2.2.0${isPro ? ` [${plan.toUpperCase()}]` : ' [FREE]'}`);
    console.log(`  ${isCrawl ? 'Crawling' : 'Scanning'} ${finalUrl}...\n`);
  }

  try {
    if (isCrawl) {
      const result = await crawl(finalUrl, {
        maxPages: isPro ? (plan === 'team' ? 2000 : 500) : 20,
        onProgress: (current, total, pageUrl) => {
          if (!isJson) {
            const path = new URL(pageUrl).pathname;
            process.stdout.write(`\r  Scanning page ${current}/${total}: ${path}${''.padEnd(40)}`);
          }
        }
      });

      if (!isJson) process.stdout.write('\r' + ' '.repeat(80) + '\r');

      if (isJson) {
        // Gate JSON output for free plan
        if (!isPro && result.pages.length > FREE_PAGE_LIMIT) {
          const gated = { ...result };
          gated.pages = result.pages.slice(0, FREE_PAGE_LIMIT);
          gated._gated = { totalPages: result.pages.length, shownPages: FREE_PAGE_LIMIT, upgrade: 'Use --key=YOUR_KEY to unlock all pages. Get a license at https://crawlaudit.dev' };
          console.log(JSON.stringify(gated, null, 2));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        return;
      }

      printCrawlResult(result, isPro);

      if (isReport) openReport(result, true, isPro);
    } else {
      const result = await scan(finalUrl);

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      if (protocolsOnly) {
        printProtocols(result.protocols);
        return;
      }

      printScore(result);
      printPageSignals(result.pageSignals);
      printSecurityHeaders(result);
      printWebMCP(result);
      printProtocols(result.protocols);
      printBotAccess(result.protocols);
      printSummary(result);

      if (isReport) openReport(result, false, isPro);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }
}

function printCrawlResult(result, isPro) {
  const bar = scoreBar(result.score);
  console.log(`  Full Site Scan Results`);
  console.log(`  ─────────────────────`);
  console.log(`  Score: ${result.score}/100 ${bar}`);
  console.log(`  Pages: ${result.pageCount}  |  Forms: ${result.totalForms}  |  Issues: ${result.totalIssues}`);
  console.log('');

  // Per-page scores (gated for free)
  console.log('  Pages');
  const pagesToShow = isPro ? result.pages : result.pages.slice(0, FREE_PAGE_LIMIT);
  pagesToShow.forEach(p => {
    const path = new URL(p.url).pathname || '/';
    const icon = p.score >= 80 ? '✓' : p.score >= 50 ? '~' : '✗';
    const color = p.score >= 80 ? '\x1b[32m' : p.score >= 50 ? '\x1b[33m' : '\x1b[31m';
    console.log(`    ${color}${icon}\x1b[0m ${String(p.score).padStart(3)} ${path}  (${p.forms.total} forms, ${p.issues.length} issues)`);
  });

  if (!isPro && result.pages.length > FREE_PAGE_LIMIT) {
    const hidden = result.pages.length - FREE_PAGE_LIMIT;
    console.log(`\n    \x1b[33m🔒 ${hidden} more page${hidden > 1 ? 's' : ''} hidden — use --key=YOUR_KEY to unlock\x1b[0m`);
    console.log(`    \x1b[33m   Get a Pro license at https://crawlaudit.dev\x1b[0m`);
  }
  console.log('');

  // Protocols
  printProtocols(result.protocols);

  // Bot Access
  printBotAccess(result.protocols);

  // Verdict
  let verdict;
  if (result.score >= 80) verdict = 'Agent-Ready';
  else if (result.score >= 50) verdict = 'Partially Ready';
  else if (result.totalForms > 0) verdict = 'Not Agent-Ready';
  else verdict = 'Invisible to AI Agents';

  console.log(`  Verdict: ${verdict}`);
  console.log(`  Full report: https://erold90.github.io/AgentReady`);
  console.log('');
}

function printScore(result) {
  const bar = scoreBar(result.score);
  console.log(`  Score: ${result.score}/100 ${bar}`);
  console.log(`  HTTPS: ${result.isHTTPS ? '✓ Yes' : '✗ No'}`);
  console.log('');
}

function printPageSignals(ps) {
  console.log('  Page Structure');
  console.log(`    Title:            ${ps.hasTitle ? '✓' : '✗'}`);
  console.log(`    Meta Description: ${ps.hasMetaDescription ? '✓' : '✗'}`);
  console.log(`    Open Graph:       ${ps.hasOgTags ? '✓' : '✗'}`);
  console.log(`    JSON-LD:          ${ps.hasJsonLd ? '✓' : '✗'}`);
  console.log(`    Semantic HTML:    ${ps.hasSemanticHTML ? '✓' : '✗'}`);
  console.log(`    ARIA:             ${ps.hasARIA ? '✓' : '✗'}`);
  console.log('');
}

function printSecurityHeaders(result) {
  const sh = result.securityHeaders || {};
  console.log('  Security');
  console.log(`    HTTPS:              ${result.isHTTPS ? '✓' : '✗'}`);
  console.log(`    HSTS:               ${sh.hsts ? '✓' : '✗'}`);
  console.log(`    CSP:                ${sh.csp ? '✓' : '✗'}`);
  console.log(`    X-Content-Type:     ${sh.xContentType ? '✓' : '✗'}`);
  console.log(`    X-Frame-Options:    ${sh.xFrame ? '✓' : '✗'}`);
  console.log(`    Referrer-Policy:    ${sh.referrerPolicy ? '✓' : '✗'}`);
  console.log('');
}

function printWebMCP(result) {
  console.log('  WebMCP');
  console.log(`    Forms:         ${result.forms.total}`);
  console.log(`    WebMCP-ready:  ${result.forms.webmcpReady}`);
  console.log(`    JS tools:      ${result.scriptRegistrations.length}`);
  if (result.forms.details.length > 0) {
    result.forms.details.forEach(f => {
      const icon = f.hasWebMCP ? '✓' : '✗';
      const name = f.toolname || f.name || f.id || `Form #${f.index}`;
      console.log(`    ${icon} ${name} (${f.fieldCount} fields)`);
    });
  }
  console.log('');
}

function printProtocols(protocols) {
  console.log('  AI Discovery Protocols');
  const checks = [
    { key: 'a2a', label: 'A2A Agent Card' },
    { key: 'mcp', label: 'MCP Discovery' },
    { key: 'agents', label: 'agents.json' },
    { key: 'openapi', label: 'OpenAPI' },
    { key: 'llms', label: 'llms.txt' },
  ];

  checks.forEach(c => {
    const r = protocols[c.key];
    const icon = r?.found ? '✓' : '✗';
    let detail = '';
    if (r?.found) {
      if (c.key === 'a2a' && r.name) detail = ` — ${r.name}`;
      if (c.key === 'mcp' && r.serverCount) detail = ` — ${r.serverCount} server(s)`;
      if (c.key === 'agents' && r.agentCount) detail = ` — ${r.agentCount} agent(s)`;
      if (c.key === 'openapi' && r.title) detail = ` — ${r.title} (${r.version})`;
      if (c.key === 'llms' && r.title) detail = ` — ${r.title}`;
    }
    console.log(`    ${icon} ${c.label}${detail}`);
  });
  console.log(`\n    ${protocols.summary.found}/${protocols.summary.total} protocols detected`);
  console.log('');
}

function printBotAccess(protocols) {
  const rt = protocols?.robotsTxt;
  if (!rt) return;
  console.log('  AI Bot Access (robots.txt)');
  if (!rt.found) {
    console.log('    No robots.txt found — all bots allowed');
  } else {
    const bots = [
      { agent: 'GPTBot', owner: 'OpenAI' },
      { agent: 'ChatGPT-User', owner: 'OpenAI' },
      { agent: 'ClaudeBot', owner: 'Anthropic' },
      { agent: 'Claude-Web', owner: 'Anthropic' },
      { agent: 'Bytespider', owner: 'ByteDance' },
      { agent: 'CCBot', owner: 'Common Crawl' },
      { agent: 'Google-Extended', owner: 'Google AI' },
      { agent: 'Bingbot', owner: 'Microsoft' },
      { agent: 'PerplexityBot', owner: 'Perplexity' },
      { agent: 'Applebot-Extended', owner: 'Apple' },
      { agent: 'FacebookBot', owner: 'Meta' },
      { agent: 'cohere-ai', owner: 'Cohere' },
      { agent: 'Amazonbot', owner: 'Amazon' },
    ];
    bots.forEach(b => {
      const isBlocked = rt.blockedBots.includes(b.agent);
      const icon = isBlocked ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
      const status = isBlocked ? 'blocked' : 'allowed';
      console.log(`    ${icon} ${b.agent} — ${status}`);
    });
    const allowed = rt.totalBots - rt.blockedCount;
    console.log(`\n    ${allowed}/${rt.totalBots} bots allowed`);
  }
  console.log('');
}

function printSummary(result) {
  let verdict;
  if (result.score >= 80) verdict = 'Agent-Ready';
  else if (result.score >= 50) verdict = 'Partially Ready';
  else if (result.forms.total > 0) verdict = 'Not Agent-Ready';
  else verdict = 'Invisible to AI Agents';

  console.log(`  Verdict: ${verdict}`);
  console.log(`  Full report: https://erold90.github.io/AgentReady`);
  console.log('');
}

function scoreBar(score) {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  const c = score >= 80 ? '\x1b[32m' : score >= 50 ? '\x1b[33m' : '\x1b[31m';
  return `${c}${'█'.repeat(filled)}${'░'.repeat(empty)}\x1b[0m`;
}

function openReport(result, isCrawlResult, isPro) {
  const html = reportHtml.generate(result, isCrawlResult, isPro, FREE_CODE_LIMIT);
  let domain = '';
  try { domain = new URL(result.url || result.pages?.[0]?.url).hostname; } catch {}
  const filename = `agentready-report-${domain || 'scan'}.html`;
  const filepath = join(process.cwd(), filename);
  writeFileSync(filepath, html, 'utf-8');
  console.log(`  Report saved: ${filename}`);

  // Open in default browser
  const platform = process.platform;
  try {
    if (platform === 'darwin') execSync(`open "${filepath}"`);
    else if (platform === 'win32') execSync(`start "" "${filepath}"`);
    else execSync(`xdg-open "${filepath}"`);
    console.log('  Opened in browser.\n');
  } catch {
    console.log(`  Open manually: file://${filepath}\n`);
  }
}

main();
