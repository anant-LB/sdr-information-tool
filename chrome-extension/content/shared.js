// Leadbeam Caller Intel — Shared Content Script Utilities
// Used by both apollo.js and hubspot.js

/**
 * Wait for a DOM element to appear, with timeout.
 * @param {string} selector - CSS selector
 * @param {number} timeout - Max wait in ms (default 10s)
 * @returns {Promise<Element|null>}
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Watch for SPA URL changes and fire a callback.
 * Handles pushState, replaceState, and popstate.
 * @param {Function} callback - called with new URL string
 */
function onUrlChange(callback) {
  let lastUrl = location.href;

  // Patch pushState / replaceState
  const origPush = history.pushState;
  const origReplace = history.replaceState;

  history.pushState = function (...args) {
    origPush.apply(this, args);
    handleChange();
  };

  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    handleChange();
  };

  window.addEventListener("popstate", handleChange);

  // Also use MutationObserver as a fallback for SPAs that update
  // the URL via other mechanisms
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) handleChange();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function handleChange() {
    const newUrl = location.href;
    if (newUrl !== lastUrl) {
      lastUrl = newUrl;
      callback(newUrl);
    }
  }

  // Fire immediately for current page
  callback(lastUrl);
}

/**
 * Map a job title string to one of our role buckets.
 * Returns the role string or null if no match.
 * @param {string} title
 * @returns {string|null}
 */
function mapTitleToRole(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  // CRO / VP of Sales
  const croPatterns = [
    /chief revenue/,
    /\bcro\b/,
    /vp.*sales/,
    /vice president.*sales/,
    /svp.*sales/,
    /evp.*sales/,
    /head of sales/,
    /director.*sales/,
    /chief sales/,
    /chief commercial/,
    /chief business/,
    /vp.*revenue/,
    /head of revenue/,
    /vp.*go.to.market/,
    /vp.*gtm/,
    /head of go.to.market/,
  ];
  if (croPatterns.some((p) => p.test(t))) return "CRO/VP of Sales";

  // Sales Enablement
  const enablementPatterns = [
    /sales enablement/,
    /revenue enablement/,
    /enablement/,
    /sales operations/,
    /revenue operations/,
    /\brevops\b/,
    /\bsales ops\b/,
    /sales training/,
    /sales effectiveness/,
    /sales productivity/,
    /go.to.market ops/,
  ];
  if (enablementPatterns.some((p) => p.test(t))) return "Sales Enablement";

  // Sales Manager
  const managerPatterns = [
    /sales manager/,
    /regional.*manager.*sales/,
    /district.*manager/,
    /area.*manager/,
    /territory.*manager/,
    /team lead.*sales/,
    /sales team lead/,
    /sales supervisor/,
    /field sales manager/,
    /inside sales manager/,
    /manager.*sales/,
  ];
  if (managerPatterns.some((p) => p.test(t))) return "Sales Manager";

  return null;
}

/**
 * Inject the "Get Intel" button near an anchor element.
 * Removes any existing button first.
 * @param {Element} anchor - The element to place the button next to
 * @param {Object} contactData - { name, title, company, role }
 */
function injectIntelButton(anchor, contactData) {
  // Remove old button if present
  const existing = document.querySelector(".leadbeam-intel-btn");
  if (existing) existing.remove();

  const btn = document.createElement("button");
  btn.className = "leadbeam-intel-btn";
  btn.textContent = "Get Intel";
  btn.title = "Open Leadbeam Caller Intel";

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({
      type: "OPEN_SIDE_PANEL",
      payload: {
        name: contactData.name || "",
        company: contactData.company || "",
        role: contactData.role || "",
      },
    });
  });

  // Insert after the anchor
  anchor.parentNode.insertBefore(btn, anchor.nextSibling);
}

// ── Listen for scrape requests from the side panel ─────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "SCRAPE_CONTACT") {
    if (typeof window.__leadbeamScrape === "function") {
      window.__leadbeamScrape().then(sendResponse);
      return true; // keep channel open for async
    }
    sendResponse({ error: "No scraper available for this page" });
  }
});
