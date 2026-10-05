// Runs inside an offscreen extension page so Chrome's built-in AI APIs are available.
// Prompt API (Gemini Nano), Translator API, Language Detector API — all free & on-device.

const LM = () => self.LanguageModel || self.ai?.languageModel || null;
let session = null;
const translators = new Map();
let detector = null;

async function nanoStatus() {
  const lm = LM();
  if (!lm) return { status: 'unavailable', detail: 'Prompt API not present in this Chrome version' };
  try {
    const a = lm.availability
      ? await lm.availability({ expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] })
      : (await lm.capabilities()).available;
    // values: 'available' | 'downloadable' | 'downloading' | 'unavailable' (old: 'readily' | 'after-download' | 'no')
    const map = { readily: 'available', 'after-download': 'downloadable', no: 'unavailable' };
    return { status: map[a] || a };
  } catch (e) {
    return { status: 'unavailable', detail: e.message };
  }
}

async function getSession() {
  if (session) return session;
  const lm = LM();
  if (!lm) throw new Error('Built-in AI not available in this Chrome');
  const st = await nanoStatus();
  if (st.status !== 'available') throw new Error('Gemini Nano model is ' + st.status + ' (open WriteAssist popup → "Download on-device AI")');
  session = await lm.create({
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
    initialPrompts: [{ role: 'system', content: 'You are a precise writing assistant. Follow the instructions exactly and output only what is asked.' }]
  });
  return session;
}

async function prompt(text) {
  const base = await getSession();
  // clone so every request starts from a clean context
  const s = base.clone ? await base.clone() : base;
  try {
    return await s.prompt(text);
  } finally {
    if (s !== base) s.destroy?.();
  }
}

async function detect(text) {
  if (!self.LanguageDetector) return null;
  if (!detector) detector = await self.LanguageDetector.create();
  const r = await detector.detect(text);
  return r?.[0]?.detectedLanguage || null;
}

async function translate({ text, target, source, fallbackTarget }) {
  if (!self.Translator) throw new Error('Translator API not available');
  source = source || (await detect(text));
  if (!source || source === 'und') throw new Error('Could not detect language');
  if (source.split('-')[0] === target.split('-')[0] && fallbackTarget && fallbackTarget !== target) target = fallbackTarget;
  if (source.split('-')[0] === target.split('-')[0]) return { text, source, target };
  const key = source + '>' + target;
  if (!translators.has(key)) {
    const a = await self.Translator.availability({ sourceLanguage: source, targetLanguage: target });
    if (a !== 'available') throw new Error('Translation model ' + key + ' is ' + a);
    translators.set(key, await self.Translator.create({ sourceLanguage: source, targetLanguage: target }));
  }
  const out = await translators.get(key).translate(text);
  return { text: out, source, target };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return false;
  (async () => {
    if (msg.type === 'status') return nanoStatus();
    if (msg.type === 'prompt') return { text: await prompt(msg.prompt) };
    if (msg.type === 'translate') return translate(msg);
    throw new Error('unknown offscreen request');
  })().then(sendResponse, (e) => {
    if (/destroyed|session/i.test(e.message)) session = null;
    sendResponse({ error: e.message || String(e) });
  });
  return true;
});
