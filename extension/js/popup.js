/**
 * popup.js — Extension popup UI controller
 */
(function() {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  let currentScan = null;
  let currentAnalysis = null;

  let fullSiteRunning = false;

  // === Init ===
  document.addEventListener('DOMContentLoaded', () => {
    $('#scan-btn').addEventListener('click', runScan);

    // Tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
        $$('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === 'tab-' + tab.dataset.tab));
      });
    });

    // Full report link
    $('#btn-full-report').addEventListener('click', () => {
      if (currentScan) {
        const encoded = encodeURIComponent(JSON.stringify(currentScan));
        if (encoded.length < 50000) {
          chrome.tabs.create({ url: 'https://erold90.github.io/AgentReady/?scan=' + encoded });
        } else {
          chrome.tabs.create({ url: 'https://erold90.github.io/AgentReady/' });
        }
      }
    });

    // Full site scan
    $('#btn-full-site').addEventListener('click', runFullSiteScan);

    // Auto-scan on popup open
    runScan();
  });

  // === Scan ===
  async function runScan() {
    $('#scan-btn').disabled = true;
    $('#scan-btn').textContent = 'Scanning';
    $('#results').hidden = true;
    $('#error').hidden = true;
    $('#loading').hidden = false;
    currentScan = null;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('about:') || tab.url?.startsWith('chrome-extension://')) {
        showError('Cannot scan browser internal pages. Navigate to a website first.');
        return;
      }

      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/content.js']
      });

      // Retrieve stored data
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const raw = document.documentElement.dataset.agentready;
          delete document.documentElement.dataset.agentready;
          return raw;
        }
      });

      const raw = results?.[0]?.result;
      if (raw) {
        currentScan = JSON.parse(raw);
        currentAnalysis = Analyzer.analyze(currentScan);
        hideLoading();
        renderResults();
      } else {
        showError('Could not extract page data. Try refreshing the page.');
      }

    } catch (err) {
      showError('Failed to scan: ' + (err.message || 'Unknown error'));
    }
  }

  function showError(msg) {
    $('#loading').hidden = true;
    $('#scan-btn').disabled = false;
    $('#scan-btn').textContent = 'Rescan';
    $('#error').textContent = msg;
    $('#error').hidden = false;
  }

  function hideLoading() {
    $('#loading').hidden = true;
    $('#scan-btn').disabled = false;
    $('#scan-btn').textContent = 'Rescan';
  }

  // === Render ===
  function renderResults() {
    $('#results').hidden = false;

    const score = currentAnalysis.score;
    const color = Analyzer.getScoreColor(score);
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / 100) * circumference;

    const ring = $('#score-ring-fill');
    ring.style.stroke = color;
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 50);

    const scoreVal = $('#score-value');
    scoreVal.style.color = color;
    animateNumber(scoreVal, score);

    // Info
    $('#score-url').textContent = currentScan.url;
    $('#score-summary').textContent = currentAnalysis.summary;

    // Stats
    const issueCount = currentAnalysis.issues.filter(i => i.type === 'warning' || i.type === 'error').length;
    $('#s-forms').textContent = currentScan.forms.length;
    $('#s-webmcp').textContent = currentScan.forms.filter(f => f.hasWebMCP).length + currentScan.scriptRegistrations.length;
    $('#s-issues').textContent = issueCount;
    $('#s-issues').style.color = issueCount > 0 ? '#ef4444' : '#10b981';
    $('#s-https').textContent = currentScan.security.isHTTPS ? 'Yes' : 'No';
    $('#s-https').style.color = currentScan.security.isHTTPS ? '#10b981' : '#ef4444';

    renderCategories();
    renderIssues();
    renderForms();
    renderTools();
  }

  function renderCategories() {
    const container = $('#categories-list');
    container.innerHTML = '';
    for (const [key, cat] of Object.entries(currentAnalysis.categories)) {
      const color = Analyzer.getScoreColor(cat.score);
      const div = document.createElement('div');
      div.className = 'cat-card';
      div.innerHTML = `
        <div class="cat-bar-wrap">
          <div class="cat-name">${esc(cat.label)}</div>
          <div class="cat-bar"><div class="cat-bar-fill" style="background:${color};"></div></div>
          <div class="cat-detail">${esc(cat.detail)}</div>
        </div>
        <div class="cat-score" style="color:${color};">${cat.score}</div>
      `;
      container.appendChild(div);
      setTimeout(() => { div.querySelector('.cat-bar-fill').style.width = cat.score + '%'; }, 50);
    }
  }

  function renderIssues() {
    const container = $('#issues-list');
    container.innerHTML = '';
    const icons = { error: '!', warning: '!', success: '\u2713', info: 'i' };
    currentAnalysis.issues.forEach(issue => {
      const div = document.createElement('div');
      div.className = 'issue';
      div.innerHTML = `
        <div class="issue-badge ${issue.type}">${icons[issue.type]}</div>
        <div class="issue-body">
          <div class="issue-title">${esc(issue.title)}</div>
          <div class="issue-text">${esc(issue.text)}</div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  function renderForms() {
    const container = $('#forms-list');
    container.innerHTML = '';
    if (currentScan.forms.length === 0) {
      container.innerHTML = '<div class="empty-state">No HTML forms detected on this page.</div>';
      return;
    }
    currentScan.forms.forEach(form => {
      const name = form.toolname || form.name || form.id || 'Form #' + form.index;
      const div = document.createElement('div');
      div.className = 'form-card';
      div.innerHTML = `
        <div class="form-header">
          <span class="form-name">${esc(name)}</span>
          <span class="form-badge ${form.hasWebMCP ? 'ready' : 'not-ready'}">${form.hasWebMCP ? 'WebMCP' : 'No WebMCP'}</span>
        </div>
        <div class="form-fields">
          ${form.fields.map(f => `
            <div class="form-field">
              <span class="ff-name">${esc(f.name || f.id || '(no name)')}</span>
              <span class="ff-type">${f.type}${f.required ? ' *' : ''}</span>
              <span class="ff-label">${esc(f.label || f.placeholder || '')}</span>
            </div>
          `).join('')}
        </div>
      `;
      container.appendChild(div);
    });
  }

  function renderTools() {
    const container = $('#tools-list');
    container.innerHTML = '';

    // Script registrations
    const regs = currentScan.scriptRegistrations.filter(r => r.name !== '_provideContext');
    if (regs.length > 0) {
      regs.forEach(reg => {
        const div = document.createElement('div');
        div.className = 'tool-card';
        div.innerHTML = `
          <div class="tool-name">${esc(reg.name)}</div>
          <div class="tool-desc">${esc(reg.description)}</div>
          <div class="tool-conf">Registered via navigator.modelContext</div>
        `;
        container.appendChild(div);
      });
    }

    // Suggested tools
    if (currentScan.suggestedTools && currentScan.suggestedTools.length > 0) {
      if (regs.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = 'padding:8px 0;font-size:11px;color:#94a3b8;font-weight:600;text-transform:uppercase;';
        sep.textContent = 'Suggested Tools';
        container.appendChild(sep);
      }

      currentScan.suggestedTools.forEach(tool => {
        const conf = Math.round((tool.confidence || 0) * 100);
        const div = document.createElement('div');
        div.className = 'tool-card';
        div.innerHTML = `
          <div class="tool-name">${esc(tool.name)}</div>
          <div class="tool-desc">${esc(tool.description)}</div>
          <div class="tool-conf">Confidence: ${conf}% &middot; Based on page content analysis</div>
        `;
        container.appendChild(div);
      });
    }

    if (regs.length === 0 && (!currentScan.suggestedTools || currentScan.suggestedTools.length === 0)) {
      container.innerHTML = '<div class="empty-state">No WebMCP tools or suggestions detected.</div>';
    }
  }

  // === Full Site Scan ===
  async function runFullSiteScan() {
    if (fullSiteRunning) return;
    fullSiteRunning = true;

    const btn = $('#btn-full-site');
    btn.disabled = true;
    btn.textContent = 'Scanning Site...';

    const section = $('#fullsite-section');
    section.hidden = false;

    const progress = $('#fs-progress');
    const progressText = $('#fs-progress-text');
    const progressFill = $('#fs-progress-fill');
    const summary = $('#fs-summary');
    const pagesContainer = $('#fs-pages');
    const proOverlay = $('#fs-pro-overlay');
    const fsError = $('#fs-error');

    // Reset
    progress.hidden = false;
    summary.hidden = true;
    pagesContainer.innerHTML = '';
    proOverlay.hidden = true;
    fsError.hidden = true;
    progressFill.style.width = '0%';
    progressText.textContent = 'Discovering sitemap...';

    try {
      // Get current tab URL for origin
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        showFullSiteError('Cannot determine current page URL.');
        return;
      }

      const origin = new URL(tab.url).origin;

      // Discover sitemap URLs
      progressText.textContent = 'Discovering sitemap...';
      progressFill.style.width = '5%';

      let urls = [];
      try {
        urls = await SitemapDiscovery.discover(origin);
      } catch (e) {
        // Sitemap discovery failed silently
      }

      if (urls.length === 0) {
        // Fallback: just scan the current page URL
        urls = [tab.url];
        progressText.textContent = 'No sitemap found. Scanning current page...';
      } else {
        progressText.textContent = `Found ${urls.length} pages in sitemap. Starting scan...`;
      }

      progressFill.style.width = '10%';

      // Crawl pages
      const results = await SiteCrawler.crawl(urls, (current, total, url) => {
        const pct = 10 + Math.round((current / total) * 85);
        progressFill.style.width = pct + '%';
        const shortUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        progressText.textContent = `Scanning page ${current}/${total}: ${shortUrl}`;
      });

      progressFill.style.width = '100%';
      progressText.textContent = 'Scan complete!';

      // Short delay then show results
      await new Promise(r => setTimeout(r, 500));
      progress.hidden = true;

      // Render summary
      renderFullSiteSummary(results);
      renderFullSitePages(results);

    } catch (err) {
      showFullSiteError('Full site scan failed: ' + (err.message || 'Unknown error'));
    } finally {
      fullSiteRunning = false;
      btn.disabled = false;
      btn.textContent = 'Full Site Scan';
    }
  }

  function renderFullSiteSummary(results) {
    const summary = $('#fs-summary');
    summary.hidden = false;

    const avgScoreEl = $('#fs-avg-score');
    avgScoreEl.textContent = results.avgScore;
    avgScoreEl.style.color = Analyzer.getScoreColor(results.avgScore);

    $('#fs-total-pages').textContent = results.scannedPages;
    $('#fs-total-forms').textContent = results.totalForms;

    const issuesEl = $('#fs-total-issues');
    issuesEl.textContent = results.totalIssues;
    issuesEl.style.color = results.totalIssues > 0 ? '#ef4444' : '#10b981';
  }

  function renderFullSitePages(results) {
    const container = $('#fs-pages');
    const proOverlay = $('#fs-pro-overlay');
    container.innerHTML = '';

    const FREE_LIMIT = 3;
    const pages = results.pages; // sorted worst-first

    pages.forEach((page, i) => {
      const row = document.createElement('div');
      row.className = 'fs-page-row';
      if (i >= FREE_LIMIT) row.classList.add('blurred');

      const color = Analyzer.getScoreColor(page.score);
      const shortUrl = (() => {
        try {
          const u = new URL(page.url);
          return u.pathname + u.search;
        } catch { return page.url; }
      })();

      row.innerHTML = `
        <div class="fs-page-score" style="background:${color}">${page.score}</div>
        <div class="fs-page-info">
          <div class="fs-page-url" title="${esc(page.url)}">${esc(shortUrl || '/')}</div>
          <div class="fs-page-meta">
            <span>${page.formCount} form${page.formCount !== 1 ? 's' : ''}</span>
            <span>${page.webmcpCount} WebMCP</span>
            <span>${page.issueCount} issue${page.issueCount !== 1 ? 's' : ''}</span>
            ${page.error ? '<span style="color:#ef4444">Error</span>' : ''}
          </div>
        </div>
      `;
      container.appendChild(row);
    });

    // Show pro overlay if there are more than FREE_LIMIT pages
    if (pages.length > FREE_LIMIT) {
      proOverlay.hidden = false;
    }
  }

  function showFullSiteError(msg) {
    const fsError = $('#fs-error');
    fsError.textContent = msg;
    fsError.hidden = false;
    $('#fs-progress').hidden = true;
    fullSiteRunning = false;
    $('#btn-full-site').disabled = false;
    $('#btn-full-site').textContent = 'Full Site Scan';
  }

  // === Helpers ===
  function animateNumber(el, target) {
    let current = 0;
    const step = Math.max(1, Math.floor(target / 25));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(interval); }
      el.textContent = current;
    }, 30);
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();
