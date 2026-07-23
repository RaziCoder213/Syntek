import { chromium } from "playwright";

// Safe signature search
export async function enrichWebsite(websiteUrl, addLog = console.log) {
  if (!websiteUrl) {
    return {
      has_booking_widget: "unknown",
      chat_widget: "unknown",
      cms_platform: "unknown",
      contact_method: "unknown",
      owner_name: null,
      enrichment_source_url: null,
      enrichment_checked_at: new Date()
    };
  }

  addLog(`[ENRICHMENT] Launching browser to enrich website: ${websiteUrl}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // Result object
  const info = {
    has_booking_widget: "unknown",
    chat_widget: "unknown",
    cms_platform: "unknown",
    contact_method: "unknown",
    owner_name: null,
    enrichment_source_url: websiteUrl,
    enrichment_checked_at: new Date()
  };

  try {
    // Go to homepage
    await page.goto(websiteUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    const homepageHtml = await page.content();
    const homepageText = await page.locator("body").innerText().catch(() => "");

    // 1. Identify CMS Platform
    if (homepageHtml.includes("wp-content") || homepageHtml.includes("wp-includes") || homepageHtml.includes('meta name="generator" content="WordPress')) {
      info.cms_platform = "wordpress";
    } else if (homepageHtml.includes("static1.squarespace.com") || homepageHtml.includes("squarespace-headers")) {
      info.cms_platform = "squarespace";
    } else if (homepageHtml.includes("wix.com") || homepageHtml.includes("wixpress") || homepageHtml.includes("wix-style")) {
      info.cms_platform = "wix";
    } else if (homepageHtml.includes("shopify.com") || homepageHtml.includes("/cdn.shopify.com")) {
      info.cms_platform = "shopify";
    } else {
      info.cms_platform = "custom";
    }

    // Heuristics checks
    const checkBookingWidget = (html) => {
      const signatures = [
        "calendly.com",
        "acuityscheduling.com",
        "square.site/appointments",
        "simplybook.me",
        "resy.com",
        "opentable.com",
        "schedulicity.com",
        "booker.com",
        "styleseat.com",
        "vagaro.com",
        "mindbodyonline.com",
        "bookingbutton",
        "wp-booking",
        "booking-widget"
      ];
      for (const sig of signatures) {
        if (html.toLowerCase().includes(sig)) return true;
      }
      return false;
    };

    const checkChatWidget = (html) => {
      const signatures = [
        "widget.intercom.io",
        "drift.com",
        "embed.tidio.co",
        "hubspot.com/conversations",
        "crisp.chat",
        "messenger.com/v3.3/plugins/customerchat",
        "livechatinc.com",
        "tawk.to",
        "zendesk.com/embeddable",
        "chat-widget",
        "live-chat"
      ];
      for (const sig of signatures) {
        if (html.toLowerCase().includes(sig)) return true;
      }
      return false;
    };

    // Evaluate booking & chat on homepage
    info.has_booking_widget = checkBookingWidget(homepageHtml) ? "true" : "false";
    info.chat_widget = checkChatWidget(homepageHtml) ? "true" : "false";

    // 2. Discover Contact Info
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

    const emailsFound = new Set();
    const phonesFound = new Set();

    // Scan homepage text/html
    const mailtoMatches = homepageHtml.match(/href="mailto:([^"]+)"/i);
    if (mailtoMatches) {
      emailsFound.add(mailtoMatches[1].split("?")[0].trim());
    }
    const telMatches = homepageHtml.match(/href="tel:([^"]+)"/i);
    if (telMatches) {
      phonesFound.add(telMatches[1].trim());
    }

    const emailMatches = homepageText.match(emailRegex);
    if (emailMatches) {
      emailMatches.forEach(m => emailsFound.add(m.trim()));
    }
    const phoneMatches = homepageText.match(phoneRegex);
    if (phoneMatches) {
      phoneMatches.forEach(m => phonesFound.add(m.trim()));
    }

    // Look for links to internal pages (Contact, About, Team, Booking)
    const links = await page.locator("a").evaluateAll(els => els.map(el => ({ href: el.href, text: el.innerText })));
    const contactLinks = [];
    const aboutLinks = [];
    const bookingLinks = [];

    for (const link of links) {
      if (!link.href || !link.href.startsWith(websiteUrl)) continue;
      const lowerText = link.text.toLowerCase();
      const lowerHref = link.href.toLowerCase();

      if (lowerText.includes("contact") || lowerHref.includes("contact")) {
        if (!contactLinks.includes(link.href)) contactLinks.push(link.href);
      }
      if (lowerText.includes("about") || lowerText.includes("team") || lowerText.includes("staff") || lowerText.includes("owner") || lowerHref.includes("about") || lowerHref.includes("team")) {
        if (!aboutLinks.includes(link.href)) aboutLinks.push(link.href);
      }
      if (lowerText.includes("book") || lowerText.includes("appointment") || lowerText.includes("reserve") || lowerHref.includes("book") || lowerHref.includes("appointment")) {
        if (!bookingLinks.includes(link.href)) bookingLinks.push(link.href);
      }
    }

    // Fetch and check secondary pages to enrich
    const secondaryPageUrl = contactLinks[0] || bookingLinks[0] || aboutLinks[0];
    if (secondaryPageUrl) {
      addLog(`[ENRICHMENT] Checking secondary page: ${secondaryPageUrl}`);
      try {
        await page.goto(secondaryPageUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        const secHtml = await page.content();
        const secText = await page.locator("body").innerText().catch(() => "");

        // Re-evaluate widgets
        if (info.has_booking_widget === "false" && checkBookingWidget(secHtml)) {
          info.has_booking_widget = "true";
        }
        if (info.chat_widget === "false" && checkChatWidget(secHtml)) {
          info.chat_widget = "true";
        }

        // Re-evaluate contact details
        const secMailto = secHtml.match(/href="mailto:([^"]+)"/i);
        if (secMailto) {
          emailsFound.add(secMailto[1].split("?")[0].trim());
        }
        const secTel = secHtml.match(/href="tel:([^"]+)"/i);
        if (secTel) {
          phonesFound.add(secTel[1].trim());
        }
        const secEmailMatches = secText.match(emailRegex);
        if (secEmailMatches) {
          secEmailMatches.forEach(m => emailsFound.add(m.trim()));
        }
        const secPhoneMatches = secText.match(phoneRegex);
        if (secPhoneMatches) {
          secPhoneMatches.forEach(m => phonesFound.add(m.trim()));
        }
      } catch (err) {
        addLog(`[WARN] Secondary page check failed: ${err.message}`);
      }
    }

    // Evaluate Contact Method
    const hasEmail = emailsFound.size > 0;
    const hasPhone = phonesFound.size > 0;
    const hasForm = homepageHtml.includes("<form") || (secondaryPageUrl && homepageHtml.includes("form"));

    if (hasEmail && hasPhone) {
      info.contact_method = "both";
    } else if (hasEmail) {
      info.contact_method = "email_only";
    } else if (hasPhone) {
      info.contact_method = "phone_only";
    } else if (hasForm) {
      info.contact_method = "form";
    } else {
      info.contact_method = "unknown";
    }

    // Keep unique found details
    info.emails = Array.from(emailsFound);
    info.phones = Array.from(phonesFound);

    // 3. Search Owner Name on About/Team Page
    const aboutPageUrl = aboutLinks[0];
    if (aboutPageUrl) {
      addLog(`[ENRICHMENT] Crawling About/Team page for Owner check: ${aboutPageUrl}`);
      try {
        await page.goto(aboutPageUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        const aboutText = await page.locator("body").innerText().catch(() => "");
        
        // Simple exact owner indicators - do not guess names blindly.
        // We look for patterns like: "Owner: John Smith" or "Founder: Jane Doe"
        // Let's use strict match patterns
        const ownerPatterns = [
          /(?:owner|founder|ceo|co-founder|president|director)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i,
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s*,\s*(?:owner|founder|ceo|co-founder|president|director)/i,
          /meet\s+(?:our\s+)?(?:owner|founder|ceo)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/i
        ];

        for (const pattern of ownerPatterns) {
          const match = aboutText.match(pattern);
          if (match && match[1]) {
            // Validate that the name doesn't contain weird characters or generic words
            const nameCandidate = match[1].trim();
            const blacklist = ["Our", "We", "The", "Company", "Welcome", "About", "Team", "Contact"];
            if (!blacklist.some(word => nameCandidate.startsWith(word))) {
              info.owner_name = nameCandidate;
              addLog(`[ENRICHMENT] Verified Owner Name Found: "${nameCandidate}"`);
              break;
            }
          }
        }
      } catch (err) {
        addLog(`[WARN] About page check failed: ${err.message}`);
      }
    }

  } catch (err) {
    addLog(`[ERROR] Enrichment page load failed: ${err.message}`);
  } finally {
    await browser.close();
  }

  return info;
}
