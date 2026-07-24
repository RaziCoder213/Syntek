import fs from 'fs';

const filePath = 'src/components/LeadFinder.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const old1 = '                  { label: "Location", value: lead.city || "—" },';
const new1 = `                  { label: "Decision Maker", value: lead.owner_name ? \`👑 \${lead.owner_name} (\${lead.owner_role || "Founder/CEO"})\` : "—", color: lead.owner_name ? "var(--brand)" : undefined },
                  { label: "MX Email Status", value: lead.email_confirmed ? "✓ MX Verified (Active Mail Server)" : (lead.email ? "⚠ Unverified / Pending MX" : "—"), color: lead.email_confirmed ? "#84cc16" : undefined },
                  { label: "AI Icebreaker", value: lead.personalized_icebreaker || "—" },
                  { label: "Location", value: lead.city || "—" },`;

const old2 = `<div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{l.type} · {l.city}</div>`;

const new2 = `<div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{l.type} · {l.city}</div>
                      {l.owner_name && (
                        <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                          👑 {l.owner_name} <span style={{ fontWeight: 400, color: "var(--text-4)" }}>({l.owner_role || "Founder/CEO"})</span>
                        </div>
                      )}`;

const old3 = `{l.email
                        ? <a href={\`mailto:\${l.email}\`} style={{ fontSize: 12, color: "var(--brand)", fontFamily: "var(--font-mono)" }} onClick={e => e.stopPropagation()}>{l.email}</a>
                        : <span style={{ fontSize: 12, color: "var(--text-4)" }}>—</span>
                      }`;

const new3 = `{l.email ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <a href={\`mailto:\${l.email}\`} style={{ fontSize: 12, color: "var(--brand)", fontFamily: "var(--font-mono)" }} onClick={e => e.stopPropagation()}>{l.email}</a>
                            {l.email_confirmed && (
                              <span style={{ fontSize: 9.5, color: "#84cc16", fontWeight: 700, background: "rgba(132,204,22,0.1)", padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(132,204,22,0.25)" }}>
                                ✓ MX Verified
                              </span>
                            )}
                          </div>
                        </div>
                      ) : <span style={{ fontSize: 12, color: "var(--text-4)" }}>—</span>}`;

if (content.includes(old1)) { content = content.replace(old1, new1); console.log('✓ drawer updated'); }
if (content.includes(old2)) { content = content.replace(old2, new2); console.log('✓ row business updated'); }
if (content.includes(old3)) { content = content.replace(old3, new3); console.log('✓ row contact updated'); }

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done patching LeadFinder.jsx');
