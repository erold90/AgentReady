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
    agentready --help             Show this help

  Examples:
    agentready https://example.com
    agentready https://villamareblu.it --crawl --report
    agentready https://stripe.com --json
    agentready https://api.openai.com --protocols
  `);
  process.exit(0);
}

const isJson = flags.has('--json');
const isCrawl = flags.has('--crawl');
const isReport = flags.has('--report');
const protocolsOnly = flags.has('--protocols') || flags.has('--protocols-only');

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

  if (!isJson) {
    console.log(`\n  ⚡ AgentReady Scanner v1.0.0`);
    console.log(`  ${isCrawl ? 'Crawling' : 'Scanning'} ${finalUrl}...\n`);
  }

  try {
    if (isCrawl) {
      const result = await crawl(finalUrl, {
        maxPages: 20,
        onProgress: (current, total, pageUrl) => {
          if (!isJson) {
            const path = new URL(pageUrl).pathname;
            process.stdout.write(`\r  Scanning page ${current}/${total}: ${path}${''.padEnd(40)}`);
          }
        }
      });

      if (!isJson) process.stdout.write('\r' + ' '.repeat(80) + '\r');

      if (isJson) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      printCrawlResult(result);

      if (isReport) openReport(result, true);
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
      printWebMCP(result);
      printProtocols(result.protocols);
      printSummary(result);

      if (isReport) openReport(result, false);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    process.exit(1);
  }
}

function printCrawlResult(result) {
  const bar = scoreBar(result.score);
  console.log(`  Full Site Scan Results`);
  console.log(`  ─────────────────────`);
  console.log(`  Score: ${result.score}/100 ${bar}`);
  console.log(`  Pages: ${result.pageCount}  |  Forms: ${result.totalForms}  |  Issues: ${result.totalIssues}`);
  console.log('');

  // Per-page scores
  console.log('  Pages');
  result.pages.forEach(p => {
    const path = new URL(p.url).pathname || '/';
    const icon = p.score >= 80 ? '✓' : p.score >= 50 ? '~' : '✗';
    const color = p.score >= 80 ? '\x1b[32m' : p.score >= 50 ? '\x1b[33m' : '\x1b[31m';
    console.log(`    ${color}${icon}\x1b[0m ${String(p.score).padStart(3)} ${path}  (${p.forms.total} forms, ${p.issues.length} issues)`);
  });
  console.log('');

  // Protocols
  printProtocols(result.protocols);

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

function openReport(result, isCrawlResult) {
  const html = reportHtml.generate(result, isCrawlResult);
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
