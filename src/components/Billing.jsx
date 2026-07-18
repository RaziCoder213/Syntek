import { useState, useEffect } from "react";

export default function Billing({ showToast }) {
  const [activePlan, setActivePlan] = useState(() => localStorage.getItem("syntek_plan") || "starter");
  const [billingCycle, setBillingCycle] = useState("yearly");
  const [stripeConnected, setStripeConnected] = useState(() => localStorage.getItem("stripe_connected") === "true");
  
  // Checkout simulator states
  const [checkoutPlan, setCheckoutPlan] = useState(null); // plan object to checkout
  const [isProcessingPay, setIsProcessingPay] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  
  // Stripe connection simulator states
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [stripeStep, setStripeStep] = useState(1);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  // Card input states
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [cardExpiry, setCardExpiry] = useState("12/28");
  const [cardCvc, setCardCvc] = useState("424");
  const [cardName, setCardName] = useState("Muhammad Razi");

  const plans = [
    {
      id: "starter",
      name: "Starter Launchpad",
      priceMonthly: 39,
      priceYearly: 29,
      description: "Perfect for freelance developers starting local client outreach.",
      features: [
        "Up to 250 lead scrapes / month",
        "Single SMTP outreach node",
        "Vite default copywriting layouts",
        "Basic smart inbox drafts",
        "Manual Kanban deal mapping"
      ],
      badge: "Freelancer"
    },
    {
      id: "pro",
      name: "Pro Autopilot",
      priceMonthly: 89,
      priceYearly: 69,
      description: "For agencies and consultants seeking automated hands-free lead pipelines.",
      features: [
        "Unlimited scraper scans",
        "Antigravity Grounding DeepSearch crawls",
        "Background cron autopilot triggers",
        "Unlimited SMTP outbox integrations",
        "AI reservation meeting scheduling",
        "Dedicated client workspace seats"
      ],
      badge: "Most Popular",
      popular: true
    },
    {
      id: "enterprise",
      name: "Agency Enterprise",
      priceMonthly: 199,
      priceYearly: 159,
      description: "Custom solutions for multi-region teams and white-labeled SaaS setups.",
      features: [
        "All Pro tier features included",
        "White-label branding domains",
        "Dedicated database instance",
        "Custom fine-tuned Antigravity models",
        "Direct HubSpot / Salesforce Sync",
        "24/7 Priority support manager"
      ],
      badge: "Enterprise"
    }
  ];

  const handleCheckoutSubmit = (e) => {
    e.preventDefault();
    if (!cardNumber || !cardExpiry || !cardCvc || !cardName) {
      showToast("Please fill in all credit card parameters", "danger");
      return;
    }

    setIsProcessingPay(true);
    setTimeout(() => {
      setIsProcessingPay(false);
      setPaymentSuccess(true);
      
      // Update plan states
      setActivePlan(checkoutPlan.id);
      localStorage.setItem("syntek_plan", checkoutPlan.id);
      showToast(`Subscription upgraded to ${checkoutPlan.name}!`, "success");
      
      setTimeout(() => {
        setCheckoutPlan(null);
        setPaymentSuccess(false);
      }, 1500);
    }, 1800);
  };

  const handleStripeConnect = () => {
    setIsConnectingStripe(true);
    setTimeout(() => {
      setIsConnectingStripe(false);
      setStripeStep(2);
    }, 1200);
  };

  const handleStripeWebhookVerify = () => {
    setIsConnectingStripe(true);
    setTimeout(() => {
      setIsConnectingStripe(false);
      setStripeConnected(true);
      localStorage.setItem("stripe_connected", "true");
      setShowStripeModal(false);
      setStripeStep(1);
      showToast("Stripe account connected successfully!", "success");
    }, 1500);
  };

  const handleDisconnectStripe = () => {
    if (confirm("Are you sure you want to disconnect Stripe? Automated checkouts will stop working.")) {
      setStripeConnected(false);
      localStorage.removeItem("stripe_connected");
      showToast("Stripe account disconnected", "warn");
    }
  };

  const handleDownloadInvoice = (invId) => {
    showToast(`Generating PDF ledger for ${invId}...`, "info");
    setTimeout(() => {
      showToast(`Invoice ${invId}.pdf downloaded successfully!`, "success");
    }, 1000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px", animation: "fadeIn 0.4s ease" }}>
      
      {/* Title Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Billing & Plans</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
            Select a subscription plan to access scrapers, autopilot triggers, and email sequences.
          </p>
        </div>
        
        {/* Billing cycle switch */}
        <div style={{ 
          display: "flex", 
          background: "var(--bg-translucent-mild)", 
          padding: "4px", 
          borderRadius: "8px", 
          border: "var(--border-subtle)" 
        }}>
          <button 
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className="btn btn-sm"
            style={{ 
              background: billingCycle === "monthly" ? "var(--bg-translucent-strong)" : "transparent",
              color: billingCycle === "monthly" ? "var(--text-primary)" : "var(--text-muted)",
              borderRadius: "6px",
              padding: "6px 12px"
            }}
          >
            Monthly
          </button>
          <button 
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className="btn btn-sm"
            style={{ 
              background: billingCycle === "yearly" ? "var(--bg-translucent-strong)" : "transparent",
              color: billingCycle === "yearly" ? "var(--text-primary)" : "var(--text-muted)",
              borderRadius: "6px",
              padding: "6px 12px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            Yearly <span style={{ fontSize: "9px", background: "var(--color-lime-glow)", color: "var(--color-lime)", padding: "1px 4px", borderRadius: "3px" }}>-25%</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "24px" }}>
        {plans.map(plan => {
          const isActive = activePlan === plan.id;
          const price = billingCycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
          return (
            <div 
              key={plan.id}
              className="glass-panel"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                padding: "32px 24px",
                borderRadius: "16px",
                background: plan.popular 
                  ? "linear-gradient(180deg, var(--bg-card), rgba(99, 102, 241, 0.02) 100%)" 
                  : "var(--bg-card)",
                border: isActive 
                  ? "2px solid var(--color-lime)" 
                  : plan.popular 
                    ? "1px solid var(--color-lime-border)" 
                    : "var(--border-subtle)",
                boxShadow: isActive
                  ? "0 10px 30px rgba(99, 102, 241, 0.1)"
                  : plan.popular 
                    ? "0 10px 30px rgba(99, 102, 241, 0.05)" 
                    : "0 4px 20px rgba(0,0,0,0.05)",
                position: "relative",
                transition: "all 0.25s ease"
              }}
            >
              {isActive && (
                <span className="badge" style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "var(--color-lime)",
                  color: "var(--text-dark)",
                  fontSize: "9px"
                }}>
                  Active Plan
                </span>
              )}
              {!isActive && plan.badge && (
                <span className="badge" style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: plan.popular ? "var(--color-lime-glow)" : "var(--bg-translucent-mild)",
                  color: plan.popular ? "var(--color-lime)" : "var(--text-secondary)",
                  border: plan.popular ? "1px solid var(--color-lime-border)" : "1px solid var(--border-translucent)",
                  fontSize: "9px"
                }}>
                  {plan.badge}
                </span>
              )}

              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)" }}>{plan.name}</h3>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px", minHeight: "36px", lineHeight: "1.4" }}>
                  {plan.description}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "32px", fontWeight: 800, color: "var(--text-primary)" }}>${price}</span>
                <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>/ month</span>
              </div>

              <button
                type="button"
                className={`btn ${isActive ? "btn-outline" : plan.popular ? "btn-lime" : "btn-indigo"}`}
                onClick={() => {
                  if (isActive) {
                    showToast("You are already on this plan!", "info");
                  } else {
                    setCheckoutPlan(plan);
                  }
                }}
                style={{ width: "100%", borderRadius: "8px", fontWeight: 700 }}
                disabled={isActive}
              >
                {isActive ? "Current Active Plan" : `Upgrade to ${plan.badge}`}
              </button>

              <div style={{ borderTop: "1px solid var(--border-translucent)", paddingTop: "20px" }}>
                <h4 style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px" }}>
                  Features Included:
                </h4>
                <ul style={{ 
                  listStyle: "none", 
                  padding: 0, 
                  display: "flex", 
                  "--lh": "1.5",
                  flexDirection: "column", 
                  gap: "10px",
                  fontSize: "12px",
                  color: "var(--text-secondary)"
                }}>
                  {plan.features.map((feat, idx) => (
                    <li key={idx} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: "var(--color-emerald)", fontWeight: "bold" }}>✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stripe Node Connection / Payment details */}
      <div 
        className="glass-panel"
        style={{
          padding: "24px",
          borderRadius: "16px",
          background: "linear-gradient(135deg, var(--bg-card), rgba(99, 102, 241, 0.01))",
          border: stripeConnected ? "1px solid var(--color-emerald)" : "1px dashed var(--color-lime-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "20px"
        }}
      >
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: stripeConnected ? "var(--color-emerald-glow)" : "rgba(99, 102, 241, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "24px"
          }}>
            💳
          </div>
          <div>
            <h4 style={{ fontSize: "15px", fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Stripe Gateway Connection</span>
              <span className="badge" style={{ 
                background: stripeConnected ? "var(--color-emerald-glow)" : "var(--color-lime-glow)", 
                color: stripeConnected ? "var(--color-emerald)" : "var(--color-lime)", 
                border: stripeConnected ? "1px solid var(--color-emerald-glow)" : "1px solid var(--color-lime-border)",
                fontSize: "9px" 
              }}>
                {stripeConnected ? "CONNECTED (v2.0)" : "Simulated Gateway Integration"}
              </span>
            </h4>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px", maxWidth: "550px", lineHeight: "1.4" }}>
              {stripeConnected 
                ? "Your Stripe client dashboard is active. Outbound customer calendar bookings will auto-generate invoices and collect reservations deposits."
                : "Connect your Stripe API endpoints to authorize automated credit card deposits. Setup syncs your product tiers and handles webhooks."}
            </p>
          </div>
        </div>
        
        {stripeConnected ? (
          <button 
            type="button"
            className="btn btn-outline"
            onClick={handleDisconnectStripe}
            style={{ borderRadius: "8px", fontSize: "12px", color: "var(--color-crimson)", borderColor: "var(--color-crimson)" }}
          >
            Disconnect Stripe
          </button>
        ) : (
          <button 
            type="button"
            className="btn btn-lime"
            onClick={() => setShowStripeModal(true)}
            style={{ borderRadius: "8px", fontSize: "12px", fontWeight: 700 }}
          >
            Connect Stripe Account
          </button>
        )}
      </div>

      {/* Invoice Ledger Section */}
      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 800, color: "var(--text-primary)" }}>🧾 Invoice History</h3>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
            Review past transaction receipts, database synchronizations, and credit updates.
          </p>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Plan Detail</th>
                <th>Billing Period</th>
                <th>Amount Paid</th>
                <th>Status</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: "INV-2026-004", plan: "Starter Launchpad Tier", period: "Jun 1, 2026 - Jul 1, 2026", amount: "$39.00", status: "PAID" },
                { id: "INV-2026-003", plan: "Starter Launchpad Tier", period: "May 1, 2026 - Jun 1, 2026", amount: "$39.00", status: "PAID" },
                { id: "INV-2026-002", plan: "Stripe Connection Deposit Setup", period: "Apr 12, 2026", amount: "$0.00", status: "PAID" }
              ].map((inv, index) => (
                <tr key={index}>
                  <td style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>{inv.id}</td>
                  <td>{inv.plan}</td>
                  <td>{inv.period}</td>
                  <td style={{ fontWeight: 600 }}>{inv.amount}</td>
                  <td>
                    <span className="badge" style={{ background: "var(--color-emerald-glow)", color: "var(--color-emerald)", border: "1px solid var(--color-emerald-glow)" }}>
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    <button 
                      onClick={() => handleDownloadInvoice(inv.id)}
                      style={{ background: "transparent", border: "none", color: "var(--color-lime)", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}
                    >
                      📥 PDF Receipt
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stripe Connect Simulation Modal */}
      {showStripeModal && (
        <>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", zIndex: 10000 }} onClick={() => setShowStripeModal(false)} />
          <div className="glass-panel" style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "480px", maxWidth: "90%", padding: "32px", zIndex: 10001, borderRadius: "16px",
            border: "1px solid var(--color-lime-border)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "20px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "28px" }}>💳</span>
                <div>
                  <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Stripe Connect Gateway</h3>
                  <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>Simulated secure authorization</p>
                </div>
              </div>
              <button onClick={() => setShowStripeModal(false)} style={{ border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>

            {stripeStep === 1 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "var(--bg-deep)", border: "var(--border-subtle)", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  Syntek requests permissions to link with your Stripe account. This enables automated checkout invoices when a lead schedules a booking from the Google Meet webhook.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>STRIPE MERCHANT ACCOUNT ID</span>
                  <input type="text" className="input-field" defaultValue="acct_103f9h82kd9a" disabled />
                </div>
                <button className="btn btn-lime" style={{ width: "100%", fontWeight: 700 }} onClick={handleStripeConnect} disabled={isConnectingStripe}>
                  {isConnectingStripe ? "Linking account with secure Oauth..." : "Authorize Stripe Connection"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ background: "var(--bg-deep)", border: "var(--border-subtle)", padding: "16px", borderRadius: "8px", fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  Merchant credentials linked! Now we will verify webhooks mapping. Syntek will automatically map client responses to trigger payment endpoints.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 700 }}>WEBHOOK RETRY KEY</span>
                  <input type="text" className="input-field" defaultValue="whsec_89df2kd8921a98f921da8" disabled />
                </div>
                <button className="btn btn-indigo" style={{ width: "100%", fontWeight: 700 }} onClick={handleStripeWebhookVerify} disabled={isConnectingStripe}>
                  {isConnectingStripe ? "Registering system hooks..." : "Verify Hook Integrations & Sync"}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Stripe Checkout Credit Card Modal */}
      {checkoutPlan && (
        <>
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)", zIndex: 10000 }} onClick={() => setCheckoutPlan(null)} />
          <div className="glass-panel" style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "450px", maxWidth: "90%", padding: "32px", zIndex: 10001, borderRadius: "16px",
            border: "1px solid var(--color-lime-border)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "20px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Stripe Secure Checkout</h3>
                <p style={{ fontSize: "11px", color: "var(--text-secondary)", margin: 0 }}>Syntek Plan Upgrades</p>
              </div>
              <button onClick={() => setCheckoutPlan(null)} style={{ border: "none", background: "transparent", color: "var(--text-secondary)", fontSize: "18px", cursor: "pointer" }}>✕</button>
            </div>

            {paymentSuccess ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "30px 0" }}>
                <div style={{ 
                  width: "56px", height: "56px", borderRadius: "50%", background: "var(--color-emerald-glow)", 
                  display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--color-emerald)"
                }}>
                  <span style={{ fontSize: "28px", color: "var(--color-emerald)" }}>✓</span>
                </div>
                <h4 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Payment Authorized!</h4>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0 }}>Upgraded to {checkoutPlan.name}</p>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Product Summary */}
                <div style={{ background: "var(--bg-deep)", border: "var(--border-subtle)", padding: "14px", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>{checkoutPlan.name}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", textTransform: "capitalize" }}>Billing cycle: {billingCycle}</span>
                  </div>
                  <span style={{ fontSize: "16px", fontWeight: 800 }}>
                    ${billingCycle === "yearly" ? checkoutPlan.priceYearly : checkoutPlan.priceMonthly} <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)" }}>/ mo</span>
                  </span>
                </div>

                {/* Card Fields */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>Cardholder Name</label>
                    <input type="text" className="input-field" value={cardName} onChange={(e) => setCardName(e.target.value)} required />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>Card Number</label>
                    <input type="text" className="input-field" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="4242 4242 4242 4242" required />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>Expiration Code</label>
                      <input type="text" className="input-field" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} placeholder="MM/YY" required />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <label style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>CVC Secure</label>
                      <input type="password" className="input-field" value={cardCvc} onChange={(e) => setCardCvc(e.target.value)} placeholder="***" required />
                    </div>
                  </div>
                </div>

                <button type="submit" className="btn btn-lime" style={{ width: "100%", fontWeight: 700, height: "42px", marginTop: "8px" }} disabled={isProcessingPay}>
                  {isProcessingPay ? "Processing Stripe Transaction..." : `Pay $${billingCycle === "yearly" ? checkoutPlan.priceYearly : checkoutPlan.priceMonthly} with Stripe`}
                </button>
              </form>
            )}
          </div>
        </>
      )}

    </div>
  );
}
