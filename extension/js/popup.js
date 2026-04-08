/**
 * popup.js — Extension popup UI controller
 */
(function() {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  let currentScan = null;
  let currentAnalysis = null;

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

      // Inject content script and get result directly
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/content.js']
      });

      const scanData = results?.[0]?.result;
      if (scanData && scanData.url) {
        currentScan = scanData;
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
    hideLoading();
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
