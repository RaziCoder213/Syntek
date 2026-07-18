import { useState, useEffect } from "react";

export default function Feedback({ showToast }) {
  const [category, setCategory] = useState("Feature Request");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbacks, setFeedbacks] = useState([]);
  const [fetching, setFetching] = useState(false);

  const fetchFeedbacks = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/feedback", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setFeedbacks(data);
      }
    } catch (err) {
      console.error("Failed to fetch feedbacks:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      showToast("Please enter a feedback message", "warn");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ category, message })
      });
      if (res.ok) {
        showToast("Thank you! Your feedback has been submitted successfully.", "success");
        setMessage("");
        fetchFeedbacks();
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed");
      }
    } catch (err) {
      showToast(err.message || "Failed to submit feedback", "danger");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBadgeStyle = (cat) => {
    switch (cat) {
      case "Bug Report":
        return { bg: "rgba(239, 68, 68, 0.08)", text: "var(--color-crimson)", border: "rgba(239, 68, 68, 0.2)" };
      case "Feature Request":
        return { bg: "rgba(99, 102, 241, 0.08)", text: "var(--color-indigo)", border: "rgba(99, 102, 241, 0.2)" };
      case "Usability Issue":
        return { bg: "rgba(245, 158, 11, 0.08)", text: "var(--color-amber)", border: "rgba(245, 158, 11, 0.2)" };
      case "Question":
        return { bg: "rgba(13, 148, 136, 0.08)", text: "var(--color-teal)", border: "rgba(13, 148, 136, 0.2)" };
      default:
        return { bg: "var(--bg-translucent-mild)", text: "var(--text-secondary)", border: "var(--border-translucent)" };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", animation: "fadeIn 0.4s ease" }}>
      
      {/* Title */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ padding: "10px", borderRadius: "10px", background: "var(--color-lime-glow)", border: "1px solid var(--color-lime-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg style={{ width: "24px", height: "24px", color: "var(--color-lime)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
          </svg>
        </div>
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>Beta Feedback Hub</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "4px", margin: 0 }}>
            Share your feature requests, report bugs, ask usability questions, or tell us how we can make Syntek better.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "24px", alignItems: "flex-start" }}>
        
        {/* Submission Form */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg style={{ width: "16px", height: "16px", color: "var(--color-indigo)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Submit New Feedback</h3>
          </div>
          
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Feedback Category</label>
              <select 
                className="input-field" 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                style={{ height: "40px" }}
              >
                <option value="Feature Request">💡 Feature Request</option>
                <option value="Bug Report">🐛 Bug Report</option>
                <option value="Usability Issue">⚙️ Usability Issue</option>
                <option value="Question">❓ Question</option>
                <option value="Other">💬 Other / General Thoughts</option>
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Your Message</label>
              <textarea 
                className="input-field" 
                value={message} 
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What's on your mind? Please describe what you encountered or what you would like to see in detail..."
                style={{ minHeight: "150px", fontFamily: "var(--font-sans)", lineHeight: "1.6", resize: "vertical" }}
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-lime glow-card"
              disabled={loading || !message.trim()}
              style={{ width: "100%", padding: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontWeight: 700 }}
            >
              {loading ? "Sending Feedback..." : "Send Feedback to Team"}
            </button>
          </form>
        </div>

        {/* Feedback History */}
        <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "18px", minHeight: "410px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg style={{ width: "16px", height: "16px", color: "var(--color-indigo)" }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Your Feedback History</h3>
          </div>
          
          {fetching ? (
            <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px" }}>
              Loading past feedbacks...
            </div>
          ) : feedbacks.length === 0 ? (
            <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "13px", gap: "10px", padding: "40px 0" }}>
              <svg style={{ width: "24px", height: "24px" }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>No feedback submitted yet. Your voice helps shape the future of Syntek!</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxHeight: "500px", overflowY: "auto", paddingRight: "4px" }}>
              {feedbacks.map((f) => {
                const style = getCategoryBadgeStyle(f.category);
                return (
                  <div 
                    key={f.id} 
                    style={{
                      background: "var(--bg-translucent-subtle)",
                      border: "1px solid var(--border-translucent)",
                      borderRadius: "10px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="badge" style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}`, fontSize: "9px" }}>
                        {f.category.toUpperCase()}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        {new Date(f.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: "1.5", margin: 0, whiteSpace: "pre-wrap" }}>
                      {f.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
