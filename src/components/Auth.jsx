import { useState } from "react";

export default function Auth({ onLogin }) {
  const [view, setView] = useState("login"); // login | register | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (view === "register") {
      if (!companyName.trim()) return setError("Company or business name is required.");
      if (password !== confirmPassword) return setError("Passwords do not match.");
      if (password.length < 6) return setError("Password must be at least 6 characters.");
    }

    if (view === "forgot") {
      setLoading(true);
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to send reset link.");
        setForgotSent(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const endpoint = view === "register" ? "/api/auth/register" : "/api/auth/login";
      const payload =
        view === "register"
          ? { company_name: companyName, email, password }
          : { email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed.");

      localStorage.setItem("x-user-id", data.id);
      localStorage.setItem("auth_token", data.token || "");
      localStorage.setItem("current_user", JSON.stringify(data));
      onLogin(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">S</div>
          <span className="auth-logo-name">Syntek</span>
        </div>

        {/* Forgot password success */}
        {view === "forgot" && forgotSent ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div className="auth-title" style={{ fontSize: 18 }}>Check your inbox</div>
            <p className="auth-sub">
              We sent a reset link to <strong style={{ color: "var(--text-1)" }}>{email}</strong>.
            </p>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 12 }}
              onClick={() => { setView("login"); setForgotSent(false); }}
            >
              ← Back to login
            </button>
          </div>
        ) : (
          <>
            <h1 className="auth-title">
              {view === "login" && "Welcome back"}
              {view === "register" && "Create your account"}
              {view === "forgot" && "Reset password"}
            </h1>
            <p className="auth-sub">
              {view === "login" && "Sign in to your Syntek workspace."}
              {view === "register" && "Start finding and reaching qualified leads."}
              {view === "forgot" && "Enter your email to receive a reset link."}
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              {view === "register" && (
                <div className="input-group">
                  <label className="input-label">Business / Company Name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Acme Corp"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    autoFocus={view === "register"}
                  />
                </div>
              )}

              <div className="input-group">
                <label className="input-label">Email address</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus={view === "login"}
                />
              </div>

              {view !== "forgot" && (
                <div className="input-group">
                  <label className="input-label">Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder={view === "register" ? "Min. 6 characters" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              )}

              {view === "register" && (
                <div className="input-group">
                  <label className="input-label">Confirm Password</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              )}

              {view === "login" && (
                <div style={{ textAlign: "right", marginTop: -6 }}>
                  <span
                    className="auth-link"
                    style={{ fontSize: 12 }}
                    onClick={() => { setView("forgot"); setError(""); }}
                  >
                    Forgot password?
                  </span>
                </div>
              )}

              {error && (
                <div
                  style={{
                    background: "var(--danger-bg)",
                    border: "1px solid rgba(239,68,68,0.25)",
                    borderRadius: "var(--radius-md)",
                    padding: "10px 12px",
                    fontSize: 12.5,
                    color: "var(--danger)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full"
                style={{ justifyContent: "center", padding: "10px 16px", marginTop: 4 }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner spinner-sm" /> Processing...
                  </>
                ) : (
                  <>
                    {view === "login" && "Sign In"}
                    {view === "register" && "Create Account →"}
                    {view === "forgot" && "Send Reset Link"}
                  </>
                )}
              </button>
            </form>

            <div className="auth-switch">
              {view === "login" && (
                <>
                  Don&apos;t have an account?{" "}
                  <span className="auth-link" onClick={() => { setView("register"); setError(""); }}>
                    Sign up free
                  </span>
                </>
              )}
              {view === "register" && (
                <>
                  Already have an account?{" "}
                  <span className="auth-link" onClick={() => { setView("login"); setError(""); }}>
                    Sign in
                  </span>
                </>
              )}
              {view === "forgot" && (
                <span className="auth-link" onClick={() => { setView("login"); setError(""); }}>
                  ← Back to sign in
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
