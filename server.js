import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import { ImapFlow } from "imapflow";
import crypto from "crypto";
dotenv.config();

const { Pool } = pg;

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigin = process.env.FRONTEND_URL || "*";
app.use(cors({
  origin: allowedOrigin === "*" ? true : allowedOrigin,
  credentials: true
}));
app.use(express.json());

// Database connection pool setup
const poolConfig = {
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_DATABASE || "syntek_db"
};

const pool = new Pool(poolConfig);

// Initialize DB schema automatically
async function setupDatabase() {
  // 1. Establish connection to postgres administrative DB first to verify database exists
  const adminPool = new Pool({
    ...poolConfig,
    database: "postgres"
  });

  try {
    const res = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [poolConfig.database]
    );
    if (res.rowCount === 0) {
      console.log(`Database '${poolConfig.database}' not found. Auto-creating database...`);
      await adminPool.query(`CREATE DATABASE ${poolConfig.database}`);
      console.log(`Database created successfully.`);
    }
  } catch (err) {
    console.error("Database pre-flight check failed:", err.message);
  } finally {
    await adminPool.end();
  }

  // 2. Re-establish connection pool to the app database and create tables
  try {
    // Create users table first (required for references)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100),
        city VARCHAR(100),
        email VARCHAR(255),
        phone VARCHAR(50),
        rating NUMERIC(3,1),
        reviews INTEGER,
        status VARCHAR(50) DEFAULT 'not contacted',
        instagram VARCHAR(100),
        website VARCHAR(255) DEFAULT NULL,
        website_status VARCHAR(50) DEFAULT 'unknown'
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        from_name VARCHAR(255) NOT NULL,
        from_email VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        subject VARCHAR(255),
        preview TEXT,
        time_received VARCHAR(100),
        is_read BOOLEAN DEFAULT FALSE,
        category VARCHAR(50) DEFAULT 'system',
        labels TEXT[] DEFAULT '{}'
      );
    `);

    // Run migrations to add missing columns if they don't exist
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_opened BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT TRUE;
    `);

    // Add user_id to leads and emails tables
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE emails ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_settings (
        id SERIAL PRIMARY KEY,
        niche VARCHAR(100) DEFAULT 'Cafes',
        location VARCHAR(100) DEFAULT 'Austin, TX',
        daily_lead_limit INTEGER DEFAULT 8,
        preferred_time VARCHAR(50) DEFAULT '09:00',
        timezone VARCHAR(50) DEFAULT 'local',
        is_active BOOLEAN DEFAULT FALSE,
        concurrent_jobs INTEGER DEFAULT 1,
        gmail_user VARCHAR(255) DEFAULT '',
        gmail_pass VARCHAR(255) DEFAULT '',
        gemini_key VARCHAR(255) DEFAULT '',
        search_mode VARCHAR(50) DEFAULT 'scraper',
        schedule_type VARCHAR(50) DEFAULT 'custom'
      );
    `);

    // Add user_id and customization columns to campaign_settings
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_name VARCHAR(100) DEFAULT 'Muhammad Razi';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_role VARCHAR(100) DEFAULT 'Independent Developer';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS company_name VARCHAR(100) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS use_company_branding BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS outreach_style VARCHAR(50) DEFAULT 'casual';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS pitch_offer VARCHAR(50) DEFAULT 'whatsapp_bot';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS custom_offer_details TEXT DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS schedule_type VARCHAR(50) DEFAULT 'custom';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS last_cron_run_date VARCHAR(50) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS sender_type VARCHAR(50) DEFAULT 'developer';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS about_text TEXT DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS portfolio_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS social_linkedin VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS social_github VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS social_twitter VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS logo_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS banner_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS profile_icon_url VARCHAR(255) DEFAULT '';
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_connected BOOLEAN DEFAULT FALSE;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_access_token TEXT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_refresh_token TEXT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_token_expiry BIGINT DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_email VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS google_sandbox_mode BOOLEAN DEFAULT TRUE;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website VARCHAR(255) DEFAULT NULL;
    `);
    await pool.query(`
      ALTER TABLE leads ADD COLUMN IF NOT EXISTS website_status VARCHAR(50) DEFAULT 'unknown';
    `);

    // Create templates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        sender_type VARCHAR(50) DEFAULT 'all',
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("PostgreSQL schema validated and multi-tenant migrations applied successfully.");
  } catch (err) {
    console.error("Failed to run database migrations:", err.message);
  }
}

// ── BACKEND API ENDPOINTS ──

// Hashing and Token Utilities for Production Launch
const JWT_SECRET = process.env.JWT_SECRET || "super-secure-syntek-secret-key-123";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword.includes(":")) {
    // Legacy support for plain-text password fallback
    return password === storedPassword;
  }
  const [salt, hash] = storedPassword.split(":");
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
  return hash === verifyHash;
}

function generateToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;
    const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (signature !== expectedSignature) return null;
    const decodedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;
    return decodedPayload.userId;
  } catch {
    return null;
  }
}

// Middleware to authenticate and isolate tenant
const authenticate = (req, res, next) => {
  // 1. Try Authorization Bearer Token
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const userId = verifyToken(token);
    if (userId) {
      req.userId = userId;
      return next();
    }
  }

  // 2. Fallback to x-user-id header for development/legacy compatibility
  const userIdHeader = req.headers["x-user-id"];
  if (userIdHeader) {
    req.userId = parseInt(userIdHeader, 10);
    if (!isNaN(req.userId)) {
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized: Invalid or missing authentication token" });
};

// Auth Routes
app.post("/api/auth/register", async (req, res) => {
  const { company_name, email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    // Check if user exists
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userCheck.rowCount > 0) {
      return res.status(400).json({ error: "User already exists with this email" });
    }

    // Hash password
    const hashedPassword = hashPassword(password);

    // Insert user
    const newUser = await pool.query(
      "INSERT INTO users (company_name, email, password) VALUES ($1, $2, $3) RETURNING id, company_name, email",
      [company_name || "", email, hashedPassword]
    );
    const userId = newUser.rows[0].id;

    // Create default campaign settings for the user
    await pool.query(
      `INSERT INTO campaign_settings (user_id, company_name, sender_name, sender_role, use_company_branding)
       VALUES ($1, $2, 'Muhammad Razi', 'Independent Developer', FALSE)`,
      [userId, company_name || ""]
    );

    const token = generateToken(userId);
    res.status(201).json({
      ...newUser.rows[0],
      token
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  try {
    const userRes = await pool.query("SELECT id, company_name, email, password FROM users WHERE email = $1", [email]);
    if (userRes.rowCount === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const user = userRes.rows[0];
    if (!verifyPassword(password, user.password)) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    delete user.password;
    
    // Generate secure token
    user.token = generateToken(user.id);
    res.json(user);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Google Calendar & Meet OAuth Endpoints
app.get("/api/auth/google", async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).send("Missing authentication token");
  }
  
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).send("Unauthorized: Invalid token");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  // If credentials are not set, fall back directly to Mock/Sandbox mode callback
  if (!clientId || !clientSecret) {
    console.log(`[GOOGLE AUTH] No OAuth Client credentials found in env. Falling back to Sandbox Mode simulation for User ${userId}`);
    const localCallback = `${req.protocol}://${req.headers.host}/api/auth/google/callback?mock=true&state=${token}`;
    return res.redirect(localCallback);
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/api/auth/google/callback`;
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events&access_type=offline&prompt=consent&state=${token}`;
  
  res.redirect(googleAuthUrl);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state, mock } = req.query;
  
  if (!state) {
    return res.status(400).send("Authorization state missing");
  }

  const userId = verifyToken(state);
  if (!userId) {
    return res.status(401).send("Unauthorized: Invalid state session");
  }

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  try {
    if (mock === "true") {
      // Configure mock Sandbox mode credentials
      await pool.query(
        `UPDATE campaign_settings SET 
          google_connected = TRUE,
          google_email = 'sandbox@syntek-calendar.com',
          google_sandbox_mode = TRUE,
          google_access_token = 'mock-sandbox-access-token',
          google_refresh_token = 'mock-sandbox-refresh-token',
          google_token_expiry = $1
        WHERE user_id = $2`,
        [Date.now() + 3600000, userId]
      );
      console.log(`[GOOGLE AUTH] Sandbox Connected for User ${userId}`);
      return res.redirect(`${frontendUrl}/?tab=Settings`);
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${req.protocol}://${req.headers.host}/api/auth/google/callback`;

    // Exchange authorization code for access/refresh tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const expiryTime = Date.now() + (tokenData.expires_in * 1000);

    // Fetch user profile email
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    let googleEmail = "connected@gmail.com";
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      if (profileData.email) googleEmail = profileData.email;
    }

    await pool.query(
      `UPDATE campaign_settings SET 
        google_connected = TRUE,
        google_email = $1,
        google_sandbox_mode = FALSE,
        google_access_token = $2,
        google_refresh_token = COALESCE($3, google_refresh_token),
        google_token_expiry = $4
      WHERE user_id = $5`,
      [googleEmail, tokenData.access_token, tokenData.refresh_token, expiryTime, userId]
    );

    console.log(`[GOOGLE AUTH] Real account connected for User ${userId}: ${googleEmail}`);
    res.redirect(`${frontendUrl}/?tab=Settings`);
  } catch (err) {
    console.error("Google Auth callback error:", err);
    res.status(500).send(`Google Connection failed: ${err.message}`);
  }
});

app.post("/api/auth/google/disconnect", authenticate, async (req, res) => {
  try {
    await pool.query(
      `UPDATE campaign_settings SET 
        google_connected = FALSE,
        google_email = NULL,
        google_access_token = NULL,
        google_refresh_token = NULL,
        google_token_expiry = NULL
      WHERE user_id = $1`,
      [req.userId]
    );
    res.json({ message: "Google account disconnected successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health Check Route
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", database: "connected" });
  } catch (err) {
    res.status(500).json({ status: "unhealthy", error: err.message });
  }
});

// Leads Routes
app.get("/api/leads", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM leads WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/leads", authenticate, async (req, res) => {
  const { name, type, city, email, phone, rating, reviews, status, instagram } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
      [name, type, city, email, phone, rating || 4.0, reviews || 0, status || "not contacted", instagram, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leads/reset-status", authenticate, async (req, res) => {
  try {
    await pool.query("UPDATE leads SET status = 'not contacted', is_opened = FALSE WHERE user_id = $1", [req.userId]);
    const result = await pool.query("SELECT * FROM leads WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leads/:id/status", authenticate, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const result = await pool.query(
      "UPDATE leads SET status = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [status, id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/leads/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { name, type, city, email, phone, rating, reviews, status, instagram, website, website_status } = req.body;
  try {
    // Determine the transition status based on email presence
    // If status is passed, use it, else select the current one
    const currentLead = await pool.query("SELECT email, status FROM leads WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (currentLead.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    
    const activeStatus = status || currentLead.rows[0].status;
    const finalEmail = email !== undefined ? email : currentLead.rows[0].email;
    
    let finalStatus = activeStatus;
    if (finalEmail && activeStatus === 'no_email') {
      finalStatus = 'not contacted';
    } else if (!finalEmail && (activeStatus === 'not contacted' || activeStatus === 'new')) {
      finalStatus = 'no_email';
    }

    const result = await pool.query(
      `UPDATE leads SET 
        name = COALESCE($1, name), 
        type = COALESCE($2, type), 
        city = COALESCE($3, city), 
        email = $4, 
        phone = COALESCE($5, phone), 
        rating = COALESCE($6, rating), 
        reviews = COALESCE($7, reviews), 
        status = COALESCE($8, status), 
        instagram = COALESCE($9, instagram), 
        website = COALESCE($10, website), 
        website_status = COALESCE($11, website_status)
      WHERE id = $12 AND user_id = $13 RETURNING *`,
      [
        name || null, 
        type || null, 
        city || null, 
        finalEmail ? finalEmail.trim() : null, 
        phone || null, 
        rating !== undefined ? rating : null, 
        reviews !== undefined ? reviews : null, 
        finalStatus, 
        instagram || null, 
        website || null, 
        website_status || null, 
        id, 
        req.userId
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/leads", authenticate, async (req, res) => {
  try {
    await pool.query("DELETE FROM leads WHERE user_id = $1", [req.userId]);
    await pool.query("DELETE FROM emails WHERE user_id = $1", [req.userId]);
    res.json({ message: "All database records cleared successfully." });
  } catch (err) {
    console.error("DELETE /api/leads failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/leads/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING *", [id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    res.json({ message: "Lead deleted", lead: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Smart Inbox Routes
app.get("/api/emails", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM emails WHERE user_id = $1 ORDER BY id ASC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/emails/sync", authenticate, async (req, res) => {
  try {
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = configRes.rows[0];
    if (!config) return res.status(404).json({ error: "Campaign configurations not found" });
    
    const result = await syncUserInbox(req.userId, config);
    if (result.success) {
      res.json({ message: "Mailbox synced successfully!", newReplies: result.count });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/emails/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { is_read, category, labels } = req.body;
  try {
    const result = await pool.query(
      "UPDATE emails SET is_read = COALESCE($1, is_read), category = COALESCE($2, category), labels = COALESCE($3, labels) WHERE id = $4 AND user_id = $5 RETURNING *",
      [is_read, category, labels, id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Email not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/emails/:id/reply", authenticate, async (req, res) => {
  const { id } = req.params;
  const { replyText, gmailUser, gmailPass } = req.body;
  try {
    // Fetch target email to find company details
    const emailResult = await pool.query("SELECT * FROM emails WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (emailResult.rowCount === 0) return res.status(404).json({ error: "Email not found" });
    const email = emailResult.rows[0];

    // If Gmail credentials are provided, send a real email
    if (gmailUser && gmailPass && email.from_email) {
      try {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          service: "gmail",
          auth: {
            user: gmailUser,
            pass: gmailPass
          }
        });
        await transporter.sendMail({
          from: gmailUser,
          to: email.from_email,
          subject: email.subject.toLowerCase().startsWith("re:") ? email.subject : `Re: ${email.subject}`,
          text: replyText
        });
        console.log(`Real reply email sent from ${gmailUser} to ${email.from_email}`);
      } catch (mailErr) {
        console.error("Nodemailer failed in reply:", mailErr);
        const errStr = mailErr.message.toLowerCase();
        if (errStr.includes("recipient") || errStr.includes("address") || errStr.includes("not found") || errStr.includes("invalid") || errStr.includes("550")) {
           const matchedLead = await pool.query(
             "UPDATE leads SET status = 'trashed' WHERE email = $1 AND user_id = $2 RETURNING name",
             [email.from_email, req.userId]
           );
           if (matchedLead.rowCount > 0) {
             console.log(`[REPLY AUTO-TRASH] Marked lead ${matchedLead.rows[0].name} as trashed due to reply email bounce.`);
           }
        }
        return res.status(500).json({ error: `Gmail transmission failed: ${mailErr.message}` });
      }
    }

    // Mark email as read and tag replies
    await pool.query(
      "UPDATE emails SET is_read = TRUE, labels = array_append(labels, 'replied') WHERE id = $1 AND user_id = $2",
      [id, req.userId]
    );

    // Automatically update the lead status to contacted/replied in pipeline
    await pool.query(
      "UPDATE leads SET status = 'contacted' WHERE (email = $1 OR name ILIKE $2) AND user_id = $3",
      [email.from_email, `%${email.company}%`, req.userId]
    );

    res.json({ message: "Reply sent and lead stage advanced in pipeline" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getFallbackReplyTemplate(email, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const signature = useCompany && companyName ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

  const preview = (email.preview || "").toLowerCase();
  
  if (preview.includes("price") || preview.includes("cost") || preview.includes("how much")) {
    return `Hi ${email.from_name || "there"},\n\nThanks for asking! Our pricing is customized depending on your business requirements. I'd love to learn more about your setup to give you an accurate quote. Are you free for a quick chat this week?\n\nCheers,\n${signature}`;
  }
  
  if (preview.includes("interested") || preview.includes("yes") || preview.includes("sure") || preview.includes("ok")) {
    return `Hi ${email.from_name || "there"},\n\nGreat to hear! I'd love to schedule a quick 10-minute slot to demo what we do and align on next steps. Would tomorrow or Thursday work best for you?\n\nCheers,\n${signature}`;
  }
  
  return `Hi ${email.from_name || "there"},\n\nThanks for getting back to me! I would love to hop on a brief call this week to see if we'd be a good fit to help optimize your operations. Let me know if you have a preferred time to connect.\n\nCheers,\n${signature}`;
}

async function generateEmailReplyText(email, config, userId) {
  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    console.warn("[GEMINI KEY MISSING] Falling back to pre-defined AI response templates.");
    return getFallbackReplyTemplate(email, config);
  }

  // Retrieve email history thread for this prospect to give conversational memory
  const threadRes = await pool.query(
    "SELECT * FROM emails WHERE from_email = $1 AND user_id = $2 ORDER BY id ASC",
    [email.from_email, userId]
  );

  let threadContext = "";
  for (const msg of threadRes.rows) {
    const isSent = msg.category === "sent" || (msg.labels && msg.labels.includes("sent"));
    threadContext += `${isSent ? "Me (Outreach)" : "Prospect"}: ${msg.preview}\n\n`;
  }

  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;

  let signature = "";
  if (useCompany && companyName) {
    signature = `${senderName}\n${senderRole}\n${companyName}`;
  } else {
    signature = `${senderName}\n${senderRole}`;
  }

  const promptText = `
    You are ${senderName}, working as "${senderRole}"${(useCompany && companyName) ? ` at ${companyName}` : ""}.
    You are replying to a prospect who sent you an email. Here is the entire email exchange thread history:
    
    ${threadContext}
    
    Write a highly personalized, short email reply (3-4 sentences maximum).
    - If the email indicates interest or asks questions, answer helpfully and suggest a 10-minute quick Zoom call this week to align.
    - If they ask for pricing, suggest a quick chat to evaluate their requirements.
    - Tone: Extremely warm, friendly, concise, and professional.
    - Signature: Use exactly this:
      Cheers,
      ${signature}
    - Instructions: Output ONLY the reply email body. Do not include subject lines or Markdown wrappers.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.warn(`[GEMINI API ERROR] Status ${response.status}. Falling back to templates.`);
      return getFallbackReplyTemplate(email, config);
    }

    const data = await response.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  } catch (err) {
    console.warn(`[GEMINI FETCH FAIL] Error: ${err.message}. Falling back to templates.`);
    return getFallbackReplyTemplate(email, config);
  }
}

app.post("/api/emails/:id/generate-reply", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    // Fetch target email
    const emailRes = await pool.query("SELECT * FROM emails WHERE id = $1 AND user_id = $2", [id, req.userId]);
    if (emailRes.rowCount === 0) {
      return res.status(404).json({ error: "Email not found" });
    }
    const email = emailRes.rows[0];

    // Fetch campaign settings
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    if (settingsRes.rowCount === 0) {
      return res.status(404).json({ error: "Campaign settings not found" });
    }
    const config = settingsRes.rows[0];

    // Check if AI is enabled for this lead/prospect
    const leadRes = await pool.query(
      "SELECT * FROM leads WHERE (email = $1 OR name ILIKE $2) AND user_id = $3 LIMIT 1",
      [email.from_email, `%${email.company}%`, req.userId]
    );
    const lead = leadRes.rows[0];
    if (lead && lead.ai_enabled === false) {
      return res.status(400).json({ error: "AI Autopilot is disabled for this lead." });
    }

    // Check meeting intent first
    const bookingCheck = await detectMeetingBookingIntent(email, config, req.userId);
    if (bookingCheck.isMeetingAgreed) {
      console.log(`[BOOKING ENGINE] Manual generate-reply: Meeting agreement detected at ${bookingCheck.meetingTime}!`);
      
      const summary = `Syntek Meeting: ${lead ? lead.name : email.from_name} & User`;
      const calendarEvent = await createGoogleCalendarEvent(req.userId, lead ? lead.name : email.from_name, email.from_email, summary, bookingCheck.meetingTime);
      
      if (calendarEvent && calendarEvent.meetLink) {
        // Update lead status to 'meeting_booked'
        if (lead) {
          await pool.query(
            "UPDATE leads SET status = 'meeting_booked' WHERE id = $1 AND user_id = $2",
            [lead.id, req.userId]
          );
        }
        
        const senderName = config.sender_name || "Muhammad Razi";
        const senderRole = config.sender_role || "Independent Developer";
        const companyName = config.company_name || "";
        const useCompany = config.use_company_branding || false;
        const signature = useCompany && companyName ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

        const replyText = `Hi ${lead ? lead.name : email.from_name},\n\nI've scheduled our call for ${new Date(bookingCheck.meetingTime).toLocaleString()}! Here is our Google Meet link:\n${calendarEvent.meetLink}\n\nLooking forward to speaking with you!\n\nCheers,\n${signature}`;
        
        return res.json({ replyText, meetingBooked: true, meetLink: calendarEvent.meetLink });
      }
    }

    const replyText = await generateEmailReplyText(email, config, req.userId);
    res.json({ replyText });
  } catch (err) {
    console.error("Failed to generate smart reply:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/send-email", authenticate, async (req, res) => {
  const { gmailUser, gmailPass, to, subject, body, leadId } = req.body;
  
  if (!gmailUser || !gmailPass) {
    return res.status(400).json({ error: "Gmail credentials are required." });
  }
  if (!to) {
    return res.status(400).json({ error: "Recipient email is required." });
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass
      }
    });

    let leadName = to;
    let leadCompany = "";
    if (leadId) {
      const leadRes = await pool.query("SELECT * FROM leads WHERE id = $1 AND user_id = $2", [leadId, req.userId]);
      if (leadRes.rowCount > 0) {
        leadName = leadRes.rows[0].name;
        leadCompany = leadRes.rows[0].name;
      }
    }

    const host = req.headers.host || "localhost:5000";
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
    const trackingTag = leadId ? `<br/><br/><img src="${baseUrl}/api/track-open/${leadId}" width="1" height="1" style="display:none;"/>` : "";
    const htmlBody = body.replace(/\n/g, "<br/>") + trackingTag;

    await transporter.sendMail({
      from: `"${gmailUser.split('@')[0]}" <${gmailUser}>`,
      to,
      subject,
      html: htmlBody
    });

    // Create an entry in emails table
    await pool.query(
      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'sent', ARRAY['sent'], $7)`,
      [leadName, to, leadCompany, subject, body, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), req.userId]
    );

    res.json({ message: "Email sent successfully via Gmail SMTP!" });
  } catch (err) {
    console.error("Nodemailer send-email failed:", err);
    const errStr = err.message.toLowerCase();
    if (leadId && (errStr.includes("recipient") || errStr.includes("address") || errStr.includes("not found") || errStr.includes("invalid") || errStr.includes("550"))) {
       await pool.query("UPDATE leads SET status = 'trashed' WHERE id = $1 AND user_id = $2", [leadId, req.userId]);
       console.log(`[API AUTO-TRASH] Marked lead ID ${leadId} as trashed due to bounce/address error: ${err.message}`);
    }
    res.status(500).json({ error: `Gmail transmission failed: ${err.message}` });
  }
});

// Settings Config Endpoints
app.get("/api/settings", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/settings", authenticate, async (req, res) => {
  const { 
    niche, location, daily_lead_limit, preferred_time, timezone, is_active, 
    concurrent_jobs, gmail_user, gmail_pass, gemini_key, search_mode, 
    sender_name, sender_role, company_name, use_company_branding, 
    outreach_style, pitch_offer, custom_offer_details, schedule_type,
    sender_type, about_text, portfolio_url, social_linkedin, social_github,
    social_twitter, logo_url, banner_url, profile_icon_url, google_sandbox_mode
  } = req.body;
  try {
    const result = await pool.query(
      `UPDATE campaign_settings SET 
        niche = COALESCE($1, niche), 
        location = COALESCE($2, location), 
        daily_lead_limit = COALESCE($3, daily_lead_limit), 
        preferred_time = COALESCE($4, preferred_time), 
        timezone = COALESCE($5, timezone), 
        is_active = COALESCE($6, is_active), 
        concurrent_jobs = COALESCE($7, concurrent_jobs), 
        gmail_user = COALESCE($8, gmail_user), 
        gmail_pass = COALESCE($9, gmail_pass), 
        gemini_key = COALESCE($10, gemini_key),
        search_mode = COALESCE($11, search_mode),
        sender_name = COALESCE($12, sender_name),
        sender_role = COALESCE($13, sender_role),
        company_name = COALESCE($14, company_name),
        use_company_branding = COALESCE($15, use_company_branding),
        outreach_style = COALESCE($16, outreach_style),
        pitch_offer = COALESCE($17, pitch_offer),
        custom_offer_details = COALESCE($18, custom_offer_details),
        schedule_type = COALESCE($19, schedule_type),
        sender_type = COALESCE($20, sender_type),
        about_text = COALESCE($21, about_text),
        portfolio_url = COALESCE($22, portfolio_url),
        social_linkedin = COALESCE($23, social_linkedin),
        social_github = COALESCE($24, social_github),
        social_twitter = COALESCE($25, social_twitter),
        logo_url = COALESCE($26, logo_url),
        banner_url = COALESCE($27, banner_url),
        profile_icon_url = COALESCE($28, profile_icon_url),
        google_sandbox_mode = COALESCE($29, google_sandbox_mode)
      WHERE user_id = $30 RETURNING *`,
      [
        niche === undefined ? null : niche,
        location === undefined ? null : location,
        daily_lead_limit === undefined ? null : daily_lead_limit,
        preferred_time === undefined ? null : preferred_time,
        timezone === undefined ? null : timezone,
        is_active === undefined ? null : is_active,
        concurrent_jobs === undefined ? null : concurrent_jobs,
        gmail_user === undefined ? null : gmail_user,
        gmail_pass === undefined ? null : gmail_pass,
        gemini_key === undefined ? null : gemini_key,
        search_mode === undefined ? null : search_mode,
        sender_name === undefined ? null : sender_name,
        sender_role === undefined ? null : sender_role,
        company_name === undefined ? null : company_name,
        use_company_branding === undefined ? null : use_company_branding,
        outreach_style === undefined ? null : outreach_style,
        pitch_offer === undefined ? null : pitch_offer,
        custom_offer_details === undefined ? null : custom_offer_details,
        schedule_type === undefined ? null : schedule_type,
        sender_type === undefined ? null : sender_type,
        about_text === undefined ? null : about_text,
        portfolio_url === undefined ? null : portfolio_url,
        social_linkedin === undefined ? null : social_linkedin,
        social_github === undefined ? null : social_github,
        social_twitter === undefined ? null : social_twitter,
        logo_url === undefined ? null : logo_url,
        banner_url === undefined ? null : banner_url,
        profile_icon_url === undefined ? null : profile_icon_url,
        google_sandbox_mode === undefined ? null : google_sandbox_mode,
        req.userId
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("POST /api/settings error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Custom Templates Endpoints
app.get("/api/templates", authenticate, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM templates WHERE user_id = $1 ORDER BY id DESC", [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/templates", authenticate, async (req, res) => {
  const { name, subject, body, sender_type } = req.body;
  if (!name || !subject || !body) {
    return res.status(400).json({ error: "Template name, subject, and body are required." });
  }
  try {
    const result = await pool.query(
      "INSERT INTO templates (name, subject, body, sender_type, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, subject, body, sender_type || "all", req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/templates/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM templates WHERE id = $1 AND user_id = $2 RETURNING *", [id, req.userId]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Template not found" });
    res.json({ message: "Template deleted successfully", template: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Email Open Tracking Endpoint
app.get("/api/track-open/:leadId", async (req, res) => {
  const { leadId } = req.params;
  try {
    await pool.query("UPDATE leads SET is_opened = TRUE WHERE id = $1", [leadId]);
    console.log(`[TRACK] Lead ID ${leadId} opened their outreach email.`);
    
    // Serve transparent 1x1 GIF
    const pixel = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64"
    );
    res.writeHead(200, {
      "Content-Type": "image/gif",
      "Content-Length": pixel.length,
      "Cache-Control": "no-store, no-cache, must-revalidate, private"
    });
    res.end(pixel);
  } catch (err) {
    console.error("Tracking pixel error:", err);
    res.status(500).end();
  }
});

// AI Autopilot Toggle for Lead
app.put("/api/leads/:id/toggle-ai", authenticate, async (req, res) => {
  const { id } = req.params;
  const { ai_enabled } = req.body;
  try {
    const result = await pool.query(
      "UPDATE leads SET ai_enabled = $1 WHERE id = $2 AND user_id = $3 RETURNING *",
      [ai_enabled, id, req.userId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Lead not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HELPER FUNCTIONS FOR MULTI-STAGE CONTACT SCRAPING ──

function extractJsonArray(text) {
  const startIdx = text.indexOf("[");
  if (startIdx === -1) {
    throw new Error("No JSON array start bracket found in response");
  }
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === "[") {
      depth++;
    } else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        const jsonSub = text.substring(startIdx, i + 1);
        try {
          return JSON.parse(jsonSub);
        } catch (e) {
          // Ignore and continue search
        }
      }
    }
  }
  const endIdx = text.lastIndexOf("]");
  if (endIdx > startIdx) {
    const jsonSub = text.substring(startIdx, endIdx + 1);
    return JSON.parse(jsonSub);
  }
  throw new Error("No matching closing bracket found for JSON array");
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x3A;/g, ":");
}

function cleanJsonContent(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("<!--")) cleaned = cleaned.substring(4);
  if (cleaned.endsWith("-->")) cleaned = cleaned.substring(0, cleaned.length - 3);
  return decodeHtmlEntities(cleaned.trim());
}

function cleanUrl(url) {
  if (!url) return null;
  let decoded = decodeHtmlEntities(url);
  decoded = decoded.replace(/\\u002f/g, "/").replace(/\\/g, "");
  if (decoded.startsWith("//")) {
    decoded = "http:" + decoded;
  }
  return decoded;
}

function isValidEmail(email) {
  if (!email) return false;
  const lower = email.toLowerCase().trim();

  // 1. Filter out common asset/media extensions disguised as emails
  const invalidExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico",
    ".css", ".js", ".zip", ".pdf", ".mp4", ".mp3", ".mov", ".avi", ".woff", ".woff2", ".ttf", ".eot"
  ];
  if (invalidExtensions.some(ext => lower.endsWith(ext))) {
    return false;
  }

  // Split username and domain
  const parts = lower.split("@");
  if (parts.length !== 2) return false;
  const [username, domain] = parts;

  // 2. Filter out placeholder/fake domains
  const placeholderDomains = [
    "example.com", "domain.com", "yourdomain.com", "company.com", "business.com",
    "template.com", "website.com", "test.com", "email.com", "mysite.com", "site.com",
    "sentry.io", "wixpress.com", "w3.org", "schema.org", "googleapis.com",
    "gravatar.com", "wordpress.org", "wordpress.com", "squarespace.com", "wix.com",
    "shopify.com", "weebly.com", "medium.com", "pinterest.com", "linkedin.com",
    "youtube.com", "apple.com", "microsoft.com", "adobe.com", "github.com",
    "twitter.com", "instagram.com", "facebook.com"
  ];
  
  if (placeholderDomains.some(d => domain === d || domain.endsWith("." + d))) {
    return false;
  }

  // 3. Filter out placeholder usernames
  const placeholderUsernames = [
    "user", "username", "yourname", "name", "email", "your_email", "youremail",
    "test", "tester", "testing", "myemail", "placeholder", "fake", "dummy"
  ];
  if (placeholderUsernames.some(u => username === u)) {
    return false;
  }

  // 4. Exclude emails that are just template forms
  if (lower === "info@company.com" || lower === "contact@company.com" || lower === "support@company.com") {
    return false;
  }

  return true;
}

function parseYelpSearchHtml(html, defaultLocation, defaultNiche) {
  const businessesMap = new Map();

  function addBiz({ name, phone, rating, reviewCount, url, alias }) {
    if (!name) return;
    
    // Clean name
    let cleanName = decodeHtmlEntities(name).replace(/<[^>]+>/g, "").trim();
    if (!cleanName || cleanName.toLowerCase().includes("see more reviews") || cleanName.toLowerCase().includes("read more")) {
      return;
    }

    // Clean yelp detail URL
    let yelpUrl = url || "";
    if (!yelpUrl && alias) {
      yelpUrl = `/biz/${alias}`;
    }
    if (yelpUrl.includes("redirect_url=")) {
      try {
        const urlObj = new URL("https://www.yelp.com" + yelpUrl);
        const redir = urlObj.searchParams.get("redirect_url");
        if (redir) yelpUrl = redir;
      } catch (e) {}
    }
    if (yelpUrl && !yelpUrl.startsWith("http")) {
      yelpUrl = `https://www.yelp.com${yelpUrl.split("?")[0]}`;
    }

    const key = (alias || cleanName).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) return;

    // Clean phone number format
    let formattedPhone = phone || "";
    if (formattedPhone.startsWith("+1")) {
      formattedPhone = `(${formattedPhone.substring(2, 5)}) ${formattedPhone.substring(5, 8)}-${formattedPhone.substring(8)}`;
    }

    const existing = businessesMap.get(key) || {};
    // Avoid overriding clean business name with fallback links
    let finalName = cleanName;
    if (existing.name && (cleanName.toLowerCase().includes("see more") || cleanName.toLowerCase().includes("reviews") || cleanName.length < existing.name.length - 8)) {
      finalName = existing.name;
    }

    businessesMap.set(key, {
      name: finalName,
      alias: alias || existing.alias || key,
      phone: formattedPhone || existing.phone || "",
      rating: rating || existing.rating || 4.0,
      reviews: reviewCount || existing.reviews || 0,
      url: yelpUrl || existing.url || "",
      city: defaultLocation,
      type: defaultNiche
    });
  }

  // Walk JSON object to find business data
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    if (obj.name && (obj.businessUrl || obj.alias || obj.rating)) {
      addBiz({
        name: obj.name,
        phone: obj.phone,
        rating: obj.rating,
        reviewCount: obj.reviewCount,
        url: obj.businessUrl || obj.url,
        alias: obj.alias
      });
    }
    for (const k of Object.keys(obj)) {
      if (obj[k] && typeof obj[k] === "object") {
        walk(obj[k]);
      }
    }
  }

  // 1. Scan JSON-LD script tags
  const scriptRegex = /<script\s*([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];

    if (attrs.includes("type=\"application/json\"") || attrs.includes("data-id=\"react-root-props\"") || content.includes("react_root_props")) {
      try {
        let clean = cleanJsonContent(content);
        if (content.includes("react_root_props")) {
          const propsMatch = content.match(/react_root_props\s*=\s*(\{[\s\S]+?\});/i);
          if (propsMatch) {
            clean = decodeHtmlEntities(propsMatch[1]);
          }
        }
        const parsed = JSON.parse(clean);
        walk(parsed);
      } catch (e) {}
    } else if (attrs.includes("type=\"application/ld+json\"")) {
      try {
        const clean = cleanJsonContent(content);
        const parsed = JSON.parse(clean);
        if (parsed["@type"] === "ItemList" && parsed.itemListElement) {
          for (const item of parsed.itemListElement) {
            const biz = item.item;
            if (biz && (biz["@type"] === "LocalBusiness" || biz["@type"] === "Restaurant" || biz["@type"] === "FoodEstablishment")) {
              addBiz({
                name: biz.name,
                phone: biz.telephone,
                rating: biz.aggregateRating ? parseFloat(biz.aggregateRating.ratingValue) : 4.0,
                reviewCount: biz.aggregateRating ? parseInt(biz.aggregateRating.reviewCount) : 0,
                url: biz.url
              });
            }
          }
        }
      } catch (e) {}
    }
  }

  // 2. Fallback: Parse /biz/ links from HTML
  const bizHrefRegex = /<a[^>]+href="\/biz\/([a-zA-Z0-9_-]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let hrefMatch;
  while ((hrefMatch = bizHrefRegex.exec(html)) !== null) {
    const alias = hrefMatch[1];
    const innerText = hrefMatch[2].replace(/<[^>]+>/g, "").trim();
    if (innerText && !innerText.toLowerCase().includes("see all") && !innerText.toLowerCase().includes("read more")) {
      addBiz({
        name: innerText,
        alias: alias,
        url: `/biz/${alias}`
      });
    }
  }

  return Array.from(businessesMap.values());
}

function extractWebsiteFromYelpDetail(html) {
  // Method 1: Look for JSON/JS objects with website URL
  const scriptRegex = /<script\s*([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const attrs = match[1];
    const content = match[2];
    if (content.includes("BusinessWebsite") || content.includes("website")) {
      try {
        let clean = cleanJsonContent(content);
        if (content.includes("react_root_props")) {
          const propsMatch = content.match(/react_root_props\s*=\s*(\{[\s\S]+?\});/i);
          if (propsMatch) {
            clean = decodeHtmlEntities(propsMatch[1]);
          }
        }
        const parsed = JSON.parse(clean);
        let foundUrl = null;
        function walk(obj) {
          if (!obj || foundUrl) return;
          if (obj.__typename === "BusinessWebsite" && obj.url) {
            foundUrl = obj.url;
            return;
          }
          if (obj.website && typeof obj.website === "object" && obj.website.url) {
            foundUrl = obj.website.url;
            return;
          }
          if (typeof obj === "object") {
            for (const k of Object.keys(obj)) {
              walk(obj[k]);
            }
          }
        }
        walk(parsed);
        if (foundUrl) {
          return cleanUrl(foundUrl);
        }
      } catch (e) {}
    }
  }

  // Method 2: Regex for biz_redir URL parameter
  const redirRegex = /biz_redir\?url=([^"&'\s>]+)/gi;
  let redirMatch;
  while ((redirMatch = redirRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(redirMatch[1]);
      if (!decoded.includes("facebook.com") && !decoded.includes("instagram.com") && !decoded.includes("twitter.com") && !decoded.includes("yelp.com") && !decoded.includes("google.com")) {
        return cleanUrl(decoded);
      }
    } catch(e) {}
  }
  
  // Method 3: Try to find a simple link with website_link_type=website
  const webRedirRegex = /url=([^"&'\s>]+)&amp;[^"]*website_link_type=website/i;
  const webMatch = html.match(webRedirRegex);
  if (webMatch) {
    try {
      return cleanUrl(decodeURIComponent(webMatch[1]));
    } catch(e) {}
  }
  
  return null;
}

async function crawlWebsiteForEmail(websiteUrl, logCallback = () => {}) {
  const emails = new Set();
  const socialLinks = { instagram: "", facebook: "" };
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  };
  let hasBooking = false;
  const bookingKeywords = [
    "calendly.com", "acuityscheduling.com", "opentable.com", "resy.com", 
    "mindbodyonline.com", "vagaro.com", "schedulicity.com", "wa.me", 
    "whatsapp.com/send", "square.site", "bookeo.com", "simplybook.me", 
    "setmore.com", "10to8.com"
  ];

  try {
    const res = await fetch(websiteUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const html = await res.text();
    const lowerHtml = html.toLowerCase();

    // Check for booking links on homepage
    for (const kw of bookingKeywords) {
      if (lowerHtml.includes(kw)) {
        hasBooking = true;
        break;
      }
    }
    if (!hasBooking) {
      if (lowerHtml.includes("book online") || lowerHtml.includes("book now") || 
          lowerHtml.includes("make reservation") || lowerHtml.includes("scheduling") || 
          lowerHtml.includes("appointment")) {
        hasBooking = true;
      }
    }

    // 1. Search for emails on homepage
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const homepageEmails = html.match(emailRegex) || [];
    for (const email of homepageEmails) {
      if (isValidEmail(email)) {
        emails.add(email.toLowerCase().trim());
      } else {
        logCallback("warn", `[-] Ignored placeholder email: ${email}`);
      }
    }

    // 2. Find social links on homepage
    const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
    if (igMatch) socialLinks.instagram = "@" + igMatch[1].replace(/\/$/, "").split(/[?#]/)[0];
    const fbMatch = html.match(/facebook\.com\/([a-zA-Z0-9_.-]+)/i);
    if (fbMatch) socialLinks.facebook = "https://facebook.com/" + fbMatch[1].replace(/\/$/, "").split(/[?#]/)[0];

    // If emails found on homepage and we crawled for booking, we still check subpages for booking/email if needed
    // But if we want to be thorough, let's always parse contact links as well.

    // 3. Find contact page link
    const linkRegex = /href=["']([^"']*(?:contact|about|info|reach|connect|help|support)[^"']*)["']/gi;
    let match;
    const subpagesToCrawl = new Set();
    while ((match = linkRegex.exec(html)) !== null) {
      let href = match[1].trim();
      try {
        const absoluteUrl = new URL(href, websiteUrl).toString();
        if (new URL(absoluteUrl).hostname === new URL(websiteUrl).hostname) {
          subpagesToCrawl.add(absoluteUrl);
        }
      } catch (e) {}
    }

    const subpages = Array.from(subpagesToCrawl).slice(0, 2);
    if (subpages.length > 0) {
      logCallback("info", `[-] Searching website subpages: ${subpages.map(s => {
        try { return new URL(s).pathname; } catch (e) { return s; }
      }).join(", ")}`);
    }

    // Crawl first 2 subpages
    for (const subpage of subpages) {
      try {
        const subRes = await fetch(subpage, { headers, signal: AbortSignal.timeout(8000) });
        if (subRes.ok) {
          const subHtml = await subRes.text();
          const subLowerHtml = subHtml.toLowerCase();

          // Check subpage for booking links
          if (!hasBooking) {
            for (const kw of bookingKeywords) {
              if (subLowerHtml.includes(kw)) {
                hasBooking = true;
                break;
              }
            }
            if (!hasBooking) {
              if (subLowerHtml.includes("book online") || subLowerHtml.includes("book now") || 
                  subLowerHtml.includes("make reservation") || subLowerHtml.includes("scheduling") || 
                  subLowerHtml.includes("appointment")) {
                hasBooking = true;
              }
            }
          }

          const subEmails = subHtml.match(emailRegex) || [];
          for (const email of subEmails) {
            if (isValidEmail(email)) {
              emails.add(email.toLowerCase().trim());
            } else {
              logCallback("warn", `[-] Ignored placeholder email: ${email}`);
            }
          }
        }
      } catch (subErr) {
        logCallback("warn", `[-] Failed to crawl subpage ${subpage}: ${subErr.message}`);
      }
    }

    return { emails: Array.from(emails), socials: socialLinks, hasBooking };

  } catch (err) {
    logCallback("warn", `[-] Website crawl failed for ${websiteUrl}: ${err.message}`);
    return { emails: [], socials: socialLinks, hasBooking: false };
  }
}

function isLeadMatchingService(lead, pitchOffer, hasBooking = false) {
  const status = lead.website_status || 'unknown';
  if (pitchOffer === "website_dev") {
    // Lead must NOT have a website, or the website must be down
    return status === "no_website" || status === "down";
  }
  if (pitchOffer === "whatsapp_bot") {
    // If they have an active website, they must NOT already have booking software
    if (status === "active" && hasBooking) {
      return false; // Skip because they already have booking tools
    }
    return true;
  }
  return true;
}

// Upgraded Multi-Stage Lead Contact Scraper Route
app.post("/api/scan", authenticate, async (req, res) => {
  const { niche, location } = req.body;
  const searchLogs = [];

  const addLog = (type, text) => {
    searchLogs.push({ type, text });
  };

  addLog("info", `Launching Yelp Multi-Stage Scraper for niche: '${niche}' in: '${location}'`);
  
  const queryDesc = encodeURIComponent(niche || "Cafes");
  const queryLoc = encodeURIComponent(location || "Austin, TX");
  const url = `https://www.yelp.com/search?find_desc=${queryDesc}&find_loc=${queryLoc}`;

  try {
    // Retrieve campaign configuration to check target service offer
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = settingsRes.rows[0] || {};
    const limit = config.daily_lead_limit || 8;
    const pitchOffer = config.pitch_offer || 'whatsapp_bot';
    const customOfferDetails = config.custom_offer_details || '';

    const businesses = [];
    let maxPagesToScrape = Math.min(10, Math.ceil(limit / 10));
    if (pitchOffer === "website_dev" || pitchOffer === "whatsapp_bot") {
      maxPagesToScrape = Math.min(10, Math.ceil((limit * 3) / 10));
    }

    for (let page = 0; page < maxPagesToScrape; page++) {
      const startParam = page * 10;
      addLog("info", `Querying Yelp search results page ${page + 1} (Offset: ${startParam})...`);
      const pageUrl = `https://www.yelp.com/search?find_desc=${queryDesc}&find_loc=${queryLoc}&start=${startParam}`;
      
      const response = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });

      if (!response.ok) {
        addLog("warn", `Failed to fetch Yelp page ${page + 1}: status ${response.status}`);
        break;
      }

      const html = await response.text();
      const pageBiz = parseYelpSearchHtml(html, location, niche);
      addLog("info", `Extracted ${pageBiz.length} potential local businesses from page ${page + 1}.`);

      if (pageBiz.length === 0) {
        break;
      }

      // Add to main list avoiding duplicates
      for (const biz of pageBiz) {
        const isDup = businesses.some(b => b.name.toLowerCase() === biz.name.toLowerCase() || (b.phone && b.phone === biz.phone));
        if (!isDup) {
          businesses.push(biz);
        }
      }

      const candidateLimit = (pitchOffer === "website_dev" || pitchOffer === "whatsapp_bot") ? limit * 3 : limit;
      if (businesses.length >= candidateLimit) {
        break;
      }

      // Brief delay to avoid aggressive scraping rate-limits
      if (page < maxPagesToScrape - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    addLog("info", `Extracted ${businesses.length} total unique potential local businesses across pages.`);

    if (businesses.length === 0) {
      addLog("warn", "Yelp scraper returned 0 items. Try checking your keyword/location or wait a few moments.");
      return res.json({ logs: searchLogs, leads: [] });
    }

    const candidateLimit = (pitchOffer === "website_dev" || pitchOffer === "whatsapp_bot") ? limit * 3 : limit;
    const leadsToProcess = businesses.slice(0, candidateLimit);
    addLog("info", `Initiating website lookup and email crawling for top ${leadsToProcess.length} candidate listings...`);

    const processedLeads = [];

    // Map through the leads to process in parallel
    const crawlPromises = leadsToProcess.map(async (biz) => {
      let website = null;
      let email = null;
      let instagram = "";
      let hasBooking = false;

      // Pre-crawl blocklist check: check if already trashed
      const dupCheck = await pool.query(
        "SELECT status FROM leads WHERE name = $1 AND city = $2 AND user_id = $3 LIMIT 1",
        [biz.name, biz.city || location, req.userId]
      );
      if (dupCheck.rowCount > 0 && dupCheck.rows[0].status === 'trashed') {
        addLog("warn", `[-] Skipping "${biz.name}" - business was previously marked as TRASHED.`);
        return;
      }

      if (biz.url) {
        addLog("info", `Fetching Yelp details for "${biz.name}"...`);
        try {
          const detailRes = await fetch(biz.url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9"
            },
            signal: AbortSignal.timeout(10000)
          });
          
          if (detailRes.ok) {
            const detailHtml = await detailRes.text();
            website = extractWebsiteFromYelpDetail(detailHtml);
            
            // Extract phone number from detail page if missing in search results
            if (!biz.phone) {
              const phoneMatch = detailHtml.match(/"telephone"\s*:\s*"([^"]+)"/i) || detailHtml.match(/telephone&quot;:\s*&quot;([^&]+)/i);
              if (phoneMatch) {
                let p = decodeHtmlEntities(phoneMatch[1]);
                if (p.startsWith("+1")) {
                  biz.phone = `(${p.substring(2, 5)}) ${p.substring(5, 8)}-${p.substring(8)}`;
                } else {
                  biz.phone = p;
                }
              }
            }

            // Extract Instagram from Yelp details if possible
            const igMatch = detailHtml.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
            if (igMatch) {
              const handle = "@" + igMatch[1].replace(/\/$/, "").split(/[?#]/)[0];
              if (handle && handle !== "@p" && handle !== "@yelp" && handle !== "@none") {
                instagram = handle;
              }
            }
            
            let websiteStatus = 'active';
            if (website) {
              addLog("info", `Found website for "${biz.name}": ${website}. Crawling for contact email...`);
              try {
                const checkRes = await fetch(website, {
                  headers: { "User-Agent": "Mozilla/5.0" },
                  signal: AbortSignal.timeout(5000)
                });
                if (!checkRes.ok) websiteStatus = 'down';
              } catch (e) {
                websiteStatus = 'down';
              }
              const crawlRes = await crawlWebsiteForEmail(website, addLog);
              hasBooking = crawlRes.hasBooking || false;
              
              if (crawlRes.emails && crawlRes.emails.length > 0) {
                email = crawlRes.emails[0];
                addLog("success", `[+] Email found for "${biz.name}": ${email}`);
              } else {
                addLog("warn", `[-] No real email found on website for "${biz.name}"`);
              }

              if (crawlRes.socials) {
                if (crawlRes.socials.instagram) instagram = crawlRes.socials.instagram;
              }
            } else {
              websiteStatus = 'no_website';
              addLog("warn", `[-] No official website listed on Yelp for "${biz.name}"`);
            }
          }
        } catch (detailErr) {
          addLog("danger", `Failed fetching Yelp details/website for "${biz.name}": ${detailErr.message}`);
        }
      }

      processedLeads.push({
        name: biz.name,
        type: biz.type,
        city: biz.city,
        email: email, // This is real or null
        phone: biz.phone,
        rating: biz.rating,
        reviews: biz.reviews,
        status: email ? "not contacted" : "no_email",
        instagram: instagram || biz.instagram || "",
        website: website || null,
        website_status: websiteStatus,
        hasBooking: hasBooking
      });
    });

    await Promise.all(crawlPromises);

    // Filter leads based on target service parameters
    const matchingLeads = processedLeads.filter(lead => {
      const isMatch = isLeadMatchingService(lead, pitchOffer, lead.hasBooking);
      if (!isMatch) {
        addLog("warn", `[-] Skipping "${lead.name}" - does not match pain points for service "${pitchOffer}" (Website: "${lead.website_status}", Existing booking features: ${lead.hasBooking}).`);
      }
      return isMatch;
    });

    const finalLeads = matchingLeads.slice(0, limit);
    addLog("info", `Filtered candidate pool: ${finalLeads.length} of ${processedLeads.length} leads match active service criteria.`);

    // Save the scraped leads to PostgreSQL
    addLog("info", "Syncing leads to PostgreSQL database...");
    const savedLeads = [];
    for (const lead of finalLeads) {
      // Avoid duplicates based on name and city and user_id
      const checkDup = await pool.query(
        "SELECT id, status FROM leads WHERE name = $1 AND city = $2 AND user_id = $3",
        [lead.name, lead.city, req.userId]
      );
      if (checkDup.rowCount === 0) {
        // Also check if this email was previously trashed!
        let emailTrashed = false;
        if (lead.email) {
          const checkEmailTrashed = await pool.query(
            "SELECT id FROM leads WHERE email = $1 AND status = 'trashed' AND user_id = $2",
            [lead.email, req.userId]
          );
          if (checkEmailTrashed.rowCount > 0) {
            emailTrashed = true;
          }
        }

        if (!emailTrashed) {
          const insertRes = await pool.query(
            "INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, user_id, website, website_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [lead.name, lead.type, lead.city, lead.email, lead.phone, lead.rating, lead.reviews, lead.status, lead.instagram, req.userId, lead.website || null, lead.website_status || 'unknown']
          );
          savedLeads.push(insertRes.rows[0]);
        } else {
          addLog("warn", `[-] Skipping "${lead.name}" because its email address was previously TRASHED.`);
        }
      } else if (checkDup.rows[0].status !== "trashed") {
        // Update details if existing and NOT trashed
        const updateRes = await pool.query(
          "UPDATE leads SET email = COALESCE($1, email), phone = COALESCE($2, phone), rating = $3, reviews = $4, instagram = COALESCE($5, instagram), website = COALESCE($6, website), website_status = COALESCE($7, website_status) WHERE id = $8 AND user_id = $9 RETURNING *",
          [lead.email, lead.phone, lead.rating, lead.reviews, lead.instagram, lead.website || null, lead.website_status || 'unknown', checkDup.rows[0].id, req.userId]
        );
        savedLeads.push(updateRes.rows[0]);
      } else {
        addLog("warn", `[-] Skipping "${lead.name}" because it is currently TRASHED.`);
      }
    }

    addLog("accent", `Lead Finder process finished. ${savedLeads.length} leads loaded successfully.`);
    res.json({ logs: searchLogs, leads: savedLeads });

  } catch (err) {
    addLog("danger", `Lead scanning failed: ${err.message}`);
    res.status(500).json({ error: err.message, logs: searchLogs });
  }
});

app.post("/api/scan-deepsearch", authenticate, async (req, res) => {
  const { niche, location, geminiKey } = req.body;
  const apiKey = geminiKey || process.env.GEMINI_API_KEY;
  const searchLogs = [];

  const addLog = (type, text) => {
    console.log(`[DEEPSEARCH LOG] [${type.toUpperCase()}] ${text}`);
    searchLogs.push({ type, text });
  };

  if (!apiKey) {
    addLog("danger", "DeepSearch requires a Gemini API Key. Please enter your API key in the UI panel.");
    return res.status(400).json({ error: "Gemini API key is required", logs: searchLogs });
  }

  addLog("info", `Initializing Gemini DeepSearch AI for niche: '${niche}' in: '${location}'...`);
  addLog("info", "Querying Gemini API with Google Search grounding enabled...");

  try {
    const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const config = settingsRes.rows[0] || {};
    // Cap UI scan to 15 leads (1 batch) to prevent gateway/proxy timeouts
    const limit = Math.min(15, config.daily_lead_limit || 8);
    const pitchOffer = config.pitch_offer || 'whatsapp_bot';
    const customOfferDetails = config.custom_offer_details || '';

    let targetingInstructions = "";
    if (pitchOffer === "website_dev") {
      targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching website design and development services.
  Therefore, you MUST ONLY return businesses that:
  - DO NOT have a website, OR
  - Have a website that is down, broken, or inaccessible.
  DO NOT return any business that has a fully working, active website. If a business has an active website, skip it and search for another one.
  In your search grounding, check the status of their website. Set "website_status" to "no_website" if they lack one, "down" if it is broken/inaccessible, or "active" if it is working.`;
    } else if (pitchOffer === "whatsapp_bot") {
      targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching WhatsApp booking bots and table reservation automations.
  Therefore, you MUST ONLY return popular businesses (e.g. cafes, restaurants, brunch spots, salons, spas) that would benefit from automated reservation booking AND do NOT already have an online booking link or scheduler widget (like Calendly, Acuity, Resy, OpenTable) on their website.
  If they already have booking automation, skip them. Set "website_status" to "active" if they have a website, or "no_website" otherwise.`;
    } else if (pitchOffer === "ai_chatbot") {
      targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching AI Chatbot customer support agents for Yelp/Instagram.
  Therefore, prioritize finding businesses that have an active Instagram handle or Yelp listing but lack instant chat responses or automated FAQ assistants. Set "website_status" to "active" if they have a website, or "no_website" otherwise.`;
    } else if (pitchOffer === "custom" && customOfferDetails) {
      targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching: ${customOfferDetails}.
  Therefore, find businesses that match the profile and pain points of this service: ${customOfferDetails}. Set "website_status" to "active" if they have a website, or "no_website" otherwise.`;
    }

    const startTime = Date.now();
    const batchSize = 4;
    const processedLeads = [];
    const seenNames = new Set();

    try {
      const existingLeads = await pool.query("SELECT name FROM leads WHERE user_id = $1", [req.userId]);
      for (const row of existingLeads.rows) {
        seenNames.add(row.name.toLowerCase().trim());
      }
      if (seenNames.size > 0) {
        addLog("info", `Pre-populated blocklist with ${seenNames.size} existing leads.`);
      }
    } catch (dbErr) {
      console.error("Failed to load existing lead names for DeepSearch seenNames:", dbErr.message);
    }

    addLog("info", `Initiating DeepSearch AI scanning loop up to the limit of ${limit} leads...`);

    let attempts = 0;
    const maxAttempts = 1;

    while (processedLeads.length < limit && attempts < maxAttempts) {
      if (Date.now() - startTime > 25000) {
        addLog("info", `Approaching overall request timeout limit (${Math.round((Date.now() - startTime)/1000)}s elapsed). Syncing current leads and concluding early.`);
        break;
      }
      attempts++;
      const currentBatchLimit = Math.min(batchSize, limit - processedLeads.length);
      if (currentBatchLimit <= 0) break;
      addLog("info", `Fetching DeepSearch AI batch (Targeting: ${currentBatchLimit} leads, Progress: ${processedLeads.length}/${limit})...`);

      const promptText = `
Find exactly ${currentBatchLimit} real, active local businesses matching this target:
- Niche: ${niche}
- Location: ${location}
${processedLeads.length > 0 ? `Please avoid duplicates of the following businesses: ${Array.from(seenNames).slice(0, 40).join(", ")}` : ""}
${targetingInstructions}

Instructions:
- Use Google Search grounding to find these businesses.
- To prevent timeouts, perform at most 1-2 Google Searches in total for the entire batch. Do not run search queries for each business individually.
- CRITICAL LOCATION CONSTRAINT: You MUST ONLY return businesses located in the specified city/state: ${location}. Under no circumstances should you return businesses in any other city, state, or country. Verify the city/state of each business using Google Search before returning it.
- WEBSITE STATUS TRUTH CONSTRAINT: Do not invent or hallucinate that a business lacks a website if it has one. If a business has an active website, do not return it with website set to null or website_status set to "no_website" just to fit the targeting instructions. Skip it. If this results in 0 leads found, return an empty array [].
- DATA QUALITY CONSTRAINTS: Do not use placeholders for phone numbers (like "(512) XXX-XXXX"). If you cannot find the actual phone number, output null or omit it. Retrieve actual rating and reviews count (if not found, output null). Do not invent reviews/ratings.
- EMAIL FINDING & DATA ACCURACY STRATEGY:
  - Deeply search the grounding context and search results (official website pages, Facebook pages, contact details pages, Yelp listings, or Instagram bios) to extract real, public contact email addresses.
  - DO NOT return dummy/placeholder emails like name@example.com or info@domain.com unless it's a real email.
  - If a public email is not found, output null. Never invent fake ones.
  - Double check phone formats, rating (e.g. 4.9), and review counts to ensure they match authentic real-world business directory data.

For each business, retrieve:
  1. Exact Business Name
  2. Specific Category/Type
  3. Official Website URL
  4. Real, public contact email address if publicly listed (otherwise null).
  5. Phone number
  6. Average rating and total reviews (if not found, output null)
  7. Official Instagram handle (otherwise null)

You must return the response as a valid JSON array of objects, where each object has these exact keys:
"name" (string), "type" (string), "city" (string, e.g. "Austin, TX"), "email" (string or null), "phone" (string), "rating" (number or null), "reviews" (integer or null), "instagram" (string), "website" (string or null), "website_status" (string, e.g. "active", "no_website", "down")

CRITICAL: If no matching businesses can be found in the location that satisfy the niching and website/service constraints, you MUST return a valid empty JSON array [] as your entire response. Do not output any conversational explanations, chat text, intros, or outros.

Format example:
[
  {
    "name": "Houndstooth Coffee",
    "type": "Specialty Coffee",
    "city": "Austin, TX",
    "email": "jake@theshoredesigns.com",
    "phone": "(512) 531-9020",
    "rating": 4.0,
    "reviews": 604,
    "instagram": "@houndstoothcoffee",
    "website": "https://www.houndstoothcoffee.com",
    "website_status": "active"
  }
]
`;

      let response;
      let usedFallback = false;
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            tools: [{ googleSearch: {} }],
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          }),
          signal: AbortSignal.timeout(25000)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Status ${response.status} - ${errText}`);
        }
      } catch (fetchErr) {
        addLog("warn", `Primary Google Search grounding failed or timed out: ${fetchErr.message}. Attempting fallback using Gemini internal knowledge base...`);
        try {
          response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: {
                responseMimeType: "application/json",
                thinkingConfig: {
                  thinkingBudget: 0
                }
              }
            }),
            signal: AbortSignal.timeout(15000)
          });
          if (!response.ok) {
            const errText = await response.text();
            addLog("warn", `Fallback request failed: ${response.status} - ${errText}`);
            break;
          }
          usedFallback = true;
          addLog("success", `Fallback query completed successfully using internal knowledge base.`);
        } catch (fallbackErr) {
          addLog("warn", `Fallback request aborted or failed: ${fallbackErr.message}`);
          break;
        }
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      
      let batchLeads = [];
      try {
        batchLeads = extractJsonArray(text);
      } catch (parseErr) {
        addLog("warn", `Failed to parse JSON response from Gemini batch: ${parseErr.message}`);
        console.warn(`[PARSING ERROR DETAILS] Raw response text:`, text);
        continue;
      }

      if (batchLeads.length === 0) {
        addLog("info", "No more leads returned in this batch. Stopping search loop.");
        break;
      }

      let addedInBatch = 0;
      for (const lead of batchLeads) {
        if (!lead.name) continue;
        const normalizedName = lead.name.toLowerCase().trim();
        if (seenNames.has(normalizedName)) continue;

        // Filter based on target service parameters
        const isMatch = isLeadMatchingService(lead, pitchOffer, false);
        if (!isMatch) {
          addLog("warn", `[-] Skipping "${lead.name}" - does not match pain points for service "${pitchOffer}" (Website status: "${lead.website_status}").`);
          continue;
        }

        seenNames.add(normalizedName);

        let email = lead.email;
        if (email) {
          if (isValidEmail(email)) {
            addLog("success", `[+] Email verified for "${lead.name}": ${email}`);
          } else {
            addLog("warn", `[-] Ignored placeholder email: ${email} for "${lead.name}"`);
            email = null;
          }
        }

        processedLeads.push({
          name: lead.name || "Unknown Business",
          type: lead.type || niche,
          city: lead.city || location,
          email: email || null,
          phone: lead.phone || "",
          rating: lead.rating ? parseFloat(lead.rating) : 4.0,
          reviews: lead.reviews ? parseInt(lead.reviews) : 0,
          status: email ? "not contacted" : "no_email",
          instagram: lead.instagram || "",
          website: lead.website || null,
          website_status: lead.website_status || 'unknown'
        });
        addedInBatch++;
      }

      addLog("success", `Processed ${addedInBatch} new leads from this AI batch.`);
      
      if (batchLeads.length < currentBatchLimit / 2) {
        addLog("info", "AI returned low count, concluding search to avoid redundancy.");
        break;
      }
    }

    addLog("info", "Syncing verified leads to PostgreSQL database...");
    const savedLeads = [];
    for (const lead of processedLeads) {
      const checkDup = await pool.query(
        "SELECT id, status FROM leads WHERE name = $1 AND city = $2 AND user_id = $3",
        [lead.name, lead.city, req.userId]
      );
      if (checkDup.rowCount === 0) {
        // Also check if this email was previously trashed!
        let emailTrashed = false;
        if (lead.email) {
          const checkEmailTrashed = await pool.query(
            "SELECT id FROM leads WHERE email = $1 AND status = 'trashed' AND user_id = $2",
            [lead.email, req.userId]
          );
          if (checkEmailTrashed.rowCount > 0) {
            emailTrashed = true;
          }
        }

        if (!emailTrashed) {
          const insertRes = await pool.query(
            "INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, user_id, website, website_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *",
            [lead.name, lead.type, lead.city, lead.email, lead.phone, lead.rating, lead.reviews, lead.status, lead.instagram, req.userId, lead.website || null, lead.website_status || 'unknown']
          );
          savedLeads.push(insertRes.rows[0]);
        } else {
          addLog("warn", `[-] Skipping "${lead.name}" because its email address was previously TRASHED.`);
        }
      } else if (checkDup.rows[0].status !== "trashed") {
        const updateRes = await pool.query(
          "UPDATE leads SET email = COALESCE($1, email), phone = COALESCE($2, phone), rating = $3, reviews = $4, instagram = COALESCE($5, instagram), website = COALESCE($6, website), website_status = COALESCE($7, website_status) WHERE id = $8 AND user_id = $9 RETURNING *",
          [lead.email, lead.phone, lead.rating, lead.reviews, lead.instagram, lead.website || null, lead.website_status || 'unknown', checkDup.rows[0].id, req.userId]
        );
        savedLeads.push(updateRes.rows[0]);
      } else {
        addLog("warn", `[-] Skipping "${lead.name}" because it is currently TRASHED.`);
      }
    }

    addLog("accent", `DeepSearch complete. ${savedLeads.length} leads synced successfully.`);
    res.json({ logs: searchLogs, leads: savedLeads });

  } catch (err) {
    console.error("DeepSearch process failed:", err);
    addLog("danger", `DeepSearch failed: ${err.message}`);
    res.status(500).json({ error: err.message, logs: searchLogs });
  }
});

// Analytics & Recommendations Endpoints
app.get("/api/analytics", authenticate, async (req, res) => {
  try {
    const totalLeads = await pool.query("SELECT COUNT(*) FROM leads WHERE user_id = $1", [req.userId]);
    const totalContacted = await pool.query("SELECT COUNT(*) FROM leads WHERE status NOT IN ('not contacted', 'trashed') AND user_id = $1", [req.userId]);
    const totalOpened = await pool.query("SELECT COUNT(*) FROM leads WHERE is_opened = TRUE AND user_id = $1", [req.userId]);
    const totalReplied = await pool.query("SELECT COUNT(*) FROM emails WHERE 'replied' = ANY(labels) AND user_id = $1", [req.userId]);
    const totalInterested = await pool.query("SELECT COUNT(*) FROM leads WHERE status = 'interested' AND user_id = $1", [req.userId]);
    
    const contactedCount = parseInt(totalContacted.rows[0].count);
    const openedCount = parseInt(totalOpened.rows[0].count);
    const repliedCount = parseInt(totalReplied.rows[0].count);
    const interestedCount = parseInt(totalInterested.rows[0].count);

    res.json({
      leadsCount: parseInt(totalLeads.rows[0].count),
      emailsSent: contactedCount,
      openRate: contactedCount > 0 ? Math.round((openedCount / contactedCount) * 100) : 0,
      replyRate: contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0,
      interestRate: contactedCount > 0 ? Math.round((interestedCount / contactedCount) * 100) : 0,
      interested: interestedCount,
      revenue: interestedCount * 1500, 
      weeklyLeads: [0, 0, 0, Math.round(contactedCount * 0.3), Math.round(contactedCount * 0.5), Math.round(contactedCount * 0.8), contactedCount],
      opensByDay: [0, 0, 0, Math.round(openedCount * 0.3), Math.round(openedCount * 0.5), Math.round(openedCount * 0.8), openedCount]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/recommendations", authenticate, async (req, res) => {
  try {
    const settingsRes = await pool.query("SELECT gemini_key, sender_name FROM campaign_settings WHERE user_id = $1 LIMIT 1", [req.userId]);
    const geminiKey = settingsRes.rows[0]?.gemini_key || process.env.GEMINI_API_KEY;
    const senderName = settingsRes.rows[0]?.sender_name || "Muhammad Razi";

    if (!geminiKey) {
      return res.json({
        recommendation: "Please configure your Gemini API Key in Settings to receive copywriting insights."
      });
    }

    const totalContacted = await pool.query("SELECT COUNT(*) FROM leads WHERE status != 'not contacted' AND user_id = $1", [req.userId]);
    const totalOpened = await pool.query("SELECT COUNT(*) FROM leads WHERE is_opened = TRUE AND user_id = $1", [req.userId]);
    const totalReplied = await pool.query("SELECT COUNT(*) FROM emails WHERE 'replied' = ANY(labels) AND user_id = $1", [req.userId]);
    
    const contactedCount = parseInt(totalContacted.rows[0].count);
    const openedCount = parseInt(totalOpened.rows[0].count);
    const repliedCount = parseInt(totalReplied.rows[0].count);

    const openRate = contactedCount > 0 ? Math.round((openedCount / contactedCount) * 100) : 0;
    const replyRate = contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;

    const promptText = `
You are an expert cold outreach copywriter analyzing campaign performance for ${senderName}, an independent web and AI developer.
Current campaign stats:
- Emails sent: ${contactedCount}
- Open rate: ${openRate}%
- Reply rate: ${replyRate}%

Write exactly 3 concise bullet points of highly specific copywriting improvements (e.g. lowercase subject lines, developer pitch, custom widgets) to improve these metrics. Keep it direct and short. Do not include markdown codeblocks or headings. Keep the response under 120 words total.
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      res.json({ recommendation: text.trim() });
    } else {
      res.json({ recommendation: "Unable to retrieve recommendations from Gemini at the moment." });
    }
  } catch (err) {
    res.json({ recommendation: `Gemini recommendations error: ${err.message}` });
  }
});

// Helper functions for Cron campaigns
async function performYelpScrapingDirect(niche, location, limit = 8, config = {}) {
  const pitchOffer = config.pitch_offer || 'whatsapp_bot';
  const queryDesc = encodeURIComponent(niche || "Cafes");
  const queryLoc = encodeURIComponent(location || "Austin, TX");
  
  const businesses = [];
  const candidateLimit = (pitchOffer === "website_dev" || pitchOffer === "whatsapp_bot") ? limit * 3 : limit;
  const maxPagesToScrape = Math.min(10, Math.ceil(candidateLimit / 10));

  for (let page = 0; page < maxPagesToScrape; page++) {
    const startParam = page * 10;
    const pageUrl = `https://www.yelp.com/search?find_desc=${queryDesc}&find_loc=${queryLoc}&start=${startParam}`;
    try {
      const response = await fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
      });
      if (!response.ok) break;
      const html = await response.text();
      const pageBiz = parseYelpSearchHtml(html, location, niche);
      if (pageBiz.length === 0) break;
      
      for (const biz of pageBiz) {
        const isDup = businesses.some(b => b.name.toLowerCase() === biz.name.toLowerCase() || (b.phone && b.phone === biz.phone));
        if (!isDup) {
          businesses.push(biz);
        }
      }
      if (businesses.length >= candidateLimit) break;
      if (page < maxPagesToScrape - 1) {
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (err) {
      console.error(`Yelp page scrape failed for direct scraper:`, err.message);
      break;
    }
  }

  const leadsToProcess = businesses.slice(0, candidateLimit);
  const results = [];

  for (const biz of leadsToProcess) {
    let website = null;
    let email = null;
    let instagram = "";
    let hasBooking = false;
    if (biz.url) {
      try {
        const detailRes = await fetch(biz.url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          },
          signal: AbortSignal.timeout(10000)
        });
        if (detailRes.ok) {
          const detailHtml = await detailRes.text();
          website = extractWebsiteFromYelpDetail(detailHtml);
          if (!biz.phone) {
            const phoneMatch = detailHtml.match(/"telephone"\s*:\s*"([^"]+)"/i) || detailHtml.match(/telephone&quot;:\s*&quot;([^&]+)/i);
            if (phoneMatch) {
              let p = decodeHtmlEntities(phoneMatch[1]);
              biz.phone = p.startsWith("+1") ? `(${p.substring(2, 5)}) ${p.substring(5, 8)}-${p.substring(8)}` : p;
            }
          }
          const igMatch = detailHtml.match(/instagram\.com\/([a-zA-Z0-9_.-]+)/i);
          if (igMatch) {
            const handle = "@" + igMatch[1].replace(/\/$/, "").split(/[?#]/)[0];
            if (handle && handle !== "@p" && handle !== "@yelp" && handle !== "@none") instagram = handle;
          }
          let websiteStatus = 'active';
          if (website) {
            try {
              const checkRes = await fetch(website, {
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(5000)
              });
              if (!checkRes.ok) websiteStatus = 'down';
            } catch (e) {
              websiteStatus = 'down';
            }
            const crawlRes = await crawlWebsiteForEmail(website, () => {});
            hasBooking = crawlRes.hasBooking || false;
            if (crawlRes.emails && crawlRes.emails.length > 0) email = crawlRes.emails[0];
            if (crawlRes.socials && crawlRes.socials.instagram) instagram = crawlRes.socials.instagram;
          } else {
            websiteStatus = 'no_website';
          }
        }
      } catch (e) {
        console.error("Cron detail scrap failed for:", biz.name, e.message);
      }
    }
    results.push({
      name: biz.name,
      type: biz.type,
      city: biz.city,
      email: email,
      phone: biz.phone || "",
      rating: biz.rating,
      reviews: biz.reviews,
      instagram: instagram || biz.instagram || "",
      website: website || null,
      website_status: websiteStatus,
      hasBooking: hasBooking
    });
  }

  // Filter leads based on target service parameters
  const matchingResults = results.filter(lead => isLeadMatchingService(lead, pitchOffer, lead.hasBooking));
  return matchingResults.slice(0, limit);
}

async function performDeepSearchDirect(niche, location, apiKey, limit = 8, config = {}) {
  if (!apiKey) throw new Error("API Key required for DeepSearch");
  
  const pitchOffer = config.pitch_offer || 'whatsapp_bot';
  const customOfferDetails = config.custom_offer_details || '';

  let targetingInstructions = "";
  if (pitchOffer === "website_dev") {
    targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching website design and development services.
  Therefore, you MUST ONLY return businesses that:
  - DO NOT have a website, OR
  - Have a website that is down, broken, or inaccessible.
  DO NOT return any business that has a fully working, active website. If a business has an active website, skip it and search for another one.
  In your search grounding, check the status of their website. Set "website_status" to "no_website" if they lack one, "down" if it is broken/inaccessible, or "active" if it is working.`;
  } else if (pitchOffer === "whatsapp_bot") {
    targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching WhatsApp booking bots and table reservation automations.
  Therefore, you MUST ONLY return popular businesses (e.g. cafes, restaurants, brunch spots, salons, spas) that would benefit from automated reservation booking AND do NOT already have an online booking link or scheduler widget (like Calendly, Acuity, Resy, OpenTable) on their website.
  If they already have booking automation, skip them. Set "website_status" to "active" if they have a website, or "no_website" otherwise.`;
  } else if (pitchOffer === "ai_chatbot") {
    targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching AI Chatbot customer support agents for Yelp/Instagram.
  Therefore, prioritize finding businesses that have an active Instagram handle or Yelp listing but lack instant chat responses or automated FAQ assistants. Set "website_status" to "active" if they have a website, or "no_website" otherwise.`;
  } else if (pitchOffer === "custom" && customOfferDetails) {
    targetingInstructions = `
- SPECIAL SEARCH TARGETING: We are pitching: ${customOfferDetails}.
  Therefore, find businesses that match the profile and pain points of this service: ${customOfferDetails}. Set "website_status" to "active" if they have a website, or "no_website" otherwise.`;
  }

  const batchSize = 8;
  const processedLeads = [];
  const seenNames = new Set();
  let attempts = 0;
  const maxAttempts = 5;

  while (processedLeads.length < limit && attempts < maxAttempts) {
    try {
      attempts++;
      const currentBatchLimit = Math.min(batchSize, limit - processedLeads.length);
      if (currentBatchLimit <= 0) break;

    const promptText = `
Find exactly ${currentBatchLimit} real, active local businesses matching this target:
- Niche: ${niche}
- Location: ${location}
${processedLeads.length > 0 ? `Please avoid duplicates of the following businesses: ${Array.from(seenNames).slice(0, 40).join(", ")}` : ""}
${targetingInstructions}

Instructions:
- Use Google Search grounding to find these businesses.
- To prevent timeouts, perform at most 1-2 Google Searches in total for the entire batch. Do not run search queries for each business individually.
- EMAIL FINDING & DATA ACCURACY STRATEGY:
  - Deeply search the grounding context and search results (official website pages, Facebook pages, contact details pages, Yelp listings, or Instagram bios) to extract real, public contact email addresses.
  - DO NOT return dummy/placeholder emails like name@example.com or info@domain.com unless it's a real email.
  - If a public email is not found, output null. Never invent fake ones.
  - Double check phone formats, rating (e.g. 4.9), and review counts to ensure they match authentic real-world business directory data.

For each business, retrieve:
  1. Exact Business Name
  2. Specific Category/Type
  3. Official Website URL
  4. Real, public contact email address if publicly listed (otherwise null).
  5. Phone number in format (XXX) XXX-XXXX
  6. Average rating and total reviews (approximate if needed)
  7. Official Instagram handle (otherwise null)

You must return the response as a valid JSON array of objects, where each object has these exact keys:
"name" (string), "type" (string), "city" (string, e.g. "Austin, TX"), "email" (string or null), "phone" (string), "rating" (number or null), "reviews" (integer or null), "instagram" (string), "website" (string or null), "website_status" (string, e.g. "active", "no_website", "down")

CRITICAL: If no matching businesses can be found in the location that satisfy the niching and website/service constraints, you MUST return a valid empty JSON array [] as your entire response. Do not output any conversational explanations, chat text, intros, or outros.
`;

    let response;
    try {
      response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          tools: [{ googleSearch: {} }],
          generationConfig: {
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Status ${response.status} - ${errText}`);
      }
    } catch (fetchErr) {
      console.warn(`[CRON DEEPSEARCH] Primary grounding search failed or timed out: ${fetchErr.message}. Trying fallback...`);
      try {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              thinkingConfig: {
                thinkingBudget: 0
              }
            }
          }),
          signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) break;
      } catch (fallbackErr) {
        console.error(`[CRON DEEPSEARCH] Fallback fetch failed:`, fallbackErr.message);
        break;
      }
    }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      let batchLeads = [];
      try {
        batchLeads = extractJsonArray(text);
      } catch (parseErr) {
        console.error("DeepSearch direct cron parse error in batch:", parseErr.message);
        continue;
      }

      if (batchLeads.length === 0) break;

      for (const lead of batchLeads) {
        if (!lead.name) continue;
        const normalizedName = lead.name.toLowerCase().trim();
        if (seenNames.has(normalizedName)) continue;
        
        // Filter based on target service pain points
        const isMatch = isLeadMatchingService(lead, pitchOffer, false);
        if (!isMatch) {
          continue;
        }

        seenNames.add(normalizedName);

        processedLeads.push({
          name: lead.name || "Unknown Business",
          type: lead.type || niche,
          city: lead.city || location,
          email: lead.email && isValidEmail(lead.email) ? lead.email.toLowerCase().trim() : null,
          phone: lead.phone || "",
          rating: lead.rating ? parseFloat(lead.rating) : 4.0,
          reviews: lead.reviews ? parseInt(lead.reviews) : 0,
          instagram: lead.instagram || "",
          website: lead.website || null,
          website_status: lead.website_status || 'unknown'
        });
      }

      if (batchLeads.length < currentBatchLimit / 2) break;
    } catch (e) {
      console.error("DeepSearch direct cron batch error:", e.message);
      break;
    }
  }

  return processedLeads.slice(0, limit);
}

async function generateDeveloperOutreach(lead, config) {
  const senderName = config.sender_name || "Muhammad Razi";
  const senderRole = config.sender_role || "Independent Developer";
  const companyName = config.company_name || "";
  const useCompany = config.use_company_branding || false;
  const senderType = config.sender_type || "developer";
  const aboutText = config.about_text || "";
  const portfolioUrl = config.portfolio_url || "";
  const socialLinkedin = config.social_linkedin || "";
  const socialGithub = config.social_github || "";
  const socialTwitter = config.social_twitter || "";
  const logoUrl = config.logo_url || "";
  const bannerUrl = config.banner_url || "";
  const profileIconUrl = config.profile_icon_url || "";

  let senderIntro = "";
  let signature = "";
  if (useCompany && companyName) {
    senderIntro = `${senderName}, ${senderRole} at ${companyName}`;
    signature = `${senderName}\n${senderRole}\n${companyName}`;
  } else {
    senderIntro = `${senderName}, ${senderRole}`;
    signature = `${senderName}\n${senderRole}`;
  }

  const pitchOffer = config.pitch_offer || "whatsapp_bot";
  const customOfferDetails = config.custom_offer_details || "";

  let offerDescription = "design simple, custom AI reservation assistants and chat widgets that help cafes handle WhatsApp bookings automatically, saving 2-3 hours daily";
  if (pitchOffer === "website_dev") {
    offerDescription = "design and develop modern, high-performing websites and custom web platforms to help businesses turn traffic into loyal customers";
  } else if (pitchOffer === "ai_chatbot") {
    offerDescription = "build intelligent custom AI chatbot assistants that reply to customer inquiries instantly on your website, Yelp, and Instagram DMs 24/7";
  } else if (pitchOffer === "custom" && customOfferDetails) {
    offerDescription = customOfferDetails;
  }

  let subject = `quick question for ${lead.name}`;
  let body = `Hi,\n\nI was looking at ${lead.name} in ${lead.city} and wanted to reach out. I'm ${senderIntro}.\n\nI ${offerDescription}. I noticed you guys have an awesome ${lead.rating}⭐ rating with ${lead.reviews} reviews, and thought this would work great for your business.\n\nI built a quick preview for ${lead.name} - would you be open to a quick 10-minute check this week?\n\nCheers,\n${signature}`;

  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const style = config.outreach_style || "casual";
      let styleGuidelines = "";
      
      if (style === "roi") {
        styleGuidelines = `
        - Pitch Angle: ROI-focused. Emphasize saving 2-3 hours of staff time daily, never missing booking messages, and improving conversion rates of chat visitors into paying customers. Mention financial benefits and call automation.`;
      } else if (style === "feedback") {
        styleGuidelines = `
        - Pitch Angle: Opinions/Feedback. Start by referencing their Yelp rating of ${lead.rating}⭐ and reviews count (${lead.reviews} reviews). Note that they must get flooded with reservation requests, and share a constructive tip on how automated IG/Yelp chat replies could streamline their reservation flow.`;
      } else if (style === "direct") {
        styleGuidelines = `
        - Pitch Angle: Pre-built Demo Showcase. Pitch directly that you've put together a quick, pre-built custom AI chat booking assistant prototype specifically customized for ${lead.name} to demonstrate how it handles instant reservations.`;
      } else {
        const pitchIdentity = (useCompany && companyName) ? `${senderRole} from ${companyName}` : senderRole;
        styleGuidelines = `
        - Pitch Angle: Casual, warm, and helpful ${pitchIdentity} offering to help another local business owner automate booking DMs and reservation queries. Keep it very conversational and low-friction.`;
      }

      let offerGuidelines = "";
      if (pitchOffer === "whatsapp_bot") {
        offerGuidelines = `offering custom AI chat booking and WhatsApp reservation bots that automate reservation scheduling and handle bookings automatically.`;
      } else if (pitchOffer === "website_dev") {
        offerGuidelines = `offering custom website design, modern web development, and local optimization to build high-converting websites.`;
      } else if (pitchOffer === "ai_chatbot") {
        offerGuidelines = `offering custom AI chatbot assistants that reply to customer inquiries instantly on their website, Yelp, and Instagram DMs 24/7.`;
      } else if (pitchOffer === "custom" && customOfferDetails) {
        offerGuidelines = `offering: ${customOfferDetails}. Focus your pitch around this specific custom offer.`;
      }

      const promptText = `
        You are ${senderName}, working as "${senderRole}"${(useCompany && companyName) ? ` at ${companyName}` : ""}. Write a highly personalized cold outreach email to a business owner.
        
        Sender Profile Context:
        - Account Type: ${senderType}
        - Sender Bio / Brand Description: ${aboutText}
        - Sender Portfolio Website: ${portfolioUrl || "None"}
        - Sender Social Media: LinkedIn: ${socialLinkedin || "None"}, GitHub: ${socialGithub || "None"}, Twitter: ${socialTwitter || "None"}
        - Branding Images: Logo URL: ${logoUrl || "None"}, Banner URL: ${bannerUrl || "None"}, Profile Icon URL: ${profileIconUrl || "None"}

        Business Details:
        - Name: ${lead.name}
        - Category: ${lead.type}
        - Location: ${lead.city}
        - Yelp Rating: ${lead.rating} out of 5 stars
        - Yelp Reviews: ${lead.reviews}
        - Instagram: ${lead.instagram || "None"}
        - Website: ${lead.website || "None"}
        - Website Status: ${lead.website_status || "unknown"} (can be "active", "no_website", or "down")

        Outreach Guidelines:
        - Target Audience: Local business owner
        - Tone: Casual, helpful, friendly.
        - Core Pitch Offer: ${offerGuidelines}
        - Personalization Rules:
          - Incorporate sender's bio context ("${aboutText}") to state why you are reaching out and highlight relevant skills/background.
          - If a portfolio URL (${portfolioUrl}) or social links (like GitHub ${socialGithub} or LinkedIn ${socialLinkedin}) are provided, naturally mention them to build high credibility.
          - If the Core Pitch Offer is website design/development (website_dev):
            - If Website Status is "no_website", write that you noticed they don't have a website, and pitch why having a modern website will capture local search traffic and build customer trust.
            - If Website Status is "down", write that you tried to visit their site and noticed it was down, broken, or inaccessible, and offer to help get it back online or rebuild a modern, reliable one.
            - If Website Status is "active", write that you checked their website, and suggest specific subtle improvements (e.g. mobile optimizations, fast page loading, cleaner layout).
          - If Core Pitch Offer is WhatsApp Booking Bot or AI Chatbot, highlight how their customers can book appointments or get instant support via chat DMs 24/7.
          - If Core Pitch Offer is a custom service, analyze the custom service details and identify the key pain point it solves for a business of this category (${lead.type}). Address how this business specifically (${lead.name}) can benefit from it, referencing their Yelp metrics or website presence to personalize the pitch.
        ${styleGuidelines}
        - Signature: Use exactly this:
          Cheers,
          ${senderName}
          ${senderRole}${(useCompany && companyName) ? `\n${companyName}` : ""}
        - Subject Line: MUST be highly click-worthy, lowercase, brief, and feel like local feedback or a quick local query (e.g. "quick question about ${lead.name}" or "website feedback").
        - Output format: Start with "Subject: [subject text]" on the first line, then a blank line, and then the email body. Output ONLY the email.
      `;
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            thinkingConfig: {
              thinkingBudget: 0
            }
          }
        }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text.startsWith("Subject:")) {
          const split = text.split("\n\n");
          const subj = split[0].replace("Subject:", "").trim();
          const bdy = split.slice(1).join("\n\n").trim();
          return { subject: subj, body: bdy };
        } else if (text) {
          return { subject: `quick query about ${lead.name}`, body: text.trim() };
        }
      }
    } catch (e) {
      console.error("[CAMPAIGN GEMINI GENERATION FAIL]", e);
    }
  }

  return { subject, body };
}

async function triggerCronCampaign(config) {
  const { niche, location, daily_lead_limit, gmail_user, gmail_pass, gemini_key, search_mode, user_id } = config;
  
  if (!gmail_user || !gmail_pass) {
    console.log(`[CRON] Gmail SMTP not configured for User ${user_id}. Skipping automated outreach.`);
    return;
  }

  console.log(`[CRON] Performing scan for User ${user_id}: niche: '${niche}' in location: '${location}' using mode: '${search_mode}'...`);
  
  let leadsFound = [];
  
  if (search_mode === "deepsearch") {
    try {
      leadsFound = await performDeepSearchDirect(niche, location, gemini_key, daily_lead_limit, config);
    } catch (e) {
      console.error(`[CRON DEEPSEARCH ERROR] Failed for User ${user_id}:`, e.message);
    }
  } else {
    try {
      leadsFound = await performYelpScrapingDirect(niche, location, daily_lead_limit, config);
    } catch (e) {
      console.error(`[CRON YELP ERROR] Failed for User ${user_id}:`, e.message);
    }
  }

  // Deduplicate and insert leads, then send email to new leads
  const newLeads = [];
  for (const lead of leadsFound) {
    const checkDup = await pool.query(
      "SELECT id, status FROM leads WHERE name = $1 AND city = $2 AND user_id = $3",
      [lead.name, lead.city, user_id]
    );
    if (checkDup.rowCount === 0) {
      // Also check if this email was previously trashed!
      let emailTrashed = false;
      if (lead.email) {
        const checkEmailTrashed = await pool.query(
          "SELECT id FROM leads WHERE email = $1 AND status = 'trashed' AND user_id = $2",
          [lead.email, user_id]
        );
        if (checkEmailTrashed.rowCount > 0) {
          emailTrashed = true;
        }
      }

      if (!emailTrashed) {
        const insertRes = await pool.query(
          `INSERT INTO leads (name, type, city, email, phone, rating, reviews, status, instagram, ai_enabled, user_id, website, website_status) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11, $12) RETURNING *`,
          [lead.name, lead.type, lead.city, lead.email, lead.phone, lead.rating, lead.reviews, lead.email ? 'not contacted' : 'no_email', lead.instagram, user_id, lead.website || null, lead.website_status || 'unknown']
        );
        if (lead.email) {
          newLeads.push(insertRes.rows[0]);
        }
      }
    }
  }

  console.log(`[CRON] User ${user_id}: Found ${leadsFound.length} leads. ${newLeads.length} are new with email details. Starting automated outreach...`);

  // Target limit
  const leadsToContact = newLeads.slice(0, daily_lead_limit);

  for (const lead of leadsToContact) {
    console.log(`[CRON] User ${user_id}: Auto-sending outreach email to ${lead.name} (${lead.email})...`);
    
    // Generate Developer Outreach Text
    const { subject, body } = await generateDeveloperOutreach(lead, config);

    try {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        service: "gmail",
        auth: {
          user: gmail_user,
          pass: gmail_pass
        }
      });

      // HTML body with open tracking pixel
      const baseUrl = process.env.APP_URL || "http://localhost:5000";
      const htmlBody = body.replace(/\n/g, "<br/>") + 
        `<br/><br/><img src="${baseUrl}/api/track-open/${lead.id}" width="1" height="1" style="display:none;"/>`;

      await transporter.sendMail({
        from: `"${gmail_user.split('@')[0]}" <${gmail_user}>`,
        to: lead.email,
        subject: subject,
        html: htmlBody
      });

      // Update database status
      await pool.query("UPDATE leads SET status = 'contacted' WHERE id = $1 AND user_id = $2", [lead.id, user_id]);

      // Create an entry in emails table
      await pool.query(
        `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'sent', ARRAY['sent'], $7)`,
        [lead.name, lead.email, lead.name, subject, body, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), user_id]
      );
      
      console.log(`[CRON] User ${user_id}: Email successfully sent to ${lead.name}`);
    } catch (err) {
      console.error(`[CRON OUTBOUND ERROR] User ${user_id} failed for ${lead.name}:`, err.message);
      const errStr = err.message.toLowerCase();
      if (errStr.includes("recipient") || errStr.includes("address") || errStr.includes("not found") || errStr.includes("invalid") || errStr.includes("550")) {
         await pool.query("UPDATE leads SET status = 'trashed' WHERE id = $1 AND user_id = $2", [lead.id, user_id]);
         console.log(`[CRON AUTO-TRASH] Marked lead ${lead.name} as trashed due to bounce error: ${err.message}`);
      }
    }
  }
}

async function syncUserInbox(userId, config) {
  const { gmail_user, gmail_pass, gemini_key } = config;
  if (!gmail_user || !gmail_pass) {
    console.log(`[SYNC] User ${userId}: Gmail credentials not configured. Skipping sync.`);
    return { success: false, error: "Gmail SMTP/IMAP credentials not connected. Please connect Gmail under settings." };
  }

  console.log(`[SYNC] Connecting to Gmail IMAP for User ${userId} (${gmail_user})...`);

  // Fetch all leads for this user to match incoming senders
  const leadsRes = await pool.query(
    "SELECT id, name, email, ai_enabled FROM leads WHERE user_id = $1 AND email IS NOT NULL AND status != 'trashed'",
    [userId]
  );
  if (leadsRes.rowCount === 0) {
    console.log(`[SYNC] User ${userId}: No active leads in database. Skipping mailbox check.`);
    return { success: true, count: 0 };
  }

  const leadsMap = new Map();
  for (const lead of leadsRes.rows) {
    leadsMap.set(lead.email.toLowerCase().trim(), lead);
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: gmail_user,
      pass: gmail_pass
    },
    logger: false,
    clientInfo: {
      name: "Syntek-SaaS"
    }
  });

  client.on("error", (err) => {
    console.error(`[SYNC ERROR] ImapFlow encountered an error for User ${userId}:`, err.message);
  });

  try {
    await client.connect();
    
    // Select and lock INBOX in a single safe block
    const lock = await client.getMailboxLock("INBOX");
    let newRepliesCount = 0;
    
    try {
      const totalMessages = client.mailbox.exists;
      console.log(`[SYNC] User ${userId}: Connected. Inbox count: ${totalMessages}`);

      if (totalMessages > 0) {
        // Check last 100 messages to keep sync fast and thorough
        const startRange = Math.max(1, totalMessages - 100);
        const range = `${startRange}:${totalMessages}`;
        
        for await (let message of client.fetch(range, { envelope: true, bodyParts: ['1'] })) {
          if (!message.envelope || !message.envelope.from || message.envelope.from.length === 0) continue;
          
          const fromEmail = message.envelope.from[0].address.toLowerCase().trim();
          const subject = message.envelope.subject || "No Subject";
          const date = message.envelope.date;

          // Detect mail delivery bounce notifications (invalid/non-existent addresses)
          const isBounceSender = fromEmail.includes("mailer-daemon") || fromEmail.includes("postmaster");
          const isBounceSubject = /delivery status notification|undeliverable|delivery failure|returned mail|bounce/i.test(subject);

          if (isBounceSender || isBounceSubject) {
            let bodyPreview = "";
            const bodyBuffer = message.bodyParts ? message.bodyParts.get('1') : null;
            if (bodyBuffer) {
              let text = bodyBuffer.toString('utf-8');
              text = text.replace(/<[^>]*>/g, ' ');
              text = text.replace(/\s+/g, ' ').trim();
              bodyPreview = text.toLowerCase();
            }

            if (bodyPreview) {
              for (const emailKey of leadsMap.keys()) {
                if (bodyPreview.includes(emailKey)) {
                  const bouncedLead = leadsMap.get(emailKey);
                  console.log(`[SYNC BOUNCE] Found bounce-back for lead: ${bouncedLead.name} (${emailKey}). Marking as trashed.`);
                  await pool.query(
                    "UPDATE leads SET status = 'trashed' WHERE id = $1 AND user_id = $2",
                    [bouncedLead.id, userId]
                  );
                  // Update associated emails with a 'bounced' label
                  await pool.query(
                    "UPDATE emails SET labels = array_append(labels, 'bounced') WHERE from_email = $1 AND user_id = $2",
                    [emailKey, userId]
                  );
                  break;
                }
              }
            }
            continue; // Skip normal processing for bounce notification
          }

          // Check if this matches a lead email
          const matchedLead = leadsMap.get(fromEmail);
          if (matchedLead) {
            // Check if this reply already exists in the database
            const emailCheck = await pool.query(
              "SELECT id FROM emails WHERE user_id = $1 AND from_email = $2 AND subject = $3 AND time_received = $4",
              [userId, fromEmail, subject, date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })]
            );

            if (emailCheck.rowCount === 0) {
              console.log(`[SYNC] User ${userId}: Found new reply from ${matchedLead.name} (${fromEmail})!`);

              // Download preview of body text
              let bodyPreview = "No body content found.";
              const bodyBuffer = message.bodyParts ? message.bodyParts.get('1') : null;
              if (bodyBuffer) {
                let text = bodyBuffer.toString('utf-8');
                text = text.replace(/<[^>]*>/g, ' ');
                text = text.replace(/\s+/g, ' ').trim();
                if (text.length > 0) {
                  bodyPreview = text.substring(0, 800);
                }
              }

              // Insert email reply record in emails table as 'unread'
              const insertedEmail = await pool.query(
                `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, FALSE, 'unread', ARRAY['inbox'], $7) RETURNING *`,
                [matchedLead.name, fromEmail, matchedLead.name, subject, bodyPreview, date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), userId]
              );

              // Update lead status to 'replied' in leads table
              await pool.query(
                "UPDATE leads SET status = 'replied' WHERE id = $1 AND user_id = $2",
                [matchedLead.id, userId]
              );

              newRepliesCount++;

              // AI Autopilot Response logic
              if (matchedLead.ai_enabled) {
                console.log(`[SYNC AUTOPILOT] User ${userId}: AI Responder triggering for lead ${matchedLead.name}...`);
                try {
                  // Detect meeting booking intent first
                  const bookingCheck = await detectMeetingBookingIntent(insertedEmail.rows[0], config, userId);
                  let replyText = "";
                  let isBooking = false;

                  if (bookingCheck.isMeetingAgreed) {
                    console.log(`[BOOKING ENGINE] Meeting agreement detected for lead ${matchedLead.name} at ${bookingCheck.meetingTime}!`);
                    const summary = `Syntek Meeting: ${matchedLead.name} & User`;
                    const calendarEvent = await createGoogleCalendarEvent(userId, matchedLead.name, matchedLead.email, summary, bookingCheck.meetingTime);

                    if (calendarEvent && calendarEvent.meetLink) {
                      // Update lead status to 'meeting_booked'
                      await pool.query(
                        "UPDATE leads SET status = 'meeting_booked' WHERE id = $1 AND user_id = $2",
                        [matchedLead.id, userId]
                      );

                      const senderName = config.sender_name || "Muhammad Razi";
                      const senderRole = config.sender_role || "Independent Developer";
                      const companyName = config.company_name || "";
                      const useCompany = config.use_company_branding || false;
                      const signature = useCompany && companyName ? `${senderName}\n${senderRole}\n${companyName}` : `${senderName}\n${senderRole}`;

                      replyText = `Hi ${matchedLead.name},\n\nI've scheduled our call for ${new Date(bookingCheck.meetingTime).toLocaleString()}! Here is our Google Meet link:\n${calendarEvent.meetLink}\n\nLooking forward to speaking with you!\n\nCheers,\n${signature}`;
                      isBooking = true;
                    }
                  }

                  if (!isBooking) {
                    replyText = await generateEmailReplyText(insertedEmail.rows[0], config, userId);
                  }

                  if (replyText) {
                    // Send the SMTP reply
                    const nodemailer = await import("nodemailer");
                    const transporter = nodemailer.default.createTransport({
                      service: "gmail",
                      auth: {
                        user: gmail_user,
                        pass: gmail_pass
                      }
                    });
                    const reSubject = subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
                    await transporter.sendMail({
                      from: gmail_user,
                      to: fromEmail,
                      subject: reSubject,
                      text: replyText
                    });
                    
                    // Mark the incoming email as read and tag as replied
                    await pool.query(
                      "UPDATE emails SET is_read = TRUE, labels = array_append(labels, 'replied') WHERE id = $1 AND user_id = $2",
                      [insertedEmail.rows[0].id, userId]
                    );

                    // Insert the sent autopilot email reply into the database
                    await pool.query(
                      `INSERT INTO emails (from_name, from_email, company, subject, preview, time_received, is_read, category, labels, user_id)
                       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'sent', ARRAY['sent'], $7)`,
                      [matchedLead.name, fromEmail, matchedLead.name, reSubject, replyText, new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), userId]
                    );
                    
                    console.log(`[SYNC AUTOPILOT SUCCESS] User ${userId}: Autopilot reply sent to ${fromEmail} (Booking: ${isBooking})`);
                  }
                } catch (autopilotErr) {
                  console.error(`[SYNC AUTOPILOT ERROR] Autopilot processing failed:`, autopilotErr.message);
                }
              }
            }
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return { success: true, count: newRepliesCount };
  } catch (err) {
    console.error(`[SYNC IMAP CONNECTION ERROR] User ${userId} failed:`, err.message);
    try {
      await client.logout();
    } catch (_) {}
    return { success: false, error: err.message };
  }
}

function getAiPreferredTime(niche) {
  const n = (niche || "").toLowerCase();
  if (n.includes("cafe") || n.includes("coffee")) {
    return "10:00";
  } else if (n.includes("restaurant") || n.includes("food") || n.includes("brunch") || n.includes("bakery")) {
    return "14:30";
  } else if (n.includes("gym") || n.includes("spa") || n.includes("salon") || n.includes("fitness")) {
    return "11:00";
  }
  return "11:15";
}

function startCronScheduler() {
  console.log("Background Campaign Cron Scheduler initialized.");
  
  // Checking scheduling queue every 60 seconds
  setInterval(async () => {
    try {
      const todayStr = new Date().toDateString();
      const settingsRes = await pool.query("SELECT * FROM campaign_settings WHERE is_active = TRUE");
      
      for (const config of settingsRes.rows) {
        const userId = config.user_id;
        if (config.last_cron_run_date === todayStr) {
          continue; 
        }

        let timeToUse = config.preferred_time || "09:00";
        if (config.schedule_type === "ai") {
          timeToUse = getAiPreferredTime(config.niche);
        }

        const [prefHour, prefMin] = timeToUse.split(":");
        const now = new Date();
        
        let tzHour = now.getHours();
        let tzMin = now.getMinutes();
        
        if (config.timezone === "est") {
          const estStr = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
          const [h, m] = estStr.split(":");
          tzHour = parseInt(h);
          tzMin = parseInt(m);
        } else if (config.timezone === "pst") {
          const pstStr = now.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour12: false });
          const [h, m] = pstStr.split(":");
          tzHour = parseInt(h);
          tzMin = parseInt(m);
        }

        const curHour = tzHour.toString().padStart(2, "0");
        const curMin = tzMin.toString().padStart(2, "0");

        if (curHour === prefHour && curMin === prefMin) {
          await pool.query("UPDATE campaign_settings SET last_cron_run_date = $1 WHERE user_id = $2", [todayStr, userId]);
          console.log(`[CRON] Scheduled time reached for User ${userId} (${timeToUse} ${config.timezone} via ${config.schedule_type || 'custom'} scheduling). Executing autonomous daily campaign...`);
          await triggerCronCampaign(config);
        }
      }
    } catch (err) {
      console.error("[CRON ERROR] Scheduler check failed:", err.message);
    }
  }, 60000);

  // Sync Inbox Replies for all active campaigns every 5 minutes (300000ms)
  setInterval(async () => {
    try {
      const activeConfigs = await pool.query("SELECT * FROM campaign_settings WHERE is_active = TRUE");
      for (const config of activeConfigs.rows) {
        if (config.gmail_user && config.gmail_pass) {
          console.log(`[CRON SYNC] Triggering autonomous reply sync for User ${config.user_id}...`);
          await syncUserInbox(config.user_id, config);
        }
      }
    } catch (e) {
      console.error("[CRON SYNC ERROR] Autonomous inbox sync failed:", e.message);
    }
  }, 300000);
}

async function refreshGoogleAccessToken(config) {
  const { user_id, google_refresh_token } = config;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!google_refresh_token || !clientId || !clientSecret) {
    return null;
  }

  console.log(`[GOOGLE CALENDAR] Refreshing OAuth access token for User ${user_id}...`);
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: google_refresh_token,
        grant_type: "refresh_token"
      })
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${await res.text()}`);
    }

    const data = await res.json();
    const expiryTime = Date.now() + (data.expires_in * 1000);

    await pool.query(
      `UPDATE campaign_settings SET 
        google_access_token = $1, 
        google_token_expiry = $2 
      WHERE user_id = $3`,
      [data.access_token, expiryTime, user_id]
    );

    return data.access_token;
  } catch (err) {
    console.error(`[GOOGLE CALENDAR] Token refresh failed for User ${user_id}:`, err.message);
    return null;
  }
}

async function createGoogleCalendarEvent(userId, leadName, leadEmail, summary, startDateTime) {
  try {
    // Fetch current Google configurations
    const configRes = await pool.query("SELECT * FROM campaign_settings WHERE user_id = $1 LIMIT 1", [userId]);
    const config = configRes.rows[0];
    
    if (!config || !config.google_connected) {
      console.log(`[GOOGLE CALENDAR] User ${userId} is not connected to Google Calendar. Generating simulated booking invitation...`);
      return getSimulatedCalendarEvent(leadName);
    }

    if (config.google_sandbox_mode) {
      console.log(`[GOOGLE CALENDAR] User ${userId} is running in Sandbox mode. Generating simulated Calendar & Meet links...`);
      return getSimulatedCalendarEvent(leadName);
    }

    // Refresh token if expired
    let accessToken = config.google_access_token;
    if (config.google_token_expiry && parseInt(config.google_token_expiry) <= Date.now() + 60000) {
      accessToken = await refreshGoogleAccessToken(config);
    }

    if (!accessToken) {
      console.log(`[GOOGLE CALENDAR] Could not refresh access token. Falling back to simulated Meet links.`);
      return getSimulatedCalendarEvent(leadName);
    }

    // Setup event timings (30 minutes duration)
    const startTimeObj = new Date(startDateTime);
    if (isNaN(startTimeObj.getTime())) {
      throw new Error("Invalid start date time format: " + startDateTime);
    }
    const endTimeStr = new Date(startTimeObj.getTime() + 30 * 60 * 1000).toISOString();
    const startTimeStr = startTimeObj.toISOString();

    console.log(`[GOOGLE CALENDAR] Creating calendar event for User ${userId} starting at ${startTimeStr}...`);

    // Create event with Google Calendar API
    const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: summary,
        description: `Syntek AI Autopilot booked call with prospect ${leadName} (${leadEmail})`,
        start: { dateTime: startTimeStr, timeZone: "UTC" },
        end: { dateTime: endTimeStr, timeZone: "UTC" },
        attendees: [{ email: leadEmail }],
        conferenceData: {
          createRequest: {
            requestId: "meet-" + Date.now(),
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[GOOGLE CALENDAR] API event insertion returned status ${response.status}:`, errText);
      return getSimulatedCalendarEvent(leadName);
    }

    const eventData = await response.json();
    
    // Find Meet link inside conference solutions entry points
    let meetLink = "";
    if (eventData.conferenceData && eventData.conferenceData.entryPoints) {
      const entryPoint = eventData.conferenceData.entryPoints.find(ep => ep.entryPointType === "video");
      if (entryPoint && entryPoint.uri) {
        meetLink = entryPoint.uri;
      }
    }
    
    if (!meetLink) {
      meetLink = getSimulatedCalendarEvent(leadName).meetLink;
    }

    return {
      meetLink,
      eventLink: eventData.htmlLink || "https://calendar.google.com"
    };

  } catch (err) {
    console.error("[GOOGLE CALENDAR EVENT CREATOR FAIL]", err);
    return getSimulatedCalendarEvent(leadName);
  }
}

function getSimulatedCalendarEvent(leadName) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const p1 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const p2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const p3 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  const meetLink = `https://meet.google.com/${p1}-${p2}-${p3}`;
  
  return {
    meetLink,
    eventLink: `https://calendar.google.com/calendar/r/eventedit?text=Booked+AI+Outreach+Call+with+${encodeURIComponent(leadName)}`
  };
}

async function detectMeetingBookingIntent(email, config, userId) {
  const preview = (email.preview || "").toLowerCase();
  
  // Quick regex/keyword fallback for sandbox/testing convenience
  if (config.google_sandbox_mode && (
      preview.includes("schedule") || 
      preview.includes("call tomorrow") || 
      preview.includes("chat tomorrow") || 
      preview.includes("hop on a call") || 
      preview.includes("hop on a zoom") ||
      preview.includes("hop on a meet") || 
      preview.includes("calendar invite") || 
      preview.includes("suggested a time") ||
      preview.includes("free to chat") ||
      preview.includes("would love to book") ||
      preview.includes("free tomorrow") ||
      preview.includes("interested")
  )) {
    console.log("[AI MEETING DETECT] Sandbox/Regex fallback match triggered.");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0); // 3:00 PM local/UTC
    return {
      isMeetingAgreed: true,
      confidence: 0.95,
      meetingTime: tomorrow.toISOString(),
      reasoning: "Regex pattern match fallback indicating scheduling/call interest in Sandbox mode."
    };
  }

  const geminiKey = config.gemini_key || process.env.GEMINI_API_KEY;
  if (!geminiKey) return { isMeetingAgreed: false };

  // Fetch thread history
  const threadRes = await pool.query(
    "SELECT * FROM emails WHERE from_email = $1 AND user_id = $2 ORDER BY id ASC",
    [email.from_email, userId]
  );

  let threadContext = "";
  for (const msg of threadRes.rows) {
    const isSent = msg.category === "sent" || (msg.labels && msg.labels.includes("sent"));
    threadContext += `${isSent ? "Me (Outreach)" : "Prospect"}: ${msg.preview}\n\n`;
  }

  const todayStr = new Date().toISOString();

  const promptText = `
    Analyze the cold outreach email exchange history between an outreach agent and a local business prospect.
    Your task is to identify if the prospect has agreed to schedule a call/meeting or suggested a time/slot to chat.

    Exchange history:
    ${threadContext}

    Current reference date and time (ISO format in UTC): ${todayStr}

    Rules:
    - If the prospect says things like "sure, send me an invite", "I'm free tomorrow at 2 PM", "how about next Tuesday morning?", or "Thursday afternoon works", set "isMeetingAgreed" to true.
    - If they say "not interested", "stop emailing", "maybe next month", or ask standard questions without agreeing to a calendar slot yet, set "isMeetingAgreed" to false.
    - Extract "meetingTime" as a valid ISO 8601 string (e.g. YYYY-MM-DDTHH:MM:SSZ) in UTC.
    - Calculate the date/time carefully based on the prospect's timezone context or relative offsets. (E.g. If they suggest "tomorrow at 11 AM" and today is June 4, the date is June 5. If they just say "Thursday afternoon" and today is Thursday, assume the upcoming Thursday or default to 14:00 local).
    
    You must output a valid JSON object with the following schema:
    {
      "isMeetingAgreed": boolean,
      "confidence": number (float between 0.0 and 1.0),
      "meetingTime": string (ISO-8601 UTC date time, e.g. "2026-06-05T15:00:00Z"),
      "reasoning": string (brief summary explaining date/time calculation reasoning)
    }

    Do not include any conversational explanation, markdown code blocks, intros, or outros. Output only the raw JSON.
  `;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return { isMeetingAgreed: false };

    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    if (!text) return { isMeetingAgreed: false };
    
    return JSON.parse(text);
  } catch (err) {
    console.error("[AI MEETING DETECT FAIL]", err.message);
    return { isMeetingAgreed: false };
  }
}

// App initialization
setupDatabase().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Syntek Backend Express server running on port ${PORT}`);
  });
  server.timeout = 300000; // 5 minutes
  startCronScheduler();
});
