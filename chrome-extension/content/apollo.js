// Leadbeam Caller Intel — Apollo.io Content Script
// Detects contact pages and injects the "Get Intel" button

(function () {
  "use strict";

  // ── Detect if we're on a contact page ─────────────────────────
  function isContactPage(url) {
    // Apollo contact pages: /people/... or #/people/...
    return /app\.apollo\.io\/.*(#\/)?people\//.test(url) ||
           /app\.apollo\.io\/.*contacts\//.test(url);
  }

  // ── Scrape contact data from Apollo DOM ───────────────────────
  async function scrapeContact() {
    let name = "";
    let title = "";
    let company = "";

    // Strategy 1: data-testid attributes
    const nameEl =
      document.querySelector('[data-testid="contact-name"]') ||
      document.querySelector('[data-testid="person-name"]');
    if (nameEl) name = nameEl.textContent.trim();

    const titleEl =
      document.querySelector('[data-testid="contact-title"]') ||
      document.querySelector('[data-testid="person-title"]');
    if (titleEl) title = titleEl.textContent.trim();

    const companyEl =
      document.querySelector('[data-testid="contact-company"]') ||
      document.querySelector('[data-testid="person-company"]');
    if (companyEl) company = companyEl.textContent.trim();

    // Strategy 2: Common Apollo class-based selectors
    if (!name) {
      const h1 = await waitForElement("h1", 5000);
      if (h1) name = h1.textContent.trim();
    }

    if (!title) {
      // Apollo often shows title in a span/div near the name
      const titleCandidates = document.querySelectorAll(
        '.zp_xQPr0, [class*="title"], [class*="Title"], [class*="headline"]'
      );
      for (const el of titleCandidates) {
        const txt = el.textContent.trim();
        if (txt && txt.length < 100 && txt !== name) {
          title = txt;
          break;
        }
      }
    }

    if (!company) {
      // Company name often appears as a link near the title
      const compCandidates = document.querySelectorAll(
        'a[href*="/accounts/"], a[href*="/companies/"], [class*="company"], [class*="Company"]'
      );
      for (const el of compCandidates) {
        const txt = el.textContent.trim();
        if (txt && txt.length < 80) {
          company = txt;
          break;
        }
      }
    }

    // Strategy 3: Parse document.title as last resort
    // Apollo titles often look like: "John Smith - Acme Corp | Apollo"
    if (!name || !company) {
      const docTitle = document.title;
      const match = docTitle.match(/^(.+?)\s*[-–—]\s*(.+?)\s*\|/);
      if (match) {
        if (!name) name = match[1].trim();
        if (!company) company = match[2].trim();
      }
    }

    const role = mapTitleToRole(title);

    return { name, title, company, role };
  }

  // ── Find an anchor element for button injection ───────────────
  async function findAnchor() {
    // Try to find the contact name heading
    const nameEl =
      document.querySelector('[data-testid="contact-name"]') ||
      document.querySelector('[data-testid="person-name"]');
    if (nameEl) return nameEl;

    const h1 = await waitForElement("h1", 5000);
    return h1;
  }

  // ── Main: inject button on contact pages ──────────────────────
  async function tryInject() {
    // Remove old button if navigating away from contact page
    if (!isContactPage(location.href)) {
      const existing = document.querySelector(".leadbeam-intel-btn");
      if (existing) existing.remove();
      return;
    }

    // Wait a beat for SPA to render
    await new Promise((r) => setTimeout(r, 1500));

    const anchor = await findAnchor();
    if (!anchor) return;

    // Don't re-inject if button already exists
    if (document.querySelector(".leadbeam-intel-btn")) return;

    const contact = await scrapeContact();
    injectIntelButton(anchor, contact);
  }

  // ── Expose scraper for on-demand scraping from side panel ────
  window.__leadbeamScrape = scrapeContact;

  // ── Listen for URL changes (SPA navigation) ──────────────────
  onUrlChange(() => {
    // Debounce slightly to let the page render
    setTimeout(tryInject, 500);
  });
})();
