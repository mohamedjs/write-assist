import { spawn } from "node:child_process";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const SHOTS_SITE = resolve(ROOT, "site/assets/shots");
const SHOTS_REMOTION = resolve("/var/www/html/old/remotion/public/writeassist");

mkdirSync(SHOTS_SITE, { recursive: true });
mkdirSync(SHOTS_REMOTION, { recursive: true });

async function waitHttp(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main() {
  console.log("Starting WriteAssist daemon on port 43817...");
  const proc = spawn("python3", ["-m", "writeassist", "run", "--no-window", "--port", "43817"], {
    cwd: ROOT,
    env: { ...process.env, PYTHONPATH: resolve(ROOT, "src") },
    stdio: "inherit",
  });

  const cleanup = () => {
    try {
      proc.kill("SIGTERM");
    } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  try {
    await waitHttp("http://127.0.0.1:43817/health");
    console.log("WriteAssist daemon is ready!");

    const browser = await puppeteer.launch({
      executablePath: "/home/mohamed/.local/bin/google-chrome",
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--force-dark-mode",
        "--hide-scrollbars",
      ],
      defaultViewport: {
        width: 1440,
        height: 900,
        deviceScaleFactor: 2,
      },
    });

    const page = await browser.newPage();

    async function save(name) {
      const sitePath = resolve(SHOTS_SITE, `${name}.png`);
      const remotionPath = resolve(SHOTS_REMOTION, `${name}.png`);
      await page.screenshot({ path: sitePath, type: "png" });
      copyFileSync(sitePath, remotionPath);
      console.log(`Saved screenshot: ${name}.png`);
    }

    // 1. Editor English (Dark Theme)
    console.log("Capturing 1. Editor English...");
    await page.goto("http://127.0.0.1:43817");
    await page.waitForSelector("#main-editor");
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
      localStorage.setItem("writeassist-theme", "dark");
    });
    const sampleTextEn =
      "The team have arrived at the airport, but their luggage was misplace. We should definitely checked the tickets before boarding.";
    await page.focus("#main-editor");
    await page.evaluate((txt) => {
      const ed = document.querySelector("#main-editor");
      ed.value = txt;
      ed.dispatchEvent(new Event("input"));
    }, sampleTextEn);

    await page.click("#btn-check-grammar");
    await page.waitForSelector(".issue-card", { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 600));
    await save("editor-en");

    // 2. AI Rewrite English (with real OpenRouter response)
    console.log("Capturing 2. AI Rewrite English...");
    await page.click('[data-tab="tab-rewrite"]');
    await page.waitForSelector("#rewrite-input");
    await page.evaluate(() => {
      // Pick Professional tone
      document.querySelectorAll(".tone-btn").forEach((b) => b.classList.remove("active"));
      const profBtn = document.querySelector('.tone-btn[data-tone="professional and polished"]');
      if (profBtn) profBtn.classList.add("active");
    });
    const draftText =
      "hey team, can u please send the updated quarterly budget report by end of day today? the executive committee needs it urgently for tomorrow review.";
    await page.evaluate((txt) => {
      document.querySelector("#rewrite-input").value = txt;
    }, draftText);

    await page.click("#btn-run-rewrite");
    // Wait for rewrite output to be populated
    await page.waitForFunction(
      () => {
        const out = document.querySelector("#rewrite-output");
        return out && out.value && out.value.length > 20 && !out.value.startsWith("Failed");
      },
      { timeout: 25000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await save("rewrite-en");

    // 3. Smart Replies English (with real OpenRouter replies)
    console.log("Capturing 3. Smart Replies English...");
    await page.click('[data-tab="tab-replies"]');
    await page.waitForSelector("#reply-context");
    const incomingEmail =
      "Hi Mohamed,\nCould we reschedule our technical roadmap review from Wednesday to Thursday afternoon? Let me know what time works best for you.";
    await page.evaluate((txt) => {
      document.querySelector("#reply-context").value = txt;
    }, incomingEmail);

    await page.click("#btn-generate-replies");
    await page.waitForSelector("#replies-container .card", { timeout: 25000 });
    await new Promise((r) => setTimeout(r, 600));
    await save("replies-en");

    // 4. Translate English -> Arabic
    console.log("Capturing 4. Translate English -> Arabic...");
    await page.click('[data-tab="tab-translate"]');
    await page.waitForSelector("#translate-input");
    await page.evaluate(() => {
      document.querySelector("#translate-target").value = "ar";
      document.querySelector("#translate-input").value =
        "WriteAssist is an open-source, private writing assistant with grammar checking, style enhancement, and smart AI rewrites across all desktop operating systems.";
    });
    await page.click("#btn-run-translate");
    await page.waitForFunction(
      () => {
        const out = document.querySelector("#translate-output");
        return out && out.value && out.value.length > 20;
      },
      { timeout: 15000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await save("translate-en");

    // 5. System Diagnostics Doctor Modal (All [PASS])
    console.log("Capturing 5. Doctor Diagnostics English...");
    await page.click("#btn-doctor");
    await page.waitForSelector("#modal-doctor.open", { timeout: 5000 });
    await page.waitForFunction(
      () => {
        const cards = document.querySelectorAll("#doctor-results .card");
        return cards.length >= 5;
      },
      { timeout: 10000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await save("doctor-en");

    // Close doctor modal
    await page.click("#btn-close-doctor");
    await new Promise((r) => setTimeout(r, 400));

    // 6. Arabic RTL Views
    console.log("Capturing 6. Arabic RTL views...");
    await page.click("#btn-lang"); // Switch to Arabic
    await new Promise((r) => setTimeout(r, 500));

    // Editor Arabic
    await page.click('[data-tab="tab-editor"]');
    await page.evaluate(() => {
      const ed = document.querySelector("#main-editor");
      ed.value = "مرحبا بك في تطبيق WriteAssist المساعد الذكي للكتابة باللغة العربية والإنجليزية.";
      ed.dispatchEvent(new Event("input"));
    });
    await new Promise((r) => setTimeout(r, 600));
    await save("editor-ar");

    // Rewrite Arabic
    await page.click('[data-tab="tab-rewrite"]');
    await page.evaluate(() => {
      document.querySelector("#rewrite-input").value = "السلام عليكم، برجاء ارسال التقرير في اقرب فرصة ممكنة للاهمية.";
    });
    await page.click("#btn-run-rewrite");
    await page.waitForFunction(
      () => {
        const out = document.querySelector("#rewrite-output");
        return out && out.value && out.value.length > 10;
      },
      { timeout: 25000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await save("rewrite-ar");

    // Translate Arabic -> English
    await page.click('[data-tab="tab-translate"]');
    await page.evaluate(() => {
      document.querySelector("#translate-target").value = "en";
      document.querySelector("#translate-input").value = "يعمل رايت أسيست بشكل متكامل على نظام ماك وويندوز ولينكس.";
    });
    await page.click("#btn-run-translate");
    await page.waitForFunction(
      () => {
        const out = document.querySelector("#translate-output");
        return out && out.value && out.value.length > 15;
      },
      { timeout: 15000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await save("translate-ar");

    // Doctor Arabic
    await page.click("#btn-doctor");
    await page.waitForSelector("#modal-doctor.open", { timeout: 5000 });
    await page.waitForFunction(
      () => {
        const cards = document.querySelectorAll("#doctor-results .card");
        return cards.length >= 5;
      },
      { timeout: 10000 }
    );
    await new Promise((r) => setTimeout(r, 600));
    await save("doctor-ar");
    await page.click("#btn-close-doctor");

    // 7. Browser Extension Popup
    console.log("Capturing 7. Browser Extension Popup...");
    const popupPage = await browser.newPage();
    await popupPage.setViewport({ width: 380, height: 600, deviceScaleFactor: 2 });
    await popupPage.goto(`file://${resolve(ROOT, "extension/popup/popup.html")}`);
    await popupPage.evaluate(() => {
      document.querySelector("#enabled").checked = true;
      document.querySelector("#siteOn").checked = true;
      document.querySelector("#autoCheck").checked = true;
      document.querySelector("#picky").checked = true;
      const keyInput = document.querySelector("#openrouterKey");
      if (keyInput) keyInput.value = "sk-or-v1-••••••••••••••••";
      const modelInput = document.querySelector("#openrouterModel");
      if (modelInput) modelInput.value = "openrouter/auto";
      const nanoPill = document.querySelector("#nanoPill");
      if (nanoPill) {
        nanoPill.textContent = "ready";
        nanoPill.className = "pill ok";
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    const popupSite = resolve(SHOTS_SITE, "extension-popup.png");
    const popupRemotion = resolve(SHOTS_REMOTION, "extension-popup.png");
    await popupPage.screenshot({ path: popupSite, type: "png" });
    copyFileSync(popupSite, popupRemotion);
    console.log("Saved screenshot: extension-popup.png");

    await browser.close();
    console.log("All real screenshots captured successfully!");
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
