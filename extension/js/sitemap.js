/**
 * sitemap.js — Sitemap discovery and parsing module
 * Tries /sitemap.xml, /sitemap_index.xml, then robots.txt Sitemap: directives
 * Returns array of page URLs (max 500)
 */
const SitemapDiscovery = (() => {
  'use strict';

  const MAX_URLS = 500;

  /**
   * Discover and return page URLs from sitemaps
   * @param {string} baseUrl - The website origin (e.g. https://example.com)
   * @returns {Promise<string[]>} Array of discovered URLs
   */
  async function discover(baseUrl) {
    const origin = new URL(baseUrl).origin;
    const urls = new Set();

    // Strategy 1: /sitemap.xml
    try {
      const found = await fetchAndParseSitemap(origin + '/sitemap.xml');
      found.forEach(u => urls.add(u));
    } catch (e) { /* ignore */ }

    // Strategy 2: /sitemap_index.xml (if first didn't yield results)
    if (urls.size === 0) {
      try {
        const found = await fetchAndParseSitemap(origin + '/sitemap_index.xml');
        found.forEach(u => urls.add(u));
      } catch (e) { /* ignore */ }
    }

    // Strategy 3: Parse robots.txt for Sitemap: directives
    if (urls.size === 0) {
      try {
        const robotsUrls = await parseSitemapsFromRobots(origin + '/robots.txt');
        for (const sitemapUrl of robotsUrls) {
          if (urls.size >= MAX_URLS) break;
          try {
            const found = await fetchAndParseSitemap(sitemapUrl);
            found.forEach(u => urls.add(u));
          } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }
    }

    // Filter to same origin and limit
    const result = [...urls]
      .filter(u => {
        try { return new URL(u).origin === origin; } catch { return false; }
      })
      .slice(0, MAX_URLS);

    return result;
  }

  /**
   * Fetch a sitemap URL and parse it
   * Handles both sitemap index files and regular sitemaps
   * Also handles plain text sitemaps (one URL per line)
   */
  async function fetchAndParseSitemap(url) {
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/xml, text/xml, text/plain' }
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const text = await resp.text();
    const urls = [];

    // Check if it looks like XML
    if (text.trim().startsWith('<?xml') || text.trim().startsWith('<')) {
      return parseXmlSitemap(text, url);
    }

    // Plain text sitemap: one URL per line
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
        urls.push(trimmed);
        if (urls.length >= MAX_URLS) break;
      }
    }

    return urls;
  }

  /**
   * Parse XML sitemap content
   * Handles <sitemapindex> (fetches sub-sitemaps) and <urlset>
   */
  async function parseXmlSitemap(xmlText, sourceUrl) {
    const urls = [];

    // Use regex parsing since DOMParser may not be available everywhere
    // Check for sitemap index
    const sitemapLocMatches = xmlText.matchAll(/<sitemap[^>]*>[\s\S]*?<loc[^>]*>\s*(.*?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi);
    const subSitemaps = [];
    for (const m of sitemapLocMatches) {
      subSitemaps.push(m[1].trim());
    }

    if (subSitemaps.length > 0) {
      // It's a sitemap index — fetch each sub-sitemap
      for (const subUrl of subSitemaps) {
        if (urls.length >= MAX_URLS) break;
        try {
          const subUrls = await fetchAndParseSitemap(subUrl);
          subUrls.forEach(u => urls.push(u));
        } catch (e) { /* skip broken sub-sitemaps */ }
      }
      return urls.slice(0, MAX_URLS);
    }

    // Regular urlset
    const locMatches = xmlText.matchAll(/<url[^>]*>[\s\S]*?<loc[^>]*>\s*(.*?)\s*<\/loc>[\s\S]*?<\/url>/gi);
    for (const m of locMatches) {
      const u = m[1].trim();
      if (u.startsWith('http://') || u.startsWith('https://')) {
        urls.push(u);
        if (urls.length >= MAX_URLS) break;
      }
    }

    return urls;
  }

  /**
   * Parse robots.txt for Sitemap: directives
   */
  async function parseSitemapsFromRobots(robotsUrl) {
    const resp = await fetch(robotsUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const sitemapUrls = [];

    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*Sitemap\s*:\s*(.+)/i);
      if (match) {
        const url = match[1].trim();
        if (url.startsWith('http://') || url.startsWith('https://')) {
          sitemapUrls.push(url);
        }
      }
    }

    return sitemapUrls;
  }

  return { discover };
})();
