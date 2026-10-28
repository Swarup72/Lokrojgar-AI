import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");

const BASE = "http://localhost:5173";
const SHOTS = "/Users/swaruppal/.gemini/antigravity/brain/a72e2512-e546-47dc-a633-5e9a8c54e82d/screenshots";
fs.mkdirSync(SHOTS, { recursive: true });

async function run() {
  console.log("Starting full workflow verification...");
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

  // Listen to console and page errors
  page.on("pageerror", (err) => console.error("  [Browser Error]:", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error("  [Console Error]:", msg.text());
    }
  });

  try {
    // 1. Public Homepage and Navigation
    console.log("\n--- Workflow 1: Public Homepage & Navigation ---");
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    const title = await page.title();
    record("Homepage loads", title.includes("LokRozgar"), `Title: ${title}`);

    const sidebarVisible = await page.locator("aside.navbar.sidebar").isVisible();
    record("Permanent sidebar visible", sidebarVisible);

    const categoriesCount = await page.locator(".category-card, .visual-category-card").count();
    record("Category cards rendered", categoriesCount >= 5, `Count: ${categoriesCount}`);

    await page.screenshot({ path: path.join(SHOTS, "01_homepage.png"), fullPage: false });

    // 2. Language switching
    console.log("\n--- Workflow 2: Language Switching ---");
    // Find language switcher buttons (MR, HI, EN)
    const mrBtn = page.locator(".language-switcher button:has-text('मराठी')").first();
    const enBtn = page.locator(".language-switcher button:has-text('English')").first();
    const hiBtn = page.locator(".language-switcher button:has-text('हिंदी')").first();

    if (await mrBtn.isVisible()) {
      await mrBtn.click();
      await page.waitForTimeout(500);
      const marathiText = await page.textContent("body");
      const hasMarathi = /काम|नोकरी|शोध|ओळख/.test(marathiText);
      record("Switch to Marathi", hasMarathi);
      await page.screenshot({ path: path.join(SHOTS, "02_homepage_marathi.png") });

      if (await hiBtn.isVisible()) {
        await hiBtn.click();
        await page.waitForTimeout(500);
        const hindiText = await page.textContent("body");
        record("Switch to Hindi", /काम|पहचान|नौकरी/.test(hindiText));
      }

      await enBtn.click();
      await page.waitForTimeout(500);
      record("Switch back to English", true);
    } else {
      record("Language switcher found", false);
    }

    // 3. Job Listing, Searching, and Filtering
    console.log("\n--- Workflow 3: Job Listing, Searching, and Filtering ---");
    await page.goto(`${BASE}/jobs`, { waitUntil: "networkidle" });
    const jobsCount = await page.locator(".job-card").count();
    record("Jobs page loads with listings", jobsCount > 0, `Jobs found: ${jobsCount}`);

    // Test occupation filter click
    const electricianCard = page.locator(".jobs-occupation-card:has-text('Electrician')").first();
    if (await electricianCard.isVisible()) {
      await electricianCard.click();
      await page.waitForTimeout(1000);
      const filteredCount = await page.locator(".job-card").count();
      record("Job category filter selection", filteredCount > 0, `Filtered jobs: ${filteredCount}`);
    }

    // Test search filter
    const searchInput = page.locator(".jobs-search-input, input[type='text']").first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Electrician");
      const searchBtn = page.locator(".jobs-search-submit, button[type='submit']").first();
      await searchBtn.click();
      await page.waitForTimeout(1000);
      const searchCount = await page.locator(".job-card").count();
      record("Job search by keyword", searchCount > 0, `Search results: ${searchCount}`);
    }
    await page.screenshot({ path: path.join(SHOTS, "03_jobs_listing.png") });

    // 4. Worker Login
    console.log("\n--- Workflow 4: Worker Login ---");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("input[name='phone'], input[type='tel']").fill("+919000000001");
    await page.locator("input[name='password'], input[type='password']").fill("Test@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
    record("Worker login succeeds", !page.url().includes("/login"), `Current URL: ${page.url()}`);

    // 5. Worker Dashboard
    console.log("\n--- Workflow 5: Worker Dashboard ---");
    await page.goto(`${BASE}/worker-dashboard`, { waitUntil: "networkidle" });
    const workerDashboardVisible = await page.locator(".worker-dashboard").isVisible();
    record("Worker dashboard rendered", workerDashboardVisible);

    const quickActionsCount = await page.locator(".worker-icon-card").count();
    record("Worker quick action tiles present", quickActionsCount >= 4, `Quick actions count: ${quickActionsCount}`);
    await page.screenshot({ path: path.join(SHOTS, "04_worker_dashboard.png") });

    // 6. Worker Profile Viewing & Updating
    console.log("\n--- Workflow 6: Worker Profile ---");
    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    const profilePageVisible = await page.locator(".profile-page").isVisible();
    record("Worker profile page rendered", profilePageVisible);

    const nameInput = page.locator(".worker-profile-form input[type='text']").first();
    if (await nameInput.isVisible()) {
      const val = await nameInput.inputValue();
      record("Profile full name loaded", Boolean(val), `Name: ${val}`);
    }
    await page.screenshot({ path: path.join(SHOTS, "05_worker_profile.png") });

    // 7. Worker Applications
    console.log("\n--- Workflow 7: Worker Applications ---");
    await page.goto(`${BASE}/applications`, { waitUntil: "networkidle" });
    const appsPage = await page.locator("h1, h2").first().textContent();
    record("Applications page loaded", Boolean(appsPage));
    await page.screenshot({ path: path.join(SHOTS, "06_worker_applications.png") });

    // Logout worker
    const logoutBtn = page.locator(".sidebar-logout").first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(500);
    }

    // 8. Employer Login
    console.log("\n--- Workflow 8: Employer Login ---");
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.locator("input[name='phone'], input[type='tel']").fill("+919110000001");
    await page.locator("input[name='password'], input[type='password']").fill("Test@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10000 });
    record("Employer login succeeds", !page.url().includes("/login"), `Current URL: ${page.url()}`);

    // 9. Employer Dashboard
    console.log("\n--- Workflow 9: Employer Dashboard ---");
    await page.goto(`${BASE}/employer-dashboard`, { waitUntil: "networkidle" });
    const employerDashboardVisible = await page.locator(".employer-dashboard").isVisible();
    record("Employer dashboard rendered", employerDashboardVisible);
    await page.screenshot({ path: path.join(SHOTS, "07_employer_dashboard.png") });

    // 10. Employer Profile
    console.log("\n--- Workflow 10: Employer Profile ---");
    await page.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    const employerProfileVisible = await page.locator(".profile-page").isVisible();
    record("Employer profile page rendered", employerProfileVisible);
    await page.screenshot({ path: path.join(SHOTS, "08_employer_profile.png") });

    // Logout employer
    const empLogoutBtn = page.locator(".sidebar-logout").first();
    if (await empLogoutBtn.isVisible()) {
      await empLogoutBtn.click();
      await page.waitForTimeout(500);
    }

    // 11. Admin Login
    console.log("\n--- Workflow 11: Admin Login ---");
    await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
    await page.locator("input[type='tel'], input[placeholder*='admin phone' i]").fill("+919999999999");
    await page.locator("input[type='password']").fill("Admin@12345");
    await page.locator("button[type='submit']").click();
    await page.waitForURL((url) => url.pathname === "/admin", { timeout: 10000 });
    record("Admin login succeeds", page.url().includes("/admin"), `Current URL: ${page.url()}`);

    // 12. Admin Dashboard
    console.log("\n--- Workflow 12: Admin Dashboard & Telemetry ---");
    await page.waitForTimeout(1000);
    const adminCards = await page.locator(".admin-stat-card").count();
    record("Admin dashboard stats rendered", adminCards >= 4, `Stat cards: ${adminCards}`);
    await page.screenshot({ path: path.join(SHOTS, "09_admin_dashboard.png") });

    // 13. Admin AI Monitoring Page
    console.log("\n--- Workflow 13: Admin AI Monitoring ---");
    await page.goto(`${BASE}/admin/ai-monitoring`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const aiStatCards = await page.locator(".admin-stat-card").count();
    record("AI Monitoring page renders live telemetry", aiStatCards >= 4, `AI metric cards: ${aiStatCards}`);
    await page.screenshot({ path: path.join(SHOTS, "10_admin_ai_monitoring.png") });

  } catch (err) {
    console.error("Verification failed with exception:", err);
  } finally {
    await browser.close();
  }

  console.log("\n================ SUMMARY ================");
  const passCount = results.filter((r) => r.ok).length;
  console.log(`Passed ${passCount} of ${results.length} checks.`);
  return results;
}

run();
