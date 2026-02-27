// Leadbeam Caller Intel — Side Panel Logic
// One-click flow: scrape active tab → stream API response → render bullets live

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
let streamedText = "";
let renderPending = false;

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
const fieldsDrawer = $("#fields-drawer");
const fieldsToggle = $("#fields-toggle");
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

// ── Toggle bar handlers ──────────────────────────────────────────
function setupToggle(toggleEl, drawerEl, onOpen) {
  toggleEl.addEventListener("click", () => {
    const opening = drawerEl.classList.contains("hidden");
    drawerEl.classList.toggle("hidden");
    toggleEl.classList.toggle("open", opening);
    if (opening && onOpen) onOpen();
  });
}

setupToggle(settingsToggle, settingsDiv, () => {
  chrome.runtime.sendMessage({ type: "GET_API_KEY" }, (res) => {
    if (res?.key) apiKeyInput.value = res.key;
  });
});

setupToggle(fieldsToggle, fieldsDrawer);

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

// ── Show loading skeletons (builds stable DOM with slots) ────────
function showLoading() {
  isLoading = true;
  updateButtonState();
  searchBtnText.textContent = "Searching…";
  searchSpinner.classList.remove("hidden");
  emptyState.classList.add("hidden");
  recentDiv.classList.add("hidden");

  const total = extraInput.value.trim() ? 5 : 4;

  const card = document.createElement("div");
  card.className = "result-card";
  card.innerHTML = '<div class="result-header">Intel Report</div>';

  for (let i = 0; i < total; i++) {
    const slot = document.createElement("div");
    slot.id = `bullet-slot-${i}`;
    slot.innerHTML = `<div class="skeleton-item">
      <div class="skeleton-dot"></div>
      <div class="skeleton-lines">
        <div class="skeleton-line" style="width:75%"></div>
        <div class="skeleton-line" style="width:90%"></div>
      </div>
    </div>`;
    card.appendChild(slot);
  }

  resultsDiv.innerHTML = "";
  resultsDiv.appendChild(card);
  resultsDiv.classList.remove("hidden");
}

// ── Render bullets progressively (updates slots in-place) ────────
function renderStream(text) {
  const bullets = parseBullets(text);
  const total = extraInput.value.trim() ? 5 : 4;

  for (let i = 0; i < total; i++) {
    const slot = document.getElementById(`bullet-slot-${i}`);
    if (!slot) continue;

    if (i < bullets.length) {
      const meta = bulletMeta[i] || bulletMeta[bulletMeta.length - 1];
      const newHtml = `<div class="bullet-item">
        <div class="bullet-dot" style="background:${meta.color}"></div>
        <div class="bullet-content">
          <div class="bullet-label" style="color:${meta.color}">${meta.label}</div>
          <div class="bullet-text">${formatLine(bullets[i])}</div>
        </div>
      </div>`;

      // Only update if content changed (avoid unnecessary reflows)
      if (slot.dataset.text !== bullets[i]) {
        slot.innerHTML = newHtml;
        slot.dataset.text = bullets[i];
      }
    }
    // Slots that are still skeletons stay as-is — no touch needed
  }

  emptyState.classList.add("hidden");
}

// ── Show final results (same slot approach, clean up) ────────────
function showResults(text) {
  // Do one final render to make sure everything is up to date
  renderStream(text);
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
      doSearch(true);
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
    return { error: "Navigate to an Apollo or HubSpot contact page first." };
  }
}

// ── Main search flow ─────────────────────────────────────────────
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
      clearScrapeStatus();
      showError(scraped.error);
      return;
    }

    if (!scraped.error) {
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

      const parts = [];
      if (scraped.company) parts.push(scraped.company);
      if (scraped.title) parts.push(scraped.title);
      if (scraped.name) parts.push(scraped.name);
      setScrapeStatus("Detected: " + parts.join(" · "), "#34D399");
    }
  }

  // Step 2: Validate
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

  // Step 3: Start streaming API call
  showLoading();
  addRecent(company, role);
  streamedText = "";

  const payload = {
    company,
    role,
    personName: personName || undefined,
    extraPrompt: extraInput.value.trim() || undefined,
  };

  const res = await chrome.runtime.sendMessage({ type: "GET_INTEL", payload });

  if (res.error) {
    stopLoading();
    showError(res.error);
    return;
  }

  // res.streaming === true — chunks will arrive via onMessage
  // Loading state stays on until INTEL_DONE arrives
}

// ── Listen for streaming messages from background ────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "PREFILL_CONTACT") {
    const { name, company, role } = msg.payload;
    if (company) companyInput.value = company;
    if (name) nameInput.value = name;
    if (role) selectRole(role);
    updateButtonState();
    return;
  }

  if (msg.type === "INTEL_SEARCHING") {
    searchBtnText.textContent = "Searching web…";
    return;
  }

  if (msg.type === "INTEL_CHUNK") {
    streamedText += msg.text;
    if (!renderPending) {
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        renderStream(streamedText);
      });
    }
    return;
  }

  if (msg.type === "INTEL_DONE") {
    stopLoading();
    if (streamedText) {
      showResults(streamedText);
    }
    return;
  }

  if (msg.type === "INTEL_ERROR") {
    stopLoading();
    showError(msg.error);
    return;
  }
});

// ── Search button click ──────────────────────────────────────────
searchBtn.addEventListener("click", () => doSearch(false));

// ── Init: load recent searches from storage ──────────────────────
chrome.storage.local.get("recentSearches", (res) => {
  if (res.recentSearches) {
    recentSearches = res.recentSearches;
    renderRecent();
  }
});
