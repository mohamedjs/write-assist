const DEFAULTS = {
  enabled: true, autoCheck: true, disabledSites: [], ltLanguage: 'auto', motherTongue: 'ar', translateTarget: 'en', picky: false,
  engine: 'auto', geminiKey: '', geminiModel: 'gemini-flash-latest', openrouterKey: '', openrouterModel: 'openrouter/auto', orFreeOnly: false, debug: false, ltServer: 'https://api.languagetool.org', ltUser: '', ltApiKey: '', dictionary: []
};
const LANGS = [['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['tr', 'Turkish'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['hi', 'Hindi'], ['ur', 'Urdu']];
const $ = (id) => document.getElementById(id);
let s = { ...DEFAULTS };
let host = '';

if (location.search.includes('page') || window.outerWidth > 500) document.body.classList.add('page');

for (const id of ['motherTongue', 'translateTarget']) for (const [c, n] of LANGS) $(id).append(new Option(n, c));

let savedT;
async function save(patch) {
  Object.assign(s, patch);
  await chrome.storage.sync.set(patch);
  $('saved').classList.add('on');
  clearTimeout(savedT);
  savedT = setTimeout(() => $('saved').classList.remove('on'), 1200);
}

async function init() {
  s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  try { host = tab?.url && /^https?:/.test(tab.url) ? new URL(tab.url).hostname : ''; } catch {}
  $('siteName').textContent = host ? `On ${host}` : 'This page';
  $('siteOn').disabled = !host;
  $('siteOn').checked = host ? !s.disabledSites.includes(host) : false;
  $('enabled').checked = s.enabled;
  for (const id of ['autoCheck', 'picky', 'debug', 'orFreeOnly']) $(id).checked = !!s[id];
  for (const id of ['ltLanguage', 'motherTongue', 'translateTarget', 'engine', 'geminiKey', 'geminiModel', 'openrouterKey', 'openrouterModel', 'ltServer', 'ltUser', 'ltApiKey']) $(id).value = s[id] ?? '';
  $('dictionary').value = (s.dictionary || []).join('\n');
  refreshNano();
  loadOrModels();
}

$('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
$('siteOn').addEventListener('change', (e) => {
  const set = new Set(s.disabledSites);
  e.target.checked ? set.delete(host) : set.add(host);
  save({ disabledSites: [...set] });
});
for (const id of ['autoCheck', 'picky', 'debug']) $(id).addEventListener('change', (e) => save({ [id]: e.target.checked }));
for (const id of ['ltLanguage', 'motherTongue', 'translateTarget', 'engine']) $(id).addEventListener('change', (e) => save({ [id]: e.target.value }));
for (const id of ['geminiKey', 'geminiModel', 'openrouterKey', 'openrouterModel', 'ltServer', 'ltUser', 'ltApiKey']) $(id).addEventListener('change', (e) => save({ [id]: e.target.value.trim() }));
$('dictionary').addEventListener('change', (e) => save({ dictionary: e.target.value.split('\n').map((w) => w.trim()).filter(Boolean) }));

// ----- OpenRouter: model list (public endpoint) + info for the chosen model
let orModels = [];
async function loadOrModels(force) {
  try {
    const { orCache } = await chrome.storage.local.get('orCache');
    if (!force && orCache && Date.now() - orCache.t < 6 * 3600e3) orModels = orCache.list;
    else {
      $('orInfo').textContent = 'Loading model list…';
      const res = await fetch('https://openrouter.ai/api/v1/models');
      const data = await res.json();
      orModels = (data.data || []).map((m) => ({
        id: m.id, name: m.name, ctx: m.context_length,
        free: (+m.pricing?.prompt || 0) === 0 && (+m.pricing?.completion || 0) === 0,
        pin: +m.pricing?.prompt || 0, pout: +m.pricing?.completion || 0
      })).sort((a, b) => a.id.localeCompare(b.id));
      chrome.storage.local.set({ orCache: { t: Date.now(), list: orModels } });
    }
  } catch (e) { $('orInfo').textContent = 'Could not load model list (' + e.message + ') – you can still type a model id.'; return; }
  fillOrModels();
}
function fillOrModels() {
  const list = $('orModels');
  list.replaceChildren();
  for (const m of orModels) if (!s.orFreeOnly || m.free) list.append(new Option(m.name + (m.free ? ' · free' : ''), m.id));
  showOrInfo();
}
function showOrInfo() {
  const id = $('openrouterModel').value.trim();
  const m = orModels.find((x) => x.id === id);
  const shown = s.orFreeOnly ? orModels.filter((x) => x.free).length : orModels.length;
  if (m) $('orInfo').textContent = `${m.name} · ${m.ctx ? Math.round(m.ctx / 1000) + 'k context · ' : ''}${m.free ? 'free' : `$${(m.pin * 1e6).toFixed(2)} in / $${(m.pout * 1e6).toFixed(2)} out per 1M tokens`}`;
  else if (id === 'openrouter/auto' || !id) $('orInfo').textContent = `Auto router picks a model for each request (paid). ${shown} models in the list – click the Model box to choose.`;
  else $('orInfo').textContent = orModels.length ? 'Model id not in the list – check the spelling.' : '';
}
$('openrouterModel').addEventListener('input', showOrInfo);
$('orFreeOnly').addEventListener('change', (e) => { save({ orFreeOnly: e.target.checked }); fillOrModels(); });
$('orReload').addEventListener('click', () => loadOrModels(true));

// ----- Chrome built-in AI (Gemini Nano) status + download (needs a user click)
const LM = () => self.LanguageModel || self.ai?.languageModel || null;
const OPTS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };

function setPill(kind, label, text) {
  $('nanoPill').className = 'pill ' + kind;
  $('nanoPill').textContent = label;
  $('nanoText').textContent = text;
}

async function refreshNano() {
  const lm = LM();
  if (!lm) {
    setPill('no', 'not available', s.geminiKey ? 'On-device AI not in this Chrome – using your Gemini key.' : 'On-device AI not in this Chrome – add a free Gemini key below.');
    return;
  }
  let a;
  try { a = lm.availability ? await lm.availability(OPTS) : (await lm.capabilities()).available; } catch (e) { a = 'unavailable'; }
  a = { readily: 'available', 'after-download': 'downloadable', no: 'unavailable' }[a] || a;
  $('nanoBtn').classList.toggle('hidden', !(a === 'downloadable' || a === 'downloading'));
  if (a === 'available') setPill('ok', 'ready', 'Chrome on-device AI is ready (free, private).');
  else if (a === 'downloadable') setPill('warn', 'not downloaded', 'Click below to download Gemini Nano (~2–4 GB, one time).');
  else if (a === 'downloading') setPill('warn', 'downloading', 'Gemini Nano is downloading…');
  else setPill('no', 'unsupported', 'This device can’t run on-device AI' + (s.geminiKey ? ' – using your Gemini key.' : ' – add a free Gemini key below.'));
}

$('nanoBtn').addEventListener('click', async () => {
  const lm = LM();
  if (!lm) return;
  $('nanoProg').classList.remove('hidden');
  setPill('warn', 'downloading', 'Downloading Gemini Nano… you can close this popup.');
  try {
    const sess = await lm.create({
      ...OPTS,
      monitor(m) { m.addEventListener('downloadprogress', (e) => { $('nanoProg').firstElementChild.style.width = Math.round((e.loaded > 1 ? e.loaded / e.total : e.loaded) * 100) + '%'; }); }
    });
    sess.destroy?.();
    $('nanoProg').classList.add('hidden');
  } catch (e) {
    setPill('no', 'failed', e.message);
    return;
  }
  refreshNano();
});

// ----- Diagnostics: test buttons + API call log
document.querySelectorAll('[data-test]').forEach((b) => b.addEventListener('click', () => {
  const out = $('testOut');
  out.className = 'testout'; out.textContent = 'Testing ' + b.textContent + '…';
  chrome.runtime.sendMessage({ type: 'test', what: b.dataset.test }, (r) => {
    if (chrome.runtime.lastError) r = { ok: false, error: chrome.runtime.lastError.message };
    out.className = 'testout ' + (r?.ok ? 'good' : 'bad');
    out.textContent = r?.ok ? r.data : '✗ ' + (r?.error || 'no response');
    renderCalls();
  });
}));

async function renderCalls() {
  const { calls = [] } = await chrome.storage.session.get('calls').catch(() => ({}));
  const box = $('calls');
  box.replaceChildren();
  if (!calls.length) { box.textContent = 'No API calls yet – type in a text box.'; return; }
  for (const c of calls) {
    const ok = c.status !== 'ERR' && !(c.status >= 400);
    const row = document.createElement('div');
    row.className = 'call ' + (ok ? 'good' : 'bad');
    row.title = c.url;
    row.textContent = `${new Date(c.t).toLocaleTimeString()}  ${c.service}  ${c.status}  ${c.ms}ms  ${c.info || c.error || ''}`;
    box.append(row);
  }
}
chrome.storage.onChanged.addListener((_, area) => { if (area === 'session') renderCalls(); });
$('clearCalls').addEventListener('click', () => chrome.storage.session.set({ calls: [] }));
renderCalls();

init();
