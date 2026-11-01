import { mkdirSync, copyFileSync } from "node:fs";
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

function buildHtml(lang = "en") {
  const rtl = lang === "ar";
  const appTitle = rtl ? "مستند Word — تقرير الربع السنوي" : "Microsoft Word — Quarterly_Report_Draft.docx";
  const docText = rtl
    ? `التقرير وصل وفيه <span class="typo">اخطاء املائيه</span> كتيره ومش مظبوطه <span class="typo">لغوياً</span>، برجاء ارسال النسخه المعدله في اقرب وقت قبل اجتماع مجلس الإداره.`
    : `The team have arrived at the airport, but their luggage was <span class="typo">misplace</span>. We should definitely <span class="typo">checked</span> the tickets before boarding the flight.`;
  const activeAppBadge = "WINWORD.EXE";
  const issuesBadge = rtl ? "⚠ خطآن نحويان" : "⚠ 2 Issues Detected";
  const fixBtn = rtl ? "⚡ تصحيح فوري" : "⚡ Fix In-Place";
  const rewriteBtn = rtl ? "✨ إعادة صياغة AI" : "✨ AI Rewrite";
  const openBtn = rtl ? "📖 فتح" : "📖 Open";
  const cardTitle = rtl ? "رايت أسيست — البادج العائم فوق كل التطبيقات" : "WriteAssist — Always-on-Top Floating Correction HUD";
  const cardDesc = rtl
    ? "يعمل فوق Word و Excel و Notes وجميع البرامج بدون سرقة التركيز من لوحة المفاتيح."
    : "Floats across all workspaces & monitors above Word, Excel, and Notes without stealing focus.";
  const suggestion1 = rtl ? 'إملاء: "اخطاء املائيه" ← "أخطاء إملائية"' : 'Grammar: "misplace" → "misplaced"';
  const suggestion2 = rtl ? 'أسلوب: "مش مظبوطه" ← "غير دقيقة"' : 'Agreement: "checked" → "check"';

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${rtl ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #090d16;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Arabic", sans-serif;
    width: 1440px;
    height: 900px;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* Desktop Background / Wallpaper */
  .desktop-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 85% 15%, rgba(37, 99, 235, 0.22), transparent 45%),
                radial-gradient(circle at 20% 80%, rgba(14, 165, 233, 0.15), transparent 40%),
                #070b14;
    z-index: 0;
  }

  /* Word Window Frame */
  .word-window {
    position: absolute;
    top: 40px;
    left: 60px;
    right: 60px;
    bottom: 40px;
    background: #111827;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 1;
  }

  /* Word Titlebar */
  .word-titlebar {
    height: 48px;
    background: #1e293b;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    padding: 0 20px;
    gap: 12px;
  }
  .mac-traffic {
    display: flex;
    gap: 8px;
  }
  .mac-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .dot-red { background: #ff5f56; }
  .dot-yellow { background: #ffbd2e; }
  .dot-green { background: #27c93f; }
  .word-title {
    font-size: 14px;
    font-weight: 600;
    color: #94a3b8;
    margin: 0 auto;
    font-family: monospace;
    letter-spacing: 0.3px;
  }

  /* Word Ribbon */
  .word-ribbon {
    height: 44px;
    background: #0f172a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    align-items: center;
    padding: 0 24px;
    gap: 20px;
    font-size: 13px;
    color: #64748b;
  }
  .ribbon-tab.active {
    color: #38bdf8;
    font-weight: 600;
    border-bottom: 2px solid #38bdf8;
    padding: 10px 0;
  }

  /* Word Document Page */
  .word-doc {
    flex: 1;
    margin: 32px auto;
    width: 900px;
    background: #182234;
    border-radius: 12px;
    padding: 48px 56px;
    box-shadow: 0 12px 30px rgba(0,0,0,0.5);
    border: 1px solid rgba(255,255,255,0.05);
  }
  .doc-heading {
    font-size: 26px;
    font-weight: 800;
    color: #f8fafc;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .doc-body {
    font-size: 22px;
    line-height: 1.8;
    color: #cbd5e1;
  }
  .typo {
    text-decoration: underline wavy #ff4d6d;
    text-underline-offset: 6px;
    color: #ff4d6d;
    font-weight: 600;
    background: rgba(255, 77, 109, 0.08);
    padding: 0 4px;
    border-radius: 4px;
  }

  /* =========================================================================
     WRITEASSIST FLOATING CORRECTION OVERLAY HUD (PINNED ON TOP)
     ========================================================================= */
  .floating-overlay-container {
    position: absolute;
    top: 70px;
    right: 90px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    animation: floatHUD 4s ease-in-out infinite alternate;
  }
  [dir="rtl"] .floating-overlay-container {
    right: auto;
    left: 90px;
    align-items: flex-start;
  }

  @keyframes floatHUD {
    0% { transform: translateY(0px); }
    100% { transform: translateY(-4px); }
  }

  /* The Main Pill */
  .wa-pill {
    background: rgba(11, 17, 32, 0.94);
    backdrop-filter: blur(16px);
    border: 1.5px solid rgba(59, 130, 246, 0.6);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(37, 99, 235, 0.35);
    border-radius: 999px;
    padding: 8px 18px;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    user-select: none;
    cursor: grab;
  }
  .wa-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 800;
    font-size: 14px;
    color: #60a5fa;
  }
  .wa-app-badge {
    background: rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    font-family: monospace;
    font-size: 12px;
    font-weight: 700;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .wa-status-badge {
    background: rgba(255, 77, 109, 0.18);
    border: 1px solid #ff4d6d;
    color: #ff4d6d;
    font-size: 12px;
    font-weight: 800;
    padding: 3px 12px;
    border-radius: 999px;
    animation: pulseBadge 2s infinite;
  }
  @keyframes pulseBadge {
    50% { opacity: 0.7; }
  }
  .wa-btn {
    background: #2563eb;
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 14px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(37, 99, 235, 0.5);
  }
  .wa-btn-secondary {
    background: rgba(59, 130, 246, 0.15);
    color: #93c5fd;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }

  /* Popover Detail Card Dropping Down From Pill */
  .wa-popover {
    width: 360px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(37, 99, 235, 0.25);
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding-bottom: 10px;
  }
  .popover-title {
    font-size: 13px;
    font-weight: 700;
    color: #38bdf8;
  }
  .popover-desc {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
  }
  .popover-issue {
    background: rgba(255, 77, 109, 0.12);
    border: 1px solid rgba(255, 77, 109, 0.3);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 12px;
    color: #fecdd3;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .popover-issue strong {
    color: #ff4d6d;
  }
  .popover-fix-pill {
    background: #00ff9d;
    color: #022c22;
    font-size: 11px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 6px;
  }
</style>
</head>
<body>
  <div class="desktop-bg"></div>

  <!-- Microsoft Word Background Application Window -->
  <div class="word-window">
    <div class="word-titlebar">
      <div class="mac-traffic">
        <span class="mac-dot dot-red"></span>
        <span class="mac-dot dot-yellow"></span>
        <span class="mac-dot dot-green"></span>
      </div>
      <div class="word-title">${appTitle}</div>
    </div>
    <div class="word-ribbon">
      <span class="ribbon-tab active">${rtl ? "الصفحة الرئيسية" : "Home"}</span>
      <span class="ribbon-tab">${rtl ? "إدراج" : "Insert"}</span>
      <span class="ribbon-tab">${rtl ? "تخطيط" : "Layout"}</span>
      <span class="ribbon-tab">${rtl ? "مراجع" : "References"}</span>
      <span class="ribbon-tab">${rtl ? "مراجعة" : "Review"}</span>
    </div>
    <div class="word-doc">
      <div class="doc-heading">${rtl ? "تقرير الأعمال التنفيذي — نسخة المسودة" : "Executive Briefing — Draft Status"}</div>
      <div class="doc-body">${docText}</div>
    </div>
  </div>

  <!-- WriteAssist Floating Correction Overlay HUD -->
  <div class="floating-overlay-container">
    <div class="wa-pill">
      <div class="wa-logo">
        <svg width="20" height="20" viewBox="0 0 48 48" fill="none">
          <path d="M11 16L17 32L21 21L24 29L27 21L31 32L37 16" stroke="#60a5fa" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="37" cy="13" r="3.5" fill="#facc15"/>
        </svg>
        <span>WriteAssist</span>
      </div>
      <span class="wa-app-badge">${activeAppBadge}</span>
      <span class="wa-status-badge">${issuesBadge}</span>
      <button class="wa-btn">${fixBtn}</button>
      <button class="wa-btn-secondary">${rewriteBtn}</button>
      <button class="wa-btn-secondary">${openBtn}</button>
    </div>

    <!-- Live Popover Inspection Card -->
    <div class="wa-popover">
      <div class="popover-header">
        <span class="popover-title">${cardTitle}</span>
        <span style="font-size:11px; color:#00ff9d; font-weight:700;">● Active</span>
      </div>
      <p class="popover-desc">${cardDesc}</p>
      <div class="popover-issue">
        <span>${suggestion1}</span>
        <span class="popover-fix-pill">Apply</span>
      </div>
      <div class="popover-issue">
        <span>${suggestion2}</span>
        <span class="popover-fix-pill">Apply</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function main() {
  console.log("Launching Puppeteer for Floating Overlay screenshots...");
  const browser = await puppeteer.launch({
    executablePath: "/home/mohamed/.local/bin/google-chrome",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    defaultViewport: {
      width: 1440,
      height: 900,
      deviceScaleFactor: 2,
    },
  });

  const page = await browser.newPage();

  async function captureShot(lang, name) {
    const html = buildHtml(lang);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 300));

    const sitePath = resolve(SHOTS_SITE, `${name}.png`);
    const remotionPath = resolve(SHOTS_REMOTION, `${name}.png`);
    await page.screenshot({ path: sitePath, type: "png" });
    copyFileSync(sitePath, remotionPath);
    console.log(`Saved screenshot: ${name}.png`);
  }

  // 1. English Overlay
  await captureShot("en", "overlay-float-en");

  // 2. Arabic Overlay
  await captureShot("ar", "overlay-float-ar");

  // 3. Isolated Pill Close-up
  const pillElement = await page.$(".wa-pill");
  if (pillElement) {
    const pillSite = resolve(SHOTS_SITE, "overlay-pill.png");
    const pillRemotion = resolve(SHOTS_REMOTION, "overlay-pill.png");
    await pillElement.screenshot({ path: pillSite, type: "png" });
    copyFileSync(pillSite, pillRemotion);
    console.log("Saved screenshot: overlay-pill.png");
  }

  await browser.close();
  console.log("All floating overlay screenshots captured successfully!");
}

main().catch((err) => {
  console.error("Overlay capture failed:", err);
  process.exit(1);
});
