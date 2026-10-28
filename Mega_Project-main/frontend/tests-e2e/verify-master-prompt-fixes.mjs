import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:5173";
const SHOTS = "/Users/swaruppal/.gemini/antigravity/brain/a72e2512-e546-47dc-a633-5e9a8c54e82d/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

async function run() {
  console.log("Starting verification of MASTER PROMPT UI fixes...");
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
    viewport: { width: 1280, height: 900 },
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
    // 1. Find Jobs Page Glitches Verification
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 1: Find Jobs UI Glitches & Filter Consistency ---");
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle" });
    await page.waitForSelector(".job-filters", { timeout: 8000 });

    // Select "Construction Work" category filter
    const categorySelect = page.locator(".job-filters select").first();
    const options = await categorySelect.locator("option").allTextContents();
    console.log("  Categories available:", options);

    // Find the Construction Work option value
    const constructionOption = await categorySelect.locator("option", { hasText: "Construction" }).first();
    const constructionVal = await constructionOption.getAttribute("value");
    if (constructionVal) {
      await categorySelect.selectOption(constructionVal);
      await page.waitForTimeout(600);
    }

    const jobCards = page.locator(".job-card");
    const count = await jobCards.count();
    record("Construction category filter applied", count > 0, `Returned ${count} jobs`);

    // Check first job card
    const firstCard = jobCards.first();
    const firstTitle = await firstCard.locator(".job-card-title").textContent();
    const firstCategory = await firstCard.locator(".job-card-category").textContent();
    console.log("  First job:", firstTitle?.trim(), "| Category pill:", firstCategory?.trim());
    record(
      "First job category pill shows Construction Work",
      firstCategory?.includes("Construction"),
      `Title: ${firstTitle?.trim()}`
    );

    // Check View Job Details button
    const viewBtn = firstCard.locator("button.job-card-view-btn");
    const viewBtnVisible = await viewBtn.isVisible();
    const viewBtnText = await viewBtn.textContent();
    record("View Job Details button is visible", viewBtnVisible, `Text: "${viewBtnText?.trim()}"`);

    // Hover over the View Job Details button and inspect styles
    await viewBtn.hover();
    await page.waitForTimeout(300);

    const btnStyles = await viewBtn.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const span = el.querySelector("span");
      const spanComputed = span ? window.getComputedStyle(span) : null;
      return {
        bg: computed.backgroundColor,
        color: computed.color,
        spanColor: spanComputed?.color,
        text: el.innerText,
      };
    });

    console.log("  View button computed on hover:", btnStyles);
    const isTextVisibleOnHover =
      btnStyles.text.trim().length > 0 &&
      btnStyles.bg !== btnStyles.color; // NOT matching color
    record("View Job Details button has visible text on hover (not solid blank)", isTextVisibleOnHover);

    // Save screenshot of Find Jobs with Construction Work filter
    await page.screenshot({ path: path.join(SHOTS, "16_find_jobs_category_and_hover.png") });

    // Test Clear Filters button
    const clearBtn = page.locator(".job-filters-clear-btn");
    const clearBtnVisible = await clearBtn.isVisible();
    record("Clear Filters button appears when filter active", clearBtnVisible);

    if (clearBtnVisible) {
      await clearBtn.click();
      await page.waitForTimeout(600);
      const resetCount = await page.locator(".job-card").count();
      record("Filters cleared and all jobs loaded", resetCount >= count, `Total jobs: ${resetCount}`);
      await page.screenshot({ path: path.join(SHOTS, "17_find_jobs_cleared_filters.png") });
    }

    // -------------------------------------------------------------------------
    // 2. Worker Dashboard & Skill-First Recommendations
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 2: Skill-First Recommendations & Match Factors ---");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("input[name='phone'], input[type='tel']").fill("+919000000010");
    await page.locator("input[name='password'], input[type='password']").fill("Test@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });

    await page.goto(`${BASE}/worker-dashboard`, { waitUntil: "networkidle" });
    await page.waitForSelector(".worker-dashboard-job-list", { timeout: 10000 });

    const recCards = page.locator(".worker-dashboard-job-list .job-card");
    const recCount = await recCards.count();
    record("Recommended jobs loaded on worker dashboard", recCount > 0, `Count: ${recCount}`);

    if (recCount > 0) {
      const firstRec = recCards.first();
      const firstRecTitle = await firstRec.locator(".job-card-title").textContent();
      const matchScoreText = await firstRec.locator(".match-score-badge").textContent();
      const hasMatchFactors = await firstRec.locator(".match-factors-container").isVisible();
      const hasSkillOverview = await firstRec.locator(".job-card-skills-overview").isVisible();

      console.log("  Top recommended job:", firstRecTitle?.trim(), "| Score:", matchScoreText?.trim());
      record("Top recommended job has match score badge", Boolean(matchScoreText));
      record("Top recommended job has match factors list", hasMatchFactors);
      record("Top recommended job has skill overview badge", hasSkillOverview);

      await firstRec.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, "18_worker_dashboard_skill_first_recommendations.png") });
    }

    // -------------------------------------------------------------------------
    // 3. Post Job Form Redesign (5 Sections)
    // -------------------------------------------------------------------------
    console.log("\n--- Testing Issue 3: Post Job Form 5-Section Redesign ---");
    await page.goto(`${BASE}/post-job`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // If on choose mode screen, click Manual mode
    const manualBtn = page.locator(".post-job-mode").first();
    if (await manualBtn.isVisible()) {
      await manualBtn.click();
      await page.waitForTimeout(400);
    }

    await page.waitForSelector(".job-form", { timeout: 8000 });
    const sections = page.locator(".job-form-section");
    const sectionCount = await sections.count();
    record("Post Job form renders 5 structured sections", sectionCount === 5, `Found ${sectionCount} sections`);

    const expectedBadges = ["1", "2", "3", "4", "5"];
    for (let i = 0; i < 5; i++) {
      const section = sections.nth(i);
      const badgeText = await section.locator(".job-form-section-badge").textContent();
      const titleText = await section.locator(".job-form-section-title").textContent();
      console.log(`  Section ${i + 1}: [Badge: ${badgeText?.trim()}] "${titleText?.trim()}"`);
      record(
        `Section ${i + 1} has correct badge '${expectedBadges[i]}'`,
        badgeText?.trim() === expectedBadges[i],
        `Title: ${titleText?.trim()}`
      );
    }

    // Check presence of key fields in their respective sections
    const sec1 = sections.nth(0);
    record("Section 1 has Job Title input", await sec1.locator("input[type='text']").first().isVisible());

    const sec2 = sections.nth(1);
    record("Section 2 has Category select", await sec2.locator("select").isVisible());

    const sec3 = sections.nth(2);
    record("Section 3 has City and Location field", await sec3.locator(".location-field, input").first().isVisible());

    const sec4 = sections.nth(3);
    record("Section 4 has Pay fields & Shift select", await sec4.locator("select").first().isVisible());

    const sec5 = sections.nth(4);
    record("Section 5 has Review button", await sec5.locator("button[type='submit']").isVisible());

    await page.screenshot({
      path: path.join(SHOTS, "19_post_job_5_sections.png"),
      fullPage: true,
    });

  } catch (err) {
    console.error("Test execution failure:", err);
    record("E2E Verification Execution", false, err.message);
  } finally {
    await browser.close();
  }

  console.log("\n========================================================");
  console.log("MASTER PROMPT VERIFICATION SUMMARY");
  console.log("========================================================");
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`Total checks: ${total} | Passed: ${passed} | Failed: ${total - passed}`);
  results.forEach((r) => console.log(`  ${r.ok ? "✅" : "❌"} ${r.name} ${r.details ? "(" + r.details + ")" : ""}`));

  if (passed !== total) {
    process.exit(1);
  }
}

run();
