import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

const app = express();
app.use(express.json());

// ── Anthropic proxy endpoint ────────────────────────────────────────
app.post("/api/intel", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set. Add it to .env" });
  }

  const { company, role, personName, extraPrompt } = req.body;

  if (!company || !role) {
    return res.status(400).json({ error: "company and role are required" });
  }

  const userContent = `I'm an SDR at Leadbeam cold calling a "${role}" at "${company}"${personName ? ` (${personName})` : ""}. Leadbeam is an AI-powered field sales platform: automates CRM data entry via voice/image, optimizes routes, discovers leads in territories, preps meetings, gives leaders real-time visibility into field activity and rep performance.

Search the web for ${company}, then give me exactly 4 bullet points (short fragments, NOT full sentences):

• What they sell / who they sell to
• Whether they likely have field reps and why (industry, product, territory-based, in-person demos, etc.)
• What a ${role} at this type of company is probably stressed about right now related to their field sales org (be specific to the role level — e.g. CRO cares about forecast accuracy and pipeline visibility, Sales Manager cares about rep productivity and CRM compliance, Enablement cares about onboarding and tool adoption)
• How Leadbeam specifically solves that stress (connect a specific Leadbeam feature to their pain — e.g. "voice-to-CRM saves reps 5hrs/wk on admin" or "real-time field activity dashboard fixes pipeline blind spots")
${extraPrompt ? `• ${extraPrompt}` : ""}

Keep each bullet to ~15 words max. Fragment style, no full sentences. Start each with "•"`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error("Anthropic API error:", anthropicRes.status, errBody);
      return res.status(anthropicRes.status).json({
        error: `Anthropic API error (${anthropicRes.status})`,
      });
    }

    const data = await anthropicRes.json();
    const text = data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "No results found.";

    res.json({ text });
  } catch (err) {
    console.error("Proxy error:", err);
    res.status(500).json({ error: "Failed to reach Anthropic API" });
  }
});

// ── Dev: attach Vite middleware so one `npm run dev` starts everything ──
const vite = await createViteServer({ server: { middlewareMode: true } });
app.use(vite.middlewares);

app.listen(PORT, () => {
  console.log(`  Leadbeam Caller Intel running at http://localhost:${PORT}`);
});
