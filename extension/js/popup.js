/**
 * popup.js — Extension popup UI controller
 */
(function() {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  let currentScan = null;
  let currentAnalysis = null;
  let currentProtocols = null;

  let fullSiteRunning = false;
  let fullSiteResults = null;
  let crawlStartTime = null;

  // === Plan System ===
  const PLANS = {
    free:  { label: 'Free',  pages: 3,    actions: 2,    color: '#94a3b8' },
    pro:   { label: 'Pro',   pages: 500,  actions: 9999, color: '#2563eb' },
    team:  { label: 'Team',  pages: 2000, actions: 9999, color: '#7c3aed' }
  };
  let currentPlan = 'free';

  // === Init ===
  document.addEventListener('DOMContentLoaded', async () => {
    // Load license → set plan
    try {
      const license = await License.load();
      if (license && license.valid && PLANS[license.plan]) {
        currentPlan = license.plan;
      }
      // Also check legacy plan storage (for testing)
      if (currentPlan === 'free') {
        const stored = await chrome.storage.local.get('agentready_plan');
        if (stored.agentready_plan && PLANS[stored.agentready_plan]) {
          currentPlan = stored.agentready_plan;
        }
      }
    } catch {}
    updatePlanBadge();

    $('#scan-btn').addEventListener('click', runScan);

    // Tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
        $$('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === 'tab-' + tab.dataset.tab));
      });
    });

    // Full report link — adapts based on context
    $('#btn-full-report').addEventListener('click', openFullReport);

    // Full site scan
    $('#btn-full-site').addEventListener('click', runFullSiteScan);

    // Page detail back button
    $('#pd-back').addEventListener('click', hidePageDetail);

    // License panel — click logo/badge to open
    $('.logo').addEventListener('click', showLicensePanel);

    // License panel buttons
    $('#license-back').addEventListener('click', hideLicensePanel);
    $('#license-activate').addEventListener('click', activateLicense);
    $('#license-deactivate').addEventListener('click', deactivateLicense);

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

        // Protocol scan in background (non-blocking)
        try {
          const origin = new URL(tab.url).origin;
          ProtocolScanner.scan(origin).then(protocols => {
            currentProtocols = protocols;
            // Re-analyze with protocols for botAccess category
            currentAnalysis = Analyzer.analyze(currentScan, protocols);
            renderResults();
            renderProtocolStats(protocols);
          }).catch(() => {});
        } catch {}
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
    // Protocols stat updated asynchronously via renderProtocolStats()

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

  // === Plan Switching ===
  async function showLicensePanel() {
    const panel = $('#license-panel');
    const license = await License.load();

    if (license && license.valid) {
      $('#license-status').className = 'license-status active';
      $('#license-status').innerHTML = `<strong>${PLANS[license.plan]?.label || 'Pro'} Plan</strong> — Active<br><span style="font-size:11px;color:#065f46">${license.meta?.customerEmail || ''}</span>`;
      $('#license-key').value = license.key;
      $('#license-key').disabled = true;
      $('#license-activate').hidden = true;
      $('#license-deactivate').hidden = false;
    } else {
      $('#license-status').className = 'license-status free';
      $('#license-status').innerHTML = '<strong>Free Plan</strong> — 3 pages, 2 code snippets';
      $('#license-key').value = '';
      $('#license-key').disabled = false;
      $('#license-activate').hidden = false;
      $('#license-deactivate').hidden = true;
    }
    $('#license-error').hidden = true;
    panel.hidden = false;
  }

  function hideLicensePanel() {
    $('#license-panel').hidden = true;
  }

  async function activateLicense() {
    const key = $('#license-key').value.trim();
    if (!key) return;

    const btn = $('#license-activate');
    btn.textContent = 'Validating...';
    btn.disabled = true;
    $('#license-error').hidden = true;

    const result = await License.validate(key);

    if (result.valid) {
      await License.save(key, result);
      currentPlan = result.plan;
      updatePlanBadge();
      btn.textContent = 'Activate License';
      btn.disabled = false;
      showLicensePanel(); // Refresh panel to show active state
      if (fullSiteResults) renderFullSitePages(fullSiteResults);
    } else {
      $('#license-error').textContent = result.error || 'Invalid license key';
      $('#license-error').hidden = false;
      btn.textContent = 'Activate License';
      btn.disabled = false;
    }
  }

  async function deactivateLicense() {
    await License.remove();
    currentPlan = 'free';
    // Also clear legacy plan storage
    chrome.storage.local.remove('agentready_plan');
    updatePlanBadge();
    showLicensePanel(); // Refresh panel
    if (fullSiteResults) renderFullSitePages(fullSiteResults);
  }

  function updatePlanBadge() {
    const plan = PLANS[currentPlan];
    let badge = $('#plan-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'plan-badge';
      badge.style.cssText = 'font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;cursor:pointer;text-transform:uppercase;';
      $('.logo').appendChild(badge);
    }
    badge.textContent = plan.label;
    badge.style.background = plan.color;
    badge.style.color = '#fff';
  }

  // === Protocol Stats ===
  function renderProtocolStats(protocols) {
    const el = $('#s-protocols');
    if (!protocols || !protocols.summary) return;
    el.textContent = protocols.summary.found + '/' + protocols.summary.total;
    el.style.color = protocols.summary.found > 0 ? '#10b981' : '#94a3b8';

    // Bot access stats
    const botEl = $('#s-bots');
    if (botEl && protocols.robotsTxt) {
      const rt = protocols.robotsTxt;
      if (rt.found) {
        const allowed = rt.totalBots - rt.blockedCount;
        botEl.textContent = allowed + '/' + rt.totalBots;
        botEl.style.color = rt.blockedCount === 0 ? '#10b981' : (rt.blockedCount > rt.totalBots / 2 ? '#ef4444' : '#f59e0b');
      } else {
        botEl.textContent = 'All';
        botEl.style.color = '#10b981';
      }
    }
  }

  // === Full Site Scan ===
  async function runFullSiteScan() {
    if (fullSiteRunning) return;
    fullSiteRunning = true;

    const btn = $('#btn-full-site');
    btn.disabled = true;
    btn.textContent = 'Scanning...';

    // Show overlay
    const overlay = $('#fs-overlay');
    const circleFill = $('#fs-circle-fill');
    const circlePct = $('#fs-circle-pct');
    const overlayStatus = $('#fs-overlay-status');
    const overlayUrl = $('#fs-overlay-url');
    const overlayEta = $('#fs-overlay-eta');
    const overlayCounter = $('#fs-overlay-counter');
    const circumference = 2 * Math.PI * 54;

    overlay.hidden = false;
    circleFill.style.strokeDashoffset = circumference;
    circlePct.textContent = '0%';
    overlayStatus.textContent = 'Discovering sitemap...';
    overlayUrl.textContent = '';
    overlayEta.textContent = '';
    overlayCounter.textContent = '';

    // Reset results section
    const section = $('#fullsite-section');
    const summary = $('#fs-summary');
    const pagesContainer = $('#fs-pages');
    const proOverlay = $('#fs-pro-overlay');
    const fsError = $('#fs-error');
    summary.hidden = true;
    pagesContainer.innerHTML = '';
    proOverlay.hidden = true;
    fsError.hidden = true;

    const setProgress = (pct) => {
      const offset = circumference - (pct / 100) * circumference;
      circleFill.style.strokeDashoffset = offset;
      circlePct.textContent = pct + '%';
    };

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        overlay.hidden = true;
        showFullSiteError('Cannot determine current page URL.');
        return;
      }

      const origin = new URL(tab.url).origin;

      setProgress(5);

      let urls = [];
      try {
        urls = await SitemapDiscovery.discover(origin);
      } catch (e) {}

      if (urls.length === 0) {
        urls = [tab.url];
        overlayStatus.textContent = 'No sitemap found. Scanning current page...';
      } else {
        overlayStatus.textContent = `Found ${urls.length} pages`;
        overlayCounter.textContent = 'Starting scan...';
      }

      setProgress(10);

      // Protocol scan in parallel with crawl
      let protocolResults = null;
      ProtocolScanner.scan(origin).then(p => { protocolResults = p; }).catch(() => {});

      crawlStartTime = Date.now();
      const results = await SiteCrawler.crawl(urls, (current, total, url) => {
        const pct = 10 + Math.round((current / total) * 85);
        setProgress(pct);

        overlayStatus.textContent = `Scanning page ${current} of ${total}`;
        const shortUrl = url.length > 60 ? url.substring(0, 57) + '...' : url;
        overlayUrl.textContent = shortUrl;
        overlayCounter.textContent = `${current}/${total} pages`;

        const eta = getETA(current, total);
        overlayEta.textContent = eta || '';
      });

      setProgress(100);
      overlayStatus.textContent = 'Scan complete!';
      overlayUrl.textContent = '';
      overlayEta.textContent = '';
      overlayCounter.textContent = `${results.scannedPages} pages scanned`;

      await new Promise(r => setTimeout(r, 800));
      overlay.hidden = true;

      // Store results and show section
      results.protocols = protocolResults;
      fullSiteResults = results;
      section.hidden = false;

      // Render summary
      renderFullSiteSummary(results);
      renderFullSitePages(results);

      // Update report button to reflect full site context
      $('#btn-full-report').textContent = 'Full Site Report on AgentReady.dev';

    } catch (err) {
      overlay.hidden = true;
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

    const pageLimit = PLANS[currentPlan].pages;
    const pages = results.pages; // sorted worst-first

    pages.forEach((page, i) => {
      const row = document.createElement('div');
      row.className = 'fs-page-row';
      if (i >= pageLimit) row.classList.add('blurred');

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
        <div class="fs-page-arrow">&#8250;</div>
      `;
      if (i < pageLimit && !page.error) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => showPageDetail(page));
      }
      container.appendChild(row);
    });

    // Show pro overlay if there are more pages than plan allows
    if (pages.length > pageLimit) {
      proOverlay.hidden = false;
    }
  }

  function showFullSiteError(msg) {
    $('#fs-overlay').hidden = true;
    $('#fullsite-section').hidden = false;
    const fsError = $('#fs-error');
    fsError.textContent = msg;
    fsError.hidden = false;
    fullSiteRunning = false;
    $('#btn-full-site').disabled = false;
    $('#btn-full-site').textContent = 'Full Site Scan';
  }

  // === Page Detail View ===
  function showPageDetail(page) {
    const panel = $('#page-detail');
    panel.hidden = false;

    const analysis = page.analysis;
    const color = Analyzer.getScoreColor(page.score);

    let shortUrl;
    try { const u = new URL(page.url); shortUrl = u.pathname + u.search; } catch { shortUrl = page.url; }

    $('#pd-score').textContent = page.score;
    $('#pd-score').style.color = color;
    $('#pd-url').textContent = shortUrl || '/';
    $('#pd-url').title = page.url;

    // Categories
    const catContainer = $('#pd-categories');
    catContainer.innerHTML = '';
    if (analysis && analysis.categories) {
      for (const [key, cat] of Object.entries(analysis.categories)) {
        const cc = Analyzer.getScoreColor(cat.score);
        const div = document.createElement('div');
        div.className = 'cat-card';
        div.innerHTML = `
          <div class="cat-bar-wrap">
            <div class="cat-name">${esc(cat.label)}</div>
            <div class="cat-bar"><div class="cat-bar-fill" style="background:${cc};width:${cat.score}%"></div></div>
            <div class="cat-detail">${esc(cat.detail)}</div>
          </div>
          <div class="cat-score" style="color:${cc};">${cat.score}</div>
        `;
        catContainer.appendChild(div);
      }
    }

    // Issues
    const issContainer = $('#pd-issues');
    issContainer.innerHTML = '';
    const icons = { error: '!', warning: '!', success: '\u2713', info: 'i' };
    if (analysis && analysis.issues) {
      analysis.issues.forEach(issue => {
        const div = document.createElement('div');
        div.className = 'issue';
        div.innerHTML = `
          <div class="issue-badge ${issue.type}">${icons[issue.type]}</div>
          <div class="issue-body">
            <div class="issue-title">${esc(issue.title)}</div>
            <div class="issue-text">${esc(issue.text)}</div>
          </div>
        `;
        issContainer.appendChild(div);
      });
    }

    // Forms
    const formsContainer = $('#pd-forms');
    formsContainer.innerHTML = '';
    if (page.forms && page.forms.length > 0) {
      page.forms.forEach(form => {
        const name = form.toolname || form.name || form.id || 'Form';
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
              </div>
            `).join('')}
          </div>
        `;
        formsContainer.appendChild(div);
      });
    } else {
      formsContainer.innerHTML = '<div class="empty-state">No forms on this page.</div>';
    }

    // Scroll to top
    panel.scrollTop = 0;
  }

  function hidePageDetail() {
    $('#page-detail').hidden = true;
  }

  // === Full Report ===
  async function openFullReport() {
    try {
      const pageLimit = PLANS[currentPlan].pages;
      const actionLimit = PLANS[currentPlan].actions;

      if (fullSiteResults && fullSiteResults.pages.length > 0) {
        // Full site report
        const payload = {
          type: 'sitescan',
          plan: currentPlan,
          avgScore: fullSiteResults.avgScore,
          totalPages: fullSiteResults.scannedPages,
          totalForms: fullSiteResults.totalForms,
          totalIssues: fullSiteResults.totalIssues,
          failedPages: fullSiteResults.failedPages,
          protocols: fullSiteResults.protocols || null,
          timestamp: new Date().toISOString(),
          pages: fullSiteResults.pages.map((p, i) => {
            if (i < pageLimit) {
              return {
                url: p.url, score: p.score, formCount: p.formCount,
                webmcpCount: p.webmcpCount, issueCount: p.issueCount,
                error: p.error || null,
                analysis: p.analysis,
                forms: p.forms,
                scanData: p.scanData
              };
            }
            return {
              url: p.url, score: p.score, formCount: p.formCount,
              webmcpCount: p.webmcpCount, issueCount: p.issueCount,
              error: p.error || null,
              locked: true
            };
          })
        };

        await chrome.storage.local.set({ agentready_report: payload });
        chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });

      } else if (currentScan && currentAnalysis) {
        // Single page report — also use storage + report.html
        const payload = {
          type: 'singlescan',
          plan: currentPlan,
          avgScore: currentAnalysis.score,
          totalPages: 1,
          totalForms: currentScan.forms.length,
          totalIssues: currentAnalysis.issues.filter(i => i.type === 'warning' || i.type === 'error').length,
          failedPages: 0,
          protocols: currentProtocols || null,
          timestamp: new Date().toISOString(),
          pages: [{
            url: currentScan.url,
            score: currentAnalysis.score,
            formCount: currentScan.forms.length,
            webmcpCount: currentScan.forms.filter(f => f.hasWebMCP).length + currentScan.scriptRegistrations.length,
            issueCount: currentAnalysis.issues.filter(i => i.type === 'warning' || i.type === 'error').length,
            error: null,
            analysis: currentAnalysis,
            forms: currentScan.forms,
            scanData: currentScan
          }]
        };

        await chrome.storage.local.set({ agentready_report: payload });
        chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
      }
    } catch (err) {
      console.error('openFullReport error:', err);
    }
  }

  // === ETA ===
  function getETA(current, total) {
    if (current < 2 || !crawlStartTime) return '';
    const elapsed = Date.now() - crawlStartTime;
    const perPage = elapsed / current;
    const remaining = Math.round((total - current) * perPage / 1000);
    if (remaining < 5) return '< 5s left';
    if (remaining < 60) return `~${remaining}s left`;
    const min = Math.floor(remaining / 60);
    const sec = remaining % 60;
    return `~${min}m ${sec}s left`;
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
