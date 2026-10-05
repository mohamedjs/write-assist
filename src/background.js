// WriteAssist service worker: routes requests from content scripts to free services.
//  - Grammar/spelling: LanguageTool public API (free, no key)
//  - AI (rewrite / fix / replies): Chrome built-in Gemini Nano (offscreen doc) -> fallback free Gemini API key
//  - Translation: Chrome built-in Translator API (offscreen doc) -> fallback Google Translate free endpoint

const DEFAULTS = {
  enabled: true,
  autoCheck: true,
  disabledSites: [],
  ltLanguage: 'auto',
  motherTongue: 'ar',
  translateTarget: 'en',
  picky: false,
  engine: 'auto', // auto | nano | gemini
  geminiKey: '',
  geminiModel: 'gemini-flash-latest',
  debug: false,
  ltServer: 'https://api.languagetool.org',
  ltUser: '',
  ltApiKey: '',
  dictionary: []
};

async function getSettings() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  const cur = await chrome.storage.sync.get(null);
  await chrome.storage.sync.set({ ...DEFAULTS, ...cur });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'wa-translate', title: 'WriteAssist: Translate selection', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'wa-fix', title: 'WriteAssist: Fix grammar of selection', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'wa-reply', title: 'WriteAssist: Suggest replies to this', contexts: ['selection'] });
  });
  if (details.reason === 'install') chrome.runtime.openOptionsPage?.();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const map = { 'wa-translate': 'translate', 'wa-fix': 'fix', 'wa-reply': 'reply' };
  chrome.tabs.sendMessage(tab.id, { type: 'menu', action: map[info.menuItemId], text: info.selectionText }, { frameId: info.frameId ?? 0 }).catch(() => {});
});

chrome.commands.onCommand.addListener(async (name) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'command', name }).catch(() => {});
});

// ---------------------------------------------------------------- API call log (shown in popup → Diagnostics)
async function logCall(entry) {
  try {
    const { calls = [] } = await chrome.storage.session.get('calls');
    calls.unshift({ t: Date.now(), ...entry });
    await chrome.storage.session.set({ calls: calls.slice(0, 40) });
  } catch {}
  const s = await chrome.storage.sync.get({ debug: false });
  if (s.debug) console.log('[WriteAssist]', entry.service, entry.status, entry.ms + 'ms', entry.info || entry.error || '');
}

async function timed(service, url, fn) {
  const t0 = Date.now();
  try {
    const { res, info } = await fn();
    logCall({ service, url, status: res?.status ?? 'ok', ms: Date.now() - t0, info });
    return res;
  } catch (e) {
    logCall({ service, url, status: 'ERR', ms: Date.now() - t0, error: e.message });
    throw e;
  }
}

// ---------------------------------------------------------------- LanguageTool
const ltCache = new Map();
let ltLast = 0;
const LT_MIN_GAP = 3100; // public API: 20 requests / minute

async function checkGrammar(text, langOverride) {
  const s = await getSettings();
  text = text.slice(0, 18000);
  const lang = langOverride || s.ltLanguage || 'auto';
  const key = lang + '|' + s.picky + '|' + text;
  if (ltCache.has(key)) return ltCache.get(key);

  const wait = ltLast + LT_MIN_GAP - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  ltLast = Date.now();

  const body = new URLSearchParams({ text, language: lang });
  if (lang === 'auto') body.set('preferredVariants', 'en-US,de-DE,pt-BR,ca-ES');
  if (s.motherTongue) body.set('motherTongue', s.motherTongue);
  if (s.picky) body.set('level', 'picky');
  if (s.ltUser && s.ltApiKey) { body.set('username', s.ltUser); body.set('apiKey', s.ltApiKey); }

  const server = (s.ltServer || DEFAULTS.ltServer).replace(/\/+$/, '');
  let data;
  await timed('LanguageTool', server + '/v2/check', async () => {
    const res = await fetch(server + '/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    });
    if (res.status === 429) throw new Error('LanguageTool rate limit reached – wait a few seconds.');
    if (!res.ok) throw new Error('LanguageTool HTTP ' + res.status + ': ' + (await res.text()).slice(0, 200));
    data = await res.json();
    return { res, info: `${text.length} chars → ${(data.matches || []).length} issues (${data.language?.detectedLanguage?.code || lang})` };
  });
  const dict = new Set((s.dictionary || []).map((w) => w.toLowerCase()));
  const matches = (data.matches || [])
    .map((m) => ({
      offset: m.offset,
      length: m.length,
      message: m.message,
      shortMessage: m.shortMessage || '',
      replacements: (m.replacements || []).slice(0, 5).map((r) => r.value),
      ruleId: m.rule?.id,
      category: m.rule?.category?.id || '',
      issueType: m.rule?.issueType || 'grammar',
      word: text.substr(m.offset, m.length)
    }))
    .filter((m) => !(m.issueType === 'misspelling' && dict.has(m.word.toLowerCase())));
  const out = { matches, language: data.language?.detectedLanguage?.code || data.language?.code || lang };
  ltCache.set(key, out);
  if (ltCache.size > 60) ltCache.delete(ltCache.keys().next().value);
  return out;
}

// ---------------------------------------------------------------- Offscreen (Chrome built-in AI)
let creatingOffscreen = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL('src/offscreen.html');
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (ctx.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url,
      reasons: ['DOM_PARSER'],
      justification: 'Run Chrome built-in on-device AI (Prompt, Translator, Language Detector APIs).'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function offscreen(msg, timeoutMs = 60000) {
  await ensureOffscreen();
  const p = chrome.runtime.sendMessage({ target: 'offscreen', ...msg });
  const t = new Promise((_, rej) => setTimeout(() => rej(new Error('On-device AI timed out')), timeoutMs));
  const r = await Promise.race([p, t]);
  if (!r) throw new Error('No response from on-device AI');
  if (r.error) throw new Error(r.error);
  return r;
}

// ---------------------------------------------------------------- Gemini API (free tier key)
const FALLBACK_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-lite-latest'];

async function gemini(prompt, { json = false } = {}) {
  const s = await getSettings();
  if (!s.geminiKey) throw new Error('No Gemini API key set');
  const models = [s.geminiModel || DEFAULTS.geminiModel, ...FALLBACK_MODELS.filter((m) => m !== s.geminiModel)];
  let lastErr;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try {
      let out;
      await timed('Gemini (' + model + ')', url, async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) }
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { const e = new Error(`HTTP ${res.status}: ${data.error?.message || res.statusText}`); e.status = res.status; throw e; }
        out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (!out) throw new Error('Empty answer (finishReason: ' + (data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || '?') + ')');
        return { res, info: out.length + ' chars' };
      });
      if (model !== s.geminiModel) chrome.storage.sync.set({ geminiModel: model }); // remember the model that works
      return out;
    } catch (e) {
      lastErr = e;
      if (!(e.status === 404 || /not found|not supported/i.test(e.message))) break; // only try another model if this one doesn't exist
    }
  }
  throw new Error('Gemini: ' + lastErr.message);
}

// ---------------------------------------------------------------- AI tasks
const TONES = {
  formal: 'more formal and polished',
  friendly: 'warmer and friendlier',
  shorter: 'shorter and more concise',
  clearer: 'clearer and easier to understand',
  professional: 'professional, suitable for a work email or message',
  confident: 'more confident and direct',
  longer: 'more detailed (expand it a little)'
};

function buildPrompt(task, { text, tone, context, intent, lang }) {
  const rule = 'Return ONLY the resulting text. No quotes, no explanations, no preamble.';
  switch (task) {
    case 'fix':
      return `Correct all grammar, spelling, punctuation and word-choice mistakes in the text below. Keep the original meaning, tone, language and formatting (line breaks, emojis, @mentions, links). ${rule}\n\nText:\n${text}`;
    case 'rewrite':
      return `Rewrite the text below to be ${TONES[tone] || TONES.clearer}. Fix any grammar mistakes too. Keep the same language and meaning; keep @mentions, links and emojis. ${rule}\n\nText:\n${text}`;
    case 'reply': {
      const langLine = lang ? `Write the replies in ${lang}.` : 'Write the replies in the same language as the message.';
      return `You help a busy professional answer messages and emails. Suggest 3 different reply options to the message below: one short, one medium, one more detailed. Natural, polite and correct English grammar if English. ${langLine}${intent ? ` The user wants the reply to: ${intent}.` : ''}${text ? ` Base it on the user's draft: "${text}".` : ''}\nOutput a JSON array of 3 strings and nothing else.\n\nMessage to reply to:\n${context}`;
    }
    case 'compose':
      return `Write a clear, well-written message based on these notes/instructions: "${intent || text}". ${context ? `It is a reply to this message:\n${context}\n` : ''}${rule}`;
    default:
      throw new Error('Unknown AI task ' + task);
  }
}

function cleanText(out) {
  return String(out || '').replace(/^```[a-z]*\n?|```$/g, '').replace(/^"([\s\S]*)"$/, '$1').trim();
}

function parseList(out) {
  out = String(out || '').replace(/```(json)?/g, '').trim();
  const a = out.indexOf('['), b = out.lastIndexOf(']');
  if (a !== -1 && b > a) {
    try {
      const arr = JSON.parse(out.slice(a, b + 1));
      if (Array.isArray(arr)) return arr.map((x) => (typeof x === 'string' ? x : x.text || x.reply || JSON.stringify(x))).filter(Boolean);
    } catch {}
  }
  return out.split(/\n\s*(?:\d+[.)]|[-*•])\s+/).map((x) => x.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, '').trim()).filter(Boolean).slice(0, 3);
}

async function runAI(task, payload) {
  const s = await getSettings();
  const prompt = buildPrompt(task, payload);
  const json = task === 'reply';
  const order = s.engine === 'nano' ? ['nano'] : s.engine === 'gemini' ? ['gemini'] : ['nano', 'gemini'];
  if (s.engine === 'auto' && s.geminiKey && (payload.text || payload.context || '').length > 3000) order.reverse();
  const errors = [];
  for (const eng of order) {
    try {
      let out;
      if (eng === 'nano') {
        await timed('Chrome on-device AI', 'LanguageModel.prompt()', async () => {
          out = (await offscreen({ type: 'prompt', prompt })).text;
          return { res: { status: 'ok' }, info: (out || '').length + ' chars' };
        });
      }
      else out = await gemini(prompt, { json });
      if (!out) throw new Error('empty answer');
      return { engine: eng, result: json ? parseList(out) : cleanText(out) };
    } catch (e) {
      errors.push(`${eng === 'nano' ? 'Chrome built-in AI' : 'Gemini API'}: ${e.message}`);
    }
  }
  throw new Error(errors.join(' | ') + (s.geminiKey ? '' : ' — Tip: add a free Gemini API key in WriteAssist settings.'));
}

// ---------------------------------------------------------------- Translation
async function translate(text, target, source) {
  const s = await getSettings();
  target = target || s.translateTarget || 'en';
  try {
    const r = await offscreen({ type: 'translate', text, target, source, fallbackTarget: s.motherTongue }, 30000);
    return { ...r, engine: 'chrome' };
  } catch (e) {
    // Google Translate free endpoint (no key)
    const call = async (tl) => {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source || 'auto'}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
      let data;
      await timed('Google Translate', url.split('&q=')[0], async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Google Translate HTTP ' + res.status);
        data = await res.json();
        return { res, info: `${data[2]} → ${tl}` };
      });
      return { text: (data[0] || []).map((x) => x[0]).join(''), source: data[2] };
    };
    let r = await call(target);
    if (!source && r.source && r.source.split('-')[0] === target.split('-')[0] && s.motherTongue && s.motherTongue !== target) {
      target = s.motherTongue;
      r = await call(target);
    }
    return { ...r, target, engine: 'google' };
  }
}

// ---------------------------------------------------------------- Message router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  const handle = async () => {
    switch (msg.type) {
      case 'settings': return getSettings();
      case 'check': return checkGrammar(msg.text, msg.language);
      case 'ai': return runAI(msg.task, msg);
      case 'translate': return translate(msg.text, msg.target, msg.source);
      case 'test': {
        if (msg.what === 'grammar') { const r = await checkGrammar('I has a apple and she go to scool yesterday. ' + Date.now()); return `OK – ${r.matches.length} issues found: ` + r.matches.map((m) => `${m.word}→${m.replacements[0] ?? '?'}`).join(', '); }
        if (msg.what === 'ai') { const r = await runAI('fix', { text: 'i has a apple and she go to scool yesterday' }); return `OK (${r.engine === 'nano' ? 'on-device' : 'Gemini'}) – “${r.result}”`; }
        if (msg.what === 'translate') { const r = await translate('صباح الخير يا صديقي', 'en'); return `OK (${r.engine}) – “${r.text}”`; }
        return null;
      }
      case 'nano-status': return offscreen({ type: 'status' }, 10000).catch((e) => ({ status: 'unavailable', detail: e.message }));
      case 'add-word': {
        const s = await getSettings();
        const dict = Array.from(new Set([...(s.dictionary || []), msg.word])).slice(-500);
        await chrome.storage.sync.set({ dictionary: dict });
        ltCache.clear();
        return { ok: true };
      }
      default: return null;
    }
  };
  if (!['settings', 'check', 'ai', 'translate', 'nano-status', 'add-word', 'test'].includes(msg.type)) return false;
  handle().then((r) => sendResponse({ ok: true, data: r }), (e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true;
});
