// Leadbeam Caller Intel — Nooks.ai Content Script
// Detects dialer contact view and scrapes name/title/company

(function () {
  "use strict";

  // Known field labels to never treat as data values
  const LABEL_BLACKLIST = new Set([
    "title", "email", "phone", "website", "sequence", "time zone",
    "timezone", "mobile", "linkedin", "account name", "company",
    "account", "prospect fields", "account fields", "industry",
    "address", "city", "state", "country", "zip", "notes",
    "add note", "prospect", "dashboard", "activity", "battlecards",
    "transcript", "customize view",
  ]);

  function isLabel(text) {
    return LABEL_BLACKLIST.has(text.toLowerCase().trim());
  }

  // ── Detect if we're on a dialer page ──────────────────────────
  function isDialerPage(url) {
    return /app\.nooks\.in\/.*\/dialer/.test(url);
  }

  // ── Scrape contact data from Nooks DOM ────────────────────────
  async function scrapeContact() {
    let name = "";
    let title = "";
    let company = "";

    // Strategy 1: Contact name — heading in the contact detail panel
    // Try h1 first, then h2/h3
    const headings = document.querySelectorAll("h1, h2, h3");
    for (const el of headings) {
      const txt = el.textContent.trim();
      // Name headings: short, no separators, not a label
      if (txt && txt.length > 2 && txt.length < 60 && !/[•·|]/.test(txt) && !isLabel(txt)) {
        name = txt;
        break;
      }
    }

    // Strategy 2: Find "Company • Title" or "Company · Title" anywhere on the page
    // This is the most reliable source — scan all elements for the separator pattern
    const separatorRegex = /[•·]/;
    const allEls = document.querySelectorAll("span, div, p, a");
    for (const el of allEls) {
      if (el.children.length > 8) continue;
      const txt = el.textContent.trim();
      if (!txt || txt.length < 5 || txt.length > 150) continue;
      if (!separatorRegex.test(txt)) continue;

      // Split on bullet or middle dot
      const parts = txt.split(separatorRegex).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        // Validate: first part should look like a company name, not a label
        if (isLabel(parts[0])) continue;
        // Skip if it looks like a list of labels (e.g. "Dashboard · Activity · Battlecards")
        if (parts.length > 3) continue;
        // Skip if parts are too short (likely UI elements)
        if (parts[0].length < 2 || parts[1].length < 2) continue;

        company = parts[0];
        title = parts.slice(1).join(" ").trim();
        break;
      }
    }

    // Strategy 3: Find "Prospect Fields" section and parse label-value rows
    if (!title || !company) {
      const section = findSectionByHeading("Prospect Fields");
      if (section) {
        const fields = parseFieldRows(section);
        if (!title && fields["title"]) title = fields["title"];
        if (!company && fields["company"]) company = fields["company"];
        if (!company && fields["account name"]) company = fields["account name"];
      }
    }

    // Strategy 4: Find "Account Fields" section and parse for Account Name
    if (!company) {
      const section = findSectionByHeading("Account Fields");
      if (section) {
        const fields = parseFieldRows(section);
        if (fields["account name"]) company = fields["account name"];
        if (!company && fields["company"]) company = fields["company"];
      }
    }

    // Strategy 5: Extract company from email domain as fallback
    if (!company) {
      const emailEls = document.querySelectorAll("a[href^='mailto:'], span, div");
      for (const el of emailEls) {
        const txt = el.textContent.trim();
        const emailMatch = txt.match(/[\w.-]+@([\w-]+)\.\w+/);
        if (emailMatch) {
          // Capitalize the domain name: "advantech" -> "Advantech"
          const domain = emailMatch[1];
          if (domain.length > 2 && domain !== "gmail" && domain !== "yahoo" && domain !== "hotmail" && domain !== "outlook") {
            company = domain.charAt(0).toUpperCase() + domain.slice(1);
            break;
          }
        }
      }
    }

    // Strategy 6: Parse document.title as last resort
    if (!name) {
      const match = document.title.match(/^(.+?)[\s|•·\-–—]/);
      if (match) name = match[1].trim();
    }

    const role = mapTitleToRole(title);

    return { name, title, company, role };
  }

  // ── Find a DOM section by its heading text ────────────────────
  function findSectionByHeading(headingText) {
    const allEls = document.querySelectorAll("span, div, h2, h3, h4");
    for (const el of allEls) {
      const txt = el.textContent.trim();
      // Match the heading but not a huge container that contains it
      if (txt.startsWith(headingText) && txt.length < headingText.length + 20) {
        // Walk up to find the section container
        let container = el.parentElement;
        for (let i = 0; i < 3 && container; i++) {
          // Look for a container that has multiple children (the field rows)
          if (container.children.length >= 3) return container;
          container = container.parentElement;
        }
        return el.parentElement?.parentElement;
      }
    }
    return null;
  }

  // ── Parse label-value field rows within a section ─────────────
  // Nooks shows rows like: [icon] Label    Value
  // We look for pairs where the label is a known field name
  function parseFieldRows(section) {
    const fields = {};
    const rows = section.querySelectorAll("div, tr, li");

    for (const row of rows) {
      // Skip rows that are containers of other rows
      if (row.querySelectorAll("div, tr, li").length > 10) continue;

      const textContent = row.textContent.trim();
      // Skip very long or very short rows
      if (textContent.length > 200 || textContent.length < 3) continue;

      // Look for known field labels within this row
      const children = row.querySelectorAll("span, div, td, p");
      for (let i = 0; i < children.length; i++) {
        const labelText = children[i].textContent.trim().toLowerCase();

        if (labelText === "title" || labelText === "job title") {
          // Find the value — scan remaining siblings in this row
          const value = findValueAfterLabel(children, i, row);
          if (value && !isLabel(value)) fields["title"] = value;
        }

        if (labelText === "account name" || labelText === "company" || labelText === "account") {
          const value = findValueAfterLabel(children, i, row);
          if (value && !isLabel(value)) fields[labelText] = value;
        }
      }
    }

    return fields;
  }

  // ── Find the value element after a label in a row ─────────────
  function findValueAfterLabel(children, labelIndex, row) {
    // Try the next sibling elements in the NodeList
    for (let j = labelIndex + 1; j < children.length && j <= labelIndex + 3; j++) {
      const txt = children[j].textContent.trim();
      if (txt && txt.length > 1 && txt.length < 100 && !isLabel(txt)) {
        // Make sure this isn't a child of the label element
        if (!children[labelIndex].contains(children[j])) {
          return txt;
        }
      }
    }

    // Try nextElementSibling of the label's parent
    const labelEl = children[labelIndex];
    const parentRow = labelEl.closest("div, tr, li") || labelEl.parentElement;
    if (parentRow && parentRow !== row) {
      const nextRow = parentRow.nextElementSibling;
      if (nextRow) {
        const txt = nextRow.textContent.trim();
        if (txt && txt.length > 1 && txt.length < 100 && !isLabel(txt)) {
          return txt;
        }
      }
    }

    return null;
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
