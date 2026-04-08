/**
 * license.js — License key validation via LemonSqueezy API
 * Validates license keys and determines the user's plan (free/pro/team)
 */
const License = (() => {
  'use strict';

  const LEMON_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';
  const STORAGE_KEY = 'agentready_license';

  // Product variant names → plan mapping (configure after creating products on LemonSqueezy)
  // These will be matched against the variant name from the license response
  const VARIANT_TO_PLAN = {
    'pro': 'pro',
    'team': 'team',
    // Fallback patterns
    'professional': 'pro',
    'business': 'team',
    'enterprise': 'team'
  };

  /**
   * Validate a license key against LemonSqueezy API
   * @param {string} key - The license key to validate
   * @returns {Promise<{valid: boolean, plan: string, error?: string, meta?: object}>}
   */
  async function validate(key) {
    if (!key || key.trim().length < 10) {
      return { valid: false, plan: 'free', error: 'Invalid key format' };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(LEMON_VALIDATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ license_key: key.trim() }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        return { valid: false, plan: 'free', error: `Validation failed (HTTP ${resp.status})` };
      }

      const data = await resp.json();

      if (!data.valid) {
        return { valid: false, plan: 'free', error: data.error || 'Invalid or expired license key' };
      }

      // Determine plan from variant name or product name
      const variantName = (data.meta?.variant_name || '').toLowerCase();
      const productName = (data.meta?.product_name || '').toLowerCase();
      let plan = 'pro'; // Default to pro for any valid license

      for (const [pattern, planName] of Object.entries(VARIANT_TO_PLAN)) {
        if (variantName.includes(pattern) || productName.includes(pattern)) {
          plan = planName;
          break;
        }
      }

      return {
        valid: true,
        plan,
        meta: {
          customerEmail: data.meta?.customer_email || '',
          customerName: data.meta?.customer_name || '',
          variantName: data.meta?.variant_name || '',
          productName: data.meta?.product_name || '',
          status: data.license_key?.status || 'active'
        }
      };
    } catch (err) {
      return { valid: false, plan: 'free', error: 'Network error: ' + err.message };
    }
  }

  /**
   * Save license data to chrome.storage
   */
  async function save(key, validationResult) {
    const data = {
      key: key.trim(),
      plan: validationResult.plan,
      valid: validationResult.valid,
      meta: validationResult.meta || {},
      activatedAt: new Date().toISOString()
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
    return data;
  }

  /**
   * Load saved license from chrome.storage
   * @returns {Promise<{key: string, plan: string, valid: boolean, meta: object} | null>}
   */
  async function load() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return result[STORAGE_KEY] || null;
    } catch {
      return null;
    }
  }

  /**
   * Remove saved license (downgrade to free)
   */
  async function remove() {
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  /**
   * Re-validate saved license (call periodically or on extension open)
   * @returns {Promise<{valid: boolean, plan: string}>}
   */
  async function revalidate() {
    const saved = await load();
    if (!saved || !saved.key) return { valid: false, plan: 'free' };

    const result = await validate(saved.key);
    if (result.valid) {
      await save(saved.key, result);
      return { valid: true, plan: result.plan };
    } else {
      // License no longer valid — downgrade
      await remove();
      return { valid: false, plan: 'free' };
    }
  }

  return { validate, save, load, remove, revalidate };
})();
