"use strict";

const REPO = "mohamedjs/write-assist";
const STORAGE_PREFIX = "writeassist";

const T = {
  en: {
    "brand.name": "WriteAssist",
    "nav.screenshots": "Screenshots", "nav.download": "Download", "nav.features": "Features", "nav.extension": "Extension", "nav.faq": "FAQ",
    "gallery.title": "Real Screenshots of WriteAssist in Action",
    "gallery.sub": "Explore the real desktop workspace, AI rewrite engine, smart replies, and system diagnostics.",
    "gallery.editor": "Writing Space: LanguageTool grammar detection with click-to-fix suggestions & Accept All",
    "gallery.rewrite": "AI Rewrite: Professional, Friendly, Formal, and Concise tone transformations via OpenRouter",
    "gallery.replies": "Smart Replies: 3 context-aware reply alternatives generated instantly with one-click copy",
    "gallery.translate": "Instant Translation: Seamless bidirectional Arabic ↔ English & multilingual translation",
    "gallery.doctor": "System Diagnostics: Real-time self-test verifying local loopback, LanguageTool & AI engines [PASS]",
    "gallery.popup": "Browser Extension: Native popup with auto-check toggle, on-device AI status & instant shortcuts",
    "hero.title": "Write with total clarity and confidence.",
    "hero.lead": "Free Grammarly-style assistant for your entire operating system and browser: grammar & spell check, AI tone rewrite, smart replies, and instant translation.",
    "hero.download": "Download for {os}", "hero.other": "Other platforms", "hero.badge": "Ready for your OS",
    "hero.version": "Version {v} · Free & Open Source",
    "hero.ext_btn": "Browser Extension",
    "hero.card_title": "Zero Setup Required",
    "hero.card_desc": "Grammar check works immediately out of the box with free tools.",
    "dl.title": "Download WriteAssist", "dl.sub": "Native desktop application and browser extension for every major platform.",
    "dl.yours": "your device", "dl.copy": "Copy", "dl.copied": "Copied",
    "dl.win.req": "Windows 10 or 11, 64-bit", "dl.win.setup": "Download Installer (.exe)", "dl.win.portable": "Portable ZIP (No Install)",
    "dl.win.note": "Windows SmartScreen note: Select More info → Run anyway on first run.",
    "dl.mac.req": "macOS 12 Monterey or later", "dl.mac.arm": "Apple Silicon (M1–M4)", "dl.mac.intel": "Intel Mac (.zip)",
    "dl.linux.req": "Ubuntu, Debian and Linux distros", "dl.linux.deb": "Download .deb (Debian/Ubuntu)", "dl.linux.tar": "Portable .tar.gz (All Distros)",
    "dl.ext.req": "Chrome, Edge, Brave, Opera, Vivaldi", "dl.ext.download": "Download Extension (.zip)", "dl.ext.instructions": "Installation Guide",
    "dl.ext.note": "Works seamlessly in Gmail, Slack, WhatsApp Web, LinkedIn, and everywhere you type.",
    "dl.all": "All releases on GitHub",
    "feat.title": "Everything you need to write better",
    "feat.1.t": "Instant Grammar & Spelling", "feat.1.d": "LanguageTool-powered detection with click-to-fix suggestions and one-click Accept All.",
    "feat.2.t": "AI Tone Rewriter", "feat.2.d": "Rephrase any message into Professional, Casual, Formal, Concise, Confident, or Expanded style.",
    "feat.3.t": "Sentence-by-Sentence Fix", "feat.3.d": "Inspect and correct individual sentences without rewriting your entire message.",
    "feat.4.t": "Bilingual Translation", "feat.4.d": "Seamless Arabic ↔ English translation and multilingual support directly inside your workflow.",
    "feat.5.t": "Smart Reply Suggestions", "feat.5.d": "Generate 3 contextual reply alternatives for emails, chat messages, and inquiries.",
    "feat.6.t": "Privacy-First Architecture", "feat.6.d": "No tracking, no telemetry, customizable LanguageTool endpoint, and personal dictionary.",
    "ext.title": "How to Install the Browser Extension",
    "ext.lead": "Add WriteAssist to any Chromium browser in less than a minute:",
    "ext.step1.t": "Download & Extract", "ext.step1.d": "Download writeassist-extension.zip from above and extract it into a folder on your computer.",
    "ext.step2.t": "Open Extensions Page", "ext.step2.d": "In Chrome, Edge, or Brave, open chrome://extensions and switch on Developer mode (top right).",
    "ext.step3.t": "Load Unpacked", "ext.step3.d": "Click Load unpacked, select the extracted extension folder, and pin the WriteAssist icon!",
    "faq.title": "Frequently Asked Questions",
    "faq.1.q": "Is WriteAssist really free?", "faq.1.a": "Yes, 100%. Grammar checking uses the free public LanguageTool API with zero API keys required. AI rewrites can use Google's free Gemini API key or your own OpenRouter credentials.",
    "faq.2.q": "Can I use both the desktop app and the extension together?", "faq.2.a": "Yes! The desktop app runs as a local background daemon that provides a standalone desktop writing workspace and can serve requests locally.",
    "faq.3.q": "How is my text protected?", "faq.3.a": "Your text is never sold or used to train public models. You can also self-host LanguageTool and point WriteAssist to your private instance in Settings.",
    "foot.made": "Built with modular architecture and care",
  },
  ar: {
    "brand.name": "رايت أسيست",
    "nav.screenshots": "لقطات شاشة", "nav.download": "التحميل", "nav.features": "المميزات", "nav.extension": "إضافة المتصفح", "nav.faq": "الأسئلة الشائعة",
    "gallery.title": "لقطات حقيقية من داخل تطبيق WriteAssist",
    "gallery.sub": "استكشف مساحة الكتابة المكتبية الحقيقية، محرك الصياغة الذكي، الردود المقترحة والفحص التشخيصي.",
    "gallery.editor": "مساحة الكتابة: فحص قواعد دقيق عبر LanguageTool مع اقتراحات فورية وزر لقبول الكل",
    "gallery.rewrite": "إعادة الصياغة: تحويل النبرة إلى احترافية، ودية، رسمية، أو موجزة عبر OpenRouter",
    "gallery.replies": "اقتراح الردود: 3 بدائل ردود ذكية وسياقية مولدة فوراً مع زر نسخ سريع",
    "gallery.translate": "الترجمة الفورية: ترجمة ثنائية دقيقة بين العربية والإنجليزية ومتعددة اللغات",
    "gallery.doctor": "الفحص التشخيصي: فحص ذاتي فوري يؤكد جاهزية الخادم ومحرك اللغة ومفاتيح الذكاء الاصطناعي [PASS]",
    "gallery.popup": "إضافة المتصفح: نافذة كروم المتكاملة مع مفتاح التفعيل التلقائي وحالة الذكاء الاصطناعي",
    "hero.title": "اكتب بثقة ووضوح تام وبدون أخطاء.",
    "hero.lead": "مساعد مجاني شبيه بـ Grammarly لنظام تشغيلك بالكامل والمتصفح: تصحيح القواعد والإملاء، إعادة الصياغة بالذكاء الاصطناعي، اقتراح الردود والترجمة الفورية.",
    "hero.download": "تحميل لنظام {os}", "hero.other": "أنظمة أخرى", "hero.badge": "جاهز لجهازك",
    "hero.version": "إصدار {v} · مجاني ومفتوح المصدر",
    "hero.ext_btn": "إضافة المتصفح",
    "hero.card_title": "جاهز فوراً بدون إعدادات",
    "hero.card_desc": "فحص القواعد والإملاء يعمل فوراً وبشكل مجاني.",
    "dl.title": "تحميل WriteAssist", "dl.sub": "تطبيق سطح مكتب وإضافة متصفح لجميع المنصات الرئيسية.",
    "dl.yours": "جهازك", "dl.copy": "نسخ", "dl.copied": "تم النسخ",
    "dl.win.req": "ويندوز 10 أو 11، 64-bit", "dl.win.setup": "تحميل ملف التثبيت (.exe)", "dl.win.portable": "نسخة محمولة بدون تثبيت (.zip)",
    "dl.win.note": "ملاحظة SmartScreen: اختر More info ثم Run anyway عند أول تشغيل.",
    "dl.mac.req": "macOS 12 أو أحدث", "dl.mac.arm": "معالجات آبل (M1–M4)", "dl.mac.intel": "أجهزة ماك إنتل (.zip)",
    "dl.linux.req": "أوبونتو وديبيان وتوزيعات لينكس", "dl.linux.deb": "تحميل حزمة .deb", "dl.linux.tar": "نسخة محمولة .tar.gz لجميع التوزيعات",
    "dl.ext.req": "كروم، إيدج، بريف، أوبرا، فيفالدي", "dl.ext.download": "تحميل حزمة الإضافة (.zip)", "dl.ext.instructions": "دليل التثبيت",
    "dl.ext.note": "يعمل بسلاسة داخل جيميل، سلاك، واتساب ويب، لينكد إن، وفي كل مكان تكتب فيه.",
    "dl.all": "كل الإصدارات على GitHub",
    "feat.title": "كل ما تحتاجه لتكتب باحترافية",
    "feat.1.t": "فحص فوري للقواعد والإملاء", "feat.1.d": "فحص دقيق مدعوم بـ LanguageTool مع اقتراحات بنقرة زر وقبول جميع التصحيحات دفعة واحدة.",
    "feat.2.t": "إعادة الصياغة بالذكاء الاصطناعي", "feat.2.d": "أعد صياغة أي نص ليكون احترافياً، ودوداً، رسمياً، مختصراً، واثقاً، أو موسعاً.",
    "feat.3.t": "تصحيح جملة بجملة", "feat.3.d": "افحص وصحح جملاً بعينها دون تغيير أسلوب رسالتك بالكامل.",
    "feat.4.t": "ترجمة احترافية ثنائية", "feat.4.d": "ترجمة عربية ↔ إنجليزية وترجمة لغات متعددة داخل مساحة عملك مباشرة.",
    "feat.5.t": "اقتراحات ردود ذكية", "feat.5.d": "توليد 3 بدائل ردود سريعة ومناسبة لرسائل البريد والمحادثات.",
    "feat.6.t": "حماية كاملة للخصوصية", "feat.6.d": "بدون تتبع وبدون إعلانات، مع دعم خوادمك الخاصة وقاموس شخصي لكلماتك.",
    "ext.title": "طريقة تثبيت إضافة المتصفح",
    "ext.lead": "أضف WriteAssist لأي متصفح مبني على كروميوم في أقل من دقيقة:",
    "ext.step1.t": "تحميل وفك الضغط", "ext.step1.d": "حمّل writeassist-extension.zip من الأعلى وفك الضغط عنه في مجلد بجهازك.",
    "ext.step2.t": "فتح صفحة الإضافات", "ext.step2.d": "في كروم أو إيدج أو بريف، افتح chrome://extensions وفعّل Developer mode من أعلى اليمين.",
    "ext.step3.t": "تحميل الإضافة", "ext.step3.d": "اضغط Load unpacked واختر المجلد، ثم ثبّت أيقونة WriteAssist في شريط المتصفح!",
    "faq.title": "الأسئلة الشائعة",
    "faq.1.q": "هل التطبيق مجاني بالفعل؟", "faq.1.a": "نعم 100%. فحص القواعد يعتمد على خادم LanguageTool العام مجاناً. وإعادة الصياغة بالذكاء الاصطناعي تعمل بمفتاح Gemini المجاني أو OpenRouter.",
    "faq.2.q": "هل يمكنني تشغيل تطبيق سطح المكتب وإضافة المتصفح معاً؟", "faq.2.a": "نعم! يعمل تطبيق سطح المكتب كخدمة محلية توفر مساحة كتابة مستقلة وتستطيع تزويد الإضافة بالبيانات محلياً.",
    "faq.3.q": "كيف تتم حماية نصوصي وخصوصيتي؟", "faq.3.a": "نصوصك لا تُباع ولا تُستخدم لتدريب النماذج العامة. كما يمكنك توجيه التطبيق لخادمك الخاص إن أردت.",
    "foot.made": "تم التطوير باهتمام وهندسة برمجية متقدمة",
  }
};

const OS_NAME = { windows: "Windows", macos: "macOS", linux: "Linux", android: "Android" };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let lang = store.get(`${STORAGE_PREFIX}-lang`) || ((navigator.language || "").startsWith("ar") ? "ar" : "en");
let release = null;
const OS = detectOS();

function t(key, vars = {}) {
  let s = (T[lang] && T[lang][key]) || T.en[key] || key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

function detectOS() {
  const ua = navigator.userAgent || "";
  const p = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "mobile";
  if (/win/i.test(p) || /windows/i.test(ua)) return "windows";
  if (/mac/i.test(p) || /mac os x/i.test(ua)) return "macos";
  if (/linux|x11|cros/i.test(p + ua)) return "linux";
  return "windows";
}

const PICK = {
  setup: /-Setup-.*\.exe$/i,
  portable: /windows-x64-portable\.zip$/i,
  "mac-arm": /macos-arm64\.zip$/i,
  "mac-intel": /macos-x86_64\.zip$/i,
  deb: /_amd64\.deb$/i,
  tar: /linux-x86_64\.tar\.gz$/i,
  ext: /-extension\.zip$/i,
  sums: /^SHA256SUMS/i,
};
const HERO_ASSET = { windows: "setup", macos: "mac-arm", linux: "deb" };

async function loadRelease() {
  for (const url of ["release.json", `https://api.github.com/repos/${REPO}/releases/latest`]) {
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.assets) return data;
      }
    } catch {}
  }
  return null;
}

function asset(kind) {
  return release && release.assets.find((a) => PICK[kind] && PICK[kind].test(a.name));
}

function renderDownloads() {
  const fallback = `https://github.com/${REPO}/releases/latest`;
  if ($("#all-releases")) $("#all-releases").href = `https://github.com/${REPO}/releases`;
  if ($("#foot-repo")) $("#foot-repo").href = `https://github.com/${REPO}`;

  $$("[data-asset]").forEach((el) => {
    const a = asset(el.dataset.asset);
    const label = t(el.dataset.i18n);
    el.href = a ? a.browser_download_url : fallback;
    el.innerHTML = "";
    el.append(label);
    if (a) {
      const s = document.createElement("small");
      s.textContent = ` · ${(a.size / 1e6).toFixed(1)} MB`;
      el.append(s);
    }
  });

  const sums = asset("sums");
  if ($("#checksums")) $("#checksums").href = sums ? sums.browser_download_url : fallback;
  const deb = asset("deb");
  if (deb && $("#apt-cmd")) $("#apt-cmd").textContent = `sudo apt install ./${deb.name}`;

  const v = release ? release.tag_name.replace(/^v/, "") : "1.0.0";
  if ($("#hero-version")) {
    $("#hero-version").textContent = t("hero.version", { v });
  }
  if ($("#foot-version")) $("#foot-version").textContent = `v${v}`;

  $$(".platform").forEach((card) => card.classList.toggle("mine", card.dataset.os === OS));
  const hero = $("#hero-download");
  if (hero) {
    if (OS in HERO_ASSET) {
      const a = asset(HERO_ASSET[OS]);
      hero.href = a ? a.browser_download_url : "#download";
      $("#hero-icon").dataset.os = OS;
      $("#hero-icon").hidden = false;
      $("#hero-download-text").textContent = t("hero.download", { os: OS_NAME[OS] });
    } else {
      hero.href = "#download";
      $("#hero-icon").hidden = true;
      $("#hero-download-text").textContent = t("dl.title");
    }
  }
}

function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  $$("[data-i18n]").forEach((el) => {
    if (!el.dataset.asset) el.textContent = t(el.dataset.i18n);
  });
  $$("#lang button").forEach((b) => b.classList.toggle("on", b.dataset.value === lang));
  document.title = `${t("brand.name")} — ${t("hero.title")}`;

  const video = $("#intro");
  if (video) {
    const src = `assets/intro-${lang}.mp4`;
    if (!video.currentSrc || !video.currentSrc.endsWith(src)) {
      video.poster = `assets/intro-${lang}.jpg`;
      const source = video.querySelector("source");
      if (source) source.src = src;
      video.load();
    }
  }

  // Gallery screenshots switching
  if ($("#shot-editor")) $("#shot-editor").src = `assets/shots/editor-${lang}.png`;
  if ($("#shot-rewrite")) $("#shot-rewrite").src = `assets/shots/rewrite-${lang}.png`;
  if ($("#shot-translate")) $("#shot-translate").src = `assets/shots/translate-${lang}.png`;
  if ($("#shot-doctor")) $("#shot-doctor").src = `assets/shots/doctor-${lang}.png`;

  renderDownloads();
}

function applyTheme() {
  const theme = store.get(`${STORAGE_PREFIX}-theme`) || "auto";
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  applyLang();
  $$("#lang button").forEach((b) => (b.onclick = () => {
    lang = b.dataset.value;
    store.set(`${STORAGE_PREFIX}-lang`, lang);
    applyLang();
  }));
  $("#theme").onclick = () => {
    const order = ["auto", "dark", "light"];
    const now = store.get(`${STORAGE_PREFIX}-theme`) || "auto";
    store.set(`${STORAGE_PREFIX}-theme`, order[(order.indexOf(now) + 1) % order.length]);
    applyTheme();
  };
  $$(".copy").forEach((b) => (b.onclick = async () => {
    const code = b.parentElement.querySelector("code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      b.textContent = t("dl.copied");
      setTimeout(() => (b.textContent = t("dl.copy")), 1500);
    } catch {}
  }));
  release = await loadRelease();
  renderDownloads();
});
