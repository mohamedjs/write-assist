"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STATE = {
  lang: localStorage.getItem("writeassist-lang") || (navigator.language.startsWith("ar") ? "ar" : "en"),
  theme: localStorage.getItem("writeassist-theme") || "auto",
  settings: {},
  dictionary: [],
  currentIssues: [],
  selectedTone: "clearer and more concise",
  checkTimeout: null,
};

const I18N = {
  en: {
    "app.name": "WriteAssist",
    "nav.editor": "Writing Space",
    "nav.rewrite": "AI Rewrite",
    "nav.translate": "Translate",
    "nav.replies": "Smart Replies",
    "nav.dictionary": "Dictionary",
    "nav.settings": "Settings",
    "nav.doctor": "Doctor",
    "status.ready": "Ready",
    "btn.check": "Check Grammar",
    "btn.accept_all": "Accept All Fixes",
  },
  ar: {
    "app.name": "رايت أسيست",
    "nav.editor": "مساحة الكتابة",
    "nav.rewrite": "إعادة الصياغة بالذكاء الاصطناعي",
    "nav.translate": "الترجمة",
    "nav.replies": "اقتراح الردود",
    "nav.dictionary": "القاموس الشخصي",
    "nav.settings": "الإعدادات",
    "nav.doctor": "الفحص التشخيصي",
    "status.ready": "جاهز",
    "btn.check": "افحص القواعد",
    "btn.accept_all": "قبول كل التصحيحات",
  }
};

function applyTheme() {
  if (STATE.theme === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = STATE.theme;
  }
  localStorage.setItem("writeassist-theme", STATE.theme);
}

function applyLang() {
  document.documentElement.lang = STATE.lang;
  document.documentElement.dir = STATE.lang === "ar" ? "rtl" : "ltr";
  const strings = I18N[STATE.lang] || I18N.en;
  $$("[data-i18n]").forEach(el => {
    const k = el.dataset.i18n;
    if (strings[k]) el.textContent = strings[k];
  });
  $("#btn-lang").textContent = STATE.lang === "ar" ? "English" : "عربي";
  localStorage.setItem("writeassist-lang", STATE.lang);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadSettings() {
  try {
    const data = await api("/api/settings");
    STATE.settings = data;
    $("#setting-lt-server").value = data.lt_server || "";
    $("#setting-ai-provider").value = data.ai_provider || "auto";
    $("#setting-gemini-key").value = data.gemini_key || "";
    $("#setting-gemini-model").value = data.gemini_model || "gemini-2.5-flash";
    $("#setting-openrouter-key").value = data.openrouter_key || "";
    $("#setting-port").value = data.port || 43817;
    $("#setting-autostart").checked = !!data.start_at_login;
  } catch (err) {
    console.warn("Could not load settings:", err);
  }
}

async function loadDictionary() {
  try {
    const res = await api("/api/dictionary");
    STATE.dictionary = res.words || [];
    renderDictionary();
  } catch (err) {
    console.warn("Could not load dictionary:", err);
  }
}

function renderDictionary() {
  const container = $("#dict-list");
  if (!container) return;
  container.innerHTML = "";
  if (STATE.dictionary.length === 0) {
    container.innerHTML = `<span style="color:var(--muted); font-size:0.9rem;">No custom words added yet.</span>`;
    return;
  }
  STATE.dictionary.forEach(word => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "0.5rem";
    chip.innerHTML = `${word} <button style="background:none; border:none; color:inherit; cursor:pointer;" data-del="${word}">✕</button>`;
    container.appendChild(chip);
  });
}

async function checkGrammar() {
  const text = $("#main-editor").value;
  if (!text.trim()) {
    STATE.currentIssues = [];
    renderIssues();
    return;
  }

  $("#daemon-dot").className = "dot busy";
  $("#daemon-status").textContent = STATE.lang === "ar" ? "جاري الفحص..." : "Checking...";

  try {
    const res = await api("/api/check", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
    STATE.currentIssues = res.matches || [];
    renderIssues();
  } catch (err) {
    console.error("Check failed:", err);
  } finally {
    $("#daemon-dot").className = "dot";
    $("#daemon-status").textContent = STATE.lang === "ar" ? "جاهز" : "Ready";
  }
}

function renderIssues() {
  const panel = $("#issues-panel");
  const summary = $("#issues-summary");
  const count = STATE.currentIssues.length;

  summary.textContent = `${count} ${count === 1 ? "issue" : "issues"} detected`;

  if (count === 0) {
    panel.innerHTML = `<div class="card" style="text-align:center; color:var(--muted); padding:2rem 1rem;">
      🎉 No grammar or spelling issues detected.
    </div>`;
    return;
  }

  panel.innerHTML = "";
  const text = $("#main-editor").value;

  STATE.currentIssues.forEach((issue, idx) => {
    const originalWord = text.substring(issue.offset, issue.offset + issue.length);
    const card = document.createElement("div");
    card.className = `card issue-card ${issue.issue_type}`;

    const reps = (issue.replacements || []).slice(0, 4);
    const chipsHtml = reps.map(r => `<button class="chip" data-idx="${idx}" data-val="${r}">${r}</button>`).join(" ");

    card.innerHTML = `
      <div class="issue-header">
        <span>${issue.issue_type.toUpperCase()}</span>
        <button class="btn-small" style="padding:0.15rem 0.4rem;" data-dict="${originalWord}">+ Dict</button>
      </div>
      <div class="issue-text">${issue.message}</div>
      <div style="font-size:0.85rem; color:var(--muted);">"${originalWord}"</div>
      <div class="replacements">${chipsHtml || '<span style="font-size:0.8rem; color:var(--muted);">No direct replacement</span>'}</div>
    `;
    panel.appendChild(card);
  });
}

function applyReplacement(idx, replacement) {
  const issue = STATE.currentIssues[idx];
  if (!issue) return;
  const textarea = $("#main-editor");
  const text = textarea.value;
  const before = text.substring(0, issue.offset);
  const after = text.substring(issue.offset + issue.length);
  textarea.value = before + replacement + after;
  checkGrammar();
}

function acceptAllFixes() {
  if (STATE.currentIssues.length === 0) return;
  const textarea = $("#main-editor");
  let text = textarea.value;

  // Apply fixes from end to beginning to preserve character offsets!
  const sorted = [...STATE.currentIssues].sort((a, b) => b.offset - a.offset);
  sorted.forEach(issue => {
    if (issue.replacements && issue.replacements.length > 0) {
      const best = issue.replacements[0];
      text = text.substring(0, issue.offset) + best + text.substring(issue.offset + issue.length);
    }
  });

  textarea.value = text;
  checkGrammar();
}

// Event Listeners Initialization
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  applyLang();
  loadSettings();
  loadDictionary();

  // Navigation Tabs
  $$(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".nav-item").forEach(b => b.classList.remove("active"));
      $$(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.tab;
      const pane = $(`#${target}`);
      if (pane) pane.classList.add("active");
      const title = btn.querySelector("span").textContent;
      $("#current-title").textContent = title;
    });
  });

  // Theme & Lang Toggles
  $("#btn-theme").addEventListener("click", () => {
    const cycle = ["auto", "dark", "light"];
    STATE.theme = cycle[(cycle.indexOf(STATE.theme) + 1) % cycle.length];
    applyTheme();
  });

  $("#btn-lang").addEventListener("click", () => {
    STATE.lang = STATE.lang === "en" ? "ar" : "en";
    applyLang();
  });

  // Editor typing debouncing
  $("#main-editor").addEventListener("input", () => {
    const text = $("#main-editor").value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $("#editor-counts").textContent = `${words} words · ${text.length} characters`;

    clearTimeout(STATE.checkTimeout);
    STATE.checkTimeout = setTimeout(checkGrammar, 500);
  });

  $("#btn-check-grammar").addEventListener("click", checkGrammar);
  $("#btn-accept-all").addEventListener("click", acceptAllFixes);

  // Replacement clicks & Add to Dictionary
  $("#issues-panel").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (chip && chip.dataset.idx !== undefined) {
      applyReplacement(parseInt(chip.dataset.idx, 10), chip.dataset.val);
      return;
    }
    const dictBtn = e.target.closest("[data-dict]");
    if (dictBtn) {
      const word = dictBtn.dataset.dict;
      api("/api/dictionary/add", { method: "POST", body: JSON.stringify({ word }) })
        .then(res => {
          STATE.dictionary = res.words || [];
          renderDictionary();
          checkGrammar();
        });
    }
  });

  // AI Rewrite Tone Selector
  $$(".tone-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      $$(".tone-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      STATE.selectedTone = btn.dataset.tone;
    });
  });

  $("#btn-run-rewrite").addEventListener("click", async () => {
    const text = $("#rewrite-input").value;
    if (!text.trim()) return;
    $("#btn-run-rewrite").disabled = true;
    $("#btn-run-rewrite").textContent = "Rewriting...";
    try {
      const res = await api("/api/rewrite", {
        method: "POST",
        body: JSON.stringify({ text, tone: STATE.selectedTone }),
      });
      $("#rewrite-output").value = res.rewritten_text || "";
    } catch (err) {
      $("#rewrite-output").value = "Failed: " + err.message;
    } finally {
      $("#btn-run-rewrite").disabled = false;
      $("#btn-run-rewrite").textContent = "Rewrite with AI";
    }
  });

  $("#btn-copy-rewrite").addEventListener("click", () => {
    const text = $("#rewrite-output").value;
    if (text) {
      navigator.clipboard.writeText(text);
      $("#btn-copy-rewrite").textContent = "Copied!";
      setTimeout(() => $("#btn-copy-rewrite").textContent = "Copy Result", 1500);
    }
  });

  // Translation
  $("#btn-run-translate").addEventListener("click", async () => {
    const text = $("#translate-input").value;
    const target = $("#translate-target").value;
    if (!text.trim()) return;
    $("#btn-run-translate").disabled = true;
    try {
      const res = await api("/api/translate", {
        method: "POST",
        body: JSON.stringify({ text, target }),
      });
      $("#translate-output").value = res.translated_text || "";
    } catch (err) {
      $("#translate-output").value = "Translation error: " + err.message;
    } finally {
      $("#btn-run-translate").disabled = false;
    }
  });

  // Smart Replies
  $("#btn-generate-replies").addEventListener("click", async () => {
    const context = $("#reply-context").value;
    if (!context.trim()) return;
    const container = $("#replies-container");
    container.innerHTML = `<span style="color:var(--muted)">Thinking of 3 smart responses...</span>`;
    try {
      const res = await api("/api/reply", {
        method: "POST",
        body: JSON.stringify({ context }),
      });
      container.innerHTML = "";
      (res.suggestions || []).forEach(reply => {
        const item = document.createElement("div");
        item.className = "card";
        item.style.display = "flex";
        item.style.justifyContent = "space-between";
        item.style.alignItems = "center";
        item.innerHTML = `
          <span>${reply}</span>
          <button class="btn btn-secondary btn-small" data-copy-reply="${encodeURIComponent(reply)}">Copy</button>
        `;
        container.appendChild(item);
      });
    } catch (err) {
      container.innerHTML = `<span style="color:var(--danger)">Failed to generate replies: ${err.message}</span>`;
    }
  });

  $("#replies-container").addEventListener("click", e => {
    const copyBtn = e.target.closest("[data-copy-reply]");
    if (copyBtn) {
      const text = decodeURIComponent(copyBtn.dataset.copyReply);
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => copyBtn.textContent = "Copy", 1500);
    }
  });

  // Dictionary Tab
  $("#btn-dict-add").addEventListener("click", async () => {
    const word = $("#dict-input").value.trim();
    if (!word) return;
    const res = await api("/api/dictionary/add", { method: "POST", body: JSON.stringify({ word }) });
    STATE.dictionary = res.words || [];
    $("#dict-input").value = "";
    renderDictionary();
  });

  $("#dict-list").addEventListener("click", async e => {
    const delBtn = e.target.closest("[data-del]");
    if (delBtn) {
      const word = delBtn.dataset.del;
      const res = await api("/api/dictionary/remove", { method: "POST", body: JSON.stringify({ word }) });
      STATE.dictionary = res.words || [];
      renderDictionary();
    }
  });

  // Settings Modal
  $("#btn-settings").addEventListener("click", () => $("#modal-settings").classList.add("open"));
  $("#btn-close-settings").addEventListener("click", () => $("#modal-settings").classList.remove("open"));
  $("#btn-cancel-settings").addEventListener("click", () => $("#modal-settings").classList.remove("open"));

  $("#btn-save-settings").addEventListener("click", async () => {
    const updates = {
      lt_server: $("#setting-lt-server").value,
      ai_provider: $("#setting-ai-provider").value,
      gemini_key: $("#setting-gemini-key").value,
      gemini_model: $("#setting-gemini-model").value,
      openrouter_key: $("#setting-openrouter-key").value,
      port: parseInt($("#setting-port").value, 10) || 43817,
      start_at_login: $("#setting-autostart").checked,
    };
    try {
      const saved = await api("/api/settings", { method: "POST", body: JSON.stringify(updates) });
      STATE.settings = saved;
      $("#modal-settings").classList.remove("open");
    } catch (err) {
      alert("Failed to save settings: " + err.message);
    }
  });

  // Diagnostics (Doctor) Modal
  async function runDoctorDiagnostics() {
    const container = $("#doctor-results");
    container.innerHTML = `<p style="color:var(--muted)">Checking system and external APIs...</p>`;
    try {
      const res = await api("/api/doctor");
      let html = '<div style="display:flex; flex-direction:column; gap:0.75rem;">';
      (res.checks || []).forEach(chk => {
        const isOk = chk.status === "PASS";
        const badgeClass = isOk ? "var(--success)" : "var(--danger)";
        html += `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <strong>${chk.name}</strong>
              <div style="font-size:0.85rem; color:var(--muted);">${chk.detail || ""}</div>
            </div>
            <span style="font-weight:700; color:${badgeClass};">[${chk.status}]</span>
          </div>
        `;
      });
      html += '</div>';
      container.innerHTML = html;
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger)">Doctor failed: ${err.message}</p>`;
    }
  }

  $("#btn-doctor").addEventListener("click", () => {
    $("#modal-doctor").classList.add("open");
    runDoctorDiagnostics();
  });
  $("#btn-rerun-doctor").addEventListener("click", runDoctorDiagnostics);
  $("#btn-close-doctor").addEventListener("click", () => $("#modal-doctor").classList.remove("open"));
  $("#btn-dismiss-doctor").addEventListener("click", () => $("#modal-doctor").classList.remove("open"));
});
