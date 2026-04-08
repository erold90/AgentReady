/**
 * background.js — Service worker that coordinates content script injection and analysis
 */

let lastScanData = null;

// Listen for scan results from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'scan-result') {
    lastScanData = msg.data;
    // Update badge with score
    try {
      // Import analyzer dynamically not possible in SW, so just store data
      // Analysis happens in popup
      chrome.action.setBadgeText({ text: '!', tabId: sender.tab?.id });
      chrome.action.setBadgeBackgroundColor({ color: '#10b981', tabId: sender.tab?.id });
    } catch(e) {}
  }
  if (msg.type === 'get-scan') {
    sendResponse(lastScanData);
    return true;
  }
});

// When user clicks the extension icon, inject content script into active tab
chrome.action.onClicked.addListener(async (tab) => {
  // This is a fallback — popup.html handles the main flow
});

// Listen for popup requesting a scan
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'run-scan') {
    lastScanData = null;
    chrome.scripting.executeScript({
      target: { tabId: msg.tabId },
      files: ['js/content.js']
    }).then(() => {
      // Content script will send results via message
      sendResponse({ status: 'injected' });
    }).catch(err => {
      sendResponse({ status: 'error', error: err.message });
    });
    return true; // async response
  }

  // Proxy fetch requests from popup (service worker has host_permissions)
  if (msg.type === 'proxy-fetch') {
    fetch(msg.url, {
      headers: msg.headers || { 'Accept': 'text/html, application/xml, text/xml, text/plain' }
    })
      .then(async resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        sendResponse({ success: true, text, status: resp.status });
      })
      .catch(err => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }
});
