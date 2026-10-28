/**
 * Real-browser verification of the UI defects this project has actually hit.
 *
 * Not a unit test: it drives Chrome against the running app and measures what
 * a user would see - computed colour contrast, whether the page really scrolls
 * sideways, whether a link lands on Not Found. Several defects here were
 * invisible to the component tests because the markup and the strings were
 * correct all along and only the CASCADE was wrong (a global
 * `button { color: #fff }` painting labels onto white grounds).
 *
 * Run it:
 *   1. mongod running
 *   2. node tests-e2e/seed-e2e.mjs                       # isolated database
 *   3. cd ../backend2 && PORT=8000 \
 *        MONGODB_URI="mongodb://127.0.0.1:27017/LokRozgar_AI_browser_e2e" \
 *        RATE_LIMIT_MAX=100000 node src/index.js
 *   4. npx vite --port 5173
 *   5. node tests-e2e/ui-audit.mjs
 *
 * It logs in ONCE and reuses the session: the login limiter allows 5 attempts
 * per 15 minutes and tripping it is correct behaviour, not something to work
 * around by weakening the limiter.
 */
/**
 * Real-browser verification of the reported UI defects.
 * Chrome via Playwright, against the running app on an isolated database.
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("@playwright/test");

const BASE = "http://localhost:5173";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";
const SHOTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "screenshots");
mkdirSync(SHOTS, { recursive: true });
const out = [];
const R = (l, ok, d = "") => { out.push(`${ok ? "PASS" : "**FAIL**"}  ${l}${d ? "  :: " + d : ""}`); return ok; };

/** sRGB relative luminance contrast ratio, per WCAG. */
function contrast(fg, bg) {
  const parse = (c) => (String(c ?? "").match(/[\d.]+/g) || [0, 0, 0]).slice(0, 3).map(Number);
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const L1 = lum(parse(fg)), L2 = lum(parse(bg));
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/** Effective background: walk up until a non-transparent colour is found. */
function EFFECTIVE_BG(el) {
  let n = el;
  while (n) {
    const bg = getComputedStyle(n).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
    n = n.parentElement;
  }
  return "rgb(255, 255, 255)";
}

async function readability(page, selector, label) {
  let els = [];
  try { els = await page.locator(selector).all(); } catch { /* fall through */ }
  if (els.length === 0) return R(`${label}: elements found`, false, `selector matched nothing: ${selector}`);
  let worst = Infinity, worstText = "";
  for (const el of els) {
    let text, fg, bg;
    try {
      if (!(await el.isVisible())) continue;
      text = (await el.innerText()).trim();
      if (!text) continue;
      fg = await el.evaluate((e) => getComputedStyle(e).color);
      bg = await el.evaluate(EFFECTIVE_BG);
    } catch { continue; }
    const ratio = contrast(fg, bg);
    if (ratio < worst) { worst = ratio; worstText = `"${text.slice(0, 30)}" ${fg} on ${bg}`; }
  }
  if (worst === Infinity) return R(`${label}: has visible text`, false, "no visible text in any match");
  // 3.0 is the WCAG large-text floor; invisible text scores 1.0.
  return R(`${label} is readable`, worst >= 3.0, `worst contrast ${worst.toFixed(2)}:1 — ${worstText}`);
}

const browser = await chromium.launch({ channel: "chrome" });

// One real login; every context below reuses its tokens.
let storageState = null;
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("lokrozgar.language", "en"); } catch {} });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="tel"]', "9000000001");
  await page.fill('input[type="password"]', "Browser-12345");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 }).catch(() => {});
  R("a real login succeeds through the UI", !page.url().includes("/login"), page.url());
  storageState = await ctx.storageState();
  await ctx.close();
}

try {
  for (const [vpName, viewport] of [["desktop 1440x900", { width: 1440, height: 900 }], ["mobile 390x844", { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, storageState });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 120)));
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 120)));

    out.push(`\n================ ${vpName} ================`);

    await page.goto(`${BASE}/worker-dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    R("the reused session is authenticated", !page.url().includes("/login"), page.url());

    // --- navbar: leading items reachable, labels have accessible names ---
    const navBox = await page.locator("nav.navbar-links").boundingBox().catch(() => null);
    if (navBox) {
      const firstLink = page.locator("nav.navbar-links a").first();
      const fb = await firstLink.boundingBox();
      R("first nav item is not clipped off the left edge", fb !== null && fb.x >= navBox.x - 1,
        `nav.x=${navBox?.x.toFixed(0)} firstItem.x=${fb?.x.toFixed(0)}`);
      const names = await page.locator("nav.navbar-links a").evaluateAll((els) =>
        els.map((e) => (e.getAttribute("aria-label") || e.innerText || "").trim()).filter(Boolean).length);
      const total = await page.locator("nav.navbar-links a").count();
      R("every nav link has an accessible name", names === total, `${names}/${total}`);
      // Touch targets: the project sets --touch-target-min: 46px, and the nav
      // links measured 41x40 against it. Below 900px the labels are visually
      // hidden, so width matters as much as height.
      const targets = await page.locator("nav.navbar-links a").evaluateAll((els) => {
        const boxes = els.map((e) => {
          const b = e.getBoundingClientRect();
          return { w: Math.round(b.width), h: Math.round(b.height), x: b.x, right: b.right,
                   name: (e.getAttribute("aria-label") || e.innerText || "").trim() };
        });
        const sorted = [...boxes].sort((a, b) => a.x - b.x);
        let overlap = 0;
        for (let i = 1; i < sorted.length; i++) if (sorted[i].x < sorted[i - 1].right - 0.5) overlap += 1;
        return { under: boxes.filter((b) => b.w < 46 || b.h < 46).map((b) => `${b.name || "?"} ${b.w}x${b.h}`), overlap, count: boxes.length };
      });
      R("every nav link meets the 46px touch-target minimum", targets.under.length === 0,
        targets.under.length ? JSON.stringify(targets.under) : `all ${targets.count} links >= 46x46`);
      R("adjacent nav targets do not overlap", targets.overlap === 0, `${targets.overlap} overlapping pairs`);

      const usable = await page.locator("nav.navbar-links").evaluate((e) => Math.round(e.getBoundingClientRect().width));
      R("the navigation row has a usable width", usable >= 120, `${usable}px wide`);
      const scrollable = await page.locator("nav.navbar-links").evaluate((e) => e.scrollWidth > e.clientWidth + 1);
      if (scrollable) {
        const canReachStart = await page.locator("nav.navbar-links").evaluate((e) => { e.scrollLeft = 0; return e.scrollLeft === 0; });
        R("an overflowing navbar can be scrolled back to its start", canReachStart);
      } else {
        out.push("   (navbar does not overflow at this width)");
      }
    }
    await page.screenshot({ path: `${SHOTS}/${viewport.width}-dashboard.png` });

    // --- worker dashboard: own job must NOT be recommended --------------
    await page.goto(`${BASE}/worker-dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const dashText = await page.locator("body").innerText();
    R("the dual-role user's OWN job is not in their recommendations",
      !dashText.includes("very long job title"), "searched the rendered dashboard text");

    // --- employer dashboard: one Applicants action, and it works --------
    await page.goto(`${BASE}/employer-dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const applicantsBtns = await page.getByRole("button", { name: /applicants/i }).count()
      + await page.getByRole("link", { name: /applicants/i }).count();
    R("exactly one Applicants action per job", applicantsBtns === 1, `found ${applicantsBtns}`);
    await page.screenshot({ path: `${SHOTS}/${viewport.width}-employer.png`, fullPage: true });

    if (applicantsBtns === 1) {
      await page.getByRole("button", { name: /applicants/i }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      const notFound = (await page.locator("body").innerText()).toLowerCase();
      R("the Applicants action does not land on Not Found",
        !notFound.includes("page not found") && !notFound.includes("doesn't exist"), page.url());
      await page.goBack();
    }

    // --- post a job: mode controls must be visible ----------------------
    await page.goto(`${BASE}/post-job`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await readability(page, ".post-job-mode", "job-posting mode controls");
    await page.screenshot({ path: `${SHOTS}/${viewport.width}-postjob-modes.png` });

    // --- skill picker ---------------------------------------------------
    await page.getByRole("button", { name: /fill the form/i }).click().catch(() => {});
    await page.waitForTimeout(600);
    const hasPicker = await page.locator(".skill-picker").count();
    R("the skill picker renders on the job form", hasPicker === 1, `found ${hasPicker}`);
    if (hasPicker) {
      const chipCount = await page.locator(".form-skill-group .form-chip").count();
      R("the old full-catalogue skill chip grid is gone", chipCount === 0, `${chipCount} legacy skill chips`);
      // type a title/description and wait for deterministic suggestions
      await page.fill('input[type="text"]', "Electrician required").catch(() => {});
      await page.fill("textarea", "House wiring and switchboard installation").catch(() => {});
      const cat = page.locator("select").first();
      await cat.selectOption({ index: 1 }).catch(() => {});
      await page.waitForTimeout(2500);
      const suggestions = await page.locator(".skill-picker-option").count();
      out.push(`   suggestions offered: ${suggestions}`);
      if (suggestions > 0) {
        await readability(page, ".skill-picker-option", "suggested skill chips");
        const before = await page.locator(".skill-picker-tag").count();
        await page.locator(".skill-picker-option").first().click();
        await page.waitForTimeout(400);
        const after = await page.locator(".skill-picker-tag").count();
        R("tapping a suggestion selects it", after === before + 1, `${before} -> ${after}`);
        await readability(page, ".skill-picker-tag", "selected skill chips");
        await page.locator(".skill-picker-tag button").first().click();
        await page.waitForTimeout(300);
        R("the remove control clears the selection",
          (await page.locator(".skill-picker-tag").count()) === before);
      }
      await page.screenshot({ path: `${SHOTS}/${viewport.width}-skillpicker.png` });
    }

    // --- chat: conversation names must be visible -----------------------
    await page.goto(`${BASE}/messages`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const chatItems = await page.locator(".chat-list-item").count();
    if (chatItems > 0) await readability(page, ".chat-list-item", "chat conversation names");
    else out.push("   (no conversations seeded; empty state shown)");
    await readability(page, ".chat-page h1, .chat-page h2, main h1", "chat page heading");

    // --- horizontal overflow --------------------------------------------
    for (const path of ["/worker-dashboard", "/employer-dashboard", "/post-job", "/jobs"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      // Asserted as the USER experiences it: try to scroll sideways and see
      // whether the page moves. documentElement.scrollWidth is not a reliable
      // proxy - a descendant with overflow-x:auto inflates it even though the
      // page itself never scrolls, which produced a false 70px reading here.
      const scrolled = await page.evaluate(() => {
        window.scrollTo(500, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      R(`no horizontal page scroll on ${path}`, scrolled === 0, `scrollX=${scrolled}`);
    }

    R("no console errors during the run", consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(" | ") || "none");
    await ctx.close();
  }

  // --- shift chips: reach the step in English, then switch to Marathi ----
  out.push("\n================ guided voice job wizard (shift step) ================");
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/post-job`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.locator(".post-job-mode").nth(1).click({ timeout: 10000 }).catch(() => {});
  // The seeded draft has every step answered but the shift, so the wizard
  // resumes straight onto the screen that reported blank chips.
  await page.waitForSelector(".guided-chip", { timeout: 20000 }).catch(() => {});
  const reached = await page.locator(".guided-wizard h2").first().innerText().catch(() => "");
  out.push(`   wizard heading reached: "${reached}"`);
  R("the wizard resumes on the shift step", /shift/i.test(reached), reached);

  const chips = await page.locator(".guided-chip").count();
  R("the shift step renders its chips", chips > 0, `${chips} chips`);
  if (chips > 0) {
    const en = await page.locator(".guided-chip").allInnerTexts();
    R("every shift chip has a non-empty label (English)", en.every((l) => l.trim()), JSON.stringify(en));
    await readability(page, ".guided-chip", "shift chips (English)");

    // The exact reported scenario: the same screen, in Marathi.
    await page.getByRole("button", { name: "मराठी" }).click().catch(() => {});
    await page.waitForTimeout(800);
    const mr = await page.locator(".guided-chip").allInnerTexts();
    R("every shift chip has a non-empty label (Marathi)", mr.length > 0 && mr.every((l) => l.trim()), JSON.stringify(mr));
    R("the Marathi labels are actually Devanagari, not English fallbacks",
      mr.some((l) => /[\u0900-\u097F]/.test(l)), JSON.stringify(mr));
    await readability(page, ".guided-chip", "shift chips (Marathi)");

    await page.locator(".guided-chip").first().click();
    await page.waitForTimeout(350);
    const active = await page.locator(".guided-chip.active").count();
    R("tapping a chip marks it selected", active === 1, `${active} active`);
    if (active) await readability(page, ".guided-chip.active", "SELECTED shift chip");
  }
  await page.screenshot({ path: `${SHOTS}/390-shift-marathi.png`, fullPage: true });
  await ctx.close();
} catch (e) {
  out.push(`ERR: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
  out.push(`\nFAILURES: ${out.filter((l) => l.startsWith("**FAIL**")).length}`);
  console.log(out.join("\n"));
}
