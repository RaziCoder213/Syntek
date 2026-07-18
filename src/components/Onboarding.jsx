import { useState } from "react";

const STEPS = [
  { label: "Your Business", icon: "🏢" },
  { label: "Your Offer",    icon: "🎯" },
  { label: "Connect Gmail", icon: "📧" },
  { label: "First Target",  icon: "🔍" },
];

export default function Onboarding({ settings, onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    senderName:         settings.senderName   || "",
    senderRole:         settings.senderRole   || "",
    companyName:        settings.companyName  || "",
    aboutText:          settings.aboutText    || "",
    pitchOffer:         settings.pitchOffer   || "whatsapp_bot",
    customOfferDetails: settings.customOfferDetails || "",
    gmailUser:          settings.gmailUser    || "",
    gmailPass:          settings.gmailPass    || "",
    geminiKey:          settings.geminiKey    || "",
    niche:              settings.niche        || "Cafes & Brunch",
    location:           settings.location     || "Austin, TX",
    dailyLeadLimit:     settings.dailyLeadLimit || 10,
  });

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const canNext = () => {
    if (step === 0) return form.senderName.trim() && form.companyName.trim();
    if (step === 1) return form.pitchOffer;
    if (step === 2) return true; // Gmail is optional
    return form.niche.trim() && form.location.trim();
  };

  const handleComplete = () => {
    onComplete({
      senderName: form.senderName,
      senderRole: form.senderRole,
      companyName: form.companyName,
      aboutText: form.aboutText,
      pitchOffer: form.pitchOffer,
      customOfferDetails: form.customOfferDetails,
      gmailUser: form.gmailUser,
      gmailPass: form.gmailPass,
      geminiKey: form.geminiKey,
      niche: form.niche,
      location: form.location,
      dailyLeadLimit: parseInt(form.dailyLeadLimit) || 10,
    });
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <div className="flex items-center gap-8 mb-12">
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#fff", fontSize: 14 }}>S</div>
            <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-1)" }}>Syntek</span>
          </div>
          {/* Step dots */}
          <div className="onboarding-steps">
            {STEPS.map((s, i) => (
              <div
                key={i}
                className={`step-dot ${i === step ? "active" : i < step ? "done" : ""}`}
              />
            ))}
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text-1)", marginBottom: 4 }}>
            {STEPS[step].icon} {STEPS[step].label}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            Step {step + 1} of {STEPS.length}
          </div>
        </div>

        {/* Body */}
        <div className="onboarding-body">
          {/* Step 0 — Business info */}
          {step === 0 && (
            <>
              <div className="input-group">
                <label className="input-label">Your Name *</label>
                <input className="input" placeholder="e.g. Muhammad Razi" value={form.senderName} onChange={set("senderName")} autoFocus />
              </div>
              <div className="input-group">
                <label className="input-label">Your Role / Title</label>
                <input className="input" placeholder="e.g. Freelance Developer" value={form.senderRole} onChange={set("senderRole")} />
              </div>
              <div className="input-group">
                <label className="input-label">Business / Company Name *</label>
                <input className="input" placeholder="e.g. Razi Dev Studio" value={form.companyName} onChange={set("companyName")} />
              </div>
              <div className="input-group">
                <label className="input-label">Short Bio (used in emails)</label>
                <textarea className="input" rows={3} placeholder="I'm a developer who helps local businesses automate their customer engagement..." value={form.aboutText} onChange={set("aboutText")} />
              </div>
            </>
          )}

          {/* Step 1 — Offer type */}
          {step === 1 && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 4 }}>
                What service are you pitching to businesses?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { id: "whatsapp_bot",  label: "💬 WhatsApp Booking Bot",  desc: "Automate reservations & DMs via WhatsApp" },
                  { id: "website_dev",   label: "🌐 Website Design & Dev",  desc: "Build or redesign business websites" },
                  { id: "ai_chatbot",    label: "🤖 AI Chatbot / Assistant", desc: "24/7 AI customer support & FAQ bots" },
                  { id: "custom",        label: "✏️  Custom Offer",           desc: "Describe your own service below" },
                ].map(o => (
                  <div
                    key={o.id}
                    onClick={() => setForm(p => ({ ...p, pitchOffer: o.id }))}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${form.pitchOffer === o.id ? "var(--brand)" : "var(--border-1)"}`,
                      background: form.pitchOffer === o.id ? "var(--brand-subtle)" : "var(--bg-overlay)",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text-1)", marginBottom: 2 }}>{o.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-3)" }}>{o.desc}</div>
                  </div>
                ))}
              </div>
              {form.pitchOffer === "custom" && (
                <div className="input-group" style={{ marginTop: 8 }}>
                  <label className="input-label">Describe your custom offer</label>
                  <textarea className="input" rows={3} placeholder="e.g. We build AI-powered loyalty card systems for restaurants..." value={form.customOfferDetails} onChange={set("customOfferDetails")} />
                </div>
              )}
            </>
          )}

          {/* Step 2 — Gmail */}
          {step === 2 && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 4 }}>
                Connect your Gmail to send outreach emails. You can also skip this and add it later in Settings.
              </div>
              <div className="input-group">
                <label className="input-label">Gmail Address</label>
                <input className="input" type="email" placeholder="yourname@gmail.com" value={form.gmailUser} onChange={set("gmailUser")} />
              </div>
              <div className="input-group">
                <label className="input-label">Gmail App Password</label>
                <input className="input" type="password" placeholder="xxxx xxxx xxxx xxxx" value={form.gmailPass} onChange={set("gmailPass")} />
                <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>
                  Use a{" "}
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>
                    Gmail App Password
                  </a>{" "}
                  — not your regular Gmail password.
                </span>
              </div>
              <div className="input-group" style={{ opacity: 0.55, pointerEvents: "none" }}>
                <label className="input-label">AI Engine</label>
                <input className="input" value="Antigravity AI (built-in — no key needed)" readOnly />
                <span style={{ fontSize: 11.5, color: "var(--text-4)" }}>
                  AI is powered by the built-in Antigravity engine. No API key required.
                </span>
              </div>
            </>
          )}

          {/* Step 3 — First target */}
          {step === 3 && (
            <>
              <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 4 }}>
                Configure your first lead scrape. You can change these anytime in Lead Finder.
              </div>
              <div className="input-group">
                <label className="input-label">Target Niche *</label>
                <input className="input" placeholder="e.g. Cafes & Brunch, Hair Salons, Gyms..." value={form.niche} onChange={set("niche")} />
              </div>
              <div className="input-group">
                <label className="input-label">Target Location *</label>
                <input className="input" placeholder="e.g. Austin, TX" value={form.location} onChange={set("location")} />
              </div>
              <div className="input-group">
                <label className="input-label">Leads per scrape run</label>
                <div className="slider-row" style={{ marginTop: 4 }}>
                  <input
                    className="slider" type="range" min={5} max={50} step={5}
                    value={form.dailyLeadLimit}
                    onChange={e => setForm(p => ({ ...p, dailyLeadLimit: e.target.value }))}
                  />
                  <span className="slider-value">{form.dailyLeadLimit}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="onboarding-footer">
          <button className="btn btn-ghost btn-sm" onClick={onSkip}>
            Skip Setup
          </button>
          <div className="flex gap-8">
            {step > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(s => s - 1)}>
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button
                className="btn btn-primary btn-sm"
                disabled={!canNext()}
                onClick={() => setStep(s => s + 1)}
              >
                Next →
              </button>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                disabled={!canNext()}
                onClick={handleComplete}
              >
                🚀 Let&apos;s Go!
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
