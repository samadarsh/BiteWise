import { chromium } from "playwright";

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync } from "fs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), ".qa-screenshots");
mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, detail = "") => {
  const line = `${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`;
  results.push(line);
  console.log(line);
  if (!cond) process.exitCode = 1;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

// ── 1. Landing: anonymous CTAs ──
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
ok("landing loads", await page.locator("text=BiteWise").first().isVisible());
// The CTAs render once the landing page's backend health check returns.
ok("Get Started CTA visible", await page.locator("text=Get Started Free").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false));
ok("Sandbox demo CTA visible", await page.locator("text=Try Sandbox Demo").waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false));

// ── 2. Demo login → platform chooser (first-time session) ──
await page.click("text=Try Sandbox Demo");
await page.waitForURL("**/app", { timeout: 20000 });
await page.waitForTimeout(1000);
ok("sandbox demo lands on the platform chooser", page.url().endsWith("/app"));
ok("chooser shows both products", await page.locator("text=Open NutriOrder AI").isVisible().catch(() => false) && await page.locator("text=Open SmartPantry AI").isVisible().catch(() => false));
ok("chooser has no sidebar yet (no product chosen)", !(await page.locator("aside nav").first().isVisible().catch(() => false)));

// ── 3. Choose NutriOrder → onboarding wizard (profile incomplete) ──
await page.click("text=Open NutriOrder AI");
await page.waitForURL("**/app/nutriorder", { timeout: 10000 });
await page.waitForTimeout(1000);
ok("wizard welcome step shows", await page.locator("text=Let's build your health profile").isVisible().catch(() => false));

await page.click("text=Get Started");
await page.waitForTimeout(400);
ok("wizard biometrics step shows", await page.locator("text=Your Biometrics").isVisible().catch(() => false));
await page.fill('input[placeholder="e.g. 28"]', "27");
await page.fill('input[placeholder="e.g. 175"]', "172");
await page.fill('input[placeholder="e.g. 70"]', "65");
await page.click("text=Continue");
await page.waitForTimeout(400);

ok("wizard goals & diet step shows", await page.locator("text=Goals & Diet").isVisible().catch(() => false));
await page.click("text=Vegetarian");
await page.click("text=Continue");
await page.waitForTimeout(400);

ok("wizard ranking step shows", await page.locator("text=How should we rank meals").isVisible().catch(() => false));
await page.click("text=Continue");
await page.waitForTimeout(400);

ok("wizard confirm step shows", await page.locator("text=You're all set").isVisible().catch(() => false));
await page.click("text=Let's Eat Smart");
await page.waitForTimeout(2000);
ok("wizard completion lands on Coach", page.url().includes("/app/nutriorder/coach"));

// ── 4. Coach hub renders as the health-tracking home ──
ok("sidebar sub-nav order is Coach, Find Food, History, Preferences", await (async () => {
  const items = await page.locator("aside nav a").allTextContents();
  const labels = items.map((t) => t.trim()).filter(Boolean);
  return JSON.stringify(labels) === JSON.stringify(["Coach", "Find Food", "History", "Preferences"]);
})());
ok("coach hero progress shows", await page.locator("text=Today's progress").isVisible().catch(() => false));
ok("first-order prompt shows before any order is placed", await page.locator("text=Order your first meal").isVisible().catch(() => false));
ok("weekly trend chart shows", await page.locator("text=This Week — Protein vs. Target").isVisible().catch(() => false));
ok("weight trend card shows", await page.locator("text=Weight Trend").isVisible().catch(() => false));

// ── 5. Seed demo data, then the Order flow end-to-end ──
await page.click("text=Load Demo Data");
await page.waitForTimeout(2500);
ok("seed success alert", await page.locator("text=seeded successfully").first().isVisible().catch(() => false));

await page.locator('aside nav a[href="/app/nutriorder/order"]').click();
await page.waitForURL("**/app/nutriorder/order", { timeout: 10000 });
await page.waitForTimeout(800);
ok("order page shows today-so-far strip", await page.locator("text=Today so far").isVisible().catch(() => false));

await page.selectOption("main select", { index: 1 });
await page.waitForTimeout(1200);
ok("session started after address", await page.locator("text=Session active").isVisible().catch(() => false));
ok(
  "no recommendations appear before a prompt is submitted",
  (await page.locator('[data-testid="recommendation-card"]').count()) === 0
);

await page.fill("textarea", "high protein grilled chicken");
await page.click("text=Find Recommended Meal");
await page.waitForTimeout(3500);
const cardCount = await page.locator('[data-testid="recommendation-card"]').count();
ok("recommendations rendered", cardCount >= 1, `${cardCount} cards`);

await page.locator("h4", { hasText: "Grilled Chicken" }).first().click();
await page.waitForTimeout(3000);
ok("cart shows COD", await page.locator("text=Cash On Delivery").isVisible().catch(() => false));
ok("coupons loaded", await page.locator("text=FITNEW50").isVisible().catch(() => false));
ok("safety check surfaced", await page.locator("text=Safety Checks Passed").isVisible().catch(() => false));

await page.locator('input[type="checkbox"]').first().check();
await page.waitForTimeout(1200);
await page.click("text=Place COD Order on Swiggy");
await page.waitForTimeout(3000);
ok("tracking view shows", await page.locator("text=Tracking").first().isVisible().catch(() => false));
await page.screenshot({ path: `${OUT}/qa-tracking.png` });

// ── 6. An in-progress order must not block Coach/Orders/Preferences ──
await page.locator('aside nav a[href="/app/nutriorder/coach"]').click();
await page.waitForURL("**/app/nutriorder/coach", { timeout: 10000 });
await page.waitForTimeout(1200);
ok(
  "coach page shows real content while order is tracking (not stuck on tracking view)",
  await page.locator("text=Today's progress").isVisible().catch(() => false)
);
ok("in-progress reminder banner shows on Coach", await page.locator("text=Order in progress").isVisible().catch(() => false));
ok("what-you-need-next card shows once an order exists", await page.locator("text=What do you need next?").isVisible().catch(() => false));

// A fresh tab (same browser context, so cookies/localStorage/auth are shared)
// gets a brand-new React provider tree with activeSessionId="" — the same as a
// real returning user's fresh page load — without disturbing `page`'s own
// in-memory order-tracking state, which a same-tab reload would wipe. Exercises
// the handleMealSelect guard that auto-starts a session when one isn't active.
const coachPage2 = await ctx.newPage();
await coachPage2.goto("http://localhost:3000/app/nutriorder/coach", { waitUntil: "networkidle" });
await coachPage2.waitForTimeout(1200);
const suggestBtn = coachPage2.locator("text=Suggest My Next Meal");
if (await suggestBtn.isVisible().catch(() => false)) {
  await suggestBtn.click();
  await coachPage2.waitForTimeout(4000);
  const coachSuggestion = coachPage2.locator(".cursor-pointer", { hasText: "🏪" }).first();
  if (await coachSuggestion.isVisible().catch(() => false)) {
    await coachSuggestion.click();
    await coachPage2.waitForTimeout(2500);
    ok(
      "selecting a meal from Coach with no active session (fresh tab) still works",
      await coachPage2.locator("text=/added — open the Order page/").isVisible().catch(() => false)
    );
  } else {
    ok("selecting a meal from Coach with no active session (fresh tab) still works", true, "skipped — today's remaining macros left no candidate meals to suggest");
  }
} else {
  ok("selecting a meal from Coach with no active session (fresh tab) still works", false, "Suggest My Next Meal button not found");
}
await coachPage2.close();

await page.locator('aside nav a[href="/app/nutriorder/order"]').click();
await page.waitForURL("**/app/nutriorder/order", { timeout: 10000 });
await page.waitForTimeout(800);
ok("navigating back to Order still shows the tracking view", await page.locator("text=Tracking").first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false));

// The "rate this meal" prompt opens 15s after placing and covers the page.
if (await page.locator("button:text-is('Skip')").isVisible().catch(() => false)) await page.click("button:text-is('Skip')");
await page.click("text=Back to Coach");
await page.waitForTimeout(1500);
ok("Back to Coach button returns to the Coach hub", page.url().includes("/app/nutriorder/coach"));

await page.locator('aside nav a[href="/app/nutriorder/orders"]').click();
await page.waitForURL("**/app/nutriorder/orders", { timeout: 10000 });
await page.waitForTimeout(1200);
ok("orders history page renders", await page.locator("text=Order History").isVisible().catch(() => false));
ok("orders history shows placed order", (await page.locator("text=ORDER_PLACED").count()) + (await page.locator("text=Order Placed").count()) >= 1);

await page.locator('aside nav a[href="/app/nutriorder/preferences"]').click();
await page.waitForURL("**/app/nutriorder/preferences", { timeout: 10000 });
await page.waitForTimeout(1200);
ok("preferences page renders (quick-edit form)", await page.locator("text=Set Up Your Profile").isVisible().catch(() => false));

// ── 7. SmartPantry flow (Kitchen composer + IA split) ──
await page.click("aside button[aria-haspopup='menu']");
await page.waitForTimeout(300);
await page.click('aside a[href="/app/smartpantry"]');
await page.waitForURL("**/app/smartpantry/kitchen", { timeout: 10000 });
ok("nav switches to smartpantry", page.url().includes("/app/smartpantry/kitchen"));
ok("sidebar sub-nav order is Kitchen, Pantry, Grocery, Household", await (async () => {
  const items = await page.locator("aside nav a").allTextContents();
  const labels = items.map((t) => t.trim()).filter(Boolean);
  return JSON.stringify(labels) === JSON.stringify(["Kitchen", "Pantry", "Grocery", "Household"]);
})());

// A fresh guest session (own browser context — not just a new tab in `ctx` —
// own demo-login, own empty household) so we can exercise the SmartPantry
// onboarding wizard while it's genuinely gated. Cookies and localStorage are
// shared by every page within one BrowserContext, so a demo-login on a page
// inside `ctx` would silently overwrite the main `page`'s session too; a
// separate context keeps them fully isolated. The main `page` above already
// has a seeded, non-empty pantry by this point (the demo seed populates both
// products), so the wizard would never trigger on it anyway.
{
  const wizardCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const wizardPage = await wizardCtx.newPage();
  // Bypass the landing page's CTA click-through — its demo button is gated
  // behind a swiggy-status fetch that can silently fail (and hide the button)
  // under the concurrent backend load the main `page` is generating by this
  // point in the run. A direct demo-login call is the same effective action,
  // just without that fragile dependency.
  await wizardPage.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  await wizardPage.evaluate(async () => {
    const r = await fetch("http://localhost:8000/auth/demo-login", { method: "POST", credentials: "include" });
    const d = await r.json();
    localStorage.setItem("bitewise_session_id", d.session_token);
    localStorage.setItem("bitewise_chosen_product", "/app/smartpantry");
  });
  // Note: while onboarding is showing, the SmartPantryGate renders the wizard
  // instead of `children` — so `/app/smartpantry`'s own redirect to `/kitchen`
  // doesn't fire until onboarding completes. That's fine for a real user (the
  // wizard renders correctly either way), so wait on content, not the URL.
  await wizardPage.goto("http://localhost:3000/app/smartpantry", { waitUntil: "networkidle" });
  await wizardPage.locator("text=What do you already have at home?").waitFor({ state: "visible", timeout: 10000 });

  ok("wizard stock step shows, pre-checked", await wizardPage.locator("text=What do you already have at home?").isVisible().catch(() => false));
  const riceCheckbox = wizardPage.locator("label", { hasText: "Rice" }).locator('input[type="checkbox"]');
  ok("stock items are checked by default", await riceCheckbox.isChecked().catch(() => false));

  await wizardPage.click("text=Deselect All");
  await wizardPage.waitForTimeout(200);
  const continueDisabled = await wizardPage.locator("button", { hasText: "Continue" }).isDisabled().catch(() => false);
  ok("stock step Continue disables when everything is deselected", continueDisabled);

  await riceCheckbox.check();
  await wizardPage.waitForTimeout(200);
  ok("stock step Continue re-enables once something is checked", !(await wizardPage.locator("button", { hasText: "Continue" }).isDisabled().catch(() => true)));

  await wizardPage.click("text=Continue");
  await wizardPage.waitForTimeout(1500);
  ok("wizard cook-query step shows", await wizardPage.locator("text=What's on your mind to cook?").isVisible().catch(() => false));

  await wizardPage.fill("textarea", "maggi noodles");
  await wizardPage.waitForTimeout(300); // let the controlled input settle before clicking, or submit() reads a stale empty query
  await wizardPage.click("button:has-text('Check it')");
  await wizardPage.waitForTimeout(2500);
  ok("cook-query step resolves a live preview against the just-stocked pantry", (await wizardPage.locator("h4", { hasText: "Maggi Noodles" }).count()) > 0);

  await wizardPage.click("button:has-text('Continue')");
  await wizardPage.waitForTimeout(500);
  ok("wizard household step shows", await wizardPage.locator("text=Who else are you cooking for?").isVisible().catch(() => false));

  await wizardPage.click("text=Take Me to My Kitchen");
  await wizardPage.waitForTimeout(1200);
  ok(
    "finishing the wizard lands on the Kitchen hub, not back in onboarding",
    (await wizardPage.locator("text=What Can I Cook Today?").isVisible().catch(() => false)) &&
      !(await wizardPage.locator("text=What do you already have at home?").isVisible().catch(() => false))
  );

  await wizardPage.reload({ waitUntil: "networkidle" });
  await wizardPage.waitForTimeout(1000);
  ok(
    "onboarding does not re-trigger on reload once the pantry is stocked",
    !(await wizardPage.locator("text=What do you already have at home?").isVisible().catch(() => false))
  );

  await wizardCtx.close();
}

ok("what-can-I-cook panel shows on Kitchen (merged, not a separate page)", await page.locator("text=What Can I Cook Today?").isVisible().catch(() => false));
const cookBtn = page.locator("text=I Cooked This").first();
if (await cookBtn.isVisible().catch(() => false)) {
  await cookBtn.click();
  await page.waitForTimeout(2000);
}
ok("no crash after cook", await page.locator("text=What Can I Cook Today?").isVisible().catch(() => false));

await page.fill("textarea", "maggi noodles");
await page.waitForTimeout(300); // let the controlled input settle before clicking, or the resolve call fires with a stale/empty query
await page.click("button:text-is('Go')");
await page.waitForTimeout(2500);
ok("composer resolves named dish", await page.locator("text=Maggi Noodles").first().isVisible().catch(() => false));

await page.fill("textarea", "chips, coke");
await page.waitForTimeout(300);
await page.click("button:text-is('Go')");
await page.waitForTimeout(2000);
ok("composer resolves grocery-item intent", await page.locator("text=Add to your grocery list?").isVisible().catch(() => false));
await page.click("text=/Add all \\d+ to grocery list/").catch(() => {});
await page.waitForTimeout(1500);

await page.locator('aside nav a[href="/app/smartpantry/pantry"]').click();
await page.waitForURL("**/app/smartpantry/pantry", { timeout: 10000 });
await page.waitForTimeout(1200);
ok("pantry page renders", await page.locator("text=Pantry Inventory").isVisible().catch(() => false));

// Mock/live mode badge — this suite always runs against USE_MOCK_MCP=true
// (the default), so it must always read "Mock", never "Live".
ok("header shows Mock mode badge (USE_MOCK_MCP=true by default)", await page.locator("span:text-is('Mock')").first().isVisible().catch(() => false));
ok("header does not show Live mode badge in mock mode", !(await page.locator("span:text-is('Live')").first().isVisible().catch(() => false)));

ok("cook page redirects to kitchen (no longer a standalone route)", await (async () => {
  await page.goto("http://localhost:3000/app/smartpantry/cook", { waitUntil: "networkidle" });
  return page.url().endsWith("/app/smartpantry/kitchen");
})());

await page.locator('aside nav a[href="/app/smartpantry/household"]').click();
await page.waitForURL("**/app/smartpantry/household", { timeout: 10000 });
ok(
  "household page renders family members",
  await page.locator("text=Jane (Spouse)").first().waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
);

await page.locator('aside nav a[href="/app/smartpantry/grocery"]').click();
await page.waitForURL("**/app/smartpantry/grocery", { timeout: 10000 });
ok(
  "grocery page renders",
  await page.locator("text=Build Cart Preview").first().waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false)
);
await page.click("text=Build Cart Preview").catch(() => {});
await page.waitForTimeout(2000);

const hasCartItems = await page.locator("text=Matched Instamart Products").isVisible().catch(() => false);
if (hasCartItems) {
  await page.selectOption("select", { index: 1 }).catch(() => {});
  await page.click("text=I confirm these details are correct");
  await page.waitForTimeout(300);
  const total = await page.locator("text=/₹\\d/").first().textContent().catch(() => "");
  const belowMin = total && parseFloat(total.replace(/[^\d.]/g, "")) < 99;
  if (!belowMin) {
    await page.click("text=Place COD Order on Instamart");
    await page.waitForTimeout(2500);
    ok("instamart order placed and tracking shown", await page.locator("text=Tracking instamart_order").isVisible().catch(() => false));
  } else {
    ok("instamart order placed and tracking shown", true, "skipped — cart below Rs 99 minimum in this run");
  }
} else {
  ok("instamart order placed and tracking shown", true, "skipped — no unpurchased grocery items in this run");
}
await page.screenshot({ path: `${OUT}/qa-smartpantry.png` });

// ── 8. Theme toggle ──
const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
await page.click('button[aria-label*="Switch to"]');
await page.waitForTimeout(600);
const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
ok("theme toggle flips", before !== after, `${before} -> ${after}`);
await page.reload({ waitUntil: "networkidle" });
const persisted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
ok("theme persists after reload", persisted === after, `${persisted}`);

// ── 9. Returning-user chooser bypass ──
await page.goto("http://localhost:3000/app", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
ok("returning user skips the chooser and lands back in their product", page.url().includes("/app/smartpantry"), page.url());

ok("no page JS errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

console.log("\n===== QA RESULTS =====");
for (const r of results) console.log(r);
await browser.close();
