// Leadbeam Caller Intel — HubSpot Content Script
// Detects contact pages and injects the "Get Intel" button

(function () {
  "use strict";

  // ── Detect if we're on a contact page ─────────────────────────
  function isContactPage(url) {
    // HubSpot contact URLs:
    //   /contacts/{portalId}/contact/{contactId}
    //   /contacts/{portalId}/record/0-1/{contactId}
    return /app\.hubspot\.com\/contacts\/\d+\/(contact|record\/0-1)\/\d+/.test(url);
  }

  // ── Parse "Title at Company" subtitle text ────────────────────
  function parseTitleAtCompany(text) {
    if (!text) return { title: "", company: "" };
    // Match "Vice President of Sales at VSC Fire & Security, Inc."
    const match = text.match(/^(.+?)\s+at\s+(.+)$/i);
    if (match) {
      return { title: match[1].trim(), company: match[2].trim() };
    }
    return { title: text.trim(), company: "" };
  }

  // ── Scrape contact data from HubSpot DOM ──────────────────────
  async function scrapeContact() {
    let name = "";
    let title = "";
    let company = "";

    // Strategy 1: Heading element — contact name is the prominent h1
    const h1 = await waitForElement("h1", 5000);
    if (h1) name = h1.textContent.trim();

    // Strategy 2: Subtitle below the name — "Title at Company"
    // HubSpot nests this in various wrapper depths, so walk up several
    // levels from the h1 and scan all child text elements.
    if (h1) {
      // Build a list of containers to search, from narrow to broad
      const containers = [
        h1.parentElement,
        h1.parentElement?.parentElement,
        h1.parentElement?.parentElement?.parentElement,
        h1.closest('[class*="header"]'),
        h1.closest('[class*="profile"]'),
        h1.closest('[class*="summary"]'),
      ].filter(Boolean);

      // De-duplicate
      const seen = new Set();
      const uniqueContainers = containers.filter((c) => {
        if (seen.has(c)) return false;
        seen.add(c);
        return true;
      });

      for (const container of uniqueContainers) {
        if (title && company) break;
        const els = container.querySelectorAll("span, div, p, h2, h3, a");
        for (const el of els) {
          // Skip the name element itself
          if (el === h1 || el.contains(h1) || h1.contains(el)) continue;
          // Skip elements with too many children (containers, not leaf text)
          if (el.children.length > 3) continue;

          const txt = el.textContent.trim();
          if (!txt || txt === name || txt.length > 200 || txt.length < 5) continue;

          // Check for "Title at Company" pattern
          if (txt.toLowerCase().includes(" at ")) {
            const parsed = parseTitleAtCompany(txt);
            if (!title && parsed.title) title = parsed.title;
            if (!company && parsed.company) company = parsed.company;
            break;
          }
        }
      }
    }

    // Strategy 3: "About this contact" property labels
    const labels = document.querySelectorAll(
      '[data-test-id="property-label"], .private-property-label, [class*="PropertyLabel"], label'
    );
    for (const label of labels) {
      const labelText = label.textContent.trim().toLowerCase();
      const valueEl =
        label.nextElementSibling ||
        label.parentElement?.querySelector('input, span[class*="value"], [data-test-id="property-value"]');

      if (!valueEl) continue;
      const value = (valueEl.value || valueEl.textContent || "").trim();
      if (!value) continue;

      if (!title && (labelText.includes("job title") || labelText === "title")) {
        title = value;
      }
      if (!company && (labelText.includes("company") || labelText.includes("company name"))) {
        company = value;
      }
    }

    // Strategy 4: Companies sidebar card — links to associated company records
    if (!company) {
      // Look for company association links in the right sidebar
      const companyLinks = document.querySelectorAll(
        'a[href*="/company/"], a[href*="/record/0-2/"], [data-test-id="association-company"] a'
      );
      for (const el of companyLinks) {
        const txt = el.textContent.trim();
        if (txt && txt.length > 1 && txt.length < 100) {
          company = txt;
          break;
        }
      }
    }

    // Strategy 5: Any element with company-related classes
    if (!company) {
      const companyCandidates = document.querySelectorAll(
        '[class*="company" i], [data-test-id*="company"]'
      );
      for (const el of companyCandidates) {
        const txt = el.textContent.trim();
        if (txt && txt.length > 1 && txt.length < 80 && txt !== name) {
          company = txt;
          break;
        }
      }
    }

    // Strategy 6: Parse document.title — "Tim Spink | Contacts | HubSpot"
    if (!name) {
      const match = document.title.match(/^(.+?)\s*\|/);
      if (match) name = match[1].trim();
    }

    // Strategy 7: If title still empty, do a broad page scan for role-like text
    // Look for any visible text that contains role keywords near the top of the page
    if (!title) {
      const allEls = document.querySelectorAll("span, div, p");
      const roleKeywords = /vice president|vp |chief revenue|cro |sales manager|sales enablement|head of sales|director.*sales|svp |evp /i;
      for (const el of allEls) {
        if (el.children.length > 2) continue;
        const txt = el.textContent.trim();
        if (!txt || txt === name || txt.length > 200 || txt.length < 5) continue;
        if (roleKeywords.test(txt)) {
          // Parse out "at Company" if present
          if (txt.toLowerCase().includes(" at ")) {
            const parsed = parseTitleAtCompany(txt);
            title = parsed.title;
            if (!company && parsed.company) company = parsed.company;
          } else {
            title = txt;
          }
          break;
        }
      }
    }

    const role = mapTitleToRole(title);

    return { name, title, company, role };
  }

  // ── Find an anchor element for button injection ───────────────
  async function findAnchor() {
    const h1 = await waitForElement("h1", 5000);
    return h1;
  }

  // ── Main: inject button on contact pages ──────────────────────
  async function tryInject() {
    if (!isContactPage(location.href)) {
      const existing = document.querySelector(".leadbeam-intel-btn");
      if (existing) existing.remove();
      return;
    }

    await new Promise((r) => setTimeout(r, 1500));

    const anchor = await findAnchor();
    if (!anchor) return;

    if (document.querySelector(".leadbeam-intel-btn")) return;

    const contact = await scrapeContact();
    injectIntelButton(anchor, contact);
  }

  // ── Expose scraper for on-demand scraping from side panel ────
  window.__leadbeamScrape = scrapeContact;

  // ── Listen for URL changes (SPA navigation) ──────────────────
  onUrlChange(() => {
    setTimeout(tryInject, 500);
  });
})();
