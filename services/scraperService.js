import { chromium } from "playwright";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
];

// Random delay helper
export async function jitterSleep(min = 2000, max = 8000) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// CAPTCHA check
export async function isCaptchaDetected(page) {
  const title = await page.title();
  const url = page.url();
  const content = await page.content();
  
  if (
    title.includes("Robot Check") || 
    title.includes("sorry") || 
    url.includes("google.com/sorry") || 
    content.includes("g-recaptcha") || 
    content.includes("captcha")
  ) {
    return true;
  }
  return false;
}

// Scrape Google Maps places
export async function scrapeGoogleMaps({ userId, niche, location, limit = 5, addLog = console.log }) {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  
  addLog(`[SCRAPER] Launching headless browser with User-Agent: ${userAgent}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent,
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    const query = `${niche} in ${location}`;
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    addLog(`[SCRAPER] Navigating to search URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await jitterSleep(3000, 6000);

    if (await isCaptchaDetected(page)) {
      throw new Error("CAPTCHA detected on search page. Stopping scraper run.");
    }

    // Handle Google Consent Dialog if it appears
    const consentButton = await page.$("button[aria-label='Accept all'], form[action*='consent.google.com'] button, button:has-text('Accept all')");
    if (consentButton) {
      addLog("[SCRAPER] Consent dialog detected, accepting terms...");
      await consentButton.click();
      await page.waitForLoadState("domcontentloaded");
      await jitterSleep(2000, 4000);
    }

    // Scroll the results feed to load listings
    addLog("[SCRAPER] Loading Google Maps feed and scrolling...");
    const feedSelector = "div[role='feed']";
    let feedFound = false;

    // Wait for the feed to appear or fallback to place list
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });
      feedFound = true;
    } catch {
      addLog("[WARN] Scrollable feed selector not found. Attempting alternative container scroll...");
    }

    let listings = [];
    let scrollCount = 0;
    const maxScrolls = 15;

    while (scrollCount < maxScrolls) {
      if (await isCaptchaDetected(page)) {
        throw new Error("CAPTCHA detected during scrolling. Stopping scraper run.");
      }

      // Check current listings count
      listings = await page.$$("a[href*='/maps/place/']");
      addLog(`[SCRAPER] Scrolled ${scrollCount} times. Found ${listings.length} candidate places.`);

      if (listings.length >= limit * 2) {
        break;
      }

      if (feedFound) {
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) el.scrollBy(0, 1500);
        }, feedSelector);
      } else {
        // Fallback body scroll
        await page.evaluate(() => window.scrollBy(0, 1500));
      }

      await jitterSleep(2000, 4000);
      scrollCount++;
    }

    // Reload links
    listings = await page.$$("a[href*='/maps/place/']");
    const placeUrls = [];
    for (const link of listings) {
      const href = await link.getAttribute("href");
      if (href && !placeUrls.includes(href)) {
        placeUrls.push(href);
      }
    }

    addLog(`[SCRAPER] Extracted ${placeUrls.length} unique place URLs. Scraping top ${limit} detailed listings...`);
    const results = [];

    for (let i = 0; i < Math.min(placeUrls.length, limit); i++) {
      const url = placeUrls[i];
      addLog(`[SCRAPER] [Lead ${i + 1}/${limit}] Navigating to place: ${url}`);
      
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await jitterSleep(2000, 5000);

      if (await isCaptchaDetected(page)) {
        throw new Error("CAPTCHA detected on detail page. Stopping scraper run.");
      }

      // Extract Name
      let name = "";
      try {
        const titleEl = await page.waitForSelector("h1", { timeout: 5000 });
        name = await titleEl.innerText();
      } catch {
        addLog(`[WARN] Title selector failed for ${url}. Skipping.`);
        continue;
      }

      // Extract Category
      let category = null;
      try {
        category = await page.locator("button[jsaction*='pane.rating.category']").first().innerText();
      } catch {
        // Fallback category locator
        try {
          category = await page.locator(".fontBodyMedium").first().innerText();
        } catch {}
      }

      // Extract Website URL
      let website = null;
      try {
        const websiteLink = page.locator("a[data-item-id='authority']").first();
        website = await websiteLink.getAttribute("href");
      } catch {
        try {
          const webEl = page.locator("a[aria-label*='Website:']").first();
          website = await webEl.getAttribute("href");
        } catch {}
      }

      // Extract Phone
      let phone = null;
      try {
        const phoneEl = page.locator("button[data-item-id*='phone:tel:']").first();
        const rawPhone = await phoneEl.getAttribute("data-item-id");
        phone = rawPhone ? rawPhone.replace("phone:tel:", "").trim() : null;
      } catch {
        try {
          const rawText = await page.locator("button[aria-label*='Phone:']").first().getAttribute("aria-label");
          phone = rawText ? rawText.replace("Phone:", "").trim() : null;
        } catch {}
      }

      // Extract Address
      let address = null;
      try {
        address = await page.locator("button[data-item-id='address']").first().innerText();
      } catch {
        try {
          address = await page.locator("button[aria-label*='Address:']").first().innerText();
        } catch {}
      }

      // Extract Rating & Review Count
      let rating = null;
      let reviews = null;
      try {
        const ratingText = await page.locator("div.F7nice span[aria-hidden='true']").first().innerText();
        rating = parseFloat(ratingText);

        const reviewsText = await page.locator("div.F7nice span[aria-label*='reviews']").first().innerText();
        const cleanReviews = reviewsText.replace(/[^0-9]/g, "");
        reviews = parseInt(cleanReviews, 10);
      } catch {
        try {
          const rateLocator = page.locator(".fontBodyMedium").first();
          const rateText = await rateLocator.innerText();
          const match = rateText.match(/(\d\.\d)\s*\((\d+)\)/);
          if (match) {
            rating = parseFloat(match[1]);
            reviews = parseInt(match[2], 10);
          }
        } catch {}
      }

      const scrapedLead = {
        user_id: userId,
        niche,
        location,
        name: name.trim(),
        address: address ? address.trim() : null,
        phone: phone ? phone.trim() : null,
        website: website ? website.trim() : null,
        category: category ? category.trim() : null,
        rating: isNaN(rating) ? null : rating,
        reviews: isNaN(reviews) ? null : reviews,
        source: "google_maps",
        source_url: url
      };

      // Write to raw_leads database table
      await pool.query(
        `INSERT INTO raw_leads (user_id, niche, location, name, address, phone, website, category, rating, reviews, source, source_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          scrapedLead.user_id,
          scrapedLead.niche,
          scrapedLead.location,
          scrapedLead.name,
          scrapedLead.address,
          scrapedLead.phone,
          scrapedLead.website,
          scrapedLead.category,
          scrapedLead.rating,
          scrapedLead.reviews,
          scrapedLead.source,
          scrapedLead.source_url
        ]
      );

      results.push(scrapedLead);
      addLog(`[SCRAPER] Successfully scraped: "${scrapedLead.name}" | Web: ${scrapedLead.website || "None"}`);
      await jitterSleep(2000, 4000);
    }

    return results;
  } finally {
    await browser.close();
  }
}
