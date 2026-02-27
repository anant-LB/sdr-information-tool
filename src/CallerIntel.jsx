import { useState } from "react";

const ROLE_OPTIONS = [
  { value: "CRO/VP of Sales", label: "CRO / VP of Sales" },
  { value: "Sales Manager", label: "Sales Manager" },
  { value: "Sales Enablement", label: "Sales Enablement" }
];

const DEFAULT_EXTRA = "Anything else relevant for selling Leadbeam to this person";

function parseBullets(text) {
  // Strip everything before the first bullet marker (•, -, *)
  const firstBullet = text.search(/^[\s]*[•\-*]\s/m);
  const bulletText = firstBullet >= 0 ? text.slice(firstBullet) : text;
  const cleaned = bulletText.replace(/^#+\s.+\n?/gm, "").trim();

  // Split on bullet markers and clean up
  const items = cleaned
    .split(/\n\s*[•\-*]\s/)
    .map(s => s.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);

  return items.length > 0 ? items : [cleaned];
}

function formatLine(text) {
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1
      ? <span key={i} style={{ fontWeight: 700, color: "#F1F5F9" }}>{part}</span>
      : part
  );
}

export default function CallerIntel() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [personName, setPersonName] = useState("");
  const [extraPrompt, setExtraPrompt] = useState(DEFAULT_EXTRA);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);

  const handleSearch = async () => {
    if (!company.trim() || !role.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          role: role.trim(),
          personName: personName.trim(),
          extraPrompt: extraPrompt.trim() !== DEFAULT_EXTRA && extraPrompt.trim() ? extraPrompt.trim() : ""
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const data = await response.json();
      setResult(data.text);
      setRecentSearches(prev => {
        const entry = { company: company.trim(), role: role.trim(), name: personName.trim() };
        const filtered = prev.filter(s => !(s.company === entry.company && s.role === entry.role));
        return [entry, ...filtered].slice(0, 5);
      });
    } catch (err) {
      setError(err.message || "Failed to fetch intel. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSearch();
  };

  const loadRecent = (search) => {
    setCompany(search.company);
    setRole(search.role);
    setPersonName(search.name || "");
  };

  const bullets = result ? parseBullets(result) : [];

  const inputStyle = {
    width: "100%", padding: "12px 16px", fontSize: 15,
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, color: "#F1F5F9", outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    boxSizing: "border-box"
  };

  const handleFocus = (e) => { e.target.style.borderColor = "rgba(56,189,248,0.4)"; e.target.style.boxShadow = "0 0 0 3px rgba(56,189,248,0.1)"; };
  const handleBlur = (e) => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; };
  const labelStyle = { fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Space Mono', monospace", display: "block", marginBottom: 8 };

  const bulletMeta = [
    { color: "#818CF8", label: "PRODUCT" },
    { color: "#38BDF8", label: "FIELD SALES FIT" },
    { color: "#F59E0B", label: "WHAT THEY'RE THINKING" },
    { color: "#34D399", label: "LEADBEAM HOOK" },
    { color: "#F472B6", label: "CUSTOM" }
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0B0F1A",
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      color: "#E2E8F0",
      position: "relative",
      overflow: "hidden"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />

      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(56, 189, 248, 0.06) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(139, 92, 246, 0.05) 0%, transparent 60%)"
      }} />

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "32px 20px", position: "relative", zIndex: 1 }}>

        {/* Header */}
        <div style={{ marginBottom: 32, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #38BDF8, #818CF8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700, color: "#0B0F1A",
            fontFamily: "'Space Mono', monospace"
          }}>L</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", color: "#F1F5F9" }}>
              Caller Intel
            </div>
            <div style={{ fontSize: 11, color: "#64748B", fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Leadbeam · Field Sales Intel
            </div>
          </div>
        </div>

        {/* Search Card */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: 24, marginBottom: 20,
          backdropFilter: "blur(20px)"
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Company</label>
            <input
              type="text" value={company}
              onChange={e => setCompany(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Cintas, Sysco, ADP..."
              style={inputStyle}
              onFocus={handleFocus} onBlur={handleBlur}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Role Level</label>
            <div style={{ display: "flex", gap: 8 }}>
              {ROLE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setRole(opt.value)}
                  style={{
                    flex: 1, padding: "11px 12px", fontSize: 14, fontWeight: role === opt.value ? 700 : 500,
                    background: role === opt.value ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.04)",
                    border: role === opt.value ? "1px solid rgba(56,189,248,0.4)" : "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10, color: role === opt.value ? "#38BDF8" : "#94A3B8",
                    cursor: "pointer", transition: "all 0.2s",
                    fontFamily: "'DM Sans', sans-serif"
                  }}
                  onMouseEnter={e => { if (role !== opt.value) { e.target.style.borderColor = "rgba(255,255,255,0.15)"; e.target.style.color = "#CBD5E1"; } }}
                  onMouseLeave={e => { if (role !== opt.value) { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.color = "#94A3B8"; } }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Contact Name <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span>
            </label>
            <input
              type="text" value={personName}
              onChange={e => setPersonName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Sarah Chen"
              style={inputStyle}
              onFocus={handleFocus} onBlur={handleBlur}
            />
          </div>

          {/* Editable custom prompt */}
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>
              Ask Anything <span style={{ fontWeight: 400, opacity: 0.6 }}>(editable -- adds extra bullet)</span>
            </label>
            <input
              type="text" value={extraPrompt}
              onChange={e => setExtraPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. What CRM do they use? Recent funding?"
              style={{ ...inputStyle, borderStyle: "dashed" }}
              onFocus={(e) => { handleFocus(e); if (extraPrompt === DEFAULT_EXTRA) setExtraPrompt(""); }}
              onBlur={(e) => { handleBlur(e); if (!extraPrompt.trim()) setExtraPrompt(DEFAULT_EXTRA); }}
            />
          </div>

          <button
            onClick={handleSearch}
            disabled={loading || !company.trim() || !role.trim()}
            style={{
              width: "100%", padding: "14px 24px", fontSize: 15, fontWeight: 700,
              background: loading ? "rgba(56,189,248,0.15)" : (!company.trim() || !role.trim()) ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg, #38BDF8, #818CF8)",
              color: (!company.trim() || !role.trim()) ? "#475569" : "#0B0F1A",
              border: "none", borderRadius: 10, cursor: loading ? "wait" : (!company.trim() || !role.trim()) ? "not-allowed" : "pointer",
              transition: "all 0.2s", letterSpacing: "0.02em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: 16, height: 16, border: "2px solid rgba(56,189,248,0.3)",
                  borderTopColor: "#38BDF8", borderRadius: "50%",
                  animation: "spin 0.8s linear infinite"
                }} />
                <span style={{ color: "#38BDF8" }}>Researching...</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 16 }}>⚡</span>
                Get Intel
              </>
            )}
          </button>
        </div>

        {/* Recent Searches */}
        {recentSearches.length > 0 && !result && !loading && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Space Mono', monospace", marginBottom: 10 }}>
              Recent
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {recentSearches.map((s, i) => (
                <button key={i} onClick={() => loadRecent(s)} style={{
                  padding: "6px 14px", fontSize: 13, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8,
                  color: "#94A3B8", cursor: "pointer", transition: "all 0.15s"
                }}
                  onMouseEnter={e => { e.target.style.background = "rgba(56,189,248,0.08)"; e.target.style.borderColor = "rgba(56,189,248,0.2)"; }}
                  onMouseLeave={e => { e.target.style.background = "rgba(255,255,255,0.04)"; e.target.style.borderColor = "rgba(255,255,255,0.06)"; }}
                >
                  {s.company} · {s.role}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: "16px 20px", background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12,
            color: "#FCA5A5", fontSize: 14, marginBottom: 20
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{
            background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)",
            borderRadius: 12, padding: 24, animation: "pulse 1.5s ease-in-out infinite"
          }}>
            {[85, 70, 75, 65].map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: i < 3 ? 16 : 0 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(255,255,255,0.08)", flexShrink: 0 }} />
                <div>
                  <div style={{ height: 8, width: 60, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginBottom: 6 }} />
                  <div style={{ height: 16, width: `${w * 3}px`, maxWidth: "100%", background: "rgba(255,255,255,0.05)", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 16, paddingBottom: 12,
              borderBottom: "1px solid rgba(255,255,255,0.06)"
            }}>
              <div style={{ fontSize: 13, color: "#64748B" }}>
                <span style={{ color: "#818CF8", fontWeight: 600 }}>{company}</span> · <span style={{ color: "#38BDF8", fontWeight: 600 }}>{role}</span>
              </div>
              <button onClick={() => { setResult(null); setCompany(""); setRole(""); setPersonName(""); setExtraPrompt(DEFAULT_EXTRA); }}
                style={{
                  padding: "6px 12px", fontSize: 12, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6,
                  color: "#64748B", cursor: "pointer", fontFamily: "'Space Mono', monospace"
                }}
                onMouseEnter={e => e.target.style.color = "#F1F5F9"}
                onMouseLeave={e => e.target.style.color = "#64748B"}
              >
                New Search
              </button>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 12, padding: 24,
              animation: "fadeSlideIn 0.3s ease-out both"
            }}>
              {bullets.map((bullet, i) => {
                const meta = bulletMeta[i] || bulletMeta[bulletMeta.length - 1];
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 14,
                    marginBottom: i < bullets.length - 1 ? 20 : 0
                  }}>
                    <div style={{ flexShrink: 0, paddingTop: 2 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", marginTop: 4,
                        background: meta.color
                      }} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: 10, fontWeight: 700, color: meta.color, letterSpacing: "0.1em",
                        textTransform: "uppercase", fontFamily: "'Space Mono', monospace", marginBottom: 4
                      }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 17, lineHeight: 1.5, color: "#CBD5E1" }}>
                        {formatLine(bullet)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!result && !loading && !error && recentSearches.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#475569" }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.5 }}>🔍</div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              Enter a company and role to get instant context<br />for your next cold call.
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        input::placeholder { color: #475569; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>
    </div>
  );
}
