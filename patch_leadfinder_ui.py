with open('src/components/LeadFinder.jsx', 'r', encoding='utf-8') as f:
  content = f.read()

# 1. Update LeadDetailDrawer overview items array to include Decision-Maker & MX Verification
old_drawer_items = '                  { label: "Location", value: lead.city || "—" },'
new_drawer_items = '''                  { label: "Decision Maker", value: lead.owner_name ? `👑 ${lead.owner_name} (${lead.owner_role || 'Founder/CEO'})` : "—", color: lead.owner_name ? "var(--brand)" : undefined },
                  { label: "MX Email Status", value: lead.email_confirmed ? "✓ MX Verified (Active Mail Server)" : (lead.email ? "⚠ Unverified / Pending MX" : "—"), color: lead.email_confirmed ? "#84cc16" : undefined },
                  { label: "AI Icebreaker", value: lead.personalized_icebreaker || "—" },
                  { label: "Location", value: lead.city || "—" },'''

if old_drawer_items in content:
  content = content.replace(old_drawer_items, new_drawer_items)
  print('✓ Upgraded LeadDetailDrawer with Decision-Maker, MX Status, & AI Icebreaker')
else:
  print('⚠ old_drawer_items not found')

# 2. Update Table Row rendering for Business & Contact & Socials
old_row_business = '''<div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{l.type} · {l.city}</div>'''

new_row_business = '''<div style={{ fontWeight: 600, color: "var(--text-1)", fontSize: 13 }}>{l.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--text-4)" }}>{l.type} · {l.city}</div>
                      {l.owner_name && (
                        <div style={{ fontSize: 11, color: "var(--brand)", fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}>
                          👑 {l.owner_name} <span style={{ fontWeight: 400, color: "var(--text-4)" }}>({l.owner_role || "Founder/CEO"})</span>
                        </div>
                      )}'''

if old_row_business in content:
  content = content.replace(old_row_business, new_row_business)
  print('✓ Upgraded Table Row Business column with Decision-Maker badge')
else:
  print('⚠ old_row_business not found')

old_row_contact = '''{l.email
                        ? <a href={`mailto:${l.email}`} style={{ fontSize: 12, color: "var(--brand)", fontFamily: "var(--font-mono)" }} onClick={e => e.stopPropagation()}>{l.email}</a>
                        : <span style={{ fontSize: 12, color: "var(--text-4)" }}>—</span>
                      }'''

new_row_contact = '''{l.email ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <a href={`mailto:${l.email}`} style={{ fontSize: 12, color: "var(--brand)", fontFamily: "var(--font-mono)" }} onClick={e => e.stopPropagation()}>{l.email}</a>
                            {l.email_confirmed && (
                              <span style={{ fontSize: 9.5, color: "#84cc16", fontWeight: 700, background: "rgba(132,204,22,0.1)", padding: "1px 5px", borderRadius: 4, border: "1px solid rgba(132,204,22,0.25)" }}>
                                ✓ MX Verified
                              </span>
                            )}
                          </div>
                        </div>
                      ) : <span style={{ fontSize: 12, color: "var(--text-4)" }}>—</span>}'''

if old_row_contact in content:
  content = content.replace(old_row_contact, new_row_contact)
  print('✓ Upgraded Table Row Contact column with MX Verified badge')
else:
  print('⚠ old_row_contact not found')

with open('src/components/LeadFinder.jsx', 'w', encoding='utf-8') as f:
  f.write(content)
