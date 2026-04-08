/**
 * license.js — CLI license validation via LemonSqueezy API
 */

const LEMON_VALIDATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/validate';

const VARIANT_TO_PLAN = {
  'pro': 'pro',
  'team': 'team',
  'professional': 'pro',
  'business': 'team',
  'enterprise': 'team'
};

/**
 * Validate a license key against LemonSqueezy API
 * @param {string} key
 * @returns {Promise<{valid: boolean, plan: string, error?: string}>}
 */
async function validate(key) {
  if (!key || key.trim().length < 10) {
    return { valid: false, plan: 'free' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const resp = await fetch(LEMON_VALIDATE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ license_key: key.trim() })
    });

    if (!resp.ok) {
      return { valid: false, plan: 'free', error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    if (!data.valid) {
      return { valid: false, plan: 'free', error: data.error || 'Invalid or expired key' };
    }

    const variantName = (data.meta?.variant_name || '').toLowerCase();
    const productName = (data.meta?.product_name || '').toLowerCase();
    let plan = 'pro';

    for (const [pattern, planName] of Object.entries(VARIANT_TO_PLAN)) {
      if (variantName.includes(pattern) || productName.includes(pattern)) {
        plan = planName;
        break;
      }
    }

    return { valid: true, plan };
  } catch (err) {
    return { valid: false, plan: 'free', error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { validate };
