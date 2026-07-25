import { chromium } from "playwright";
const OUT = "/private/tmp/claude-501/-Users-samadarsh-Documents-MY-PROJECTS-nutriorderai/4bd99f5a-9d4b-4c31-b48d-5feb4102f53a/scratchpad/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/");
await page.evaluate(async () => {
  const r = await fetch("http://localhost:8000/auth/demo-login", { method: "POST", credentials: "include" });
  const d = await r.json();
  localStorage.setItem("bitewise_session_id", d.session_token);
  localStorage.setItem("bitewise_theme", "dark");
});

await page.goto("http://localhost:3000/app/nutriorder", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/switcher-closed.png` });

await page.click("aside button[aria-haspopup='menu']");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/switcher-open.png` });

await page.click("aside a[href='/app/smartpantry']");
await page.waitForURL("**/app/smartpantry", { timeout: 10000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/switcher-after-nav.png` });

await browser.close();
