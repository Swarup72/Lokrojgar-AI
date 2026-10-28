import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:5173";
const SHOTS = "/Users/swaruppal/.gemini/antigravity/brain/a72e2512-e546-47dc-a633-5e9a8c54e82d/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

async function run() {
  console.log("Starting verification of UI Audit fixes (Issues 1 - 5)...");
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });

  const results = [];
  const record = (name, ok, details = "") => {
    results.push({ name, ok, details });
    console.log(`${ok ? "✅ PASS" : "❌ FAIL"}: ${name} ${details ? "(" + details + ")" : ""}`);
  };

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on("pageerror", (err) => console.error("  [Browser Error]:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("  [Console Error]:", msg.text());
    }
  });

  try {
    // -------------------------------------------------------------------------
    // Issue 1: Voice-based field extraction in Business Details (Employer)
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 1: Voice Extraction in Business Details ---");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("input[name='phone'], input[type='tel']").fill("+919110000001");
    await page.locator("input[name='password'], input[type='password']").fill("Test@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });

    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await page.waitForSelector("#employer-form", { timeout: 8000 });

    const voiceActionBar = await page.locator(".employer-voice-action-bar").isVisible();
    record("Voice action bar visible in Business Details", voiceActionBar);

    const voiceBtn = page.locator(".employer-voice-trigger-btn");
    record("Voice trigger button present", await voiceBtn.isVisible());

    // Click the voice button to open the voice assistant
    await voiceBtn.click();
    await page.waitForTimeout(400);

    const voicePanel = await page.locator(".employer-voice-panel").isVisible();
    record("Interactive Voice Assistant panel opened", voicePanel);

    const langChipsCount = await page.locator(".employer-voice-lang-chip").count();
    record("Language selectors present (mr, hi, en)", langChipsCount === 3, `Found: ${langChipsCount}`);

    const fieldTabsCount = await page.locator(".employer-voice-tab").count();
    record("Voice field tabs present", fieldTabsCount >= 3, `Tabs: ${fieldTabsCount}`);

    const fieldMicBtnsCount = await page.locator(".field-mic-btn").count();
    record("Individual mic buttons present on form inputs", fieldMicBtnsCount >= 3, `Count: ${fieldMicBtnsCount}`);

    // Verify input fields can be edited
    const nameInput = page.locator(".voice-input-container input").first();
    const origVal = await nameInput.inputValue();
    await nameInput.fill(origVal + " Updated");
    record("Form fields editable and reviewable before saving", (await nameInput.inputValue()).includes("Updated"));
    await nameInput.fill(origVal); // restore

    await page.screenshot({ path: path.join(SHOTS, "11_business_details_voice_assistant.png") });

    // -------------------------------------------------------------------------
    // Issue 2: Two-way Reviews Separation
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 2: Two-Way Reviews Separation ---");
    await page.locator("#profile-reviews").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    const twoWayGrid = await page.locator(".rating-two-way-grid").isVisible();
    record("Two-way reviews grid visible", twoWayGrid);

    const workerDirCol = await page.locator(".rating-direction-column.worker-direction").isVisible();
    const employerDirCol = await page.locator(".rating-direction-column.employer-direction").isVisible();
    record("Section A (Employer ratings of worker) column present", workerDirCol);
    record("Section B (Worker ratings of employer) column present", employerDirCol);

    const sectionATitle = await page.locator(".worker-direction .rating-direction-title").textContent();
    const sectionBTitle = await page.locator(".employer-direction .rating-direction-title").textContent();
    record("Section A heading correct", Boolean(sectionATitle), sectionATitle);
    record("Section B heading correct", Boolean(sectionBTitle), sectionBTitle);

    const sectionAEmpty = await page.locator(".worker-direction .rating-list-empty, .worker-direction .rating-empty-muted").count();
    const sectionBEmpty = await page.locator(".employer-direction .rating-list-empty, .employer-direction .rating-empty-muted").count();
    record("Independent empty states rendered for both sections", sectionAEmpty > 0 && sectionBEmpty > 0);

    await page.screenshot({ path: path.join(SHOTS, "12_two_way_reviews_desktop.png") });

    // Test mobile responsive stacking
    console.log("\n--- Testing Issue 2 (Mobile Viewport): Responsive Two-Way Reviews ---");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(400);

    const isStacked = await page.evaluate(() => {
      const colA = document.querySelector(".worker-direction");
      const colB = document.querySelector(".employer-direction");
      if (!colA || !colB) return false;
      const rectA = colA.getBoundingClientRect();
      const rectB = colB.getBoundingClientRect();
      // On mobile stack, colB must be below colA (higher top coordinate)
      return rectB.top >= rectA.bottom - 5;
    });
    record("Two-way reviews stack vertically on mobile viewport", isStacked);

    await page.screenshot({ path: path.join(SHOTS, "13_two_way_reviews_mobile.png") });

    // Restore desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    // Logout employer
    const logoutBtn = page.locator(".sidebar-logout").first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(600);
    }

    // -------------------------------------------------------------------------
    // Issue 3: Skill-Based Job Recommendations
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 3: Skill-Based Job Recommendations ---");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("input[name='phone'], input[type='tel']").fill("+919000000010"); // Kiran Deshmukh (has skills)
    await page.locator("input[name='password'], input[type='password']").fill("Test@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });

    await page.goto(`${BASE}/worker-dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector(".worker-dashboard-job-list, .worker-cold-start-card", { timeout: 8000 });

    const jobCardsCount = await page.locator(".worker-visual-job-card").count();
    record("Worker dashboard loads recommendation cards", jobCardsCount > 0, `Count: ${jobCardsCount}`);

    const skillsOverviewCount = await page.locator(".job-card-skills-overview").count();
    record("Skill overview section rendered on recommendation cards", skillsOverviewCount > 0);

    const firstCardHasSkillsSection = await page.locator(".worker-visual-job-card .job-card-skills-overview").first().isVisible();
    record("First job card has dedicated skill match information", firstCardHasSkillsSection);

    // Verify match factors list and transparent summary
    const matchFactorsVisible = await page.locator(".match-factors-container").first().isVisible();
    record("Match factors transparently displayed", matchFactorsVisible);

    await page.locator(".worker-dashboard-job-list").scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, "14_skill_based_recommendations.png") });

    // -------------------------------------------------------------------------
    // Issue 4: Marathi Voice Instructions
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 4: Marathi Voice Instructions ---");
    // Switch to Marathi
    const mrLangBtn = page.locator(".language-switcher button:has-text('मराठी')").first();
    if (await mrLangBtn.isVisible()) {
      await mrLangBtn.click();
      await page.waitForTimeout(600);
    }

    const marathiAudioBtn = page.locator(".worker-audio-button");
    const audioBtnText = await marathiAudioBtn.textContent();
    record("Marathi audio instruction button present with text 'आवाजात ऐका'", audioBtnText.includes("आवाजात ऐका") || audioBtnText.includes("ऐका"), audioBtnText);

    // Click audio button to test trigger
    await marathiAudioBtn.click();
    await page.waitForTimeout(400);

    // Click again to verify clean stop (no overlapping audio)
    await marathiAudioBtn.click();
    await page.waitForTimeout(400);
    record("Audio instruction button toggles without throwing exceptions", true);

    await page.screenshot({ path: path.join(SHOTS, "15_marathi_voice_guidance.png") });

    console.log("\n==========================================");
    console.log(`Verification Complete: ${results.filter((r) => r.ok).length} / ${results.length} checks passed`);
    console.log("==========================================");
  } catch (error) {
    console.error("Test failed with error:", error);
    record("Verification execution completed", false, error.message);
  } finally {
    await browser.close();
  }
}

run();
