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

    // Render all tabs
    renderCategoryScores();
    renderIssues();
    renderForms();
    renderCode();
    renderAgentView();
    renderReport();
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
      <img src="https://img.shields.io/badge/CrawlAudit-Score_${score}%2F100-10b981?style=for-the-badge" alt="Agent-Ready Badge" style="height:28px">
    </div>
    <div style="font-size:13px;color:#475569;margin-bottom:8px">Add this badge to your site:</div>
    <pre style="background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;text-align:left">&lt;a href="https://crawlaudit.dev"&gt;&lt;img src="https://img.shields.io/badge/CrawlAudit-Score_${score}%2F100-10b981?style=for-the-badge" alt="Agent-Ready Badge"&gt;&lt;/a&gt;</pre>
  </div>
  ` : `
  <div style="margin:24px 0;padding:20px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;text-align:center">
    <div style="font-size:16px;font-weight:700;color:#92400e;margin-bottom:12px">&#128679; Work in Progress</div>
    <div style="margin-bottom:16px">
      <img src="https://img.shields.io/badge/CrawlAudit-Score_${score}%2F100-f59e0b?style=for-the-badge" alt="Work in Progress Badge" style="height:28px">
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

  // === Start ===
  document.addEventListener('DOMContentLoaded', init);
})();
