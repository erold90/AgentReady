/**
 * app.js — Main application logic for AgentReady
 */

(function() {
  'use strict';

  // === State ===
  let currentScan = null;
  let currentAnalysis = null;

  // === DOM Elements ===
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const urlInput = $('#url-input');
  const scanBtn = $('#scan-btn');
  const scanError = $('#scan-error');
  const resultsSection = $('#results');
  const themeToggle = $('#theme-toggle');

  // === Init ===
  function init() {
    // Theme
    const savedTheme = localStorage.getItem('agentready-theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Event listeners
    scanBtn.addEventListener('click', handleScan);
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleScan(); });
    themeToggle.addEventListener('click', toggleTheme);
    $('#rescan-btn')?.addEventListener('click', handleScan);
    $('#download-report').addEventListener('click', downloadReport);
    $('#copy-report-link').addEventListener('click', copyReportLink);

    // Compare
    const compareBtn = $('#compare-btn');
    if (compareBtn) {
      compareBtn.addEventListener('click', handleCompare);
    }

    // Agent Simulator
    const simBtn = $('#sim-btn');
    if (simBtn) {
      simBtn.addEventListener('click', runSimulation);
    }

    // Tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Agent view toggle
    $$('.agent-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => switchAgentView(btn.dataset.view));
    });

    // Example URLs
    $$('.example-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        urlInput.value = btn.dataset.url;
        handleScan();
      });
    });

    // Scroll reveal animations (IntersectionObserver)
    initScrollReveal();

    // Hero terminal typing animation
    initTerminalAnimation();

    // Handle bookmarklet data via URL param
    const params = new URLSearchParams(window.location.search);
    const scanParam = params.get('scan');
    if (scanParam) {
      try {
        const scanData = JSON.parse(decodeURIComponent(scanParam));
        handleBookmarkletData(scanData);
        // Clean URL
        history.replaceState(null, '', window.location.pathname);
      } catch(e) {
        console.error('Failed to parse bookmarklet data:', e);
      }
    }

    // Handle bookmarklet data via postMessage (for large payloads)
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'agentready-scan') {
        handleBookmarkletData(event.data.data);
      }
      if (event.data && event.data.type === 'agentready-sitescan') {
        handleSiteScanData(event.data.data);
      }
    });

    // Handle mode param — data arrives via postMessage
    const modeParam = params.get('mode');
    if (modeParam === 'sitescan' || modeParam === 'scan') {
      // Show a loading indicator while waiting for data
      showToast('Receiving scan data...');
      history.replaceState(null, '', window.location.pathname);
    }

    // URL from query param
    const urlParam = params.get('url');
    if (urlParam && !scanParam) {
      urlInput.value = urlParam;
      handleScan();
    }

    // Load history
    loadHistory();
  }

  // === Bookmarklet Handler ===
  function handleBookmarkletData(scanData) {
    currentScan = scanData;
    currentAnalysis = Analyzer.analyze(currentScan);
    urlInput.value = currentScan.url;
    renderResults();
    saveToHistory(currentScan.url, currentAnalysis.score);
    showToast('Live DOM analysis complete!');
  }

  // === Full Site Scan Handler ===
  function handleSiteScanData(data) {
    renderSiteScanResults(data);
    showToast('Full site scan report loaded!');
  }

  function renderSiteScanResults(data) {
    const section = $('#sitescan-results');
    section.hidden = false;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Hide single-page results if visible
    resultsSection.hidden = true;

    // Summary
    const avgColor = Analyzer.getScoreColor(data.avgScore);
    $('#ss-avg-score').textContent = data.avgScore;
    $('#ss-avg-score').style.color = avgColor;
    $('#ss-total-pages').textContent = data.totalPages;
    $('#ss-total-forms').textContent = data.totalForms;
    const issuesEl = $('#ss-total-issues');
    issuesEl.textContent = data.totalIssues;
    issuesEl.style.color = data.totalIssues > 0 ? 'var(--red)' : 'var(--green)';

    // Subtitle — try to extract domain from first page
    let domain = '';
    if (data.pages && data.pages.length > 0) {
      try { domain = new URL(data.pages[0].url).hostname; } catch {}
    }
    $('#sitescan-subtitle').textContent = domain
      ? `${data.totalPages} pages scanned on ${domain}`
      : `${data.totalPages} pages scanned`;

    // Page list
    const container = $('#ss-pages');
    container.innerHTML = '';
    const FREE_LIMIT = 3;

    data.pages.forEach((page, i) => {
      const color = Analyzer.getScoreColor(page.score);
      const isLocked = page.locked || i >= FREE_LIMIT;

      let shortUrl = page.url;
      try { const u = new URL(page.url); shortUrl = u.pathname + u.search || '/'; } catch {}

      const row = createElement('div', 'ss-page-row' + (isLocked ? ' ss-locked' : ''), `
        <div class="ss-page-score" style="background:${color}">${page.score}</div>
        <div class="ss-page-info">
          <div class="ss-page-url" title="${escapeHTML(page.url)}">${escapeHTML(shortUrl)}</div>
          <div class="ss-page-meta">
            <span>${page.formCount} form${page.formCount !== 1 ? 's' : ''}</span>
            <span>${page.webmcpCount} WebMCP</span>
            <span>${page.issueCount} issue${page.issueCount !== 1 ? 's' : ''}</span>
            ${page.error ? '<span style="color:var(--red)">Error</span>' : ''}
          </div>
        </div>
        ${isLocked
          ? '<div class="ss-page-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
          : '<div class="ss-page-arrow">&#8250;</div>'
        }
      `);

      if (!isLocked && !page.error && page.analysis) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => renderSiteScanPageDetail(page));
      }

      container.appendChild(row);
    });

    // Pro overlay
    const proOverlay = $('#ss-pro-overlay');
    if (data.pages.length > FREE_LIMIT) {
      proOverlay.hidden = false;
    } else {
      proOverlay.hidden = true;
    }
  }

  function renderSiteScanPageDetail(page) {
    const detail = $('#ss-page-detail');
    detail.hidden = false;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const analysis = page.analysis;
    const color = Analyzer.getScoreColor(page.score);

    let shortUrl = page.url;
    try { const u = new URL(page.url); shortUrl = u.pathname + u.search || '/'; } catch {}

    let html = '';
    html += `<div class="ss-detail-header">`;
    html += `  <button class="ss-detail-back" onclick="document.getElementById('ss-page-detail').hidden=true">&larr; Back to pages</button>`;
    html += `  <div class="ss-detail-score" style="color:${color}">${page.score}</div>`;
    html += `</div>`;
    html += `<div class="ss-detail-url">${escapeHTML(shortUrl)}</div>`;

    // Categories
    if (analysis && analysis.categories) {
      html += '<h3 style="margin:20px 0 12px;font-size:14px;">Categories</h3>';
      for (const [key, cat] of Object.entries(analysis.categories)) {
        const cc = Analyzer.getScoreColor(cat.score);
        html += `<div class="category-card">`;
        html += `  <div class="category-name">${cat.label}</div>`;
        html += `  <div class="category-bar"><div class="category-bar-fill" style="width:${cat.score}%;background:${cc};"></div></div>`;
        html += `  <div class="category-score" style="color:${cc};">${cat.score}<span style="font-size:14px;color:var(--text-3);">/100</span></div>`;
        html += `  <div style="font-size:12px;color:var(--text-3);margin-top:4px;">${cat.detail}</div>`;
        html += `</div>`;
      }
    }

    // Issues
    if (analysis && analysis.issues && analysis.issues.length > 0) {
      const icons = { error: '!', warning: '!', success: '\u2713', info: 'i' };
      html += '<h3 style="margin:20px 0 12px;font-size:14px;">Issues</h3>';
      analysis.issues.forEach(issue => {
        html += `<div class="issue-item">`;
        html += `  <div class="issue-icon ${issue.type}">${icons[issue.type]}</div>`;
        html += `  <div class="issue-text"><strong>${escapeHTML(issue.title)}</strong> — ${escapeHTML(issue.text)}</div>`;
        html += `</div>`;
      });
    }

    // Forms
    if (page.forms && page.forms.length > 0) {
      html += '<h3 style="margin:20px 0 12px;font-size:14px;">Forms</h3>';
      page.forms.forEach(form => {
        const name = form.toolname || form.name || form.id || 'Form';
        const badge = form.hasWebMCP
          ? '<span class="form-badge ready">WebMCP Ready</span>'
          : '<span class="form-badge not-ready">Not Ready</span>';
        html += `<div class="form-card expanded">`;
        html += `  <div class="form-card-header"><div class="form-name">${escapeHTML(name)} ${badge}</div></div>`;
        html += `  <div class="form-card-body">`;
        form.fields.forEach(f => {
          html += `<div class="form-field-row">`;
          html += `  <div class="form-field-label">${escapeHTML(f.name || f.id || '(no name)')}</div>`;
          html += `  <div class="form-field-type">${f.type}${f.required ? ' *' : ''}</div>`;
          html += `</div>`;
        });
        html += `  </div></div>`;
      });
    }

    detail.innerHTML = html;
  }

  // === Scan Handler ===
  async function handleScan() {
    let url = urlInput.value.trim();
    if (!url) { showError('Please enter a URL to scan.'); return; }

    // Add protocol if missing
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
      urlInput.value = url;
    }

    hideError();
    setLoading(true);

    try {
      const origin = new URL(url).origin;
      const [scanResult, protocolResults] = await Promise.all([
        Scanner.scan(url),
        ProtocolScanner.scan(origin).catch(() => null)
      ]);
      currentScan = scanResult;
      currentScan._protocols = protocolResults;
      currentAnalysis = Analyzer.analyze(currentScan, protocolResults);
      renderResults();
      saveToHistory(url, currentAnalysis.score);

      // Update URL without reload
      const newUrl = new URL(window.location);
      newUrl.searchParams.set('url', url);
      history.replaceState(null, '', newUrl);
    } catch (err) {
      showError(err.message || 'Failed to scan. Please check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }

  // === Render Results ===
  function renderResults() {
    resultsSection.hidden = false;

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Score gauge
    const score = currentAnalysis.score;
    const color = Analyzer.getScoreColor(score);
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (score / 100) * circumference;

    const ring = $('#score-ring-fill');
    ring.style.stroke = color;
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 50);

    const scoreValue = $('#score-value');
    animateNumber(scoreValue, score);
    scoreValue.style.color = color;

    // Stats
    const totalForms = currentScan.forms.length;
    const webmcpForms = currentScan.forms.filter(f => f.hasWebMCP).length;
    const issueCount = currentAnalysis.issues.filter(i => i.type === 'warning' || i.type === 'error').length;

    $('#stat-forms').textContent = totalForms;
    $('#stat-webmcp').textContent = webmcpForms + currentScan.scriptRegistrations.length;
    $('#stat-issues').textContent = issueCount;
    $('#stat-issues').style.color = issueCount > 0 ? 'var(--red)' : 'var(--green)';
    const protStat = $('#stat-protocols');
    if (protStat && currentScan._protocols) {
      const p = currentScan._protocols.summary;
      protStat.textContent = p.found + '/' + p.total;
      protStat.style.color = p.found > 0 ? 'var(--green)' : 'var(--text-3)';
    }

    // Scanned URL
    $('#scanned-url-value').textContent = currentScan.url;

    // Source badge & proxy warning
    const warningEl = $('#proxy-warning');
    if (warningEl) warningEl.remove();
    if (currentScan.source === 'bookmarklet') {
      const badge = createElement('div', 'proxy-warning', `
        <span style="font-size:16px;">&#9889;</span>
        <span><strong>Live DOM Analysis</strong> — Results from the actual rendered page, not a proxy. Full accuracy.</span>
      `);
      badge.id = 'proxy-warning';
      badge.style.background = 'var(--green-light)';
      badge.style.borderColor = 'var(--green)';
      const header = $('.results-header');
      if (header) header.parentNode.insertBefore(badge, header.nextSibling);
    } else if (currentScan.responseQuality && currentScan.responseQuality.quality !== 'good') {
      const warning = createElement('div', 'proxy-warning', `
        <span style="font-size:16px;">${currentScan.responseQuality.isCaptcha ? '&#9888;' : currentScan.responseQuality.isBlocked ? '&#128683;' : '&#9881;'}</span>
        <span>${currentScan.responseQuality.message}</span>
      `);
      warning.id = 'proxy-warning';
      const header = $('.results-header');
      if (header) header.parentNode.insertBefore(warning, header.nextSibling);
    }

    // Show simulator section
    const simSection = $('#simulator');
    if (simSection) {
      simSection.hidden = false;
      // Reset simulator state
      const simLog = $('#sim-log');
      if (simLog) { simLog.hidden = true; simLog.innerHTML = ''; }
      const simBtn = $('#sim-btn');
      if (simBtn) { simBtn.textContent = '\u25b6 Simulate AI Agent'; simBtn.disabled = false; }
    }

    // Render all tabs
    renderCategoryScores();
    renderIssues();
    renderForms();
    renderCode();
    renderAgentView();
    renderReport();
    renderCodeGen();
  }

  // === Category Scores ===
  function renderCategoryScores() {
    const container = $('#category-scores');
    container.innerHTML = '';

    for (const [key, cat] of Object.entries(currentAnalysis.categories)) {
      const color = Analyzer.getScoreColor(cat.score);
      const card = createElement('div', 'category-card', `
        <div class="category-name">${cat.label}</div>
        <div class="category-bar">
          <div class="category-bar-fill" style="width: 0%; background: ${color};"></div>
        </div>
        <div class="category-score" style="color: ${color};">${cat.score}<span style="font-size:14px;color:var(--text-3);">/100</span></div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px;">${cat.detail}</div>
      `);
      container.appendChild(card);

      // Animate bar
      setTimeout(() => {
        card.querySelector('.category-bar-fill').style.width = cat.score + '%';
      }, 100);
    }
  }

  // === Issues ===
  function renderIssues() {
    const container = $('#issues-list');
    container.innerHTML = '';

    const icons = { error: '!', warning: '!', success: '\u2713', info: 'i' };

    currentAnalysis.issues.forEach(issue => {
      const item = createElement('div', 'issue-item', `
        <div class="issue-icon ${issue.type}">${icons[issue.type]}</div>
        <div class="issue-text"><strong>${issue.title}</strong> — ${issue.text}</div>
      `);
      container.appendChild(item);
    });
  }

  // === Forms ===
  function renderForms() {
    const container = $('#forms-list');
    container.innerHTML = '';

    if (currentScan.forms.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128196;</div><p>No HTML forms detected on this page.</p></div>';
      return;
    }

    currentScan.forms.forEach(form => {
      const name = Generator.inferToolName(form);
      const badge = form.hasWebMCP ?
        '<span class="form-badge ready">WebMCP Ready</span>' :
        '<span class="form-badge not-ready">Not Ready</span>';

      const card = createElement('div', 'form-card', `
        <div class="form-card-header">
          <div class="form-name">${escapeHTML(name)} ${badge}</div>
          <div class="form-fields-count">${form.fieldCount} field${form.fieldCount > 1 ? 's' : ''} &middot; ${form.method}</div>
        </div>
        <div class="form-card-body">
          <div style="font-size:13px;color:var(--text-2);margin-bottom:12px;">
            ${form.action ? 'Action: <code>' + escapeHTML(form.action) + '</code>' : 'No action attribute'}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em;">
            <div>Field</div><div>Type</div><div>WebMCP</div>
          </div>
          ${form.fields.map(f => `
            <div class="form-field-row">
              <div class="form-field-label">${escapeHTML(f.name || f.id || '(no name)')}</div>
              <div class="form-field-type">${f.tagName === 'select' ? 'select' : f.type}${f.required ? ' *' : ''}</div>
              <div class="form-field-webmcp">${f.toolparamdescription ? '<span style="color:var(--green);">\u2713 ' + escapeHTML(f.toolparamdescription) + '</span>' : '<span style="color:var(--text-3);">-</span>'}</div>
            </div>
          `).join('')}
        </div>
      `);

      // Toggle expand
      card.querySelector('.form-card-header').addEventListener('click', () => {
        card.classList.toggle('expanded');
      });

      container.appendChild(card);
    });
  }

  // === Code Generation ===
  function renderCode() {
    const container = $('#code-sections');
    const noFormsMsg = $('#no-forms-msg');
    container.innerHTML = '';
    noFormsMsg.hidden = true;

    // Generate code for existing forms
    currentScan.forms.forEach(form => {
      const declarativeCode = Generator.generateDeclarative(form);
      const imperativeCode = Generator.generateImperative(form);
      const toolName = Generator.inferToolName(form);

      const block = createElement('div', 'code-block', `
        <div class="code-block-header">
          <div class="code-block-title">${escapeHTML(toolName)}</div>
          <div style="display:flex;gap:8px;align-items:center;">
            <div class="code-tabs">
              <button class="code-tab active" data-type="declarative">HTML</button>
              <button class="code-tab" data-type="imperative">JavaScript</button>
            </div>
            <button class="code-copy-btn">Copy</button>
          </div>
        </div>
        <div class="code-block-body">
          <pre class="code-content">${escapeHTML(declarativeCode)}</pre>
        </div>
      `);

      const tabs = block.querySelectorAll('.code-tab');
      const codeContent = block.querySelector('.code-content');
      const copyBtn = block.querySelector('.code-copy-btn');
      let currentType = 'declarative';

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          currentType = tab.dataset.type;
          codeContent.textContent = currentType === 'declarative' ? declarativeCode : imperativeCode;
        });
      });

      copyBtn.addEventListener('click', async () => {
        const code = currentType === 'declarative' ? declarativeCode : imperativeCode;
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
      });

      container.appendChild(block);
    });

    // Generate suggested tools code for sites without forms
    if (currentScan.suggestedTools && currentScan.suggestedTools.length > 0) {
      if (currentScan.forms.length === 0) {
        const headerEl = createElement('div', '', `
          <div style="background:var(--primary-light);border:1px solid var(--primary);border-radius:var(--radius-sm);padding:16px 20px;margin-bottom:16px;">
            <strong style="color:var(--primary);">Suggested Tools</strong>
            <span style="color:var(--text-2);"> — Based on your page content, we recommend implementing these WebMCP tools:</span>
          </div>
        `);
        container.appendChild(headerEl);
      }

      currentScan.suggestedTools.forEach(tool => {
        const code = Generator.generateSuggestedCode(tool);

        const block = createElement('div', 'code-block', `
          <div class="code-block-header">
            <div class="code-block-title">
              ${escapeHTML(tool.name)}
              <span style="font-size:11px;font-weight:400;color:var(--text-3);margin-left:8px;">suggested</span>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
              <span style="font-size:12px;color:var(--text-3);">JavaScript (imperative API)</span>
              <button class="code-copy-btn">Copy</button>
            </div>
          </div>
          <div class="code-block-body">
            <pre class="code-content">${escapeHTML(code)}</pre>
          </div>
        `);

        const copyBtn = block.querySelector('.code-copy-btn');
        copyBtn.addEventListener('click', async () => {
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = 'Copied!';
          copyBtn.classList.add('copied');
          setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
        });

        container.appendChild(block);
      });
    }

    // Show empty state only if no forms AND no suggestions
    if (currentScan.forms.length === 0 && (!currentScan.suggestedTools || currentScan.suggestedTools.length === 0)) {
      noFormsMsg.hidden = false;
    }
  }

  // === Agent View ===
  function renderAgentView() {
    renderBeforeView();
    renderAfterView();
  }

  function renderBeforeView() {
    const container = $('#agent-before-content');
    const tools = Generator.generateAgentView(currentScan.forms, currentScan.scriptRegistrations);

    let html = '';
    html += '<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Navigating to</span> ' + escapeHTML(currentScan.url) + '</div>';
    html += '<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Discovering WebMCP tools...</span></div>';
    html += '<div class="agent-line">&nbsp;</div>';

    if (tools.length === 0) {
      html += '<div class="agent-line"><span class="agent-warning">&#9888; No WebMCP tools found on this page.</span></div>';
      html += '<div class="agent-line"><span class="agent-dim">The AI agent cannot interact with this website programmatically.</span></div>';
      html += '<div class="agent-line"><span class="agent-dim">It can only read visible text and click links.</span></div>';

      if (currentScan.forms.length > 0) {
        html += '<div class="agent-line">&nbsp;</div>';
        html += `<div class="agent-line"><span class="agent-error">&#9888; ${currentScan.forms.length} form${currentScan.forms.length > 1 ? 's' : ''} detected but NOT exposed to agents.</span></div>`;
        html += '<div class="agent-line"><span class="agent-dim">Add WebMCP attributes to make them discoverable.</span></div>';
      }
    } else {
      html += `<div class="agent-line"><span class="agent-success">&#10003; Found ${tools.length} tool${tools.length > 1 ? 's' : ''}</span></div>`;
      html += '<div class="agent-line">&nbsp;</div>';

      tools.forEach(tool => {
        html += '<div class="agent-tool">';
        html += `<div><span class="agent-tool-name">${escapeHTML(tool.name)}</span><span class="agent-tool-desc"> — ${escapeHTML(tool.description)}</span></div>`;
        if (tool.params.length > 0) {
          html += '<div style="margin-top:8px;">';
          tool.params.forEach(p => {
            const req = p.required ? ' <span class="agent-error">*required</span>' : '';
            html += `<div style="margin-left:16px;"><span class="agent-param">${escapeHTML(p.name)}</span>: <span class="agent-type">${p.type}</span> <span class="agent-dim">— ${escapeHTML(p.description)}</span>${req}</div>`;
          });
          html += '</div>';
        }
        html += `<div style="margin-top:4px;"><span class="agent-dim">Source: ${tool.source}</span></div>`;
        html += '</div>';
      });
    }

    container.innerHTML = html;
  }

  function renderAfterView() {
    const container = $('#agent-after-content');
    const tools = Generator.generateAfterView(currentScan.forms, currentScan.suggestedTools);

    let html = '';
    html += '<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Navigating to</span> ' + escapeHTML(currentScan.url) + '</div>';
    html += '<div class="agent-line"><span class="agent-prompt">&gt;</span> <span class="agent-dim">Discovering WebMCP tools...</span></div>';
    html += '<div class="agent-line">&nbsp;</div>';

    if (tools.length === 0) {
      html += '<div class="agent-line"><span class="agent-dim">No forms on this page to convert to WebMCP tools.</span></div>';
      html += '<div class="agent-line"><span class="agent-dim">Use the imperative API (navigator.modelContext.registerTool) to add custom tools.</span></div>';
    } else {
      html += `<div class="agent-line"><span class="agent-success">&#10003; Found ${tools.length} tool${tools.length > 1 ? 's' : ''}</span></div>`;
      html += '<div class="agent-line">&nbsp;</div>';

      tools.forEach(tool => {
        html += '<div class="agent-tool">';
        html += `<div><span class="agent-tool-name">${escapeHTML(tool.name)}</span><span class="agent-tool-desc"> — ${escapeHTML(tool.description)}</span></div>`;
        if (tool.params.length > 0) {
          html += '<div style="margin-top:8px;">';
          tool.params.forEach(p => {
            const req = p.required ? ' <span class="agent-error">*required</span>' : '';
            html += `<div style="margin-left:16px;"><span class="agent-param">${escapeHTML(p.name)}</span>: <span class="agent-type">${p.type}</span> <span class="agent-dim">— ${escapeHTML(p.description)}</span>${req}</div>`;
          });
          html += '</div>';
        }
        html += `<div style="margin-top:4px;"><span class="agent-success">&#10003; WebMCP ready (suggested implementation)</span></div>`;
        html += '</div>';
      });
    }

    container.innerHTML = html;
  }

  // === Report ===
  function renderReport() {
    const container = $('#report-preview');
    const score = currentAnalysis.score;
    const color = Analyzer.getScoreColor(score);
    const cls = Analyzer.getScoreClass(score);

    let html = '';
    html += `<h3 style="margin-bottom:16px;">Agent Readiness Report</h3>`;
    html += `<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;">`;
    html += `  <div style="font-size:48px;font-weight:800;color:${color};">${score}/100</div>`;
    html += `  <div><div style="font-weight:600;">${currentScan.url}</div><div style="color:var(--text-3);font-size:13px;">${currentAnalysis.summary}</div></div>`;
    html += `</div>`;

    // Category breakdown
    html += '<div style="margin-top:16px;">';
    for (const [key, cat] of Object.entries(currentAnalysis.categories)) {
      const catColor = Analyzer.getScoreColor(cat.score);
      html += `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:14px;">`;
      html += `  <span>${cat.label}</span>`;
      html += `  <span style="font-weight:600;color:${catColor};">${cat.score}/100</span>`;
      html += '</div>';
    }
    html += '</div>';

    // Issues summary
    const errors = currentAnalysis.issues.filter(i => i.type === 'error').length;
    const warnings = currentAnalysis.issues.filter(i => i.type === 'warning').length;
    const successes = currentAnalysis.issues.filter(i => i.type === 'success').length;
    html += `<div style="margin-top:16px;font-size:14px;color:var(--text-2);">`;
    html += `${successes} passed &middot; ${warnings} warnings &middot; ${errors} errors`;
    html += '</div>';

    // Scan info
    html += `<div style="margin-top:16px;font-size:12px;color:var(--text-3);">`;
    html += `Scanned: ${new Date(currentScan.timestamp).toLocaleString()} | Page size: ${(currentScan.htmlLength / 1024).toFixed(1)} KB`;
    html += '</div>';

    container.innerHTML = html;
  }

  function downloadReport() {
    if (!currentAnalysis) return;
    const score = currentAnalysis.score;
    const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';

    let reportHTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Agent Readiness Report — ${currentScan.url}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #0f172a; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .score { font-size: 64px; font-weight: 800; color: ${color}; }
    .url { color: #475569; font-size: 14px; margin-bottom: 24px; }
    .summary { font-size: 16px; color: #475569; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
    th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    th { font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    .issue { padding: 12px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; }
    .badge-error { background: #fee2e2; color: #ef4444; }
    .badge-warning { background: #fef3c7; color: #f59e0b; }
    .badge-success { background: #d1fae5; color: #10b981; }
    .badge-info { background: #dbeafe; color: #2563eb; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <h1>Agent Readiness Report</h1>
  <div class="url">${escapeHTML(currentScan.url)}</div>
  <div class="score">${score}/100</div>
  <div class="summary">${currentAnalysis.summary}</div>

  ${score >= 75 ? `
  <div style="margin:24px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;text-align:center">
    <div style="font-size:16px;font-weight:700;color:#166534;margin-bottom:12px">&#9989; Certified Agent-Ready</div>
    <div style="margin-bottom:16px">
      <img src="https://img.shields.io/badge/AgentReady-Score_${score}%2F100-10b981?style=for-the-badge" alt="Agent-Ready Badge" style="height:28px">
    </div>
    <div style="font-size:13px;color:#475569;margin-bottom:8px">Add this badge to your site:</div>
    <pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;text-align:left">&lt;a href="https://crawlaudit.dev"&gt;&lt;img src="https://img.shields.io/badge/AgentReady-Score_${score}%2F100-10b981?style=for-the-badge" alt="Agent-Ready Badge"&gt;&lt;/a&gt;</pre>
  </div>
  ` : `
  <div style="margin:24px 0;padding:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;text-align:center">
    <div style="font-size:16px;font-weight:700;color:#92400e;margin-bottom:12px">&#128679; Work in Progress</div>
    <div style="margin-bottom:16px">
      <img src="https://img.shields.io/badge/AgentReady-Score_${score}%2F100-f59e0b?style=for-the-badge" alt="Work in Progress Badge" style="height:28px">
    </div>
    <div style="font-size:13px;color:#475569">Score 75+ to unlock the Agent-Ready certification badge.</div>
  </div>
  `}

  <h2>Category Breakdown</h2>
  <table>
    <tr><th>Category</th><th>Score</th><th>Detail</th></tr>
    ${Object.values(currentAnalysis.categories).map(cat => `
    <tr>
      <td>${cat.label}</td>
      <td style="font-weight:600;">${cat.score}/100</td>
      <td style="color:#475569;">${cat.detail}</td>
    </tr>`).join('')}
  </table>

  <h2>Issues</h2>
  ${currentAnalysis.issues.map(issue => `
  <div class="issue">
    <span class="badge badge-${issue.type}">${issue.type}</span>
    <strong>${escapeHTML(issue.title)}</strong> — ${escapeHTML(issue.text)}
  </div>`).join('')}

  <h2>Forms Detected (${currentScan.forms.length})</h2>
  <table>
    <tr><th>Form</th><th>Fields</th><th>Method</th><th>WebMCP</th></tr>
    ${currentScan.forms.map(f => `
    <tr>
      <td>${escapeHTML(Generator.inferToolName(f))}</td>
      <td>${f.fieldCount}</td>
      <td>${f.method}</td>
      <td>${f.hasWebMCP ? '<span class="badge badge-success">Ready</span>' : '<span class="badge badge-error">Not Ready</span>'}</td>
    </tr>`).join('')}
  </table>

  <div class="footer">
    Generated by AgentReady | ${new Date().toISOString()} | agentready.dev
  </div>
</body>
</html>`;

    const blob = new Blob([reportHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentready-report-${currentScan.security.domain}.html`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Report downloaded!');
  }

  function copyReportLink() {
    const shareUrl = `${window.location.origin}${window.location.pathname}?url=${encodeURIComponent(currentScan.url)}`;
    navigator.clipboard.writeText(shareUrl);
    showToast('Link copied to clipboard!');
  }

  // === History ===
  function saveToHistory(url, score) {
    const history = JSON.parse(localStorage.getItem('agentready-history') || '[]');
    history.unshift({ url, score, timestamp: Date.now() });
    // Keep last 50
    localStorage.setItem('agentready-history', JSON.stringify(history.slice(0, 50)));
  }

  function loadHistory() {
    // History feature ready for future use
  }

  // === Tabs ===
  function switchTab(tabId) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    $$('.tab-content').forEach(tc => tc.classList.toggle('active', tc.id === 'tab-' + tabId));
  }

  function switchAgentView(view) {
    $$('.agent-toggle-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.agent-view').forEach(v => v.classList.remove('active'));
    $(`#agent-view-${view}`).classList.add('active');
  }

  // === Theme ===
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('agentready-theme', isDark ? 'light' : 'dark');
  }

  // === UI Helpers ===
  function setLoading(loading) {
    scanBtn.disabled = loading;
    scanBtn.classList.toggle('scanning', loading);
    scanBtn.querySelector('.scan-btn-text').hidden = loading;
    scanBtn.querySelector('.scan-btn-loading').hidden = !loading;
  }

  function showError(msg) {
    scanError.textContent = msg;
    scanError.hidden = false;
  }

  function hideError() {
    scanError.hidden = true;
  }

  function showToast(msg) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.hidden = false;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.hidden = true; }, 300);
    }, 2500);
  }

  function animateNumber(el, target) {
    let current = 0;
    const step = Math.max(1, Math.floor(target / 30));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      el.textContent = current;
    }, 30);
  }

  function createElement(tag, className, innerHTML) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // === Agent Simulator ===
  async function runSimulation() {
    if (!currentScan || !currentAnalysis) return;

    const btn = $('#sim-btn');
    const log = $('#sim-log');
    btn.disabled = true;
    btn.textContent = '\u23f3 Simulating...';
    log.hidden = false;
    log.innerHTML = '';

    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const addLine = async (text, cls, ms) => {
      ms = ms || 400;
      cls = cls || '';
      await delay(ms);
      const div = document.createElement('div');
      div.className = 'sim-line ' + cls;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    };

    const addVerdict = async (text, level, ms) => {
      ms = ms || 600;
      await delay(ms);
      const div = document.createElement('div');
      div.className = 'sim-verdict sim-verdict-' + level;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
    };

    const scan = currentScan;
    const analysis = currentAnalysis;
    const domain = scan.security ? scan.security.domain : '';
    const protocols = scan._protocols || null;
    const ps = scan.pageSignals || {};
    const score = analysis.score;

    // Init
    await addLine('Agent initializing...', 'sim-info', 300);
    await addLine('Target: ' + (scan.url || domain), 'sim-info', 200);

    // Step 1: Connection
    await addLine('\u2500\u2500 Step 1: Discovering site \u2500\u2500', 'sim-step', 500);
    await addLine('Connecting to ' + domain + '...', 'sim-info', 400);
    if (scan.security && scan.security.isHTTPS) {
      await addLine('\u2713 HTTPS connection established \u2014 secure context available', 'sim-pass');
    } else {
      await addLine('\u2717 No HTTPS \u2014 navigator.modelContext will NOT be available', 'sim-fail');
    }

    // Step 2: robots.txt (we don't actually check robots.txt, so simulate based on available data)
    await addLine('\u2500\u2500 Step 2: Checking access permissions \u2500\u2500', 'sim-step', 600);
    await addLine('Reading robots.txt...', 'sim-info', 400);
    // We don't have robots.txt data, so provide a neutral response
    await addLine('\u2139 robots.txt check not available via proxy \u2014 access assumed', 'sim-info', 300);

    // Step 3: Discovery protocols
    await addLine('\u2500\u2500 Step 3: Scanning discovery protocols \u2500\u2500', 'sim-step', 600);
    await addLine('Scanning for AI discovery endpoints...', 'sim-info', 400);

    let protocolCount = 0;
    if (protocols) {
      if (protocols.a2a && protocols.a2a.found) {
        await addLine('\u2713 Found A2A Agent Card' + (protocols.a2a.name ? ' \u2014 ' + protocols.a2a.name : ''), 'sim-pass', 300);
        protocolCount++;
      } else {
        await addLine('\u2717 No A2A Agent Card (/.well-known/agent.json)', 'sim-fail', 200);
      }
      if (protocols.mcp && protocols.mcp.found) {
        await addLine('\u2713 Found MCP Discovery' + (protocols.mcp.serverCount ? ' \u2014 ' + protocols.mcp.serverCount + ' server(s)' : ''), 'sim-pass', 300);
        protocolCount++;
      } else {
        await addLine('\u2717 No MCP Discovery (/.well-known/mcp.json)', 'sim-fail', 200);
      }
      if (protocols.agents && protocols.agents.found) {
        await addLine('\u2713 Found agents.json' + (protocols.agents.agentCount ? ' \u2014 ' + protocols.agents.agentCount + ' agent(s)' : ''), 'sim-pass', 300);
        protocolCount++;
      } else {
        await addLine('\u2717 No agents.json', 'sim-fail', 200);
      }
      if (protocols.openapi && protocols.openapi.found) {
        await addLine('\u2713 Found OpenAPI spec' + (protocols.openapi.title ? ' \u2014 ' + protocols.openapi.title : ''), 'sim-pass', 300);
        protocolCount++;
      } else {
        await addLine('\u2717 No OpenAPI spec', 'sim-fail', 200);
      }
      if (protocols.llms && protocols.llms.found) {
        await addLine('\u2713 Found llms.txt' + (protocols.llms.title ? ' \u2014 ' + protocols.llms.title : ''), 'sim-pass', 300);
        protocolCount++;
      } else {
        await addLine('\u2717 No llms.txt \u2014 cannot read site description', 'sim-fail', 200);
      }
      await addLine('Discovered ' + protocolCount + '/' + protocols.summary.total + ' protocols', protocolCount > 0 ? 'sim-pass' : 'sim-warn', 300);
    } else {
      await addLine('\u2717 Protocol scan unavailable', 'sim-warn', 300);
    }

    // Step 4: Page structure
    await addLine('\u2500\u2500 Step 4: Analyzing page structure \u2500\u2500', 'sim-step', 600);
    await addLine('Reading page metadata...', 'sim-info', 400);

    if (ps.hasTitle) {
      await addLine('\u2713 Title: ' + ps.title, 'sim-pass', 250);
    } else {
      await addLine('\u2717 No page title \u2014 agent cannot identify this page', 'sim-fail', 250);
    }

    if (ps.hasMetaDescription) {
      await addLine('\u2713 Meta description found', 'sim-pass', 200);
    } else {
      await addLine('\u2717 No meta description', 'sim-fail', 200);
    }

    if (ps.hasJsonLd || ps.hasMicrodata) {
      const types = [];
      if (ps.hasJsonLd) types.push('JSON-LD');
      if (ps.hasMicrodata) types.push('Microdata');
      await addLine('\u2713 Structured data found (' + types.join(', ') + ')', 'sim-pass', 250);
    } else {
      await addLine('\u2717 No structured data \u2014 page content is opaque to agents', 'sim-fail', 250);
    }

    if (ps.semanticCount > 3) {
      await addLine('\u2713 Semantic HTML detected (' + ps.semanticCount + ' semantic elements)', 'sim-pass', 200);
    } else if (ps.semanticCount > 0) {
      await addLine('\u26a0 Minimal semantic HTML (' + ps.semanticCount + ' elements)', 'sim-warn', 200);
    } else {
      await addLine('\u2717 No semantic HTML \u2014 content structure is ambiguous', 'sim-fail', 200);
    }

    // Step 5: Tools
    await addLine('\u2500\u2500 Step 5: Looking for actionable tools \u2500\u2500', 'sim-step', 600);
    await addLine('Querying navigator.modelContext...', 'sim-info', 400);

    const webmcpForms = scan.forms.filter(function(f) { return f.hasWebMCP; });
    const scriptRegs = scan.scriptRegistrations || [];
    const totalTools = webmcpForms.length + scriptRegs.length;
    const totalForms = scan.forms.length;

    if (totalTools > 0) {
      const toolNames = [];
      webmcpForms.forEach(function(f) { toolNames.push(Generator.inferToolName(f)); });
      scriptRegs.forEach(function(r) { toolNames.push(r.name || 'script-tool'); });
      await addLine('\u2713 Found ' + totalTools + ' WebMCP tool(s): ' + toolNames.join(', '), 'sim-pass', 300);
      await addLine('Agent CAN interact with this site', 'sim-pass', 200);
    } else if (totalForms > 0) {
      await addLine('Found ' + totalForms + ' form(s) but none are WebMCP-enabled', 'sim-warn', 300);
      await addLine('Agent can SEE forms but CANNOT use them programmatically', 'sim-warn', 200);
    } else {
      await addLine('No interactive elements found \u2014 site is READ-ONLY to agents', 'sim-fail', 300);
    }

    // Step 6: Verdict
    await addLine('\u2500\u2500 Final Assessment \u2500\u2500', 'sim-step', 800);

    if (score >= 80) {
      await addVerdict('\u2705 SIMULATION PASSED \u2014 AI agents can fully discover and interact with this site (Score: ' + score + '/100)', 'pass');
    } else if (score >= 50) {
      await addVerdict('\u26a0\ufe0f PARTIAL \u2014 AI agents can discover the site but cannot fully interact (Score: ' + score + '/100)', 'partial');
    } else if (totalForms > 0) {
      await addVerdict('\u274c SIMULATION FAILED \u2014 AI agents can see ' + totalForms + ' form(s) but cannot use them. The site needs WebMCP attributes. (Score: ' + score + '/100)', 'fail');
    } else {
      await addVerdict('\u274c SIMULATION FAILED \u2014 This site is invisible to AI agents. No tools, no protocols, no structured actions. (Score: ' + score + '/100)', 'fail');
    }

    btn.textContent = '\u25b6 Run Again';
    btn.disabled = false;
  }

  // === Compare Handler ===
  async function handleCompare() {
    const url1Input = $('#compare-url-1');
    const url2Input = $('#compare-url-2');
    const compareBtn = $('#compare-btn');
    const compareError = $('#compare-error');
    const compareResults = $('#compare-results');

    let url1 = url1Input.value.trim();
    let url2 = url2Input.value.trim();

    if (!url1 || !url2) {
      compareError.textContent = 'Please enter both URLs to compare.';
      compareError.hidden = false;
      return;
    }

    if (!url1.startsWith('http://') && !url1.startsWith('https://')) { url1 = 'https://' + url1; url1Input.value = url1; }
    if (!url2.startsWith('http://') && !url2.startsWith('https://')) { url2 = 'https://' + url2; url2Input.value = url2; }

    compareError.hidden = true;
    compareBtn.querySelector('.compare-btn-text').hidden = true;
    compareBtn.querySelector('.compare-btn-loading').hidden = false;
    compareBtn.disabled = true;

    try {
      const origin1 = new URL(url1).origin;
      const origin2 = new URL(url2).origin;

      const [scan1, scan2, proto1, proto2] = await Promise.all([
        Scanner.scan(url1),
        Scanner.scan(url2),
        ProtocolScanner.scan(origin1).catch(() => null),
        ProtocolScanner.scan(origin2).catch(() => null)
      ]);

      const analysis1 = Analyzer.analyze(scan1, proto1);
      const analysis2 = Analyzer.analyze(scan2, proto2);

      const scoreColor = (s) => s >= 80 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';

      let domain1 = ''; try { domain1 = new URL(url1).hostname; } catch {}
      let domain2 = ''; try { domain2 = new URL(url2).hostname; } catch {}

      // Render results
      $('#compare-domain-a').textContent = domain1;
      $('#compare-domain-b').textContent = domain2;

      const s1 = analysis1.score;
      const s2 = analysis2.score;

      $('#compare-score-a').textContent = s1;
      $('#compare-score-a').style.color = scoreColor(s1);
      $('#compare-score-b').textContent = s2;
      $('#compare-score-b').style.color = scoreColor(s2);

      const barA = $('#compare-bar-a');
      const barB = $('#compare-bar-b');
      barA.style.background = scoreColor(s1);
      barB.style.background = scoreColor(s2);
      setTimeout(() => { barA.style.width = s1 + '%'; barB.style.width = s2 + '%'; }, 50);

      const forms1 = scan1.forms?.length || 0;
      const forms2 = scan2.forms?.length || 0;
      const wm1 = scan1.forms?.filter(f => f.hasWebMCP).length || 0;
      const wm2 = scan2.forms?.filter(f => f.hasWebMCP).length || 0;
      const proto1Count = proto1?.summary?.found || 0;
      const proto2Count = proto2?.summary?.found || 0;

      $('#compare-stats-a').innerHTML = `<span>${forms1} forms</span><span>${wm1} WebMCP</span><span>${proto1Count} protocols</span>`;
      $('#compare-stats-b').innerHTML = `<span>${forms2} forms</span><span>${wm2} WebMCP</span><span>${proto2Count} protocols</span>`;

      const winner = $('#compare-winner');
      if (s1 > s2) {
        winner.innerHTML = `<span style="color:${scoreColor(s1)}">${escapeHTML(domain1)}</span> wins by ${s1 - s2} points`;
      } else if (s2 > s1) {
        winner.innerHTML = `<span style="color:${scoreColor(s2)}">${escapeHTML(domain2)}</span> wins by ${s2 - s1} points`;
      } else {
        winner.textContent = "It's a tie!";
      }

      compareResults.hidden = false;
      compareResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      compareError.textContent = err.message || 'Failed to scan one or both URLs. Please check and try again.';
      compareError.hidden = false;
    } finally {
      compareBtn.querySelector('.compare-btn-text').hidden = false;
      compareBtn.querySelector('.compare-btn-loading').hidden = true;
      compareBtn.disabled = false;
    }
  }

  // === Complete Code Generator ===
  let codeGenFiles = [];

  function detectSiteType(title, domain, scan) {
    const t = (title + ' ' + domain).toLowerCase();
    const text = (scan.suggestedTools || []).map(s => s.name).join(' ');
    if (/hotel|booking|reserv|b&b|hostel|villa|resort|inn|lodge|check.?in/i.test(t + text)) return 'hotel';
    if (/shop|store|cart|ecommerce|buy|product|price/i.test(t + text)) return 'ecommerce';
    if (/blog|article|post|news|magazine/i.test(t + text)) return 'blog';
    if (/api|docs|developer|documentation/i.test(t + text)) return 'api';
    return 'generic';
  }

  function generateWebMCPJs(domain, siteType) {
    const configs = {
      hotel: { name: 'check_availability', desc: 'Check room availability for given dates',
        props: '        check_in: { type: "string", description: "Check-in date (YYYY-MM-DD)" },\n        check_out: { type: "string", description: "Check-out date (YYYY-MM-DD)" },\n        guests: { type: "number", description: "Number of guests" }',
        ret: '      return { available: true, rooms: [] };' },
      ecommerce: { name: 'search_products', desc: 'Search the product catalog',
        props: '        query: { type: "string", description: "Search query" },\n        category: { type: "string", description: "Product category" },\n        max_price: { type: "number", description: "Maximum price filter" }',
        ret: '      return { products: [], total: 0 };' },
      blog: { name: 'search_articles', desc: 'Search blog articles and content',
        props: '        query: { type: "string", description: "Search query" },\n        tag: { type: "string", description: "Filter by tag" }',
        ret: '      return { articles: [], total: 0 };' },
      api: { name: 'query_api', desc: 'Query the API endpoint',
        props: '        endpoint: { type: "string", description: "API endpoint path" },\n        method: { type: "string", description: "HTTP method (GET, POST)" }',
        ret: '      return { status: 200, data: {} };' },
      generic: { name: 'site_search', desc: 'Search content on ' + domain,
        props: '        query: { type: "string", description: "Search query" }',
        ret: '      return { results: [], total: 0 };' }
    };
    const c = configs[siteType] || configs.generic;
    return `if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "${c.name}",
    description: "${c.desc}",
    parameters: {
      type: "object",
      properties: {
${c.props}
      }
    },
    handler: async (params) => {
      // Your implementation here
${c.ret}
    }
  });
}`;
  }

  function generateWebMCPHTML(forms) {
    if (!forms || forms.length === 0) return null;
    const nonReady = forms.filter(f => !f.hasWebMCP);
    if (nonReady.length === 0) return null;

    let html = '';
    nonReady.forEach(form => {
      const toolName = Generator.inferToolName(form);
      const toolDesc = Generator.inferToolDescription(form);
      html += `<form toolname="${toolName}"\n      tooldescription="${toolDesc}"\n      toolautosubmit\n`;
      if (form.action) html += `      action="${form.action}"\n`;
      html += `      method="${form.method || 'GET'}">\n`;
      form.fields.forEach(f => {
        const nameAttr = f.name || f.id || 'field';
        const desc = f.label || f.placeholder || f.ariaLabel || nameAttr;
        if (f.tagName === 'select') {
          html += `  <select name="${nameAttr}" toolparamdescription="${desc}"${f.required ? ' required' : ''}>\n`;
          (f.options || []).forEach(o => {
            html += `    <option value="${o.value}">${o.text}</option>\n`;
          });
          html += `  </select>\n`;
        } else if (f.tagName === 'textarea') {
          html += `  <textarea name="${nameAttr}" toolparamdescription="${desc}"${f.required ? ' required' : ''}></textarea>\n`;
        } else {
          html += `  <input type="${f.type}" name="${nameAttr}" toolparamdescription="${desc}"${f.required ? ' required' : ''}`;
          if (f.placeholder) html += ` placeholder="${f.placeholder}"`;
          html += `>\n`;
        }
      });
      html += `  <button type="submit">Submit</button>\n</form>`;
      if (nonReady.indexOf(form) < nonReady.length - 1) html += '\n\n';
    });
    return html;
  }

  function generateLlmsTxt(title, domain, desc, siteType) {
    let txt = `# ${title}\n\n> ${desc}\n\n## Pages\n- [Home](https://${domain}/)\n`;
    if (siteType === 'hotel') {
      txt += `- [Rooms](https://${domain}/rooms)\n- [Book Now](https://${domain}/book)\n- [Gallery](https://${domain}/gallery)\n- [Contact](https://${domain}/contact)\n`;
      txt += `\n## Key Information\n- Accommodation / hospitality website\n- Online booking available\n- Check-in / check-out info on booking page\n`;
    } else if (siteType === 'ecommerce') {
      txt += `- [Products](https://${domain}/products)\n- [Categories](https://${domain}/categories)\n- [Cart](https://${domain}/cart)\n- [Contact](https://${domain}/contact)\n`;
      txt += `\n## Key Information\n- E-commerce website\n- Product catalog with search\n- Online checkout available\n`;
    } else if (siteType === 'blog') {
      txt += `- [Articles](https://${domain}/blog)\n- [About](https://${domain}/about)\n- [Contact](https://${domain}/contact)\n`;
      txt += `\n## Key Information\n- Blog / content website\n- Articles and posts available\n`;
    } else {
      txt += `- [About](https://${domain}/about)\n- [Contact](https://${domain}/contact)\n`;
      txt += `\n## Key Information\n- ${desc}\n`;
    }
    return txt;
  }

  function renderCodeGen() {
    const section = $('#codegen');
    const tabsEl = $('#codegen-tabs');
    const pathEl = $('#codegen-path');
    const codeEl = $('#codegen-code');
    const statusEl = $('#codegen-status');
    const copyBtn = $('#codegen-copy');

    if (!currentScan || !section) return;

    const protocols = currentScan._protocols || {};
    let domain = '';
    try { domain = new URL(currentScan.url).hostname; } catch { return; }
    const title = currentScan.pageSignals?.title || domain;
    const desc = currentScan.pageSignals?.hasMetaDescription
      ? 'Information and services from ' + domain
      : 'Information about ' + domain;
    const domainSlug = domain.replace(/\./g, '-');
    const siteType = detectSiteType(title, domain, currentScan);

    const files = [];

    // 1. agent.json
    const a2aCode = JSON.stringify({
      name: title + ' Agent',
      description: 'AI agent for ' + domain,
      url: 'https://' + domain,
      version: '1.0.0',
      capabilities: { streaming: false, pushNotifications: false },
      skills: [{
        name: 'general_info',
        description: 'Get information about ' + domain,
        tags: ['info', 'help']
      }],
      authentication: null
    }, null, 2);
    files.push({
      name: 'agent.json',
      path: '/.well-known/agent.json',
      found: !!(protocols.a2a && protocols.a2a.found),
      code: protocols.a2a && protocols.a2a.found
        ? '// Already detected on your site'
        : a2aCode
    });

    // 2. mcp.json
    const mcpCode = JSON.stringify({
      mcpServers: {
        [domainSlug]: {
          url: 'https://' + domain + '/mcp',
          transport: 'streamable-http',
          description: 'MCP server for ' + domain
        }
      }
    }, null, 2);
    files.push({
      name: 'mcp.json',
      path: '/.well-known/mcp.json',
      found: !!(protocols.mcp && protocols.mcp.found),
      code: protocols.mcp && protocols.mcp.found
        ? '// Already detected on your site'
        : mcpCode
    });

    // 3. agents.json
    const agentsCode = JSON.stringify({
      agents: [{
        name: title + ' Assistant',
        description: 'AI assistant for ' + domain,
        protocol: 'a2a',
        url: 'https://' + domain + '/.well-known/agent.json',
        capabilities: ['chat', 'search']
      }]
    }, null, 2);
    files.push({
      name: 'agents.json',
      path: '/.well-known/agents.json',
      found: !!(protocols.agents && protocols.agents.found),
      code: protocols.agents && protocols.agents.found
        ? '// Already detected on your site'
        : agentsCode
    });

    // 4. llms.txt
    files.push({
      name: 'llms.txt',
      path: '/llms.txt',
      found: !!(protocols.llms && protocols.llms.found),
      code: protocols.llms && protocols.llms.found
        ? '// Already detected on your site'
        : generateLlmsTxt(title, domain, desc, siteType)
    });

    // 5. robots.txt (always show)
    files.push({
      name: 'robots.txt',
      path: '/robots.txt',
      found: false,
      alwaysShow: true,
      code: `User-agent: *\nAllow: /\n\n# AI Agents \u2014 Allow all\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Amazonbot\nAllow: /\n\nSitemap: https://${domain}/sitemap.xml`
    });

    // 6. WebMCP HTML (only if forms found without WebMCP)
    const webmcpHTML = generateWebMCPHTML(currentScan.forms);
    if (webmcpHTML) {
      files.push({
        name: 'WebMCP HTML',
        path: 'Form attributes (add to your HTML)',
        found: false,
        code: webmcpHTML
      });
    }

    // 7. WebMCP JavaScript (always show as example)
    files.push({
      name: 'WebMCP JS',
      path: '<script> tag or external .js file',
      found: currentScan.scriptRegistrations && currentScan.scriptRegistrations.length > 0,
      alwaysShow: true,
      code: currentScan.scriptRegistrations && currentScan.scriptRegistrations.length > 0
        ? '// WebMCP registrations already detected on your site.\n// Below is an additional example you can extend:\n\n' + generateWebMCPJs(domain, siteType)
        : generateWebMCPJs(domain, siteType)
    });

    codeGenFiles = files;

    // Render tabs
    tabsEl.innerHTML = '';
    files.forEach(function(f, i) {
      const tab = document.createElement('button');
      tab.className = 'codegen-tab' + (i === 0 ? ' active' : '');
      const dotClass = f.found ? 'found' : 'missing';
      tab.innerHTML = '<span class="codegen-tab-dot ' + dotClass + '"></span>' + escapeHTML(f.name);
      tab.addEventListener('click', function() { selectCodeGenTab(i); });
      tabsEl.appendChild(tab);
    });

    // Show first tab
    selectCodeGenTab(0);

    // Copy button handler
    copyBtn.onclick = function() {
      const code = codeEl.textContent;
      navigator.clipboard.writeText(code).then(function() {
        copyBtn.textContent = 'Copied!';
        copyBtn.classList.add('copied');
        setTimeout(function() { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 2000);
      });
    };

    // Status text
    const missing = files.filter(function(f) { return !f.found && !f.alwaysShow; }).length;
    if (missing > 0) {
      statusEl.textContent = missing + ' file' + (missing > 1 ? 's' : '') + ' missing \u2014 copy and deploy to improve your score';
    } else {
      statusEl.textContent = 'All protocols detected! Your site is fully discoverable by AI agents.';
    }

    section.hidden = false;
  }

  function selectCodeGenTab(index) {
    const tabs = $$('.codegen-tab');
    tabs.forEach(function(t, i) { t.classList.toggle('active', i === index); });
    $('#codegen-path').textContent = codeGenFiles[index].path;
    $('#codegen-code').textContent = codeGenFiles[index].code;
  }

  // === Hero Terminal Animation ===
  function initTerminalAnimation() {
    var body = document.getElementById('terminal-body');
    var terminal = document.getElementById('hero-terminal');
    if (!body || !terminal) return;

    // Multiple scan scenarios for the loop
    var scans = [
      {
        url: 'https://stripe.com',
        time: '1.2s',
        categories: [
          { name: 'WebMCP Compliance', score: 18, max: 20, status: 'pass' },
          { name: 'AI Discovery',      score: 15, max: 15, status: 'pass' },
          { name: 'Structured Data',   score: 12, max: 15, status: 'pass' },
          { name: 'robots.txt',        score: 10, max: 10, status: 'pass' },
          { name: 'Accessibility',     score: 8,  max: 10, status: 'warn' },
          { name: 'MCP Discovery',     score: 0,  max: 15, status: 'fail' },
          { name: 'llms.txt',          score: 0,  max: 15, status: 'fail' },
        ],
        total: 63, verdict: 'Needs Work', verdictClass: 'warn',
        summary: ['<span class="t-pass">3</span> forms detected, <span class="t-pass">1</span> WebMCP-ready', '<span class="t-pass">4</span> AI protocols found', 'Run <span class="t-cmd">agentready fix</span> to generate missing files']
      },
      {
        url: 'https://github.com',
        time: '0.9s',
        categories: [
          { name: 'WebMCP Compliance', score: 20, max: 20, status: 'pass' },
          { name: 'AI Discovery',      score: 15, max: 15, status: 'pass' },
          { name: 'Structured Data',   score: 15, max: 15, status: 'pass' },
          { name: 'robots.txt',        score: 10, max: 10, status: 'pass' },
          { name: 'Accessibility',     score: 9,  max: 10, status: 'pass' },
          { name: 'MCP Discovery',     score: 12, max: 15, status: 'pass' },
          { name: 'llms.txt',          score: 10, max: 15, status: 'warn' },
        ],
        total: 91, verdict: 'Excellent', verdictClass: 'pass',
        summary: ['<span class="t-pass">12</span> forms detected, <span class="t-pass">12</span> WebMCP-ready', '<span class="t-pass">5</span> AI protocols found', 'Site is fully agent-ready!']
      },
      {
        url: 'https://booking.com',
        time: '1.8s',
        categories: [
          { name: 'WebMCP Compliance', score: 5,  max: 20, status: 'fail' },
          { name: 'AI Discovery',      score: 8,  max: 15, status: 'warn' },
          { name: 'Structured Data',   score: 14, max: 15, status: 'pass' },
          { name: 'robots.txt',        score: 7,  max: 10, status: 'warn' },
          { name: 'Accessibility',     score: 6,  max: 10, status: 'warn' },
          { name: 'MCP Discovery',     score: 0,  max: 15, status: 'fail' },
          { name: 'llms.txt',          score: 0,  max: 15, status: 'fail' },
        ],
        total: 40, verdict: 'Poor', verdictClass: 'fail',
        summary: ['<span class="t-pass">8</span> forms detected, <span class="t-fail">0</span> WebMCP-ready', '<span class="t-warn">2</span> AI protocols found', 'Run <span class="t-cmd">agentready fix</span> to generate missing files']
      }
    ];

    var scanIndex = 0;
    var animationTimer = null;

    function padRight(str, len) {
      while (str.length < len) str += ' ';
      return str;
    }

    function buildLines(scan) {
      var icon = { pass: '✓', warn: '⚠', fail: '✗' };
      var lines = [
        { delay: 600, html: '<span class="t-dim">Scanning ' + scan.url.replace('https://', '') + '...</span>' },
        { delay: 500, html: '' }
      ];
      scan.categories.forEach(function(cat) {
        var name = padRight(cat.name, 20);
        lines.push({
          delay: 180,
          html: '<span class="t-' + cat.status + '">' + icon[cat.status] + '</span> <span class="t-bold">' + name + '</span> <span class="t-' + cat.status + '">' + (cat.score < 10 ? ' ' : '') + cat.score + '</span><span class="t-dim">/' + cat.max + '</span>'
        });
      });
      lines.push({ delay: 350, html: '' });
      lines.push({ delay: 80, html: '<span class="t-separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>' });
      lines.push({ delay: 250, html: '  <span class="t-score">Score: ' + scan.total + '/100</span> <span class="t-dim">—</span> <span class="t-' + scan.verdictClass + '">' + scan.verdict + '</span>' });
      lines.push({ delay: 80, html: '<span class="t-separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>' });
      lines.push({ delay: 300, html: '' });
      scan.summary.forEach(function(s) {
        lines.push({ delay: 150, html: '<span class="t-dim">→</span> ' + s });
      });
      return lines;
    }

    function runScan() {
      var scan = scans[scanIndex % scans.length];
      scanIndex++;

      // Clear body
      body.innerHTML = '<div class="terminal-line"><span class="t-prompt">$</span> <span class="t-cmd">npx webmcp-scanner</span> <span class="t-url">' + scan.url + '</span></div>';

      // Remove old stats bar
      var oldStats = terminal.querySelector('.terminal-stats');
      if (oldStats) oldStats.remove();

      var lines = buildLines(scan);
      var i = 0;

      function scrollToBottom() {
        body.scrollTop = body.scrollHeight;
      }

      function addLine() {
        if (i >= lines.length) {
          // Cursor
          var cursor = document.createElement('div');
          cursor.className = 'terminal-line';
          cursor.innerHTML = '<span class="t-prompt">$</span> <span class="t-cursor"></span>';
          body.appendChild(cursor);
          scrollToBottom();
          // Stats bar
          var stats = document.createElement('div');
          stats.className = 'terminal-stats';
          stats.innerHTML = '<span>7 categories · 5 protocols</span><span class="stat-highlight">Scanned in ' + scan.time + '</span>';
          terminal.appendChild(stats);
          // Wait then loop
          animationTimer = setTimeout(runScan, 4000);
          return;
        }
        var line = lines[i];
        var el = document.createElement('div');
        el.className = 'terminal-line';
        el.innerHTML = line.html || '&nbsp;';
        body.appendChild(el);
        scrollToBottom();
        i++;
        animationTimer = setTimeout(addLine, line.delay);
      }

      animationTimer = setTimeout(addLine, 800);
    }

    // Start after hero entrance
    animationTimer = setTimeout(runScan, 1200);
  }

  // === Scroll Reveal ===
  function initScrollReveal() {
    var revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
    if (!revealEls.length || !('IntersectionObserver' in window)) return;
    // Activate reveal system — without this class, content stays visible
    document.body.classList.add('js-reveal');
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });
    revealEls.forEach(function(el) { observer.observe(el); });
  }

  // === Animated counters ===
  function initCounters() {
    var counters = document.querySelectorAll('.trust-counter-value[data-target]');
    if (!counters.length || !('IntersectionObserver' in window)) return;
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        var target = parseInt(el.dataset.target, 10);
        var duration = target > 100 ? 2000 : 1200;
        var start = 0;
        var startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var progress = Math.min((ts - startTime) / duration, 1);
          var eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
          el.textContent = Math.round(eased * target).toLocaleString() + (target > 100 ? '+' : '');
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        observer.unobserve(el);
      });
    }, { threshold: 0.5 });
    counters.forEach(function(el) { observer.observe(el); });
  }

  // === Hero particles ===
  function initParticles() {
    var container = document.querySelector('.hero');
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var particlesDiv = document.createElement('div');
    particlesDiv.className = 'hero-particles';
    container.insertBefore(particlesDiv, container.firstChild);
    for (var i = 0; i < 12; i++) {
      var p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (6 + Math.random() * 8) + 's';
      p.style.animationDelay = (Math.random() * 10) + 's';
      p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
      particlesDiv.appendChild(p);
    }
  }

  // === Start ===
  document.addEventListener('DOMContentLoaded', function() {
    init();
    initCounters();
    initParticles();
  });
})();
