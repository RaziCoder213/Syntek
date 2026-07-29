import pg from "pg";
import dotenv from "dotenv";
import { runRetroactiveEmailVerificationCleanup } from "../services/emailVerificationService.js";

dotenv.config();
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const report = await runRetroactiveEmailVerificationCleanup(pool);
    console.log("\n================ RETROACTIVE CLEANUP REPORT ================");
    console.log(`Total Leads Processed: ${report.total}`);
    console.log(`Verified Deliverable (MX Pass): ${report.verified}`);
    console.log(`Invalid Undeliverable (MX Fail / Excluded -1000 score): ${report.invalid}`);
    if (report.invalidLeadsSummary.length > 0) {
      console.log("\nExcluded Invalid Leads:");
      report.invalidLeadsSummary.forEach(item => {
        console.log(` - ID ${item.id}: ${item.name} (${item.email}) -> ${item.reason}`);
      });
    }
    console.log("============================================================\n");
    await pool.end();
  } catch (err) {
    console.error("Retroactive cleanup failed:", err);
    process.exit(1);
  }
}

main();
