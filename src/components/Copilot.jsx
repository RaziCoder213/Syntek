import { useState, useEffect, useRef } from "react";

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
            return (
              <li key={lIdx} style={{ marginBottom: 4 }}>
                {parseBoldText(cleanLine)}
              </li>
            );
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
    
    return (
      <p key={bIdx} style={{ margin: "4px 0", lineHeight: 1.5 }}>
        {parseBoldText(trimmed)}
      </p>
    );
  });
}

export default function Copilot({ showToast, onRefreshAll }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
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
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearChat = async () => {
    if (!window.confirm("Clear co-pilot chat history?")) return;
    try {
      const res = await fetch("/api/ai/copilot", { method: "DELETE" });
      if (res.ok) {
        setMessages([]);
        showToast("Co-pilot chat cleared.", "info");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSend = async (textToSend) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    if (!textToSend) setInputText("");
    
    // Optimistic local state update
    const userMsg = { id: Date.now(), role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      if (res.ok) {
        const data = await res.json();
        // Append response message
        setMessages(prev => [...prev, {
          id: Date.now() + 1,
          role: "assistant",
          content: data.reply,
          actionResults: data.actionResults
        }]);

        // If any actions were processed, trigger main view reload
        if (data.actions && data.actions.length > 0) {
          if (onRefreshAll) {
            onRefreshAll();
          }
          // Show toasts for actions
          if (data.actionResults) {
            data.actionResults.forEach(r => {
              if (r.success) {
                showToast(r.message, "success");
              } else {
                showToast(r.error, "warning");
              }
            });
          }
        }
      } else {
        showToast("Co-pilot failed to respond.", "danger");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error communicating with Co-pilot.", "danger");
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    "Move Razi HZTech to Won",
    "Sync Inbox",
    "Run campaign",
    "Add Follow Up stage",
    "Initiate re-research on Razi HZTech",
    "Set lead limit to 15"
  ];

  return (
    <>
      {/* Floating Toggle Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 1000,
            background: "linear-gradient(135deg, var(--brand) 0%, #8b5cf6 100%)",
            color: "white",
            border: "none",
            borderRadius: "50px",
            padding: "12px 20px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 10px 25px rgba(108, 92, 231, 0.4)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s"
          }}
          className="hover-scale"
          title="Open AI Co-pilot Console"
        >
          <span>🧠</span>
          <span>Co-pilot</span>
        </button>
      )}

      {/* Slide-out Drawer Panel */}
      {isOpen && (
        <>
          {/* Backdrop dismiss */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.3)",
              backdropFilter: "blur(2px)",
              zIndex: 998
            }}
          />

          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "400px",
              background: "rgba(18, 18, 26, 0.95)",
              borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "-10px 0 40px rgba(0,0,0,0.6)",
              zIndex: 999,
              display: "flex",
              flexDirection: "column",
              backdropFilter: "blur(20px)"
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🧠</span>
                <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--text-1)" }}>Syntek AI Co-pilot</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {messages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-3)",
                      fontSize: "11px",
                      cursor: "pointer",
                      padding: 0
                    }}
                    className="hover-white"
                  >
                    Clear Chat
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-2)",
                    fontSize: "16px",
                    cursor: "pointer",
                    padding: "4px"
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Messages Container */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "16px"
              }}
            >
              {messages.length === 0 ? (
                <div style={{ margin: "auto", textAlign: "center", color: "var(--text-3)", maxWidth: "280px" }}>
                  <div style={{ fontSize: "36px", marginBottom: "12px" }}>🧠</div>
                  <h4 style={{ color: "var(--text-1)", marginBottom: "6px", fontSize: "14px" }}>Ask me anything!</h4>
                  <p style={{ fontSize: "12px", lineHeight: "1.5" }}>
                    I can move stages, create leads, start automations, find email addresses, sync your inbox, and update configurations.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}
                  >
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "12px",
                        fontSize: "13px",
                        lineHeight: "1.5",
                        background: m.role === "user" ? "var(--brand)" : "var(--bg-overlay)",
                        color: m.role === "user" ? "white" : "var(--text-1)",
                        border: m.role === "user" ? "none" : "1px solid var(--border-1)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                        wordBreak: "break-word"
                      }}
                    >
                      {formatChatMessage(m.content)}
                    </div>

                    {/* Action Execution Logs */}
                    {m.actionResults && m.actionResults.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          marginTop: "4px",
                          paddingLeft: "6px"
                        }}
                      >
                        {m.actionResults.map((r, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: "11px",
                              color: r.success ? "var(--success)" : "var(--warning)",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px"
                            }}
                          >
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
                <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px" }}>
                  <div className="status-dot green pulse" style={{ width: 6, height: 6 }} />
                  <span style={{ fontSize: "11px", color: "var(--text-3)" }}>Co-pilot is thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions */}
            {messages.length === 0 && (
              <div style={{ padding: "0 20px 10px 20px" }}>
                <div style={{ fontSize: "11px", color: "var(--text-3)", marginBottom: "8px", fontWeight: 600 }}>SUGGESTED COMMANDS</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(s)}
                      style={{
                        padding: "6px 10px",
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "20px",
                        fontSize: "11px",
                        color: "var(--text-2)",
                        cursor: "pointer",
                        transition: "background 0.2s"
                      }}
                      className="hover-bg-light"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input Box */}
            <div
              style={{
                padding: "20px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.01)"
              }}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                style={{ display: "flex", gap: "8px" }}
              >
                <input
                  className="input"
                  placeholder="Ask anything, e.g., 'sync inbox'..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  style={{ flex: 1, fontSize: "13px" }}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="btn btn-brand"
                  style={{ padding: "8px 16px" }}
                  disabled={loading || !inputText.trim()}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
