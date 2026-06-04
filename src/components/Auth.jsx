import React, { useState } from "react";

export default function Auth({ onLogin, showToast }) {
  const [isRegister, setIsRegister] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isRegister && password !== confirmPassword) {
      showToast("Passwords do not match", "danger");
      return;
    }
    setLoading(true);
    try {
      const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
      const payload = isRegister ? { company_name: companyName, email, password } : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }
      showToast(isRegister ? "Registration successful!" : "Welcome back!", "success");
      
      // Save session info
      localStorage.setItem("x-user-id", data.id);
      if (data.token) {
        localStorage.setItem("auth_token", data.token);
      }
      localStorage.setItem("current_user", JSON.stringify(data));
      
      onLogin(data);
    } catch (err) {
      showToast(err.message, "danger");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at center, #0e0e18 0%, #050508 100%)",
      padding: "20px",
      width: "100%"
    }}>
      <div className="glass-panel glow-card" style={{
        width: "100%",
        maxWidth: "460px",
        padding: "40px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        animation: "fadeIn 0.6s ease"
      }}>
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "28px", fontWeight: 900, color: "#fff", letterSpacing: "-0.04em" }}>
            Syn<span style={{ color: "var(--color-lime)" }}>tek</span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "6px" }}>
            {isRegister ? "Register your company portal" : "Log in to your workspace"}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {isRegister && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Company Name</label>
              <input
                type="text"
                className="input-field"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. Syntek Technologies"
                style={{ width: "100%", padding: "12px", background: "rgba(0,0,0,0.2)", border: "var(--border-subtle)", borderRadius: "8px", color: "#fff" }}
              />
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Email Address</label>
            <input
              type="email"
              className="input-field"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              style={{ width: "100%", padding: "12px", background: "rgba(0,0,0,0.2)", border: "var(--border-subtle)", borderRadius: "8px", color: "#fff" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Password</label>
            <input
              type="password"
              className="input-field"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: "100%", padding: "12px", background: "rgba(0,0,0,0.2)", border: "var(--border-subtle)", borderRadius: "8px", color: "#fff" }}
            />
          </div>

          {isRegister && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>Confirm Password</label>
              <input
                type="password"
                className="input-field"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                style={{ width: "100%", padding: "12px", background: "rgba(0,0,0,0.2)", border: "var(--border-subtle)", borderRadius: "8px", color: "#fff" }}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-lime"
            disabled={loading}
            style={{ width: "100%", padding: "14px", marginTop: "10px" }}
          >
            {loading ? "Authenticating..." : isRegister ? "Create Portal" : "Access Portal"}
          </button>
        </form>

        <div style={{ display: "flex", justifyContent: "center", fontSize: "13px" }}>
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-lime)",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            {isRegister ? "Already have an account? Log in" : "Need an account? Register your company"}
          </button>
        </div>
      </div>
    </div>
  );
}
