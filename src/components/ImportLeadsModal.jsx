import { useState, useRef } from "react";

/**
 * CSV / JSON Import Modal Component for Syntek Leads
 * Parses CSV & JSON files, maps columns automatically, displays live preview, and imports to backend.
 */
export default function ImportLeadsModal({ isOpen, onClose, onSuccess, showToast }) {
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  // Simple CSV Parser handling quotes and commas
  function parseCsvText(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length === 0) return [];

    const parseLine = (line) => {
      const result = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += c;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length === 0 || (values.length === 1 && !values[0])) continue;
      const rowObj = {};
      headers.forEach((h, idx) => {
        rowObj[h] = values[idx] || "";
      });

      // Normalize key aliases
      const normalized = {
        name: rowObj.name || rowObj.business || rowObj.company || rowObj.title || "",
        email: rowObj.email || rowObj.email_address || rowObj.contact_email || "",
        phone: rowObj.phone || rowObj.phone_number || rowObj.mobile || "",
        city: rowObj.city || rowObj.location || rowObj.address || "Unknown",
        type: rowObj.type || rowObj.niche || rowObj.category || "General",
        website: rowObj.website || rowObj.url || rowObj.domain || "",
        owner_name: rowObj.owner_name || rowObj.contact_name || rowObj.owner || "",
        owner_role: rowObj.owner_role || rowObj.role || rowObj.title || "Owner",
        rating: parseFloat(rowObj.rating || "4.5"),
        reviews: parseInt(rowObj.reviews || "0", 10),
        status: rowObj.status || (rowObj.email ? "not contacted" : "no_email")
      };

      if (normalized.name) {
        rows.push(normalized);
      }
    }

    return rows;
  }

  function handleFileChange(e) {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    processFile(selectedFile);
  }

  function processFile(selectedFile) {
    setFile(selectedFile);
    const reader = new FileReader();

    reader.onload = (evt) => {
      const content = evt.target.result;
      try {
        if (selectedFile.name.endsWith(".json")) {
          const json = JSON.parse(content);
          const dataArray = Array.isArray(json) ? json : [json];
          const mapped = dataArray.map(item => ({
            name: item.name || item.company || "Unknown Business",
            email: item.email || "",
            phone: item.phone || "",
            city: item.city || item.location || "Unknown",
            type: item.type || item.niche || "General",
            website: item.website || "",
            owner_name: item.owner_name || item.contact_name || "",
            status: item.status || "not contacted"
          })).filter(l => l.name);
          setParsedData(mapped);
        } else {
          // Default CSV parsing
          const rows = parseCsvText(content);
          setParsedData(rows);
        }
      } catch (err) {
        showToast("Error reading file: " + err.message, "danger");
      }
    };

    reader.readAsText(selectedFile);
  }

  async function handleUpload() {
    if (parsedData.length === 0) {
      showToast("No valid leads found in file.", "warning");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedData)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to import leads");
      }

      const data = await res.json();
      showToast(`🎉 Imported ${parsedData.length} leads successfully!`, "success");
      if (onSuccess) onSuccess(parsedData.length);
      onClose();
    } catch (err) {
      showToast("Import failed: " + err.message, "danger");
    } finally {
      setLoading(false);
    }
  }

  function downloadSampleCsv() {
    const headers = "Name,Category,City,Email,Phone,Website,Owner Name,Owner Role\n";
    const sample = "Bennu Coffee,Cafe,Austin TX,info@bennucoffee.com,512-555-0199,https://bennucoffee.com,Steve L,Founder\nAustin Dental Care,Dentist,Austin TX,contact@austindental.com,512-555-0188,https://austindental.com,Dr Smith,Lead Dentist\n";
    const blob = new Blob([headers + sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "syntek_leads_import_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        background: "var(--bg-card, #121318)", border: "1px solid var(--border-1, #262936)",
        borderRadius: "16px", padding: "24px", width: "90%", maxWidth: "620px",
        color: "var(--text-1, #fff)", boxShadow: "0 20px 40px rgba(0,0,0,0.6)"
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            📤 Import Leads (CSV / JSON)
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-3)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: isDragOver ? "2px dashed var(--brand, #3b82f6)" : "2px dashed var(--border-2, #333)",
            borderRadius: "12px", padding: "32px 16px", textAlign: "center",
            background: isDragOver ? "rgba(59,130,246,0.1)" : "var(--bg-input, #1a1c24)",
            cursor: "pointer", marginBottom: 16, transition: "all 0.2s"
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv, .json"
            style={{ display: "none" }}
          />
          <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>
            {file ? file.name : "Click or drag CSV / JSON file here to import"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-4)", marginTop: 4 }}>
            Supports columns: Name, Email, Phone, City, Category, Website, Owner Name
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button
            onClick={downloadSampleCsv}
            style={{ background: "none", border: "none", color: "var(--brand, #3b82f6)", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
          >
            📥 Download Sample CSV Template
          </button>
          {parsedData.length > 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "#84cc16" }}>
              ✓ {parsedData.length} valid lead(s) ready to import
            </span>
          )}
        </div>

        {/* Live Preview Table */}
        {parsedData.length > 0 && (
          <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--border-subtle, #222)", borderRadius: 8, marginBottom: 16 }}>
            <table style={{ width: "100%", fontSize: 11.5, textOverflow: "ellipsis" }}>
              <thead>
                <tr style={{ background: "var(--bg-translucent-mild, #181a20)", textAlign: "left" }}>
                  <th style={{ padding: 6 }}>Business Name</th>
                  <th style={{ padding: 6 }}>Email</th>
                  <th style={{ padding: 6 }}>Phone</th>
                  <th style={{ padding: 6 }}>City</th>
                </tr>
              </thead>
              <tbody>
                {parsedData.slice(0, 5).map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle, #222)" }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: 6 }}>{r.email || "—"}</td>
                    <td style={{ padding: 6 }}>{r.phone || "—"}</td>
                    <td style={{ padding: 6 }}>{r.city || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedData.length > 5 && (
              <div style={{ padding: 6, textAlign: "center", fontSize: 11, color: "var(--text-4)" }}>
                ...and {parsedData.length - 5} more rows
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleUpload}
            disabled={loading || parsedData.length === 0}
          >
            {loading ? "Importing..." : `Confirm & Import ${parsedData.length} Leads`}
          </button>
        </div>
      </div>
    </div>
  );
}
