import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("pageerror", (e) => console.log("[pageerror]", String(e)));
page.on("console", (msg) => { if (msg.type() === "error") console.log("[console.error]", msg.text()); });
page.on("response", async (res) => {
  if (res.url().includes("/coach/next-meal")) {
    console.log("[next-meal response]", res.status());
    try { console.log(JSON.stringify(await res.json()).slice(0, 500)); } catch {}
  }
});

await page.goto("http://localhost:3000/");
await page.evaluate(async () => {
  const r = await fetch("http://localhost:8000/auth/demo-login", { method: "POST", credentials: "include" });
  const d = await r.json();
  await fetch("http://localhost:8000/demo/seed", { method: "POST", credentials: "include", headers: { Authorization: "Bearer " + d.session_token } });
  localStorage.setItem("bitewise_session_id", d.session_token);
  localStorage.setItem("bitewise_chosen_product", "/app/nutriorder");
});

// Place an order quickly via the Order page UI (mirrors qa.mjs flow)
await page.goto("http://localhost:3000/app/nutriorder/order", { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.selectOption("main select", { index: 1 });
await page.waitForTimeout(1200);
await page.fill("textarea", "high protein grilled chicken");
await page.click("text=Find Recommended Meal");
await page.waitForTimeout(3500);
await page.locator("h4", { hasText: "Grilled Chicken" }).first().click();
await page.waitForTimeout(3000);
await page.locator('input[type="checkbox"]').first().check();
await page.waitForTimeout(1200);
await page.click("text=Place COD Order on Swiggy");
await page.waitForTimeout(3000);
console.log("order placed, url:", page.url());

await page.goto("http://localhost:3000/app/nutriorder/coach", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
console.log("on coach, url:", page.url());

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("after reload, url:", page.url());

const cardVisible = await page.locator("text=What do you need next?").isVisible().catch(() => false);
console.log("what-you-need-next visible after reload:", cardVisible);

const btn = page.locator("text=Suggest My Next Meal");
console.log("suggest button visible:", await btn.isVisible().catch(() => false));
await btn.click();
console.log("clicked suggest button, waiting...");
await page.waitForTimeout(4000);

const bodyText = await page.locator("body").innerText();
const idx = bodyText.indexOf("What do you need next?");
console.log("--- card area text ---");
console.log(bodyText.slice(idx, idx + 600));

const suggCount = await page.locator(".cursor-pointer", { hasText: "🏪" }).count();
console.log("suggestion cards found:", suggCount);

await browser.close();
