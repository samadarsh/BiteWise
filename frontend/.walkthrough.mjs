/**
 * Records a narrated video walkthrough of BiteWise — both products, one take.
 *
 * Usage:  node .walkthrough.mjs demo     # :3001 -> :8001, USE_MOCK_MCP=true
 *         node .walkthrough.mjs live     # :3000 -> :8000, USE_MOCK_MCP=false
 *
 * Both instances must already be running (scripts/start_dual_mode.sh).
 *
 * Unlike .qa.mjs (a pass/fail gate), this is a *recording*: it narrates each
 * beat with an on-screen caption, paces itself for a viewer rather than for
 * wall-clock speed, and never aborts mid-take. Every check is soft — a step
 * that can't run is noted in the report and the walkthrough moves on, because
 * a truncated video is worse than a video with an honest gap in it.
 */

import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync, renameSync, readdirSync, rmSync } from "fs";

// ── Mode config ──────────────────────────────────────────────────────────────
const MODE = (process.argv[2] || "demo").toLowerCase();
const MODES = {
  demo: {
    base: "http://localhost:3001",
    api: "http://localhost:8001",
    badge: { label: "DEMO · MOCK MCP", bg: "#f4b544", fg: "#17211c" },
    // Mock mode fabricates Swiggy responses, so ordering runs end to end.
    canOrder: true,
  },
  live: {
    base: "http://localhost:3000",
    api: "http://localhost:8000",
    badge: { label: "LIVE · REAL MCP", bg: "#e5484d", fg: "#ffffff" },
    // Live mode talks to the real Swiggy MCP. With no client_id registered,
    // every Swiggy-backed call returns swiggy_reauth_required — that wall is
    // itself the thing worth recording, so we drive up to it deliberately.
    canOrder: false,
  },
};
const CFG = MODES[MODE];
if (!CFG) {
  console.error(`Unknown mode "${MODE}". Use "demo" or "live".`);
  process.exit(1);
}

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(REPO, "qa", "walkthrough", MODE);
const SHOTS = join(OUT, "stills");
rmSync(OUT, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

// ── Report ───────────────────────────────────────────────────────────────────
const report = [];
let chapter = "—";
const note = (text, status = "ok", detail = "") => {
  report.push({ chapter, text, status, detail });
  const tag = { ok: "  OK  ", gap: " GAP  ", info: " INFO " }[status] || status;
  console.log(`${tag} [${chapter}] ${text}${detail ? " — " + detail : ""}`);
};

// ── Browser ──────────────────────────────────────────────────────────────────
const VIEWPORT = { width: 1440, height: 900 };
const browser = await chromium.launch({ headless: true, slowMo: 60 });
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: OUT, size: VIEWPORT },
  deviceScaleFactor: 1,
});

// The caption bar lives in a shadow root appended to <body>, outside React's
// hydration container, so it can't collide with app styles or trip hydration.
// Installed via addInitScript (re-runs on every full navigation) and restored
// from sessionStorage, so the narration survives page loads mid-chapter.
await ctx.addInitScript(() => {
  const ensure = () => {
    if (!document.body) return null;
    let host = document.getElementById("__wt_host");
    if (!host) {
      host = document.createElement("div");
      host.id = "__wt_host";
      host.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;";
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `<style>
        .bar{font:500 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
             background:linear-gradient(180deg,rgba(8,12,10,.90),rgba(8,12,10,.98));
             color:#fff;padding:15px 24px 17px;display:flex;gap:16px;align-items:baseline;
             border-top:2px solid var(--accent,#f4b544);
             box-shadow:0 -10px 34px rgba(0,0,0,.4);backdrop-filter:blur(6px)}
        .ch{color:var(--accent,#f4b544);font-weight:800;white-space:nowrap;
            text-transform:uppercase;letter-spacing:.08em;font-size:12px}
        .tx{color:rgba(255,255,255,.94);flex:1}
        .mode{white-space:nowrap;font-weight:800;padding:4px 12px;border-radius:999px;
              font-size:11px;letter-spacing:.06em}
      </style><div class="bar"><span class="ch"></span><span class="tx"></span><span class="mode"></span></div>`;
      document.body.appendChild(host);
    }
    return host.shadowRoot;
  };

  window.__wtSet = (ch, text, badge) => {
    const r = ensure();
    if (!r) return false;
    const bar = r.querySelector(".bar");
    bar.style.setProperty("--accent", badge.bg);
    r.querySelector(".ch").textContent = ch;
    r.querySelector(".tx").textContent = text;
    const m = r.querySelector(".mode");
    m.textContent = badge.label;
    m.style.background = badge.bg;
    m.style.color = badge.fg;
    try {
      sessionStorage.setItem("__wt_cap", JSON.stringify([ch, text, badge]));
    } catch { /* about:blank has no storage */ }
    return true;
  };

  // Restore after hydration rather than at DOMContentLoaded, so the caption
  // node is appended once React has already claimed its own container.
  const restore = () => {
    let saved = null;
    try { saved = sessionStorage.getItem("__wt_cap"); } catch { /* ignore */ }
    if (saved) window.__wtSet(...JSON.parse(saved));
  };
  if (document.readyState === "complete") setTimeout(restore, 250);
  else window.addEventListener("load", () => setTimeout(restore, 250));
});

const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// ── Narration helpers ────────────────────────────────────────────────────────
const wait = (ms) => page.waitForTimeout(ms);

/** Sets the on-screen caption and holds it long enough to read. */
const say = async (text, hold = 2200) => {
  await page
    .evaluate(
      ([ch, tx, badge]) => window.__wtSet && window.__wtSet(ch, tx, badge),
      [chapter, text, CFG.badge]
    )
    .catch(() => {});
  await wait(hold);
};

const beat = async (name) => {
  chapter = name;
  console.log(`\n── ${name} ──`);
};

const shot = async (name) => {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) }).catch(() => {});
};

const visible = (sel, timeout = 4000) =>
  page.locator(sel).first().waitFor({ state: "visible", timeout }).then(() => true).catch(() => false);

/** Scrolls smoothly so the video shows the page moving rather than jumping. */
const glide = async (toY, steps = 26) => {
  await page.evaluate(
    ([target, n]) =>
      new Promise((res) => {
        const from = window.scrollY;
        const dx = (target - from) / n;
        let i = 0;
        const tick = () => {
          window.scrollTo(0, from + dx * ++i);
          if (i < n) requestAnimationFrame(tick);
          else res();
        };
        tick();
      }),
    [toY, steps]
  );
  await wait(500);
};

/**
 * Scrolls a just-appeared element into frame before we narrate it. Results in
 * this app render below the control that produced them, so without this the
 * caption describes something the viewer can't see. Parks the element ~140px
 * from the top, which keeps it clear of both the sticky header and the caption.
 */
const reveal = async (sel) => {
  const box = await page.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  const cur = await page.evaluate(() => window.scrollY);
  await glide(Math.max(0, cur + box.y - 140));
  return true;
};

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 1 — Landing
// ═════════════════════════════════════════════════════════════════════════════
await beat("Landing");
await page.goto(`${CFG.base}/`, { waitUntil: "networkidle" });
await say(
  MODE === "demo"
    ? "BiteWise — one platform, two products. This take runs against the mock Swiggy MCP, so orders are simulated end to end."
    : "BiteWise in live mode — same build, wired to the real Swiggy MCP instead of the mock.",
  3400
);
note("landing renders", (await visible("text=BiteWise")) ? "ok" : "gap");
await shot("01-landing");

await say("NutriOrder AI — health-aware ordering: biometric targets, a coach, and meals ranked against the gap to your goal.", 2600);
await glide(900);
await shot("02-landing-nutriorder");
await say("SmartPantry AI — household kitchen intelligence: qualitative stock levels, recipe matching, and grocery automation.", 2600);
await glide(1900);
await shot("03-landing-smartpantry");
await glide(0);

// The sandbox CTA is gated on the backend reporting use_mock_mcp — its absence
// in live mode is correct behaviour, not a broken button.
const sandboxVisible = await visible("text=Try Sandbox Demo", 3000);
if (MODE === "demo") {
  note("sandbox CTA offered (use_mock_mcp=true)", sandboxVisible ? "ok" : "gap");
} else {
  note("sandbox CTA correctly hidden in live mode", sandboxVisible ? "gap" : "ok",
    sandboxVisible ? "CTA rendered despite use_mock_mcp=false" : "backend reports use_mock_mcp=false");
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 2 — Getting in
// ═════════════════════════════════════════════════════════════════════════════
await beat("Sign in");
if (MODE === "demo") {
  await say("One click into the sandbox — it provisions a throwaway demo user against the isolated demo database.", 2400);
  await page.click("text=Try Sandbox Demo");
} else {
  await say("Live mode has no sandbox button, so we come in the front door: Get Started Free.", 2600);
  await page.click("text=Get Started Free");
  await wait(1500);
  await say("No session yet, so the app gates itself behind sign-in. We continue as a guest.", 2400);
  const guestBtn = page.locator("button", { hasText: "Continue as Guest" }).first();
  if (await guestBtn.isVisible().catch(() => false)) {
    await guestBtn.click();
    note("guest sign-in available in live mode");
  } else {
    note("guest sign-in button not found", "gap");
  }
}
await page.waitForURL("**/app**", { timeout: 20000 }).catch(() => {});
await wait(2000);

await beat("Product chooser");
const chooserOk = await visible("text=What are you here for today?", 8000);
note("product chooser renders both products", chooserOk ? "ok" : "gap");
await say("BiteWise asks which product you're here for. The choice is remembered, so returning users skip straight back in.", 3000);
await shot("04-chooser");

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 3 — SmartPantry onboarding
// ═════════════════════════════════════════════════════════════════════════════
await beat("SmartPantry onboarding");
await page.click("text=Open SmartPantry AI").catch(() => {});
await wait(2500);

const stockStep = await visible("text=What do you already have at home?", 12000);
note("onboarding gates on an empty pantry", stockStep ? "ok" : "gap");
if (stockStep) {
  await say("A cold pantry is the hardest part of this product, so onboarding front-loads it: 40+ common Indian staples, pre-checked.", 3400);
  await shot("05-sp-onboarding-stock");
  await say("Uncheck what you don't have, and you've stocked a kitchen in about fifteen seconds.", 2600);

  const rice = page.locator("label", { hasText: "Rice" }).locator('input[type="checkbox"]').first();
  await page.click("text=Deselect All").catch(() => {});
  await wait(700);
  const disabled = await page.locator("button", { hasText: "Continue" }).first().isDisabled().catch(() => false);
  note("Continue disables when nothing is selected", disabled ? "ok" : "gap");
  await say("Deselect everything and the step refuses to continue — an empty pantry is the one state this product can't work from.", 3000);

  await rice.check().catch(() => {});
  await wait(400);
  // Re-check a broad spread so the recipe engine has something real to chew on.
  const boxes = page.locator('input[type="checkbox"]');
  const n = Math.min(await boxes.count(), 22);
  for (let i = 0; i < n; i++) await boxes.nth(i).check().catch(() => {});
  await wait(600);
  await say("Check a realistic spread back in, and the step unlocks.", 2000);
  await page.click("button:has-text('Continue')").catch(() => {});
  await wait(2000);

  const cookStep = await visible("text=What's on your mind to cook?", 8000);
  note("cook-query step renders", cookStep ? "ok" : "gap");
  if (cookStep) {
    await say("Next it asks what you actually want to cook — and answers it live, against the pantry you just declared.", 3200);
    await page.fill("textarea", "maggi noodles").catch(() => {});
    await wait(500);
    await shot("06-sp-onboarding-cook");
    await page.click("button:has-text('Check it')").catch(() => {});
    await wait(3500);
    const resolved = (await page.locator("h4", { hasText: "Maggi Noodles" }).count()) > 0;
    note("cook query resolves against the just-stocked pantry", resolved ? "ok" : "gap");
    await say("It resolves the dish, checks the ingredients against stock, and tells you what's missing before you start.", 3200);
    await shot("07-sp-onboarding-resolved");
    await page.click("button:has-text('Continue')").catch(() => {});
    await wait(1500);
  }

  const householdStep = await visible("text=Who else are you cooking for?", 6000);
  note("household step renders", householdStep ? "ok" : "gap");
  if (householdStep) {
    await say("Finally, who else you're cooking for — portions and nutrition targets scale to the household, not just to you.", 3200);
    await shot("08-sp-onboarding-household");
    await page.click("text=Take Me to My Kitchen").catch(() => {});
    await wait(2500);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 4 — SmartPantry kitchen
// ═════════════════════════════════════════════════════════════════════════════
await beat("Kitchen");
const kitchenOk = await visible("text=What Can I Cook Today?", 10000);
note("kitchen hub renders", kitchenOk ? "ok" : "gap");
await say("The Kitchen hub is the SmartPantry home — everything cookable right now, ranked by what's about to expire.", 3200);
await shot("09-sp-kitchen");

const modeBadge = MODE === "demo" ? "Mock" : "Live";
const badgeOk = await visible(`span:text-is('${modeBadge}')`, 3000);
note(`header shows the "${modeBadge}" mode badge`, badgeOk ? "ok" : "gap");
await say(`The header badge reads "${modeBadge}" — live mode touches a real Swiggy account and real money, so it's never a click away from being discoverable.`, 3400);

await reveal("textarea");
await say("The composer takes plain language. Name a dish and it resolves the recipe and checks your shelves.", 2800);
await page.fill("textarea", "paneer butter masala").catch(() => {});
await wait(500);
await page.click("button:text-is('Go')").catch(() => {});
await wait(3500);
const dishOk = await visible("text=Paneer Butter Masala", 6000);
note("composer resolves a named dish", dishOk ? "ok" : "gap");
await reveal("text=Paneer Butter Masala");
await say("It names the dish, lists the ingredients, and marks which ones you're short on — before you commit to cooking.", 3400);
await shot("10-sp-composer-dish");

await reveal("textarea");
await say("Same box, different intent — a shopping list. It classifies that as groceries, not a recipe.", 2800);
await page.fill("textarea", "chips, coke, paneer").catch(() => {});
await wait(500);
await page.click("button:text-is('Go')").catch(() => {});
await wait(3000);
const groceryIntent = await visible("text=Add to your grocery list?", 6000);
note("composer distinguishes grocery intent from recipe intent", groceryIntent ? "ok" : "gap");
await reveal("text=Add to your grocery list?");
await say("No recipe this time — it recognised a shopping intent and offered the list instead.", 3000);
await shot("11-sp-composer-grocery");
if (groceryIntent) {
  await say("One tap moves the whole set onto the household grocery list.", 2200);
  await page.click("text=/Add all \\d+ to grocery list/").catch(() => {});
  await wait(2000);
}

const cookBtn = page.locator("text=I Cooked This").first();
if (await cookBtn.isVisible().catch(() => false)) {
  await reveal("text=What Can I Cook Today?");
  await say("And when you actually cook something, \"I Cooked This\" decrements the pantry a tier — full to half, half to low. That's the automation that keeps stock honest without anyone weighing rice.", 4000);
  await cookBtn.click();
  await wait(2500);
  note("'I Cooked This' decrements pantry without crashing",
    (await visible("text=What Can I Cook Today?", 5000)) ? "ok" : "gap");
  await shot("12-sp-cooked");
} else {
  note("'I Cooked This' not offered in this run", "info", "no recipe fully cookable from current stock");
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 5 — Pantry
// ═════════════════════════════════════════════════════════════════════════════
await beat("Pantry");
await page.locator('aside nav a[href="/app/smartpantry/pantry"]').click().catch(() => {});
await wait(2500);
const pantryOk = await visible("text=Pantry Inventory", 8000);
note("pantry inventory renders", pantryOk ? "ok" : "gap");
await say("The pantry itself is qualitative, not numeric — full, half, low, empty. Nobody sustains gram-level tracking; everybody can eyeball a jar.", 4000);
await shot("13-sp-pantry");
await reveal("text=🔄 Adjust Level");
await say("Each card is a battery meter, and one tap cycles the level down.", 2400);
const adjust = page.locator("text=🔄 Adjust Level").first();
if (await adjust.isVisible().catch(() => false)) {
  await adjust.click();
  await wait(1800);
  note("stock level cycles on tap");
} else {
  note("adjust-level control not reachable", "gap");
}
await shot("14-sp-pantry-adjusted");
await glide(0);

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 6 — Household
// ═════════════════════════════════════════════════════════════════════════════
await beat("Household");
await page.locator('aside nav a[href="/app/smartpantry/household"]').click().catch(() => {});
await wait(2500);
const householdOk = await visible("text=Household", 8000);
note("household page renders", householdOk ? "ok" : "gap");
await say("Household members carry their own diets and allergies, and recipe suggestions are filtered against all of them at once.", 3400);
await shot("15-sp-household");

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 7 — Grocery + Instamart
// ═════════════════════════════════════════════════════════════════════════════
await beat("Grocery");
await page.locator('aside nav a[href="/app/smartpantry/grocery"]').click().catch(() => {});
await wait(2500);
const groceryOk = await visible("text=Build Cart Preview", 8000);
note("grocery page renders", groceryOk ? "ok" : "gap");
await say("The grocery list fills itself: anything that hits empty is added automatically, and priority is derived from stock level.", 3400);
await shot("16-sp-grocery");

await say("Build Cart Preview turns the list into an Instamart cart.", 2400);
await page.click("text=Build Cart Preview").catch(() => {});
await wait(4000);
await shot("17-sp-cart-preview");

const matched = await visible("text=Matched Instamart Products", 6000);
if (matched) {
  note("Instamart cart preview built", "ok");
  await reveal("text=Matched Instamart Products");
  // Real-catalogue matching is location-specific and needs a Swiggy address.
  // In live mode with no connected account there is none, so the backend
  // falls back to a flat SIMULATED estimate — and the UI badges each line as
  // such rather than passing a guess off as a real price.
  const simulated = await page.locator("text=SIMULATED").first().isVisible().catch(() => false);
  note("cart lines labelled SIMULATED", simulated ? "ok" : "info",
    simulated ? "no Swiggy address, so no real catalogue match" : "matched against the catalogue");
  if (MODE === "live" && simulated) {
    await say("Note the badges: real catalogue pricing is location-specific and needs a Swiggy address. There isn't one here, so it falls back to a flat estimate — and labels every line SIMULATED rather than passing a guess off as a real price.", 5200);
  } else {
    await say("Matched products, prices, and a total — still a preview. Nothing is ordered until you tick the confirmation.", 3400);
  }
  await page.selectOption("select", { index: 1 }).catch(() => {});
  await reveal("text=I confirm these details are correct");
  await page.click("text=I confirm these details are correct").catch(() => {});
  await wait(1200);
  if (CFG.canOrder) {
    await page.click("text=Place COD Order on Instamart").catch(() => {});
    await wait(4000);
    const tracked = await visible("text=Tracking instamart_order", 8000);
    await reveal("text=Tracking instamart_order");
    note("Instamart COD order placed and tracking shown", tracked ? "ok" : "info",
      tracked ? "" : "likely below the ₹99 Instamart minimum in this run");
    await say("Order placed on Instamart, cash on delivery, with live tracking.", 2800);
    await shot("18-sp-instamart-order");
  }
} else {
  const wall = await page.locator("text=/Connect your Swiggy|Connect Swiggy|reconnect/i").first().isVisible().catch(() => false);
  note("Instamart cart preview blocked", wall ? "ok" : "info",
    wall ? "swiggy_reauth_required — no Swiggy account connected in live mode" : "no unpurchased grocery items in this run");
  if (wall) {
    await say("And here's the live-mode boundary: the catalogue lookup is a real Swiggy MCP call, so it stops dead until a Swiggy account is connected.", 3800);
    await shot("18-sp-swiggy-wall");
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 8 — Switch products
// ═════════════════════════════════════════════════════════════════════════════
await beat("Switch to NutriOrder");
await say("Both products share one session, one sidebar, and one switcher.", 2400);
await page.click("aside button[aria-haspopup='menu']").catch(() => {});
await wait(1200);
await shot("19-product-switcher");
await page.click('aside a[href="/app/nutriorder"]').catch(() => {});
await wait(3000);

await beat("NutriOrder onboarding");
const welcomeStep = await visible("text=Let's build your health profile", 10000);
note("NutriOrder gates on an incomplete health profile", welcomeStep ? "ok" : "gap");
if (welcomeStep) {
  await say("NutriOrder can't rank a meal without knowing your body, so it gates on a health profile.", 3000);
  await shot("20-no-onboarding-welcome");
  await page.click("text=Get Started").catch(() => {});
  await wait(1200);

  note("biometrics step renders", (await visible("text=Your Biometrics", 6000)) ? "ok" : "gap");
  await say("Age, height, weight — enough to derive BMR, TDEE, and a daily protein and calorie target.", 3000);
  await page.fill('input[placeholder="e.g. 28"]', "29").catch(() => {});
  await page.fill('input[placeholder="e.g. 175"]', "178").catch(() => {});
  await page.fill('input[placeholder="e.g. 70"]', "74").catch(() => {});
  await wait(900);
  await shot("21-no-biometrics");
  await page.click("text=Continue").catch(() => {});
  await wait(1200);

  note("goals & diet step renders", (await visible("text=Goals & Diet", 6000)) ? "ok" : "gap");
  await say("Then the goal and the diet — these become hard filters, not suggestions.", 2800);
  await page.click("text=Vegetarian").catch(() => {});
  await wait(600);
  await shot("22-no-goals");
  await page.click("text=Continue").catch(() => {});
  await wait(1200);

  note("ranking step renders", (await visible("text=How should we rank meals", 6000)) ? "ok" : "gap");
  await say("You also get to weight the ranking itself — protein density against calories against price.", 3000);
  await shot("23-no-ranking");
  await page.click("text=Continue").catch(() => {});
  await wait(1200);

  note("confirm step renders", (await visible("text=You're all set", 6000)) ? "ok" : "gap");
  await shot("24-no-confirm");
  await page.click("text=Let's Eat Smart").catch(() => {});
  await wait(3500);
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 9 — Coach
// ═════════════════════════════════════════════════════════════════════════════
await beat("Coach");
const coachOk = await visible("text=Today's progress", 10000);
note("coach hub renders as the health-tracking home", coachOk ? "ok" : "gap");
await say("Onboarding lands on Coach — the health home, not the ordering screen. Ordering is a tool the coach reaches for, not the point.", 3600);
await shot("25-no-coach");
await reveal("text=This Week — Protein vs. Target");
note("weekly protein trend renders", (await visible("text=This Week — Protein vs. Target", 4000)) ? "ok" : "gap");
note("weight trend renders", (await visible("text=Weight Trend", 4000)) ? "ok" : "gap");
await say("Weekly protein against target, and weight trend — the two numbers that tell you whether any of this is working.", 3400);
await shot("26-no-coach-trends");
await glide(0);

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 10 — Ordering
// ═════════════════════════════════════════════════════════════════════════════
if (CFG.canOrder) {
  await beat("Demo data");
  await say("The sandbox seeds a realistic history — saved addresses, past orders, logged weights.", 2600);
  await page.click("text=Load Demo Data").catch(() => {});
  await wait(4000);
  note("demo seed succeeded",
    (await visible("text=seeded successfully", 6000)) ? "ok" : "gap");
  await shot("27-demo-seeded");
}

await beat("Ordering");
await page.locator('aside nav a[href="/app/nutriorder/order"]').click().catch(() => {});
await wait(2500);
note("order page renders", (await visible("text=Today so far", 8000)) ? "ok" : "gap");
await say("The order page opens with what you've already eaten today — every recommendation is scored against the gap that's left.", 3400);
await shot("28-no-order");

await page.selectOption("main select", { index: 1 }).catch(() => {});
await wait(3000);

if (CFG.canOrder) {
  note("session starts after address selection",
    (await visible("text=Session active", 6000)) ? "ok" : "gap");
  const preCards = await page.locator('[data-testid="recommendation-card"]').count();
  note("nothing is recommended before you ask", preCards === 0 ? "ok" : "gap", `${preCards} cards pre-prompt`);
  await say("Pick a delivery address and the ordering session opens — but nothing is recommended until you actually ask.", 3200);

  await page.fill("textarea", "high protein grilled chicken").catch(() => {});
  await wait(600);
  await say("Ask in plain language. Behind this: Swiggy search, then a ranking pass against your targets, diet, and allergies.", 3400);
  await page.click("text=Find Recommended Meal").catch(() => {});
  await wait(5000);
  const cards = await page.locator('[data-testid="recommendation-card"]').count();
  note("recommendations rendered", cards >= 1 ? "ok" : "gap", `${cards} cards`);
  await reveal('[data-testid="recommendation-card"]');
  await say("Each card shows why it ranked where it did — protein per rupee, the macro gap it closes, and what it costs. It also declares what it isn't sure about.", 4400);
  await shot("29-no-recommendations");

  await page.locator("h4", { hasText: "Grilled Chicken" }).first().click().catch(() => {});
  await wait(4000);
  note("cart built with COD", (await visible("text=Cash On Delivery", 6000)) ? "ok" : "gap");
  note("coupons fetched", (await visible("text=FITNEW50", 4000)) ? "ok" : "gap");
  note("safety checks surfaced before payment", (await visible("text=Safety Checks Passed", 4000)) ? "ok" : "gap");
  await reveal("text=Cash On Delivery");
  await say("Picking a meal builds a real cart: coupons applied, and a safety gate that re-checks allergies and diet against the actual cart contents.", 4200);
  await shot("30-no-cart");

  await reveal("text=Safety Checks Passed");
  await say("Nothing is placed on autopilot. The order is locked behind an explicit human confirmation.", 3000);
  await page.locator('input[type="checkbox"]').first().check().catch(() => {});
  await wait(1500);
  await page.click("text=Place COD Order on Swiggy").catch(() => {});
  await wait(4500);
  note("order placed and tracking shown", (await visible("text=Tracking", 8000)) ? "ok" : "gap");
  await reveal("text=Tracking");
  await say("Order placed, cash on delivery, live tracking — and it's logged against today's targets automatically.", 3400);
  await shot("31-no-tracking");

  await beat("Order history");
  await page.locator('aside nav a[href="/app/nutriorder/orders"]').click().catch(() => {});
  await wait(2500);
  note("order history renders", (await visible("text=Order History", 8000)) ? "ok" : "gap");
  await say("Every order lands in history with the nutrition it contributed.", 2600);
  await shot("32-no-history");
} else {
  // Live mode: the address dropdown is itself a Swiggy MCP call.
  const wall = await page
    .locator("text=/Connect your Swiggy|Connect Swiggy|reconnect|swiggy_reauth/i")
    .first()
    .isVisible()
    .catch(() => false);
  note("ordering blocked on Swiggy connection in live mode", wall ? "ok" : "info",
    wall ? "swiggy_reauth_required from /me/addresses" : "no explicit reauth prompt surfaced on screen");
  await say("In live mode the address list is already a real Swiggy MCP call — so the flow stops here until a Swiggy account is connected. No credentials are registered on this build, and ALLOW_PLACE_ORDER is false.", 4600);
  await shot("29-no-order-swiggy-wall");

  await beat("Order history");
  await page.locator('aside nav a[href="/app/nutriorder/orders"]').click().catch(() => {});
  await wait(2500);
  note("order history renders", (await visible("text=Order History", 8000)) ? "ok" : "gap");
  await say("History is local, so it renders regardless — it's just empty for a brand-new live account.", 2800);
  await shot("30-no-history");
}

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 11 — Preferences
// ═════════════════════════════════════════════════════════════════════════════
await beat("Preferences");
await page.locator('aside nav a[href="/app/nutriorder/preferences"]').click().catch(() => {});
await wait(2500);
const prefsOk = (await visible("text=Set Up Your Profile", 6000)) || (await visible("text=Preferences", 4000));
note("preferences page renders", prefsOk ? "ok" : "gap");
await say("Everything onboarding asked stays editable — change a target and the ranking shifts on the next search.", 3200);
await shot("33-no-preferences");

// ═════════════════════════════════════════════════════════════════════════════
// CHAPTER 12 — Theme + returning user
// ═════════════════════════════════════════════════════════════════════════════
await beat("Theme");
const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.click('button[aria-label*="Switch to"]').catch(() => {});
await wait(1500);
const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
note("theme toggle flips", before !== after ? "ok" : "gap", `${before} -> ${after}`);
await say("Light and dark are both first-class, and the choice persists across reloads.", 2800);
await shot("34-theme");

await beat("Returning user");
await page.goto(`${CFG.base}/app`, { waitUntil: "networkidle" });
await wait(2000);
const bypassed = page.url().includes("/app/nutriorder");
note("returning user skips the chooser", bypassed ? "ok" : "gap", page.url());
const persisted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
note("theme persisted across a full reload", persisted === after ? "ok" : "gap", String(persisted));
await say("Come back later and BiteWise drops you straight into the product you were last using.", 3000);
await shot("35-returning-user");

await beat("Wrap");
await say(
  MODE === "demo"
    ? "Two products, one session, one platform — NutriOrder for what you eat out, SmartPantry for what you cook in."
    : "Same build, real MCP. Everything local works; everything Swiggy-backed waits on a connected account.",
  3800
);

note("no uncaught page errors", pageErrors.length === 0 ? "ok" : "gap", pageErrors.slice(0, 3).join(" | "));

// ── Finish: flush the video, then name it something a human can find ─────────
await page.close();
await ctx.close();
await browser.close();

const raw = readdirSync(OUT).filter((f) => f.endsWith(".webm"));
let video = null;
if (raw.length) {
  video = join(OUT, `bitewise-${MODE}-walkthrough.webm`);
  renameSync(join(OUT, raw[0]), video);
}

const counts = report.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
writeFileSync(
  join(OUT, "report.json"),
  JSON.stringify({ mode: MODE, base: CFG.base, api: CFG.api, counts, video, steps: report }, null, 2)
);

console.log(`\n===== ${MODE.toUpperCase()} WALKTHROUGH =====`);
console.log(`ok: ${counts.ok || 0}   gaps: ${counts.gap || 0}   info: ${counts.info || 0}`);
if (counts.gap) {
  console.log("\nGaps:");
  for (const r of report.filter((r) => r.status === "gap")) {
    console.log(`  [${r.chapter}] ${r.text}${r.detail ? " — " + r.detail : ""}`);
  }
}
console.log(`\nVideo:  ${video || "(none captured)"}`);
console.log(`Stills: ${SHOTS}`);
console.log(`Report: ${join(OUT, "report.json")}`);
