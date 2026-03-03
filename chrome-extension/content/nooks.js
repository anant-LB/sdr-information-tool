// Leadbeam Caller Intel — Nooks.ai Content Script
// Detects dialer contact view and scrapes name/title/company

(function () {
  "use strict";

  // ── Detect if we're on a dialer page ──────────────────────────
  function isDialerPage(url) {
    return /app\.nooks\.in\/.*\/dialer/.test(url);
  }

  // ── Scrape contact data from Nooks DOM ────────────────────────
  async function scrapeContact() {
    let name = "";
    let title = "";
    let company = "";

    // Strategy 1: Contact name — large heading at top of contact panel
    const h1 = await waitForElement("h1", 5000);
    if (h1) name = h1.textContent.trim();

    // If no h1, try h2 or prominent heading-like elements
    if (!name) {
      const headings = document.querySelectorAll("h2, h3, [class*='name' i], [class*='Name']");
      for (const el of headings) {
        const txt = el.textContent.trim();
        if (txt && txt.length > 2 && txt.length < 60 && !txt.includes("•")) {
          name = txt;
          break;
        }
      }
    }

    // Strategy 2: Subtitle line — "Company • Title" format
    // This appears right below the name heading
    if (h1) {
      const containers = [
        h1.parentElement,
        h1.parentElement?.parentElement,
        h1.parentElement?.parentElement?.parentElement,
      ].filter(Boolean);

      const seen = new Set();
      for (const container of containers) {
        if (seen.has(container)) continue;
        seen.add(container);

        const els = container.querySelectorAll("span, div, p");
        for (const el of els) {
          if (el === h1 || el.contains(h1) || h1.contains(el)) continue;
          if (el.children.length > 3) continue;

          const txt = el.textContent.trim();
          // Look for "Company • Title" pattern (bullet separator)
          if (txt && txt.includes("•") && txt.length < 150) {
            const parts = txt.split("•").map((s) => s.trim());
            if (parts.length >= 2) {
              company = parts[0];
              title = parts.slice(1).join(" ").trim();
            }
            break;
          }
        }
        if (company || title) break;
      }
    }

    // Strategy 3: Prospect Fields section — labeled rows
    // Look for "Title" and "Account Name" field labels
    const allElements = document.querySelectorAll("span, div, td, dt, dd, label");
    for (const el of allElements) {
      const txt = el.textContent.trim().toLowerCase();
      if (txt.length > 20) continue;

      // Find the value element (next sibling, or next element in the row)
      const valueEl =
        el.nextElementSibling ||
        el.parentElement?.querySelector(":scope > :last-child");
      if (!valueEl || valueEl === el) continue;
      const value = valueEl.textContent.trim();
      if (!value || value.length > 100) continue;

      if (!title && txt === "title") {
        title = value;
      }
      if (!company && (txt === "account name" || txt === "company" || txt === "account")) {
        company = value;
      }
    }

    // Strategy 4: Look for Account Fields section specifically
    if (!company) {
      const accountLabels = document.querySelectorAll("span, div");
      for (const el of accountLabels) {
        if (el.textContent.trim() === "Account Name") {
          // The value is likely in a sibling or nearby element
          const parent = el.closest("div[class], tr, li");
          if (parent) {
            const spans = parent.querySelectorAll("span, div, a");
            for (const s of spans) {
              const v = s.textContent.trim();
              if (v && v !== "Account Name" && v.length < 80) {
                company = v;
                break;
              }
            }
          }
          break;
        }
      }
    }

    // Strategy 5: Parse document.title as last resort
    if (!name) {
      const match = document.title.match(/^(.+?)[\s|•\-–—]/);
      if (match) name = match[1].trim();
    }

    const role = mapTitleToRole(title);

    return { name, title, company, role };
  }

  // ── Find anchor for button injection ──────────────────────────
  async function findAnchor() {
    const h1 = await waitForElement("h1", 5000);
    return h1;
  }

  // ── Inject button on dialer pages ─────────────────────────────
  async function tryInject() {
    if (!isDialerPage(location.href)) {
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

  // ── Expose scraper for side panel ─────────────────────────────
  window.__leadbeamScrape = scrapeContact;

  // ── Listen for URL changes (SPA navigation) ──────────────────
  onUrlChange(() => {
    setTimeout(tryInject, 500);
  });
})();
