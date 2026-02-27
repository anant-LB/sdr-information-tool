// Leadbeam Caller Intel — Side Panel Logic
// One-click flow: scrape active tab → fill fields → call API → show bullets

// ── Bullet metadata (colors + labels) ─────────────────────────────
const bulletMeta = [
  { color: "#818CF8", label: "PRODUCT" },
  { color: "#38BDF8", label: "FIELD SALES FIT" },
  { color: "#F59E0B", label: "WHAT THEY'RE THINKING" },
  { color: "#34D399", label: "LEADBEAM HOOK" },
  { color: "#F472B6", label: "CUSTOM" },
];

// ── State ─────────────────────────────────────────────────────────
let selectedRole = "";
let recentSearches = [];
let isLoading = false;

// ── DOM refs ──────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const companyInput = $("#company-input");
const nameInput = $("#name-input");
const extraInput = $("#extra-input");
const searchBtn = $("#search-btn");
const searchBtnText = $("#search-btn-text");
const searchSpinner = $("#search-spinner");
const resultsDiv = $("#results");
const emptyState = $("#empty-state");
const recentDiv = $("#recent-searches");
const recentList = $("#recent-list");
const settingsDiv = $("#settings");
const settingsToggle = $("#settings-toggle");
const apiKeyInput = $("#api-key-input");
const saveKeyBtn = $("#save-key-btn");
const keyStatus = $("#key-status");
const scrapeStatus = $("#scrape-status");

// ── Bullet parser (ported from CallerIntel.jsx) ──────────────────
function parseBullets(text) {
  const firstBullet = text.search(/^[\s]*[•\-*]\s/m);
  const bulletText = firstBullet >= 0 ? text.slice(firstBullet) : text;
  const cleaned = bulletText.replace(/^#+\s.+\n?/gm, "").trim();

  const items = cleaned
    .split(/\n\s*[•\-*]\s/)
    .map((s) => s.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);

  return items.length > 0 ? items : [cleaned];
}

// ── Format bold text (**text**) ──────────────────────────────────
function formatLine(text) {
  return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// ── Update button state ──────────────────────────────────────────
function updateButtonState() {
  // Button is always enabled unless we're mid-loading
  searchBtn.disabled = isLoading;
}

// ── Role buttons ─────────────────────────────────────────────────
document.querySelectorAll(".role-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".role-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedRole = btn.dataset.role;
  });
});

// ── Input listeners ──────────────────────────────────────────────
companyInput.addEventListener("input", updateButtonState);

// ── Settings toggle ──────────────────────────────────────────────
settingsToggle.addEventListener("click", () => {
  settingsDiv.classList.toggle("hidden");
  if (!settingsDiv.classList.contains("hidden")) {
    chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (res) => {
      if (res?.key) apiKeyInput.value = res.key;
    });
  }
});

// ── Save API key ─────────────────────────────────────────────────
saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatus.textContent = "Please enter an API key";
    keyStatus.style.color = "#FCA5A5";
    return;
  }
  chrome.runtime.sendMessage({ type: "SAVE_API_KEY", key }, () => {
    keyStatus.textContent = "Key saved!";
    keyStatus.style.color = "#34D399";
    setTimeout(() => { keyStatus.textContent = ""; }, 2000);
  });
});

// ── Render loading skeletons ─────────────────────────────────────
function showLoading() {
  isLoading = true;
  updateButtonState();
  searchBtnText.textContent = "Searching…";
  searchSpinner.classList.remove("hidden");
  emptyState.classList.add("hidden");
  recentDiv.classList.add("hidden");

  const skeletonCount = extraInput.value.trim() ? 5 : 4;
  let html = '<div class="result-card">';
  for (let i = 0; i < skeletonCount; i++) {
    html += `<div class="skeleton-item">
      <div class="skeleton-dot"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line" style="width:75%"></div>
        <div class="skeleton-line" style="width:90%"></div>
      </div>
    </div>`;
  }
  html += "</div>";

  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove("hidden");
}

// ── Render results ───────────────────────────────────────────────
function showResults(text) {
  const bullets = parseBullets(text);
  let html = '<div class="result-card"><div class="result-header">Intel Report</div>';

  bullets.forEach((bullet, i) => {
    const meta = bulletMeta[i] || bulletMeta[bulletMeta.length - 1];
    html += `<div class="bullet-item">
      <div class="bullet-dot" style="background:${meta.color}"></div>
      <div class="bullet-content">
        <div class="bullet-label" style="color:${meta.color}">${meta.label}</div>
        <div class="bullet-text">${formatLine(bullet)}</div>
      </div>
    </div>`;
  });

  html += "</div>";
  resultsDiv.innerHTML = html;
  resultsDiv.classList.remove("hidden");
  emptyState.classList.add("hidden");
}

// ── Show error ───────────────────────────────────────────────────
function showError(message) {
  resultsDiv.innerHTML = `<div class="error-box">${message}</div>`;
  resultsDiv.classList.remove("hidden");
  emptyState.classList.add("hidden");
}

// ── Reset loading state ──────────────────────────────────────────
function stopLoading() {
  isLoading = false;
  updateButtonState();
  searchBtnText.textContent = "Get Intel";
  searchSpinner.classList.add("hidden");
}

// ── Scrape status indicator ──────────────────────────────────────
function setScrapeStatus(text, color) {
  scrapeStatus.textContent = text;
  scrapeStatus.style.color = color || "#94A3B8";
  scrapeStatus.classList.remove("hidden");
}

function clearScrapeStatus() {
  scrapeStatus.classList.add("hidden");
  scrapeStatus.textContent = "";
}

// ── Add to recent searches ───────────────────────────────────────
function addRecent(company, role) {
  recentSearches = recentSearches.filter(
    (r) => !(r.company === company && r.role === role)
  );
  recentSearches.unshift({ company, role });
  if (recentSearches.length > 5) recentSearches.pop();
  chrome.storage.local.set({ recentSearches });
  renderRecent();
}

function renderRecent() {
  if (recentSearches.length === 0 || !resultsDiv.classList.contains("hidden")) {
    recentDiv.classList.add("hidden");
    return;
  }
  recentList.innerHTML = recentSearches
    .map(
      (r, i) =>
        `<button class="recent-btn" data-idx="${i}">${r.company} · ${r.role}</button>`
    )
    .join("");
  recentDiv.classList.remove("hidden");

  recentList.querySelectorAll(".recent-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const r = recentSearches[parseInt(btn.dataset.idx)];
      companyInput.value = r.company;
      selectRole(r.role);
      doSearch(true); // skip scrape, use form values
    });
  });
}

// ── Select role programmatically ─────────────────────────────────
function selectRole(role) {
  selectedRole = role;
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.role === role);
  });
}

// ── Scrape the active tab via content script ─────────────────────
async function scrapeActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { error: "No active tab found" };

    const response = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_CONTACT" });
    return response;
  } catch (err) {
    // Content script not injected (not on Apollo/HubSpot)
    return { error: "Navigate to an Apollo or HubSpot contact page first." };
  }
}

// ── Main search flow ─────────────────────────────────────────────
// skipScrape=true when using manual fields or recent searches
async function doSearch(skipScrape = false) {
  if (isLoading) return;
  clearScrapeStatus();

  let company = companyInput.value.trim();
  let role = selectedRole;
  let personName = nameInput.value.trim();

  // Step 1: Scrape the active tab (unless skipping)
  if (!skipScrape) {
    setScrapeStatus("Reading page…", "#38BDF8");

    const scraped = await scrapeActiveTab();

    if (scraped.error && !company) {
      // No scraped data and no manual input
      clearScrapeStatus();
      showError(scraped.error);
      return;
    }

    if (!scraped.error) {
      // Fill fields with scraped data (don't overwrite manual edits)
      if (scraped.company) {
        company = scraped.company;
        companyInput.value = company;
      }
      if (scraped.name) {
        personName = scraped.name;
        nameInput.value = personName;
      }
      if (scraped.role) {
        selectRole(scraped.role);
        role = scraped.role;
      }

      // Show what was detected
      const parts = [];
      if (scraped.company) parts.push(scraped.company);
      if (scraped.title) parts.push(scraped.title);
      if (scraped.name) parts.push(scraped.name);
      setScrapeStatus("Detected: " + parts.join(" · "), "#34D399");
    }
  }

  // Step 2: Validate — need at least company and role
  if (!company) {
    clearScrapeStatus();
    showError("Could not detect company. Enter it manually and try again.");
    return;
  }

  if (!role) {
    clearScrapeStatus();
    showError("Could not detect role from job title. Select a role above and click Get Intel again.");
    return;
  }

  // Step 3: Fire the API call
  showLoading();
  addRecent(company, role);

  const payload = {
    company,
    role,
    personName: personName || undefined,
    extraPrompt: extraInput.value.trim() || undefined,
  };

  const res = await chrome.runtime.sendMessage({ type: "GET_INTEL", payload });
  stopLoading();

  if (res.error) {
    showError(res.error);
  } else {
    showResults(res.text);
  }
}

// ── Search button click ──────────────────────────────────────────
searchBtn.addEventListener("click", () => doSearch(false));

// ── Listen for prefill from content scripts (injected button) ────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PREFILL_CONTACT") {
    const { name, company, role } = msg.payload;
    if (company) companyInput.value = company;
    if (name) nameInput.value = name;
    if (role) selectRole(role);
    updateButtonState();
  }
});

// ── Init: load recent searches from storage ──────────────────────
chrome.storage.local.get("recentSearches", (res) => {
  if (res.recentSearches) {
    recentSearches = res.recentSearches;
    renderRecent();
  }
});
