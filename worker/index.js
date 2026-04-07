/**
 * AgentReady CORS Proxy — Cloudflare Worker
 *
 * Deploy:
 *   npx wrangler deploy worker/index.js --name agentready-proxy
 *
 * Usage:
 *   GET https://agentready-proxy.<account>.workers.dev/?url=https://example.com
 */

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    if (!target) {
      return jsonResponse({ error: 'Missing ?url= parameter' }, 400);
    }

    // Validate target URL
    let parsedTarget;
    try {
      parsedTarget = new URL(target);
    } catch {
      return jsonResponse({ error: 'Invalid URL' }, 400);
    }

    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      return jsonResponse({ error: 'Only HTTP/HTTPS URLs supported' }, 400);
    }

    // Block internal/private IPs
    const hostname = parsedTarget.hostname;
    if (hostname === 'localhost' || hostname.startsWith('127.') ||
        hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
        hostname.startsWith('172.16.')) {
      return jsonResponse({ error: 'Private addresses not allowed' }, 403);
    }

    try {
      const response = await fetch(target, {
        headers: {
          'User-Agent': 'AgentReady Scanner/1.0 (+https://erold90.github.io/AgentReady)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        cf: { cacheTtl: 300 }
      });

      const html = await response.text();

      return new Response(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'X-Proxy-Status': response.status.toString(),
          'Cache-Control': 'public, max-age=300'
        }
      });
    } catch (err) {
      return jsonResponse({ error: `Fetch failed: ${err.message}` }, 502);
    }
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
