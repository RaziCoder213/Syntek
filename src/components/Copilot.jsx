import { useState, useEffect, useRef, useCallback } from "react";

function parseBoldText(text) {
  if (!text) return "";
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={idx} style={{ color: "inherit", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function formatChatMessage(content) {
  if (!content) return "";
  const cleanContent = content.replace(/\r?\n[\*\-]{3,}\r?\n/g, "\n\n").replace(/^[\*\-]{3,}\r?\n/g, "");
  const blocks = cleanContent.split(/\n\n+/);
  return blocks.map((block, bIdx) => {
    const trimmed = block.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^(#+)\s*(.*)/);
      if (match) {
        const level = match[1].length;
        const text = match[2];
        const fontSize = level === 1 ? "15px" : level === 2 ? "14px" : "13px";
        return (
          <div key={bIdx} style={{ fontWeight: 700, fontSize, marginTop: "8px", marginBottom: "4px", color: "var(--text-1)" }}>
            {parseBoldText(text)}
          </div>
        );
      }
    }
    const lines = trimmed.split("\n");
    const isList = lines.length > 0 && lines.every(line => {
      const tl = line.trim();
      return tl.startsWith("* ") || tl.startsWith("- ") || /^\d+\.\s/.test(tl);
    });
    if (isList) {
      return (
        <ul key={bIdx} style={{ margin: "6px 0", paddingLeft: 18, listStyleType: "disc" }}>
          {lines.map((line, lIdx) => {
            const cleanLine = line.trim().replace(/^[\*\-\d\.\s]+/, "").trim();
            return <li key={lIdx} style={{ marginBottom: 4 }}>{parseBoldText(cleanLine)}</li>;
          })}
        </ul>
      );
    }
    const isKeyValue = lines.length > 1 && lines.every(line => {
      const tl = line.trim();
      return tl.includes(":") && tl.split(":")[0].length < 35;
    });
    if (isKeyValue) {
      return (
        <div key={bIdx} style={{ display: "flex", flexDirection: "column", gap: 6, margin: "8px 0", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
          {lines.map((line, lIdx) => {
            const idx = line.indexOf(":");
            const key = line.substring(0, idx).trim();
            const val = line.substring(idx + 1).trim();
            return (
              <div key={lIdx} style={{ display: "flex", fontSize: "12px", gap: 8, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: "var(--text-2)", minWidth: 80 }}>{key}:</span>
                <span style={{ color: "var(--text-1)", wordBreak: "break-all" }}>{parseBoldText(val)}</span>
              </div>
            );
          })}
        </div>
      );
    }
    return <p key={bIdx} style={{ margin: "4px 0", lineHeight: 1.5 }}>{parseBoldText(trimmed)}</p>;
  });
}

// Parse natural language scheduling into a note prepended to the message
function parseSchedulingCommand(text) {
  const schedulePatterns = [
    { regex: /every\s+(\d+)\s+second/i,   label: m => `every ${m[1]} seconds` },
    { regex: /every\s+(\d+)\s+minute/i,   label: m => `every ${m[1]} minutes` },
    { regex: /every\s+(\d+)\s+hour/i,     label: m => `every ${m[1]} hours` },
    { regex: /every\s+(\d+)\s+day/i,      label: m => `every ${m[1]} days` },
    { regex: /every\s+day/i,              label: () => "daily" },
    { regex: /every\s+hour/i,             label: () => "hourly" },
    { regex: /every\s+minute/i,           label: () => "every minute" },
    { regex: /daily/i,                    label: () => "daily" },
    { regex: /on\s+condition/i,           label: () => "conditionally" },
    { regex: /when\s+(.+?)\s+then/i,      label: m => `when "${m[1]}"` },
  ];
  for (const { regex, label } of schedulePatterns) {
    const m = text.match(regex);
    if (m) return `[SCHEDULE: ${label(m)}] `;
  }
  return "";
}

export default function Copilot({ showToast, onRefreshAll }) {
  const [isOpen, setIsOpen]         = useState(false);
  const [messages, setMessages]     = useState([]);
  const [inputText, setInputText]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingText, setEditingText]   = useState("");
  const messagesEndRef = useRef(null);
  const abortCtrlRef   = useRef(null);
  const inputRef       = useRef(null);

  useEffect(() => {
    if (isOpen) fetchHistory();
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/ai/copilot");
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) { console.error(err); }
  };

  const handleClearChat = async () => {
    if (!window.confirm("Clear co-pilot chat history?")) return;
    try {
      const res = await fetch("/api/ai/copilot", { method: "DELETE" });
      if (res.ok) { setMessages([]); showToast("Co-pilot chat cleared.", "info"); }
    } catch (err) { console.error(err); }
  };

  const handleStop = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
    }
    setLoading(false);
    setMessages(prev => {
      // Remove the last "thinking" placeholder if present
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last._thinking) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    showToast("Generation stopped.", "info");
  };

  const handleSend = useCallback(async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    if (!textToSend) setInputText("");

    // Detect scheduling intent and prepend note
    const schedulePrefix = parseSchedulingCommand(text);
    const fullText = schedulePrefix ? schedulePrefix + text : text;

    const userMsg = { id: Date.now(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    abortCtrlRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullText }),
        signal: abortCtrlRef.current.signal,
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          role: "assistant",
          content: data.reply,
          actionResults: data.actionResults,
        }]);
        if (data.actions && data.actions.length > 0) {
          if (onRefreshAll) onRefreshAll();
          if (data.actionResults) {
            data.actionResults.forEach(r => {
              if (r.success) showToast(r.message, "success");
              else showToast(r.error, "warning");
            });
          }
        }
      } else if (res.status !== 0) {
        showToast("Co-pilot failed to respond.", "danger");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(err);
        showToast("Network error communicating with Co-pilot.", "danger");
      }
    } finally {
      setLoading(false);
      abortCtrlRef.current = null;
    }
  }, [inputText, loading, onRefreshAll, showToast]);

  const startEditMessage = (msg) => {
    setEditingMsgId(msg.id);
    setEditingText(msg.content);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submitEdit = async () => {
    if (!editingText.trim()) return;
    // Remove the edited message and all messages after it from state + re-send
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === editingMsgId);
      return idx >= 0 ? prev.slice(0, idx) : prev;
    });
    const text = editingText.trim();
    setEditingMsgId(null);
    setEditingText("");
    await handleSend(text);
  };

  const cancelEdit = () => {
    setEditingMsgId(null);
    setEditingText("");
  };

  const suggestions = [
    "Trash all bounced leads",
    "Sync Inbox",
    "Run campaign",
    "Show my lead stats",
    "Bulk re-research leads",
    "Set lead limit to 15",
  ];

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            position: "fixed", bottom: "24px", right: "24px", zIndex: 1000,
            background: "linear-gradient(135deg, var(--brand) 0%, #8b5cf6 100%)",
            color: "white", border: "none", borderRadius: "50px", padding: "12px 20px",
            fontSize: "13px", fontWeight: 600, boxShadow: "0 10px 25px rgba(108, 92, 231, 0.4)",
            display: "flex", alignItems: "center", gap: "8px", cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          className="hover-scale"
          title="Open AI Co-pilot Console"
        >
          <span>🧠</span><span>Co-pilot</span>
        </button>
      )}

      {/* Slide-out Drawer Panel */}
      {isOpen && (
        <>
          <div onClick={() => { if (!loading) setIsOpen(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)", zIndex: 998 }} />

          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "420px", background: "rgba(18, 18, 26, 0.97)", borderLeft: "1px solid rgba(255,255,255,0.08)", boxShadow: "-10px 0 40px rgba(0,0,0,0.6)", zIndex: 999, display: "flex", flexDirection: "column", backdropFilter: "blur(20px)" }}>

            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🧠</span>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-1)" }}>Syntek AI Co-pilot</span>
                {loading && (
                  <span style={{ fontSize: "10px", color: "var(--brand)", background: "rgba(108,92,231,0.15)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(108,92,231,0.3)" }}>
                    thinking…
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {messages.length > 0 && !loading && (
                  <button onClick={handleClearChat} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "11px", cursor: "pointer", padding: 0 }} className="hover-white">
                    Clear
                  </button>
                )}
                {loading && (
                  <button
                    onClick={handleStop}
                    style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#f87171", fontSize: "11px", cursor: "pointer", padding: "3px 10px", borderRadius: 6, fontWeight: 600 }}
                  >
                    ⏹ Stop
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", color: "var(--text-2)", fontSize: "16px", cursor: "pointer", padding: "4px" }}>✕</button>
              </div>
            </div>

            {/* Messages Container */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {messages.length === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", color: "var(--text-3)", maxWidth: "280px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>🧠</div>
                  <h4 style={{ color: "var(--text-1)", marginBottom: "6px", fontSize: "14px" }}>Ask me anything!</h4>
                  <p style={{ fontSize: "12px", lineHeight: "1.5" }}>
                    I can move leads, trash bounced emails, run campaigns, sync your inbox, manage stages, and more.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%", display: "flex", flexDirection: "column", gap: "4px" }}
                  >
                    <div
                      style={{
                        padding: "10px 14px", borderRadius: "12px", fontSize: "13px", lineHeight: "1.5",
                        background: m.role === "user" ? "var(--brand)" : "var(--bg-overlay)",
                        color: m.role === "user" ? "white" : "var(--text-1)",
                        border: m.role === "user" ? "none" : "1px solid var(--border-1)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)", wordBreak: "break-word",
                        position: "relative",
                      }}
                    >
                      {formatChatMessage(m.content)}
                    </div>

                    {/* Edit button for user messages */}
                    {m.role === "user" && !loading && (
                      <button
                        onClick={() => startEditMessage(m)}
                        style={{ alignSelf: "flex-end", background: "none", border: "none", color: "var(--text-4)", fontSize: "10px", cursor: "pointer", padding: "2px 4px", marginTop: -2 }}
                        title="Edit and resend this message"
                      >
                        ✏️ Edit
                      </button>
                    )}

                    {/* Action Execution Logs */}
                    {m.actionResults && m.actionResults.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", paddingLeft: "6px" }}>
                        {m.actionResults.map((r, i) => (
                          <div key={i} style={{ fontSize: "11px", color: r.success ? "var(--success)" : "var(--warning)", display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>{r.success ? "✓" : "⚠"}</span>
                            <span>{r.success ? r.message : r.error}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
              {loading && (
                <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", background: "var(--bg-overlay)", border: "1px solid var(--border-1)", borderRadius: 12 }}>
                  <div className="status-dot green pulse" style={{ width: 6, height: 6 }} />
                  <span style={{ fontSize: "12px", color: "var(--text-3)" }}>Co-pilot is thinking…</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions (only when chat is empty) */}
            {messages.length === 0 && (
              <div style={{ padding: "0 18px 10px 18px" }}>
                <div style={{ fontSize: "10px", color: "var(--text-4)", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>Suggested</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s)}
                      style={{ padding: "5px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "20px", fontSize: "11px", color: "var(--text-2)", cursor: "pointer", transition: "background 0.2s" }}
                      className="hover-bg-light"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Edit Mode Banner */}
            {editingMsgId && (
              <div style={{ padding: "8px 18px", background: "rgba(108,92,231,0.1)", borderTop: "1px solid rgba(108,92,231,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: "11px", color: "var(--brand)", fontWeight: 600 }}>✏️ Editing message — messages after this will be removed</span>
                <button onClick={cancelEdit} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
              </div>
            )}

            {/* Input Box */}
            <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.01)" }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (editingMsgId) submitEdit();
                  else handleSend();
                }}
                style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}
              >
                <textarea
                  ref={inputRef}
                  className="input"
                  placeholder={editingMsgId ? "Edit your message…" : "Ask anything, e.g. 'trash bounced leads every day'…"}
                  value={editingMsgId ? editingText : inputText}
                  onChange={(e) => editingMsgId ? setEditingText(e.target.value) : setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (editingMsgId) submitEdit();
                      else handleSend();
                    }
                  }}
                  style={{ flex: 1, fontSize: "13px", resize: "none", minHeight: 38, maxHeight: 120, padding: "8px 12px", borderRadius: 8, lineHeight: 1.5 }}
                  disabled={loading}
                  rows={1}
                />
                {loading ? (
                  <button
                    type="button"
                    onClick={handleStop}
                    style={{ padding: "8px 14px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, color: "#f87171", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    ⏹ Stop
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-brand"
                    style={{ padding: "8px 16px", whiteSpace: "nowrap" }}
                    disabled={editingMsgId ? !editingText.trim() : !inputText.trim()}
                  >
                    {editingMsgId ? "✓ Send" : "Send"}
                  </button>
                )}
              </form>
              <div style={{ fontSize: "10px", color: "var(--text-4)", marginTop: 6 }}>
                Press Enter to send · Shift+Enter for new line · You can say "every day", "every hour", "on condition…"
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
