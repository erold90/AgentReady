/**
 * report.js — Full site report renderer
 * Reads scan data from chrome.storage.local, renders full report page
 */
(function() {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const FREE_LIMIT = 3;
  let reportData = null;

  document.addEventListener('DOMContentLoaded', async () => {
    $('#btn-download').addEventListener('click', downloadReport);

    try {
      const result = await chrome.storage.local.get('agentready_report');
      const data = result.agentready_report;

      if (!data) {
        showError('No report data found. Run a Full Site Scan from the extension first.');
        return;
      }

      reportData = data;
      hideLoading();
      renderReport(data);

    } catch (err) {
      showError('Failed to load report: ' + (err.message || 'Unknown error'));
    }
  });

  function showError(msg) {
    $('#loading').style.display = 'none';
    const el = $('#error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  function hideLoading() {
    $('#loading').style.display = 'none';
    $('#report').style.display = 'block';
  }

  function getScoreColor(score) {
    if (score >= 80) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === Render ===
  function renderReport(data) {
    // Domain
    let domain = '';
    if (data.pages && data.pages.length > 0) {
      try { domain = new URL(data.pages[0].url).hostname; } catch {}
    }
    $('#r-domain').textContent = domain;

    // Score ring
    const color = getScoreColor(data.avgScore);
    const circumference = 2 * Math.PI * 45;
    const offset = circumference - (data.avgScore / 100) * circumference;
    const ring = $('#r-ring');
    ring.style.stroke = color;
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);

    const scoreEl = $('#r-score');
    scoreEl.textContent = data.avgScore;
    scoreEl.style.color = color;

    // Stats
    const avgEl = $('#r-avg');
    avgEl.textContent = data.avgScore;
    avgEl.style.color = color;

    $('#r-pages').textContent = data.totalPages;
    $('#r-forms').textContent = data.totalForms;

    const issuesEl = $('#r-issues');
    issuesEl.textContent = data.totalIssues;
    issuesEl.style.color = data.totalIssues > 0 ? '#ef4444' : '#10b981';

    $('#r-pages-sub').textContent = `Sorted by score (worst first)`;

    // Adjust title for single page
    if (data.type === 'singlescan') {
      $('.summary-title').textContent = 'Page Scan Report';
      $('.pages-title span:first-child').textContent = 'Page Detail';
    }

    // Pages
    renderPages(data.pages, data.type);

    // Timestamp
    $('#r-timestamp').textContent = `Report generated on ${new Date().toLocaleString()} by AgentReady`;
  }

  function renderPages(pages, type) {
    const container = $('#r-page-list');
    container.innerHTML = '';

    pages.forEach((page, i) => {
      const color = getScoreColor(page.score);
      const isLocked = page.locked || i >= FREE_LIMIT;

      let shortUrl = page.url;
      try {
        const u = new URL(page.url);
        shortUrl = u.pathname + u.search || '/';
      } catch {}

      const row = document.createElement('div');
      row.className = 'page-row' + (isLocked ? ' locked' : '');
      row.innerHTML = `
        <div class="page-score" style="background:${color}">${page.score}</div>
        <div class="page-info">
          <div class="page-url" title="${esc(page.url)}">${esc(shortUrl)}</div>
          <div class="page-meta">
            <span>${page.formCount} form${page.formCount !== 1 ? 's' : ''}</span>
            <span>${page.webmcpCount} WebMCP</span>
            <span>${page.issueCount} issue${page.issueCount !== 1 ? 's' : ''}</span>
            ${page.error ? '<span style="color:#ef4444">Error</span>' : ''}
          </div>
        </div>
        ${isLocked
          ? '<div class="page-lock"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
          : '<div class="page-arrow">&#8250;</div>'
        }
      `;

      if (!isLocked && !page.error && page.analysis) {
        row.addEventListener('click', () => showDetail(page));
      }

      container.appendChild(row);
    });

    // Pro overlay (only for full site scans with more than FREE_LIMIT pages)
    if (type !== 'singlescan' && pages.length > FREE_LIMIT) {
      $('#r-pro-overlay').style.display = 'block';
    }

    // For single page, auto-expand the detail
    if (type === 'singlescan' && pages.length === 1 && pages[0].analysis) {
      showDetail(pages[0]);
    }
  }

  function showDetail(page) {
    const detail = $('#r-detail');
    detail.style.display = 'block';
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const analysis = page.analysis;
    const color = getScoreColor(page.score);

    let shortUrl = page.url;
    try { const u = new URL(page.url); shortUrl = u.pathname + u.search || '/'; } catch {}

    let html = '';
    html += `<div class="detail-header">`;
    html += `  <button class="detail-back" id="detail-back-btn">&larr; Back to pages</button>`;
    html += `  <div class="detail-score" style="color:${color}">${page.score}</div>`;
    html += `</div>`;
    html += `<div class="detail-url">${esc(page.url)}</div>`;

    // Categories
    if (analysis && analysis.categories) {
      html += '<div class="detail-section-title">Categories</div>';
      for (const [key, cat] of Object.entries(analysis.categories)) {
        const cc = getScoreColor(cat.score);
        html += `<div class="cat-card">`;
        html += `  <div class="cat-bar-wrap">`;
        html += `    <div class="cat-name">${esc(cat.label)}</div>`;
        html += `    <div class="cat-bar"><div class="cat-bar-fill" style="width:${cat.score}%;background:${cc}"></div></div>`;
        html += `    <div class="cat-detail">${esc(cat.detail)}</div>`;
        html += `  </div>`;
        html += `  <div class="cat-score" style="color:${cc}">${cat.score}</div>`;
        html += `</div>`;
      }
    }

    // Issues
    if (analysis && analysis.issues && analysis.issues.length > 0) {
      const icons = { error: '!', warning: '!', success: '\u2713', info: 'i' };
      html += '<div class="detail-section-title">Issues & Suggestions</div>';
      analysis.issues.forEach(issue => {
        html += `<div class="issue">`;
        html += `  <div class="issue-badge ${issue.type}">${icons[issue.type]}</div>`;
        html += `  <div class="issue-body">`;
        html += `    <div class="issue-title">${esc(issue.title)}</div>`;
        html += `    <div class="issue-text">${esc(issue.text)}</div>`;
        html += `  </div>`;
        html += `</div>`;
      });
    }

    // Forms
    if (page.forms && page.forms.length > 0) {
      html += '<div class="detail-section-title">Forms</div>';
      page.forms.forEach(form => {
        const name = form.toolname || form.name || form.id || 'Form';
        html += `<div class="form-card">`;
        html += `  <div class="form-header">`;
        html += `    <span class="form-name">${esc(name)}</span>`;
        html += `    <span class="form-badge ${form.hasWebMCP ? 'ready' : 'not-ready'}">${form.hasWebMCP ? 'WebMCP' : 'No WebMCP'}</span>`;
        html += `  </div>`;
        if (form.fields && form.fields.length > 0) {
          html += `<div class="form-fields">`;
          form.fields.forEach(f => {
            html += `<div class="form-field">`;
            html += `  <span class="ff-name">${esc(f.name || f.id || '(no name)')}</span>`;
            html += `  <span class="ff-type">${f.type}${f.required ? ' *' : ''}</span>`;
            html += `</div>`;
          });
          html += `</div>`;
        }
        html += `</div>`;
      });
    } else {
      html += '<div class="detail-section-title">Forms</div>';
      html += '<div class="empty-state">No forms detected on this page.</div>';
    }

    detail.innerHTML = html;

    // Back button
    detail.querySelector('#detail-back-btn').addEventListener('click', () => {
      detail.style.display = 'none';
    });
  }

  // === Download ===
  function downloadReport() {
    if (!reportData) return;

    const color = getScoreColor(reportData.avgScore);
    let domain = '';
    if (reportData.pages && reportData.pages.length > 0) {
      try { domain = new URL(reportData.pages[0].url).hostname; } catch {}
    }

    let html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>AgentReady Report — ${domain}</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 24px; color: #0f172a; }
  h1 { font-size: 24px; margin-bottom: 4px; }
  .domain { color: #475569; font-size: 14px; margin-bottom: 24px; }
  .score { font-size: 64px; font-weight: 800; color: ${color}; }
  .stats { display: flex; gap: 24px; margin: 24px 0; font-size: 14px; }
  .stats span { color: #475569; }
  .stats strong { color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  th { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; }
  .footer { margin-top: 48px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 16px; }
</style></head><body>
<h1>Full Site Scan Report</h1>
<div class="domain">${domain}</div>
<div class="score">${reportData.avgScore}/100</div>
<div class="stats">
  <span><strong>${reportData.totalPages}</strong> pages</span>
  <span><strong>${reportData.totalForms}</strong> forms</span>
  <span><strong>${reportData.totalIssues}</strong> issues</span>
</div>
<h2>Pages</h2>
<table>
<tr><th>Score</th><th>Page</th><th>Forms</th><th>WebMCP</th><th>Issues</th></tr>`;

    reportData.pages.forEach(p => {
      let shortUrl = p.url;
      try { shortUrl = new URL(p.url).pathname || '/'; } catch {}
      const sc = getScoreColor(p.score);
      html += `<tr>
  <td style="font-weight:700;color:${sc}">${p.score}</td>
  <td>${shortUrl}</td>
  <td>${p.formCount}</td>
  <td>${p.webmcpCount}</td>
  <td>${p.issueCount}</td>
</tr>`;
    });

    html += `</table>`;

    // Detail for free pages
    reportData.pages.forEach((p, i) => {
      if (i >= FREE_LIMIT || p.locked || !p.analysis) return;
      let shortUrl = p.url;
      try { shortUrl = new URL(p.url).pathname || '/'; } catch {}

      html += `<h3 style="margin-top:32px;">${shortUrl} — ${p.score}/100</h3>`;

      if (p.analysis.categories) {
        html += '<table><tr><th>Category</th><th>Score</th><th>Detail</th></tr>';
        Object.values(p.analysis.categories).forEach(cat => {
          const cc = getScoreColor(cat.score);
          html += `<tr><td>${cat.label}</td><td style="font-weight:600;color:${cc}">${cat.score}</td><td style="color:#475569">${cat.detail}</td></tr>`;
        });
        html += '</table>';
      }

      if (p.analysis.issues) {
        p.analysis.issues.forEach(issue => {
          const bg = issue.type === 'error' ? '#fee2e2' : issue.type === 'warning' ? '#fef3c7' : issue.type === 'success' ? '#d1fae5' : '#dbeafe';
          html += `<div style="padding:8px 12px;margin:4px 0;border-radius:6px;background:${bg};font-size:13px;"><strong>${issue.title}</strong> — ${issue.text}</div>`;
        });
      }
    });

    if (reportData.pages.length > FREE_LIMIT) {
      html += `<div style="text-align:center;padding:24px;margin-top:24px;background:#f8fafc;border-radius:8px;color:#475569;">
        <p style="font-size:16px;font-weight:600;">+ ${reportData.pages.length - FREE_LIMIT} more pages</p>
        <p>Upgrade to Pro to see detailed analysis for all pages.</p>
      </div>`;
    }

    html += `<div class="footer">Generated by AgentReady | ${new Date().toISOString()}</div></body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentready-report-${domain}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
})();
