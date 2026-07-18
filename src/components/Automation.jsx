import { useState, useEffect, useRef, useCallback } from "react";

const MODES = [
  {
    id: "scrape_only",
    icon: "🔍",
    title: "Scrape Only",
    desc: "AI finds & saves qualified leads. No emails sent.",
  },
  {
    id: "email_only",
    icon: "📧",
    title: "Email Only",
    desc: "Send outreach to existing not-contacted leads.",
  },
  {
    id: "both",
    icon: "⚡",
    title: "Full Autopilot",
    desc: "Scrape new leads and email them automatically.",
  },
];

const SCHEDULES = [
  { id: "daily",   label: "Every Day" },
  { id: "weekly",  label: "Every Week" },
  { id: "monthly", label: "Every Month" },
  { id: "custom",  label: "Custom (manual trigger)" },
];

const LS_JOB_KEY = "syntek_active_job";

export default function Automation({ settings, onSave, showToast, refreshData }) {
  const [mode, setMode]         = useState(settings.autopilotMode || "both");
  const [schedule, setSchedule] = useState(settings.scheduleType  || "daily");
  const [active, setActive]     = useState(settings.isActive      || false);
  const [runTime, setRunTime]   = useState("09:00");
  const [running, setRunning]   = useState(false);
  const [stopping, setStopping] = useState(false);
  const [logs, setLogs]         = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const logRef  = useRef(null);
  const stopRef = useRef(false);   // local stop flag for scan polling
  const bgJobRef = useRef(false);  // true when a background jobId is active — prevents finally from clearing running state

  /* ── Sync settings from parent ── */
  useEffect(() => {
    setMode(settings.autopilotMode || "both");
    setSchedule(settings.scheduleType || "daily");
    setActive(settings.isActive || false);
  }, [settings]);

  /* ── Auto-scroll log ── */
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  /* ── On mount: check if a run is active on the server ── */
  useEffect(() => {
    fetch("/api/automation/status")
      .then(r => r.json())
      .then(data => {
        if (data.jobs && data.jobs.length > 0) {
          const liveJob = data.jobs[0];
          bgJobRef.current = true;
          setActiveJobId(liveJob.jobId);
          setRunning(true);
          addLog(`⚡ Reconnected to background run (ID: ${liveJob.jobId.split(":").pop()})`, "info");
          addLog("Automation is still running on the server in the background.", "info");
        } else {
          localStorage.removeItem(LS_JOB_KEY);
        }
      })
      .catch(err => console.error("Failed to check automation status:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Poll server status when connected to a live jobId ── */
  useEffect(() => {
    if (!activeJobId) return;
    const iv = setInterval(async () => {
      try {
        const res  = await fetch("/api/automation/status");
        const data = await res.json();
        const live = data.jobs?.find(j => j.jobId === activeJobId);
        if (!live) {
          // Job finished — now it's safe to clean up
          bgJobRef.current = false;
          clearInterval(iv);
          setRunning(false);
          setStopping(false);
          setActiveJobId(null);
          localStorage.removeItem(LS_JOB_KEY);
          addLog("✓ Automation run completed. Refreshing data...", "success");
          if (refreshData) {
            await refreshData();
            addLog("✓ Kanban & Inbox updated!", "success");
          }
          showToast("Automation complete! Leads & inbox updated.", "success");
        } else if (live.stopped) {
          addLog("⚠ Stop signal acknowledged by server.", "warn");
        }
      } catch { /* transient */ }
    }, 3000);
    return () => clearInterval(iv);
  }, [activeJobId, refreshData, showToast]);

  const addLog = useCallback((text, type = "info") => {
    setLogs(prev => [...prev, { text, type, time: new Date().toLocaleTimeString() }]);
  }, []);

  async function handleSave() {
    await onSave({ autopilotMode: mode, scheduleType: schedule, isActive: active });
    showToast("Automation settings saved.", "success");
  }

  /* ── Emergency Stop ── */
  async function handleStop() {
    if (!activeJobId) return;
    setStopping(true);
    stopRef.current = true;
    addLog("🛑 Emergency stop requested. Finishing current step...", "warn");
    try {
      const res = await fetch(`/api/automation/stop/${encodeURIComponent(activeJobId)}`, { method: "POST" });
      if (res.ok) {
        addLog("Stop signal sent to server. Campaign will halt after current email.", "warn");
        showToast("Stop signal sent — automation will halt shortly.", "warning");
      } else {
        // If job already finished
        setRunning(false);
        setStopping(false);
        setActiveJobId(null);
        localStorage.removeItem(LS_JOB_KEY);
        addLog("Run already completed.", "info");
      }
    } catch (e) {
      addLog(`✕ Stop failed: ${e.message}`, "error");
      setStopping(false);
    }
  }

  /* ── Run Now ── */
  async function handleRunNow() {
    bgJobRef.current = false;
    setRunning(true);
    setStopping(false);
    stopRef.current = false;
    setLogs([]);
    addLog("Starting automation run...", "info");

    try {
      const endpoint = mode === "scrape_only"
        ? "/api/deepsearch"
        : mode === "email_only"
          ? "/api/campaigns/run"
          : "/api/autopilot/run";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche:            settings.niche,
          location:         settings.location,
          limit:            settings.dailyLeadLimit,
          pitch_offer:      settings.pitchOffer,
          required_contact: settings.requiredContact,
          mode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addLog(`✕ Run failed: ${err.error || res.statusText}`, "error");
        showToast("Automation run failed.", "danger");
        setRunning(false);
        return;
      }

      const data = await res.json();

      // Log any immediate response messages
      if (data.log) {
        for (const line of data.log) {
          addLog(line.text || line.message || String(line), line.type || "info");
        }
      }

      // If server returned a jobId, track it for stop button + reconnect
      const jobId = data.jobId;
      if (jobId) {
        bgJobRef.current = true;  // ← prevent finally from clearing state
        setActiveJobId(jobId);
        localStorage.setItem(LS_JOB_KEY, JSON.stringify({ jobId, startedAt: Date.now(), mode }));
        addLog(`⚡ Background job started (ID: ${jobId.split(":").pop()}). Safe to close — runs on server.`, "info");
        addLog("Use the 🛑 Stop button to cancel anytime.", "info");
        return; // finally will run but bgJobRef.current=true so it skips cleanup
      }

      // If we got a scanId (deepsearch / async scan), poll for completion
      const scanId = data.scanId || data.scan_id;
      if (scanId) {
        addLog(`Scan started (ID: ${scanId}). AI is searching...`, "info");
        let seenLogCount = 0;
        let done = false;
        let pollAttempts = 0;
        while (!done && pollAttempts < 200 && !stopRef.current) {
          await new Promise(r => setTimeout(r, 3000));
          pollAttempts++;
          try {
            const statusRes  = await fetch(`/api/scan/status/${scanId}`);
            if (!statusRes.ok) continue;
            const statusData = await statusRes.json();
            const serverLogs = statusData.logs || [];
            for (let j = seenLogCount; j < serverLogs.length; j++) {
              const entry = serverLogs[j];
              addLog(entry.text || entry.message || "", entry.type || "info");
            }
            seenLogCount = serverLogs.length;
            if (statusData.status === "done") {
              done = true;
              addLog("✓ Scan finished. Refreshing data...", "success");
              if (refreshData) {
                await refreshData();
                addLog("✓ Kanban & Inbox updated!", "success");
              }
            } else if (statusData.status === "error") {
              done = true;
              addLog(`✕ Scan error: ${statusData.error || "Unknown error"}`, "error");
            }
          } catch { /* transient poll failure */ }
        }
        if (!done && !stopRef.current) addLog("⚠ Scan timed out. Partial results may have been saved.", "warn");
      } else {
        // Synchronous response (already logged above)
        addLog(`✓ Run triggered. ${data.message || ""}`, "success");
        if (refreshData) await refreshData();
      }

      showToast("Automation run finished!", "success");
    } catch (e) {
      addLog(`✕ Network error: ${e.message}`, "error");
      showToast("Network error during run.", "danger");
    } finally {
      // Only clear running state if there's NO active background job.
      // If bgJobRef.current is true, the job is still running on the server
      // and the polling useEffect will handle cleanup when it finishes.
      if (!bgJobRef.current) {
        setRunning(false);
        setStopping(false);
        setActiveJobId(null);
        localStorage.removeItem(LS_JOB_KEY);
      }
    }
  }

  const isEmailMode = mode === "email_only" || mode === "both";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780 }}>
      {/* Header */}
      <div className="section-header">
        <div>
          <div className="section-title">Automation Center</div>
          <div className="section-desc">Configure autopilot — Syntek works while you sleep.</div>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-secondary" onClick={handleSave} disabled={running}>Save</button>

          {/* Emergency Stop button — only visible while running an email/autopilot job */}
          {running && isEmailMode && (
            <button
              className="btn"
              onClick={handleStop}
              disabled={stopping}
              title="Stop sending emails after the current one finishes"
              style={{
                background: stopping ? "var(--bg-overlay)" : "linear-gradient(135deg, #ef4444, #dc2626)",
                color: "#fff",
                border: "none",
                boxShadow: stopping ? "none" : "0 0 16px rgba(239,68,68,0.4)",
                animation: stopping ? "none" : "pulse-red 1.5s infinite",
                fontWeight: 700,
                letterSpacing: "0.03em",
                gap: 6,
                display: "flex",
                alignItems: "center",
              }}
            >
              {stopping
                ? <><span className="spinner spinner-sm" style={{ borderTopColor: "#fff" }} /> Stopping...</>
                : <>🛑 Emergency Stop</>}
            </button>
          )}

          <button
            className="btn btn-primary"
            onClick={handleRunNow}
            disabled={running}
          >
            {running
              ? <><span className="spinner spinner-sm" /> Running...</>
              : "▶ Run Now"}
          </button>
        </div>
      </div>

      {/* Background running banner */}
      {running && activeJobId && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px", borderRadius: "var(--radius-md)",
          background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)",
          fontSize: 13, color: "var(--text-2)",
        }}>
          <span className="status-dot green pulse" />
          <span style={{ flex: 1 }}>
            <strong style={{ color: "var(--text-1)" }}>Automation running in background.</strong>
            {" "}Safe to close or navigate away — it will continue on the server and update when done.
          </span>
          {isEmailMode && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="btn btn-sm"
              style={{ background: "#ef4444", color: "#fff", border: "none", fontWeight: 700 }}
            >
              {stopping ? "Stopping…" : "🛑 Stop"}
            </button>
          )}
        </div>
      )}

      {/* Autopilot toggle */}
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 20px" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-1)" }}>Autopilot</div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
            Enable to run automatically on your chosen schedule.
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
          <span className="toggle-track"><span className="toggle-thumb" /></span>
        </label>
      </div>

      {/* Mode selector */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-4)", marginBottom: 10 }}>
          Autopilot Mode
        </div>
        <div className="automation-mode-cards">
          {MODES.map(m => (
            <div
              key={m.id}
              className={`mode-card ${mode === m.id ? "selected" : ""}`}
              onClick={() => !running && setMode(m.id)}
              style={{ opacity: running ? 0.6 : 1, cursor: running ? "not-allowed" : "pointer" }}
            >
              <div className="mode-card-icon">{m.icon}</div>
              <div className="mode-card-title">{m.title}</div>
              <div className="mode-card-desc">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Schedule + config */}
      <div className="grid-2">
        {/* Schedule */}
        <div className="card">
          <div className="card-header"><span className="card-title">Schedule</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {SCHEDULES.map(s => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: "var(--radius-md)", cursor: "pointer", background: schedule === s.id ? "var(--brand-subtle)" : "transparent", transition: "background 0.15s" }}>
                <input
                  type="radio"
                  name="schedule"
                  value={s.id}
                  checked={schedule === s.id}
                  onChange={() => setSchedule(s.id)}
                  style={{ accentColor: "var(--brand)" }}
                />
                <span style={{ fontSize: 13, color: schedule === s.id ? "var(--brand)" : "var(--text-2)", fontWeight: schedule === s.id ? 600 : 400 }}>{s.label}</span>
              </label>
            ))}
          </div>
          {schedule !== "custom" && (
            <div className="input-group" style={{ marginTop: 12 }}>
              <label className="input-label">Run Time</label>
              <input
                className="input input-sm"
                type="time"
                value={runTime}
                onChange={e => setRunTime(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Run config */}
        <div className="card">
          <div className="card-header"><span className="card-title">Run Config</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Target Niche</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{settings.niche || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Location</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{settings.location || "—"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Leads / Run</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)" }}>{settings.dailyLeadLimit || 10}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Pitch Offer</span>
              <span className="badge badge-brand" style={{ textTransform: "capitalize" }}>
                {(settings.pitchOffer || "—").replace("_", " ")}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Required Contact</span>
              <span style={{ fontSize: 12, color: "var(--text-1)" }}>{settings.requiredContact || "email_or_phone"}</span>
            </div>
            <div className="divider" />
            <div style={{ fontSize: 12, color: "var(--text-4)" }}>
              Niche, location &amp; limits are managed in{" "}
              <span style={{ color: "var(--brand)", fontWeight: 600, cursor: "pointer" }}>Settings → Profile</span>.
            </div>
          </div>
        </div>
      </div>

      {/* Live log console */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="card-title">Run Log</span>
          <div className="flex items-center gap-8">
            {running && (
              <>
                <span className="status-dot green pulse" />
                <span style={{ fontSize: 12, color: "var(--success)" }}>
                  {stopping ? "Stopping..." : "Running in background..."}
                </span>
              </>
            )}
            {logs.length > 0 && !running && (
              <button
                className="btn btn-ghost btn-icon"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={() => setLogs([])}
                title="Clear logs"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div ref={logRef} className="log-console" style={{ height: 220, borderRadius: "0 0 var(--radius-lg) var(--radius-lg)", border: "none" }}>
          {logs.length === 0 ? (
            <div style={{ color: "var(--text-4)", fontStyle: "italic" }}>
              Hit &quot;Run Now&quot; to see live logs here...
            </div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={`log-line ${l.type}`}>
                <span className="log-time">{l.time}</span>
                <span className="log-text">{l.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
