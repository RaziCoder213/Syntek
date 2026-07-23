import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export function normalizeText(txt) {
  return (txt || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function extractDomain(url) {
  if (!url) return null;
  try {
    let clean = url.trim().toLowerCase();
    if (!/^https?:\/\//i.test(clean)) {
      clean = "http://" + clean;
    }
    const parsed = new URL(clean);
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    // If URL is invalid, return normalized string directly
    return url.toLowerCase().replace(/https?:\/\//, "").replace(/^www\./, "").split("/")[0].trim();
  }
}

export async function checkDeduplication(lead, userId, stalenessDays = 60) {
  const normalizedSearchName = normalizeText(lead.name);
  const normalizedSearchAddress = normalizeText(lead.address);
  const searchDomain = extractDomain(lead.website);

  // 1. Fetch all user leads to compare
  const leadsRes = await pool.query(
    "SELECT id, name, address, website, created_at, last_seen_at FROM leads WHERE user_id = $1",
    [userId]
  );

  let matchedRow = null;

  for (const row of leadsRes.rows) {
    // Check name + address match
    if (normalizedSearchName && normalizedSearchAddress) {
      const rowNameClean = normalizeText(row.name);
      const rowAddrClean = normalizeText(row.address);
      if (rowNameClean === normalizedSearchName && rowAddrClean === normalizedSearchAddress) {
        matchedRow = row;
        break;
      }
    }

    // Check domain match
    if (searchDomain) {
      const rowDomain = extractDomain(row.website);
      if (rowDomain && rowDomain === searchDomain) {
        matchedRow = row;
        break;
      }
    }
  }

  if (matchedRow) {
    const lastSeen = matchedRow.last_seen_at ? new Date(matchedRow.last_seen_at) : new Date(matchedRow.created_at);
    const diffTime = Math.abs(new Date() - lastSeen);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const shouldReScore = diffDays > stalenessDays;

    // Update last_seen_at timestamp
    await pool.query("UPDATE leads SET last_seen_at = NOW() WHERE id = $1", [matchedRow.id]);

    return {
      isDuplicate: true,
      shouldReScore,
      existingId: matchedRow.id,
      lastSeenDaysAgo: diffDays
    };
  }

  return {
    isDuplicate: false,
    shouldReScore: true,
    existingId: null
  };
}
