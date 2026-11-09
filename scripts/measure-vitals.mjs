#!/usr/bin/env node
// Lab measurements of Core Web Vitals for pages of a running site (use a production build: `npm run build && npm start`).
// Per page: TTFB, FCP, LCP, CLS, JS transferred, and the latency of one interaction (INP-like, Event Timing API).
// Mobile profile: Pixel 7 viewport, 4× CPU slowdown, ~Fast 4G network. Numbers are lab estimates, not field data.
// Usage: node scripts/measure-vitals.mjs --base http://localhost:5176 [--mobile] [--runs 3] \
//          [--cookie "name=value; …"] /en "/en/services" "/en/services/x|button[aria-label=Menu]"
//   A path may end with "|<css selector>" to click that element after load and measure the interaction.
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const base = opt("--base", "http://localhost:5176");
const runs = Number(opt("--runs", "3"));
const cookie = opt("--cookie", "");
const mobile = args.includes("--mobile");
const paths = args.filter((a) => a !== "--mobile");
if (paths.length === 0) paths.push("/en");

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

async function measure(browser, path, selector) {
  const context = await browser.newContext(mobile ? { ...devices["Pixel 7"] } : { viewport: { width: 1440, height: 900 } });
  if (cookie) {
    const url = new URL(base);
    await context.addCookies(
      cookie.split(";").map((c) => {
        const [name, ...rest] = c.trim().split("=");
        return { name, value: rest.join("="), domain: url.hostname, path: "/" };
      }),
    );
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (mobile) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
  }
  await page.addInitScript(() => {
    window.__vitals = { lcp: 0, cls: 0, inp: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__vitals.lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__vitals.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.interactionId) window.__vitals.inp = Math.max(window.__vitals.inp, e.duration);
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  });
  const response = await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  if (selector) {
    await page.click(selector, { timeout: 10_000 }).catch((e) => console.error(`  click failed: ${e.message.split("\n")[0]}`));
    await page.waitForTimeout(1000);
  }
  const result = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const js = performance
      .getEntriesByType("resource")
      .filter((r) => r.initiatorType === "script" || r.name.endsWith(".js"))
      .reduce((sum, r) => sum + (r.transferSize || 0), 0);
    return {
      ttfb: nav ? nav.responseStart : null,
      fcp: fcp ? fcp.startTime : null,
      lcp: window.__vitals.lcp || null,
      cls: window.__vitals.cls,
      inp: window.__vitals.inp || null,
      jsKB: Math.round(js / 1024),
      html: nav ? Math.round(nav.transferSize / 1024) : null,
    };
  });
  await context.close();
  return { status: response?.status(), ...result };
}

const browser = await chromium.launch();
console.log(`${mobile ? "mobile (Pixel 7, 4× CPU, Fast 4G)" : "desktop 1440×900"} · ${runs} run(s) · median`);
console.log("path | status | TTFB ms | FCP ms | LCP ms | CLS | interaction ms | JS KB | HTML KB");
for (const entry of paths) {
  const [path, selector] = entry.split("|");
  const results = [];
  for (let i = 0; i < runs; i++) results.push(await measure(browser, path, selector));
  const m = (k) => median(results.map((r) => r[k]));
  const fmt = (v, d = 0) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
  console.log(
    `${entry} | ${results[0].status} | ${fmt(m("ttfb"))} | ${fmt(m("fcp"))} | ${fmt(m("lcp"))} | ${fmt(m("cls"), 3)} | ${fmt(m("inp"))} | ${fmt(m("jsKB"))} | ${fmt(m("html"))}`,
  );
}
await browser.close();
