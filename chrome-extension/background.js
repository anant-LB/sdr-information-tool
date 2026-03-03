// Leadbeam Caller Intel — Background Service Worker
// Handles: Anthropic API calls (streaming), API key storage, side panel control

// Open side panel when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ── Message listener ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_INTEL") {
    startStreaming(msg.payload).then(sendResponse);
    return true;
  }

  if (msg.type === "OPEN_SIDE_PANEL") {
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: "PREFILL_CONTACT",
          payload: msg.payload,
        });
      }, 300);
    });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "SAVE_API_KEY") {
    chrome.storage.local.set({ anthropicApiKey: msg.key }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "GET_API_KEY") {
    chrome.storage.local.get("anthropicApiKey", (result) => {
      sendResponse({ key: result.anthropicApiKey || "" });
    });
    return true;
  }
});

// ── Validate and kick off streaming ─────────────────────────────────
async function startStreaming(payload) {
  const { anthropicApiKey } = await chrome.storage.local.get("anthropicApiKey");

  if (!anthropicApiKey) {
    return { error: "API key not set. Open the side panel settings to add your Anthropic API key." };
  }

  if (!payload.company || !payload.role) {
    return { error: "Company and role are required." };
  }

  // Fire streaming in background (don't await — chunks sent via messages)
  streamIntel(payload, anthropicApiKey);

  return { streaming: true };
}

// ── Streaming Anthropic API call ────────────────────────────────────
async function streamIntel({ company, role, personName, extraPrompt }, apiKey) {
  const userContent = `I'm an SDR at Leadbeam cold calling a "${role}" at "${company}"${personName ? ` (${personName})` : ""}. Leadbeam is an AI-powered field sales platform: automates CRM data entry via voice/image, optimizes routes, discovers leads in territories, preps meetings, gives leaders real-time visibility into field activity and rep performance.

Give me exactly 5 bullet points about ${company} (short fragments, NOT full sentences):

• PRODUCT: What specific products/services does ${company} sell, to which specific customer segments, in which verticals? Be concrete — name actual product lines, industries served, or buyer personas, not generic descriptions.
• FIELD SALES FIT: Do they likely have field reps? Why — what about their product, deal size, sales motion, or industry requires in-person selling?
• WHAT THEY'RE THINKING: What is a ${role} at ${company} specifically losing sleep over right now? Think about what's unique to their company, industry, or competitive situation — not generic sales leadership concerns. What pressure is specific to THEIR business?
• HIRING SIGNALS: Any signs ${company} is growing, restructuring, or investing in their sales org? Think new territories, job postings, leadership changes, acquisitions, or product launches that would create sales team needs.
• LEADBEAM HOOK: Given the above, what is the single most compelling thing to say about Leadbeam on this call? Connect one specific Leadbeam feature to one specific pain at ${company}. Be sharp and specific.
${extraPrompt ? `• ${extraPrompt}` : ""}

Keep each bullet to ~15 words max. Fragment style, no full sentences. Start each with "•"`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        stream: true,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("Anthropic API error:", res.status, errBody);
      safeSend({ type: "INTEL_ERROR", error: `Anthropic API error (${res.status})` });
      return;
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let searchingNotified = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);

          // Notify when web search starts
          if (event.type === "content_block_start" &&
              event.content_block?.type === "server_tool_use" &&
              !searchingNotified) {
            safeSend({ type: "INTEL_SEARCHING" });
            searchingNotified = true;
          }

          // Stream text deltas
          if (event.type === "content_block_delta" &&
              event.delta?.type === "text_delta") {
            safeSend({ type: "INTEL_CHUNK", text: event.delta.text });
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    }

    safeSend({ type: "INTEL_DONE" });
  } catch (err) {
    console.error("Stream failed:", err);
    safeSend({ type: "INTEL_ERROR", error: "Failed to reach Anthropic API. Check your network and API key." });
  }
}

// ── Safe message send (side panel might be closed) ──────────────────
function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg);
  } catch (e) {
    // Side panel closed mid-stream — ignore
  }
}
