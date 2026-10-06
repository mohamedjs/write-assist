// WriteAssist content script: Grammarly-style underlines, suggestion cards,
// a writing panel (fix / rewrite / reply / translate) and a selection toolbar.
(() => {
  if (window.__WA_LOADED) return;
  window.__WA_LOADED = true;
  const TM = window.__WA_TM;

  // ----------------------------------------------------------------- settings & messaging
  let settings = { enabled: true, autoCheck: true, disabledSites: [], translateTarget: 'en', motherTongue: 'ar' };
  const siteOff = () => !settings.enabled || (settings.disabledSites || []).includes(location.hostname);

  function send(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!r) return reject(new Error('No response from extension'));
          r.ok ? resolve(r.data) : reject(new Error(r.error));
        });
      } catch (e) {
        reject(new Error('Extension was updated – reload this page.'));
      }
    });
  }

  send({ type: 'settings' }).then((s) => { settings = s; if (siteOff()) deactivate(); }).catch(() => {});
  chrome.storage?.onChanged.addListener(() => send({ type: 'settings' }).then((s) => { settings = s; if (siteOff()) { deactivate(); hidePanel(); } }).catch(() => {}));

  // ----------------------------------------------------------------- DOM helpers
  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
    return e;
  }
  const log = (...a) => { if (settings.debug) console.log('%c[WriteAssist]', 'color:#7c3aed;font-weight:bold', ...a); };
  const noFocus = (e) => e.preventDefault(); // keep focus/selection in the editor
  const BULB = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '13'); svg.setAttribute('height', '13');
    svg.innerHTML = '<path fill="currentColor" d="M12 2a7 7 0 0 0-4 12.75V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.25A7 7 0 0 0 12 2zm-3 18h6v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1z"/>';
    return svg;
  };

  // ----------------------------------------------------------------- shadow UI
  let host, root, layer, badge, card, panel, selbar, toastEl;
  function ensureUI() {
    if (host?.isConnected) return;
    host = document.createElement('wa-root');
    host.setAttribute('data-wa-ignore', '');
    host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    root = host.attachShadow({ mode: 'open' });
    root.append(h('style', { text: CSS }));
    layer = h('div', { class: 'layer' });
    // Grammarly-style pill in the top-right of the message box: [💡 AI suggestions] [W logo + count]
    badge = h('div', { class: 'badge hidden', onmousedown: noFocus },
      h('button', { class: 'bulb', title: 'Rewrite / reply / translate with AI', onclick: () => togglePanel('rewrite') }, BULB()),
      h('button', { class: 'g', title: 'WriteAssist', onclick: () => togglePanel('fix') }, h('span', { class: 'gl' }, 'W'), h('span', { class: 'count hidden' })));
    card = h('div', { class: 'card hidden', onmousedown: (e) => { if (e.target.closest('button')) e.preventDefault(); }, onmouseenter: () => clearTimeout(cardHideT), onmouseleave: () => hideCardSoon() });
    panel = h('div', { class: 'panel hidden', dir: 'auto' });
    selbar = h('div', { class: 'selbar hidden', onmousedown: noFocus });
    toastEl = h('div', { class: 'toast hidden' });
    root.append(layer, badge, card, panel, selbar, toastEl);
    (document.documentElement || document.body).appendChild(host);
  }
  // true if node is our host or anywhere inside our shadow root (contains() can't see into shadow DOM)
  const inUI = (n) => {
    while (n && host) {
      if (n === host) return true;
      const r = n.getRootNode?.();
      if (r === root) return true;
      n = r && r.host ? r.host : null;
    }
    return false;
  };

  let toastT;
  function toast(msg, kind = '') {
    ensureUI();
    toastEl.className = 'toast ' + kind;
    toastEl.textContent = msg;
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.add('hidden'), kind === 'err' ? 6000 : 2500);
  }

  // ----------------------------------------------------------------- state
  const S = { el: null, lastEl: null, text: '', matches: [], status: 'idle', error: '', lang: '', reqId: 0, timer: null, boxes: [] };
  const ignored = new Set();
  const memo = new WeakMap();
  const keyOf = (m) => m.ruleId + '|' + m.word;

  function activate(el) {
    if (S.el === el) return;
    if (S.el) memo.set(S.el, { text: S.text, matches: S.matches, lang: S.lang });
    ensureUI();
    S.el = el; S.lastEl = el;
    const cur = TM.getText(el).text;
    const prev = memo.get(el);
    S.matches = prev ? adjust(prev.matches, prev.text, cur) : [];
    S.text = cur; S.lang = prev?.lang || '';
    S.status = prev ? 'done' : 'idle'; S.error = '';
    render();
    if (settings.autoCheck) scheduleCheck(prev && prev.text === cur ? null : 300);
  }

  function deactivate() {
    if (S.el) memo.set(S.el, { text: S.text, matches: S.matches, lang: S.lang });
    S.el = null;
    clearTimeout(S.timer);
    if (!host) return;
    layer.replaceChildren();
    badge.classList.add('hidden');
    hideCard();
  }

  // shift/drop matches after an edit (common prefix/suffix diff)
  function adjust(matches, oldT, newT) {
    if (oldT === newT) return matches.slice();
    let p = 0;
    const max = Math.min(oldT.length, newT.length);
    while (p < max && oldT[p] === newT[p]) p++;
    let s = 0;
    while (s < max - p && oldT[oldT.length - 1 - s] === newT[newT.length - 1 - s]) s++;
    const oldEnd = oldT.length - s, delta = newT.length - oldT.length;
    const out = [];
    for (const m of matches) {
      if (m.offset + m.length < p || (m.offset + m.length === p && p < oldEnd)) out.push(m);
      else if (m.offset >= oldEnd && m.offset > p) out.push({ ...m, offset: m.offset + delta });
    }
    return out;
  }

  function onInput() {
    if (!S.el) return;
    const t = TM.getText(S.el).text;
    if (t === S.text) return;
    S.matches = adjust(S.matches, S.text, t);
    S.text = t;
    hideCard();
    requestRender();
    if (settings.autoCheck) scheduleCheck();
  }

  function scheduleCheck(delay = 1400) {
    clearTimeout(S.timer);
    if (delay === null) return;
    S.timer = setTimeout(check, delay);
  }

  async function check() {
    if (!S.el) return;
    const el = S.el, sent = TM.getText(el).text;
    if (sent.trim().length < 3) { S.matches = []; S.status = 'done'; render(); return; }
    const id = ++S.reqId;
    S.status = 'checking'; renderBadge();
    try {
      log('checking grammar…', JSON.stringify(sent.slice(0, 80)));
      const r = await send({ type: 'check', text: sent });
      log('LanguageTool →', r.matches.length, 'issues', r.matches);
      if (id !== S.reqId || S.el !== el) return;
      const fresh = r.matches.filter((m) => !ignored.has(keyOf(m)));
      S.matches = adjust(fresh, sent, S.text);
      S.lang = r.language; S.status = 'done'; S.error = '';
    } catch (e) {
      if (id !== S.reqId) return;
      S.status = 'error'; S.error = e.message;
      log('grammar check failed:', e.message);
    }
    render();
    if (panelMode === 'fix' && !panel.classList.contains('hidden')) renderPanel();
  }

  // ----------------------------------------------------------------- rendering
  let rafPending = false;
  function requestRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }

  const typeOf = (m) => (m.issueType === 'misspelling' ? 'spell' : m.issueType === 'style' || m.issueType === 'locale-violation' || m.category === 'STYLE' || m.category === 'REDUNDANCY' ? 'style' : 'grammar');
  const LABEL = { spell: 'Spelling', grammar: 'Grammar & punctuation', style: 'Clarity & style' };

  function render() {
    if (!host) return;
    if (!S.el || !S.el.isConnected || siteOff()) { if (S.el && !S.el.isConnected) deactivate(); return; }
    const rects = TM.rectsFor(S.el, S.matches.map((m) => ({ start: m.offset, end: m.offset + m.length })));
    S.boxes = rects;
    const frag = document.createDocumentFragment();
    rects.forEach((rs, i) => {
      const t = typeOf(S.matches[i]);
      for (const r of rs) {
        frag.append(h('div', { class: 'ul ' + t + (cardIdx === i ? ' active' : ''), style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px` }));
      }
    });
    layer.replaceChildren(frag);
    renderBadge();
    if (!panel.classList.contains('hidden')) positionPanel();
  }

  function renderBadge() {
    if (!S.el) return;
    const box = TM.visibleBox(S.el);
    const r = S.el.getBoundingClientRect();
    if (box.right - box.left < 30 || box.bottom - box.top < 14) { badge.classList.add('hidden'); return; }
    const W = 46, H = 22;
    // top-right corner of the box (like Grammarly); single-line boxes: vertically centred on the right
    const right = Math.min(box.right, r.right), top = Math.max(box.top, r.top);
    const x = right - W - 6;
    const y = r.height >= 44 ? top + 6 : r.top + (r.height - H) / 2;
    badge.style.left = x + 'px';
    badge.style.top = Math.max(box.top, y) + 'px';
    const n = S.matches.length;
    badge.className = 'badge ' + (S.status === 'checking' ? 'busy' : S.status === 'error' ? 'err' : n ? 'bad' : 'ok');
    const g = badge.querySelector('.g'), cnt = badge.querySelector('.count');
    cnt.textContent = S.status === 'error' ? '!' : n > 99 ? '99+' : String(n);
    cnt.classList.toggle('hidden', !(n || S.status === 'error'));
    g.title = S.status === 'error' ? 'WriteAssist: ' + S.error : n ? `WriteAssist: ${n} suggestion${n > 1 ? 's' : ''} – click to review` : 'WriteAssist: looks good ✓';
  }

  // ----------------------------------------------------------------- suggestion card
  let cardIdx = -1, cardHideT, hoverT;
  function matchAt(x, y) {
    for (let i = 0; i < S.boxes.length; i++) for (const r of S.boxes[i]) if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 2) return i;
    return -1;
  }

  function showCard(i) {
    const m = S.matches[i];
    const rs = S.boxes[i];
    if (!m || !rs?.length) return;
    clearTimeout(cardHideT);
    cardIdx = i;
    const t = typeOf(m);
    const reps = m.replacements.length
      ? m.replacements.map((rep) => h('button', { class: 'chip', dir: 'auto', onclick: () => applyMatch(i, rep) }, rep === '' ? '(remove)' : rep.replace(/ /g, ' ')))
      : [h('span', { class: 'muted' }, 'No automatic suggestion')];
    card.replaceChildren(
      h('div', { class: 'card-head' }, h('span', { class: 'dot ' + t }), h('span', {}, LABEL[t])),
      h('div', { class: 'card-msg', dir: 'auto' }, m.message),
      h('div', { class: 'chips' }, reps),
      h('div', { class: 'card-actions' },
        h('button', { class: 'link', onclick: () => ignoreMatch(i) }, 'Ignore'),
        m.issueType === 'misspelling' ? h('button', { class: 'link', onclick: () => addWord(i) }, 'Add to dictionary') : null,
        h('button', { class: 'link', title: 'Fix the grammar of the whole sentence with AI', onclick: () => fixSentenceInCard(i) }, '✨ Fix sentence'),
        h('button', { class: 'link', onclick: () => { hideCard(); togglePanel('fix', true); } }, 'More…'))
    );
    card.classList.remove('hidden');
    const r = rs[rs.length - 1];
    const cw = 300, ch = card.offsetHeight || 140;
    let left = Math.min(Math.max(8, r.left), innerWidth - cw - 8);
    let top = r.bottom + 6;
    if (top + ch > innerHeight - 8) top = Math.max(8, rs[0].top - ch - 6);
    card.style.left = left + 'px'; card.style.top = top + 'px';
    requestRender();
  }
  function hideCard() { if (!card) return; card.classList.add('hidden'); if (cardIdx !== -1) { cardIdx = -1; requestRender(); } }
  function hideCardSoon() { clearTimeout(cardHideT); cardHideT = setTimeout(hideCard, 350); }

  function applyMatch(i, rep) {
    const m = S.matches[i];
    if (!m || !S.el) return;
    const cur = TM.getText(S.el).text;
    if (cur.substr(m.offset, m.length) !== m.word) { hideCard(); onInput(); scheduleCheck(200); return; }
    TM.replaceRange(S.el, m.offset, m.offset + m.length, rep);
    hideCard();
    setTimeout(onInput, 0);
  }
  function ignoreMatch(i) {
    const m = S.matches[i];
    if (!m) return;
    ignored.add(keyOf(m));
    S.matches = S.matches.filter((x) => keyOf(x) !== keyOf(m));
    hideCard(); render();
    if (!panel.classList.contains('hidden')) renderPanel();
  }
  async function addWord(i) {
    const m = S.matches[i];
    if (!m) return;
    await send({ type: 'add-word', word: m.word }).catch(() => {});
    ignoreMatch(i);
    toast(`“${m.word}” added to your dictionary`);
  }

  async function applyAllSuggestions() {
    if (!S.el) return;
    const el = S.el;
    const list = S.matches.filter((m) => m.replacements.length).sort((a, b) => b.offset - a.offset);
    if (!list.length) return toast('Nothing to auto-fix');
    if (TM.isTextField(el)) {
      let t = TM.getText(el).text;
      for (const m of list) if (t.substr(m.offset, m.length) === m.word) t = t.slice(0, m.offset) + m.replacements[0] + t.slice(m.offset + m.length);
      TM.replaceAll(el, t);
    } else {
      for (const m of list) {
        const t = TM.getText(el).text;
        if (t.substr(m.offset, m.length) !== m.word) continue;
        TM.replaceRange(el, m.offset, m.offset + m.length, m.replacements[0]);
        await new Promise((r) => setTimeout(r, 40));
      }
    }
    setTimeout(() => { onInput(); renderPanel(); }, 50);
    toast(`Applied ${list.length} fix${list.length > 1 ? 'es' : ''}`, 'ok');
  }

  // ----------------------------------------------------------------- sentence fixes (AI)
  function sentencesOf(text) {
    const out = [];
    const push = (a, b) => {
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      if (b > a) out.push({ start: a, end: b, text: text.slice(a, b) });
    };
    const re = /[.!?؟…]+["'”’)\]]*(?=\s|$)|\n/g;
    let start = 0, m;
    while ((m = re.exec(text))) { const end = m.index + m[0].length; push(start, end); start = end; }
    push(start, text.length);
    return out;
  }
  // sentence that contains pos (or the last one that starts before it)
  function sentenceAt(text, pos) {
    const list = sentencesOf(text);
    return list.filter((s) => s.start <= pos).pop() || list[0] || null;
  }
  function findNear(cur, piece, pos) {
    if (cur.substr(pos, piece.length) === piece) return pos;
    let best = -1, i = cur.indexOf(piece);
    while (i !== -1) { if (best === -1 || Math.abs(i - pos) < Math.abs(best - pos)) best = i; i = cur.indexOf(piece, i + 1); }
    return best;
  }
  function replacePiece(el, piece, pos, rep) {
    if (!el?.isConnected) return false;
    const at = findNear(TM.getText(el).text, piece, pos);
    if (at === -1) return false;
    TM.replaceRange(el, at, at + piece.length, rep);
    setTimeout(() => { if (S.el === el) onInput(); }, 30);
    return true;
  }

  async function fixSentenceInCard(i) {
    const m = S.matches[i], el = S.el;
    if (!m || !el) return;
    const s = sentenceAt(TM.getText(el).text, m.offset);
    if (!s) return;
    clearTimeout(cardHideT);
    card.querySelector('.card-ai')?.remove();
    const area = h('div', { class: 'card-ai' }, busyBox('Fixing sentence…'));
    card.append(area);
    try {
      const r = await send({ type: 'ai', task: 'fix', text: s.text });
      const fixed = String(r.result || '').trim();
      if (!fixed || fixed === s.text) { area.replaceChildren(h('div', { class: 'muted small' }, 'The AI thinks this sentence is correct.')); return; }
      area.replaceChildren(
        h('div', { class: 'out', dir: 'auto' }, diffNodes(s.text, fixed)),
        h('div', { class: 'row end' },
          h('span', { class: 'muted small grow' }, r.label || ''),
          h('button', { class: 'mini', onclick: () => {
            hideCard();
            replacePiece(el, s.text, s.start, fixed) ? toast('Sentence fixed ✓', 'ok') : toast('The sentence changed – try again', 'err');
          } }, 'Accept')));
    } catch (e) { area.replaceChildren(errBox(e.message)); }
  }

  let SF = { el: null, list: [], loading: false, done: false, error: '', note: '' };
  const MAX_SENTS = 40;
  async function fixSentences() {
    const el = S.el || S.lastEl;
    if (!el?.isConnected) return;
    const all = sentencesOf(TM.getText(el).text).filter((s) => /\p{L}/u.test(s.text));
    if (!all.length) return toast('Type something first', 'err');
    const sents = all.slice(0, MAX_SENTS);
    SF = { el, list: [], loading: true, done: false, error: '', note: '' };
    renderPanel(); positionPanel();
    try {
      const r = await send({ type: 'ai', task: 'sentences', sentences: sents.map((s) => s.text) });
      const list = sents.map((s, i) => ({ ...s, fixed: String(r.result[i] ?? s.text).trim() })).filter((s) => s.fixed && s.fixed !== s.text);
      SF = { el, list, loading: false, done: true, error: '', note: `${sents.length} sentence${sents.length > 1 ? 's' : ''} checked · ${r.label || r.engine}` + (all.length > MAX_SENTS ? ` · only the first ${MAX_SENTS} of ${all.length}` : '') };
    } catch (e) { SF = { el, list: [], loading: false, done: false, error: e.message, note: '' }; }
    renderPanel(); positionPanel();
  }
  function acceptSentence(i) {
    const s = SF.list[i];
    if (!s) return;
    if (!replacePiece(SF.el, s.text, s.start, s.fixed)) toast('That sentence changed – run the check again', 'err');
    SF.list.splice(i, 1);
    renderPanel();
  }
  async function acceptAllSentences() {
    const list = SF.list.slice().sort((a, b) => b.start - a.start); // last first, so earlier offsets stay valid
    let n = 0;
    for (const s of list) {
      if (replacePiece(SF.el, s.text, s.start, s.fixed)) n++;
      await new Promise((r) => setTimeout(r, 40));
    }
    SF.list = [];
    renderPanel();
    toast(`Fixed ${n} sentence${n === 1 ? '' : 's'} ✓`, 'ok');
  }

  function panelSentences(body, el) {
    const mine = SF.el === el;
    body.append(h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'lbl' }, 'Fix by sentence'),
        h('div', { class: 'muted small' }, 'AI checks each sentence for grammar the underlines miss.')),
      mine && SF.list.length > 1 ? h('button', { class: 'btn', onmousedown: noFocus, onclick: acceptAllSentences }, `Accept all (${SF.list.length})`) : null,
      h('button', { class: 'btn ' + (mine && SF.done ? 'ghost' : 'accent'), disabled: mine && SF.loading, onmousedown: noFocus, onclick: fixSentences }, mine && SF.done ? 'Re-check' : '✨ Fix sentences')));
    if (!mine) return;
    if (SF.loading) body.append(busyBox('Checking sentences…'));
    if (SF.error) body.append(errBox(SF.error));
    if (SF.done && !SF.list.length) body.append(h('div', { class: 'score ok small' }, 'All sentences look correct ✓'));
    if (SF.list.length) {
      const box = h('div', { class: 'issues' });
      SF.list.forEach((s, i) => box.append(h('div', { class: 'issue' },
        h('div', { class: 'grow sent', dir: 'auto' }, diffNodes(s.text, s.fixed)),
        h('button', { class: 'mini', onmousedown: noFocus, onclick: () => acceptSentence(i) }, 'Fix'),
        h('button', { class: 'mini ghost', onmousedown: noFocus, onclick: () => { SF.list.splice(i, 1); renderPanel(); } }, '✕'))));
      body.append(box);
    }
    if (SF.done && SF.note) body.append(h('div', { class: 'muted small' }, SF.note));
  }

  // ----------------------------------------------------------------- panel
  let panelMode = 'fix', panelSel = null, replyContext = '', aiResult = null;
  const LANGS = [['en', 'English'], ['ar', 'Arabic'], ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['tr', 'Turkish'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['zh', 'Chinese'], ['ja', 'Japanese'], ['hi', 'Hindi'], ['ur', 'Urdu']];

  function togglePanel(mode, forceOpen) {
    ensureUI();
    if (!forceOpen && !panel.classList.contains('hidden') && panelMode === mode) return hidePanel();
    panelMode = mode || panelMode;
    const el = S.el || S.lastEl;
    panelSel = null;
    if (el && el.isConnected) {
      const o = TM.selectionOffsets(el);
      if (o && o.end > o.start) panelSel = { el, ...o, text: TM.getText(el).text.slice(o.start, o.end) };
    }
    if (panelMode === 'reply' && !replyContext) replyContext = getConversationContext();
    aiResult = null;
    panel.classList.remove('hidden');
    renderPanel();
    positionPanel();
    if (S.el && S.status === 'idle') check();
  }
  function hidePanel() { panel?.classList.add('hidden'); aiResult = null; }

  function positionPanel() {
    const w = Math.min(390, innerWidth - 16);
    panel.style.width = w + 'px';
    const ph = panel.offsetHeight || 420;
    const el = S.el || S.lastEl;
    let left, top;
    if (el && el.isConnected && !badge.classList.contains('hidden')) {
      const b = badge.getBoundingClientRect();
      left = b.right - w;
      top = b.top - ph - 10;
      if (top < 8) top = b.bottom + 10;
    } else { left = innerWidth - w - 16; top = 16; }
    panel.style.left = Math.min(Math.max(8, left), innerWidth - w - 8) + 'px';
    panel.style.top = Math.min(Math.max(8, top), Math.max(8, innerHeight - ph - 8)) + 'px';
  }

  function targetText() {
    const el = S.el || S.lastEl;
    if (panelSel && panelSel.el === el) return { text: panelSel.text, sel: true };
    return { text: el?.isConnected ? TM.getText(el).text.replace(/\n+$/, '') : '', sel: false };
  }

  function putText(newText, { sel = true } = {}) {
    const el = S.el || S.lastEl;
    if (!el || !el.isConnected) { copy(newText); return; }
    const cur = TM.getText(el).text;
    if (sel && panelSel && panelSel.el === el && cur.slice(panelSel.start, panelSel.end) === panelSel.text) {
      TM.replaceRange(el, panelSel.start, panelSel.end, newText);
      panelSel = { ...panelSel, end: panelSel.start + newText.length, text: newText };
    } else {
      TM.replaceAll(el, newText);
      panelSel = null;
    }
    setTimeout(() => { if (S.el === el) onInput(); }, 30);
    toast('Text replaced ✓', 'ok');
  }

  function copy(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard', 'ok'), () => toast('Copy failed', 'err'));
  }

  function renderPanel() {
    if (!panel || panel.classList.contains('hidden')) return;
    const tabs = [['fix', 'Correct'], ['rewrite', 'Rewrite'], ['reply', 'Reply'], ['translate', 'Translate']];
    const head = h('div', { class: 'p-head' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'W'), 'WriteAssist'),
      h('button', { class: 'x', title: 'Close (Esc)', onclick: hidePanel }, '×'));
    const tabBar = h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: 'tab' + (panelMode === k ? ' on' : ''), onclick: () => { panelMode = k; aiResult = null; if (k === 'reply' && !replyContext) replyContext = getConversationContext(); renderPanel(); positionPanel(); } }, l)));
    const body = h('div', { class: 'p-body' });
    ({ fix: panelFix, rewrite: panelRewrite, reply: panelReply, translate: panelTranslate })[panelMode](body);
    panel.replaceChildren(head, tabBar, body);
  }

  function busyBox(label) { return h('div', { class: 'busy-row' }, h('span', { class: 'spin' }), label); }
  function errBox(msg) { return h('div', { class: 'error', dir: 'auto' }, msg); }

  function panelFix(body) {
    const el = S.el || S.lastEl;
    if (!el?.isConnected) { body.append(h('p', { class: 'muted' }, 'Click inside any text box (email, WhatsApp, Slack, Telegram…) to check your writing.')); return; }
    if (S.status === 'checking') body.append(busyBox('Checking grammar…'));
    if (S.status === 'error') body.append(errBox(S.error));
    const n = S.matches.length;
    const fixable = S.matches.filter((m) => m.replacements.length).length;
    body.append(h('div', { class: 'row' },
      h('div', { class: 'score ' + (n ? 'bad' : 'ok') }, n ? `${n} issue${n > 1 ? 's' : ''}` : 'No issues found'),
      h('div', { class: 'grow' }),
      fixable ? h('button', { class: 'btn', onmousedown: noFocus, onclick: applyAllSuggestions }, `Accept all (${fixable})`) : null,
      h('button', { class: 'btn ghost', onmousedown: noFocus, onclick: () => check() }, 'Re-check')));
    const list = h('div', { class: 'issues' });
    S.matches.forEach((m, i) => {
      const t = typeOf(m);
      list.append(h('div', { class: 'issue', onmouseenter: () => showCard(i), onmouseleave: hideCardSoon },
        h('span', { class: 'dot ' + t }),
        h('div', { class: 'grow' },
          h('div', { class: 'iw', dir: 'auto' }, h('s', {}, m.word || '␣'), m.replacements[0] != null ? h('b', {}, ' → ' + (m.replacements[0] || '(remove)')) : null),
          h('div', { class: 'im', dir: 'auto' }, m.shortMessage || m.message)),
        m.replacements.length ? h('button', { class: 'mini', onmousedown: noFocus, onclick: () => applyMatch(i, m.replacements[0]) }, 'Fix') : null,
        h('button', { class: 'mini ghost', onmousedown: noFocus, onclick: () => ignoreMatch(i) }, '✕')));
    });
    body.append(list);
    body.append(h('div', { class: 'sep' }));
    panelSentences(body, el);
    body.append(h('div', { class: 'sep' }));
    body.append(h('div', { class: 'row' },
      h('div', { class: 'muted small' }, 'Deep fix with AI rewrites the whole message' + (panelSel ? ' (selection)' : '') + '.'),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn accent', onmousedown: noFocus, onclick: () => runAI(body, 'fix', {}) }, '✨ AI fix')));
    renderAIResult(body);
    if (S.lang) body.append(h('div', { class: 'foot muted small' }, 'Language: ' + S.lang + ' · Grammar by LanguageTool'));
  }

  function panelRewrite(body) {
    const { text, sel } = targetText();
    body.append(h('div', { class: 'muted small' }, sel ? 'Rewriting your selected text.' : 'Rewriting the whole text box. Select part of the text to rewrite only that.'));
    const tones = [['clearer', 'Clearer'], ['professional', 'Professional'], ['formal', 'Formal'], ['friendly', 'Friendly'], ['shorter', 'Shorter'], ['confident', 'Confident'], ['longer', 'Expand']];
    body.append(h('div', { class: 'chips wrap' }, tones.map(([k, l]) => h('button', { class: 'chip big', onmousedown: noFocus, onclick: () => runAI(body, 'rewrite', { tone: k }) }, l))));
    if (!text.trim()) body.append(h('p', { class: 'muted' }, 'Type something in a text box first.'));
    renderAIResult(body);
  }

  function panelReply(body) {
    const ctx = h('textarea', { class: 'inp', rows: '4', dir: 'auto', placeholder: 'Message / email you want to reply to (auto-detected on Gmail, WhatsApp, Slack, Telegram… or paste it here)' });
    ctx.value = replyContext;
    ctx.addEventListener('input', () => { replyContext = ctx.value; });
    const intent = h('input', { class: 'inp', dir: 'auto', placeholder: 'Optional: what you want to say (e.g. "accept, but next Tuesday")' });
    const lang = h('select', { class: 'inp sel' }, h('option', { value: '' }, 'Same language'), LANGS.map(([c, n]) => h('option', { value: n }, n)));
    body.append(h('label', { class: 'lbl' }, 'Reply to'), ctx, intent,
      h('div', { class: 'row' }, lang, h('div', { class: 'grow' }),
        h('button', { class: 'btn ghost', onclick: () => { replyContext = getConversationContext(); ctx.value = replyContext; } }, 'Detect'),
        h('button', { class: 'btn accent', onclick: () => {
          if (!ctx.value.trim() && !intent.value.trim()) return toast('Paste the message you want to reply to', 'err');
          const draft = targetText().text;
          runAI(body, intent.value.trim() && !ctx.value.trim() ? 'compose' : 'reply', { context: ctx.value.trim(), intent: intent.value.trim(), lang: lang.value, text: draft.length < 600 ? draft : '' });
        } }, '✨ Suggest replies')));
    renderAIResult(body);
  }

  function panelTranslate(body) {
    const { text, sel } = targetText();
    const tgt = h('select', { class: 'inp sel' }, LANGS.map(([c, n]) => h('option', { value: c, selected: c === (settings.translateTarget || 'en') }, n)));
    const src = h('textarea', { class: 'inp', rows: '3', dir: 'auto', placeholder: 'Text to translate' });
    src.value = text;
    body.append(h('div', { class: 'muted small' }, sel ? 'Translating your selection.' : 'Write in any language (e.g. Arabic) and translate it, then replace.'), src,
      h('div', { class: 'row' }, h('span', { class: 'small' }, 'To'), tgt, h('div', { class: 'grow' }),
        h('button', { class: 'btn accent', onclick: async () => {
          if (!src.value.trim()) return;
          aiResult = { loading: 'Translating…' }; renderAIResultOnly(body);
          try {
            const r = await send({ type: 'translate', text: src.value, target: tgt.value });
            aiResult = { text: r.text, note: `${r.source || '?'} → ${r.target || tgt.value} · ${r.engine === 'chrome' ? 'Chrome on-device' : 'Google Translate'}`, replaceable: src.value === text && !!text };
          } catch (e) { aiResult = { error: e.message }; }
          renderAIResultOnly(body);
        } }, 'Translate')));
    renderAIResult(body);
  }

  async function runAI(body, task, extra) {
    const { text } = targetText();
    if ((task === 'fix' || task === 'rewrite') && !text.trim()) return toast('Type something first', 'err');
    aiResult = { loading: task === 'reply' ? 'Writing reply ideas…' : 'Thinking…' };
    renderAIResultOnly(body);
    try {
      const r = await send({ type: 'ai', task, text, ...extra });
      const eng = r.label || (r.engine === 'nano' ? 'Chrome on-device AI' : 'Gemini API');
      if (Array.isArray(r.result)) aiResult = { list: r.result, note: eng };
      else aiResult = { text: r.result, before: text, note: eng, replaceable: true };
    } catch (e) { aiResult = { error: e.message }; }
    renderAIResultOnly(body);
  }

  function renderAIResultOnly(body) {
    body.querySelector('.result')?.remove();
    renderAIResult(body);
    positionPanel();
  }

  function renderAIResult(body) {
    if (!aiResult) return;
    const box = h('div', { class: 'result' });
    if (aiResult.loading) box.append(busyBox(aiResult.loading));
    else if (aiResult.error) box.append(errBox(aiResult.error));
    else if (aiResult.list) {
      aiResult.list.forEach((t) => box.append(h('div', { class: 'opt' },
        h('div', { class: 'opt-t', dir: 'auto' }, t),
        h('div', { class: 'row end' },
          h('button', { class: 'mini ghost', onclick: () => copy(t) }, 'Copy'),
          (S.el || S.lastEl)?.isConnected ? h('button', { class: 'mini', onmousedown: noFocus, onclick: () => putText(t, { sel: false }) }, 'Insert') : null))));
      box.append(h('div', { class: 'foot muted small' }, aiResult.note));
    } else {
      const out = h('div', { class: 'out', dir: 'auto' });
      if (aiResult.before && aiResult.before !== aiResult.text) out.append(diffNodes(aiResult.before, aiResult.text));
      else out.textContent = aiResult.text;
      box.append(out, h('div', { class: 'row end' },
        h('span', { class: 'muted small grow' }, aiResult.note || ''),
        h('button', { class: 'mini ghost', onclick: () => copy(aiResult.text) }, 'Copy'),
        aiResult.replaceable && (S.el || S.lastEl)?.isConnected ? h('button', { class: 'mini', onmousedown: noFocus, onclick: () => putText(aiResult.text) }, 'Replace') : null));
    }
    body.append(box);
  }

  // word-level diff (LCS) for AI previews
  function diffNodes(a, b) {
    const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
    const frag = document.createDocumentFragment();
    if (A.length * B.length > 400000) { frag.append(b); return frag; }
    const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < A.length || j < B.length) {
      if (i < A.length && j < B.length && A[i] === B[j]) { frag.append(B[j]); i++; j++; }
      else if (j < B.length && (i >= A.length || dp[i][j + 1] >= dp[i + 1][j])) { frag.append(/^\s+$/.test(B[j]) ? B[j] : h('ins', {}, B[j])); j++; }
      else { if (!/^\s+$/.test(A[i])) frag.append(h('del', {}, A[i])); i++; }
    }
    return frag;
  }

  // ----------------------------------------------------------------- conversation context (for replies)
  function lastTexts(sel, n, fmt) {
    const els = Array.from(document.querySelectorAll(sel)).filter((e) => e.offsetParent !== null || e.getClientRects().length);
    return els.slice(-n).map(fmt || ((e) => e.innerText.trim())).filter(Boolean).join('\n');
  }
  function getConversationContext() {
    const sel = String(getSelection() || '').trim();
    if (sel.length > 2) return sel.slice(0, 4000);
    const hst = location.hostname;
    let t = '';
    try {
      if (hst === 'mail.google.com') t = lastTexts('div.a3s', 1);
      else if (hst === 'web.whatsapp.com') t = lastTexts('[data-pre-plain-text]', 8, (e) => {
        const who = (e.getAttribute('data-pre-plain-text') || '').replace(/^\[[^\]]*\]\s*/, '').trim();
        const txt = (e.querySelector('.selectable-text') || e).innerText.trim();
        return txt ? `${who} ${txt}` : '';
      });
      else if (/slack\.com$/.test(hst)) t = lastTexts('[data-qa="message_container"], .c-message_kit__background', 6);
      else if (/telegram\.org$/.test(hst)) t = lastTexts('.bubble .message, .message .text-content, .Message .text-content', 6);
      else if (/outlook\.(live|office|office365)\.com$/.test(hst)) t = lastTexts('[aria-label="Message body"], div[role="document"]', 1);
      else if (/linkedin\.com$/.test(hst)) t = lastTexts('.msg-s-event-listitem__body', 6);
      else if (/discord\.com$/.test(hst)) t = lastTexts('[id^="message-content-"]', 6);
      else if (/messenger\.com$|facebook\.com$/.test(hst)) t = lastTexts('[role="row"] [dir="auto"]', 6);
    } catch {}
    return (t || '').trim().slice(-4000);
  }

  // ----------------------------------------------------------------- selection toolbar
  let selInfo = null;
  function showSelbar() {
    const s = getSelection();
    const text = String(s || '').trim();
    if (!s.rangeCount || text.length < 2 || text.length > 5000) return hideSelbar();
    const anchor = s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentElement;
    if (inUI(anchor)) return;
    const active = document.activeElement;
    let el = TM.editableRoot(anchor) || (TM.isTextField(active) ? TM.editableRoot(active) : null);
    let offs = null;
    if (el) offs = TM.selectionOffsets(el);
    if (el && TM.isTextField(el) && offs?.end <= offs?.start) return hideSelbar();
    let rect;
    if (el && TM.isTextField(el)) { const r = TM.rectsFor(el, [offs])[0]; rect = r[r.length - 1]; }
    else { const rs = s.getRangeAt(0).getClientRects(); rect = rs[rs.length - 1]; }
    if (!rect) return hideSelbar();
    const selText = el && offs ? TM.getText(el).text.slice(offs.start, offs.end) : text;
    selInfo = { text: selText, el, offs };
    ensureUI();
    const btn = (label, fn, title) => h('button', { class: 'sb', title, onclick: fn }, label);
    selbar.replaceChildren(
      h('span', { class: 'logo sm' }, 'W'),
      btn('Translate', () => selAction('translate')),
      btn(el ? 'Fix' : 'Fix grammar', () => selAction('fix')),
      el ? btn('Rewrite', () => selAction('rewrite')) : btn('Reply', () => selAction('reply'), 'Suggest replies to this text'));
    selbar.classList.remove('hidden');
    const w = selbar.offsetWidth || 260;
    selbar.style.left = Math.min(Math.max(8, rect.right - w / 2), innerWidth - w - 8) + 'px';
    let top = rect.bottom + 8;
    if (top + 40 > innerHeight) top = rect.top - 44;
    selbar.style.top = top + 'px';
  }
  function hideSelbar() { selbar?.classList.add('hidden'); }

  async function selAction(action, textOverride) {
    const info = textOverride ? { text: textOverride, el: null } : selInfo;
    if (!info) return;
    hideSelbar();
    if (action === 'reply') {
      replyContext = info.text;
      return togglePanel('reply', true);
    }
    if (info.el && action !== 'translate') {
      S.lastEl = info.el;
      if (info.el !== S.el) activate(info.el);
      panelMode = action === 'rewrite' ? 'rewrite' : 'fix';
      panel.classList.remove('hidden');
      panelSel = { el: info.el, ...info.offs, text: info.text };
      aiResult = null; renderPanel(); positionPanel();
      if (action === 'fix') runAI(panel.querySelector('.p-body'), 'fix', {});
      return;
    }
    // non-editable text (or translate): open panel with result
    panelMode = action === 'translate' ? 'translate' : 'fix';
    panel.classList.remove('hidden');
    panelSel = info.el ? { el: info.el, ...info.offs, text: info.text } : null;
    aiResult = { loading: action === 'translate' ? 'Translating…' : 'Fixing…' };
    renderPanel(); positionPanel();
    const body = panel.querySelector('.p-body');
    if (action === 'translate') {
      const ta = body.querySelector('textarea'); if (ta) ta.value = info.text;
      try {
        const r = await send({ type: 'translate', text: info.text });
        aiResult = { text: r.text, note: `${r.source || '?'} → ${r.target} · ${r.engine === 'chrome' ? 'Chrome on-device' : 'Google Translate'}`, replaceable: !!info.el };
      } catch (e) { aiResult = { error: e.message }; }
    } else {
      try {
        const r = await send({ type: 'ai', task: 'fix', text: info.text });
        aiResult = { text: r.result, before: info.text, note: r.label || (r.engine === 'nano' ? 'Chrome on-device AI' : 'Gemini API'), replaceable: false };
      } catch (e) { aiResult = { error: e.message }; }
    }
    renderAIResultOnly(body);
  }

  // ----------------------------------------------------------------- events
  // Activate even if the box already had focus before the extension loaded (Slack, WhatsApp auto-focus)
  const tryActivate = (node) => {
    if (siteOff() || inUI(node)) return;
    const el = TM.editableRoot(node?.nodeType === 1 ? node : node?.parentElement);
    if (el && el !== S.el) { log('editor detected', el.tagName, el.className || '', el.getAttribute('data-qa') || ''); activate(el); }
  };
  ['keydown', 'mousedown', 'input'].forEach((t) => document.addEventListener(t, (e) => tryActivate(e.composedPath?.()[0] || e.target), true));
  setTimeout(() => tryActivate(document.activeElement), 600);

  document.addEventListener('focusin', (e) => {
    if (siteOff()) return;
    const t = e.composedPath?.()[0] || e.target;
    if (inUI(e.target)) return;
    const el = TM.editableRoot(t);
    if (el) activate(el);
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (inUI(a)) return;
      if (S.el && (a === S.el || S.el.contains(a))) return;
      const el = TM.editableRoot(a);
      if (el) activate(el); else deactivate();
    }, 150);
  }, true);

  document.addEventListener('input', (e) => { if (S.el && (e.target === S.el || S.el.contains(e.target))) onInput(); }, true);
  document.addEventListener('keyup', () => S.el && requestRender(), true);
  window.addEventListener('scroll', () => { if (S.el) { requestRender(); hideCard(); } hideSelbar(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => S.el && requestRender());
  setInterval(() => { if (S.el && document.visibilityState === 'visible') { const t = TM.getText(S.el).text; if (t !== S.text) onInput(); else render(); } }, 900);

  let lastMove = 0;
  document.addEventListener('mousemove', (e) => {
    if (!S.el || !S.boxes.length) return;
    const now = Date.now();
    if (now - lastMove < 60) return;
    lastMove = now;
    const i = matchAt(e.clientX, e.clientY);
    clearTimeout(hoverT);
    if (i !== -1 && i !== cardIdx) hoverT = setTimeout(() => showCard(i), 280);
    else if (i === -1 && cardIdx !== -1 && card && !card.matches(':hover')) hideCardSoon();
    else if (i === cardIdx) clearTimeout(cardHideT);
  }, { passive: true });

  document.addEventListener('mouseup', (e) => {
    if (inUI(e.composedPath?.()[0])) return;
    if (S.el && S.boxes.length) {
      const i = matchAt(e.clientX, e.clientY);
      if (i !== -1 && String(getSelection()).length === 0) { showCard(i); return; }
    }
    setTimeout(() => { if (!siteOff()) showSelbar(); }, 10);
  }, true);

  document.addEventListener('mousedown', (e) => {
    const p = e.composedPath?.()[0];
    if (inUI(p)) return;
    hideSelbar();
    if (card && !card.classList.contains('hidden')) hideCard();
    if (panel && !panel.classList.contains('hidden')) hidePanel();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && host) {
      if (!card.classList.contains('hidden') || !selbar.classList.contains('hidden') || !panel.classList.contains('hidden')) {
        hideCard(); hideSelbar(); hidePanel();
      }
    }
  }, true);

  chrome.runtime.onMessage.addListener((msg) => {
    if (window !== window.top && !document.hasFocus()) return;
    if (msg.type === 'command') {
      if (siteOff()) return;
      const el = S.el || TM.editableRoot(document.activeElement);
      if (msg.name === 'open-panel') { if (el && el !== S.el) activate(el); togglePanel('fix', true); }
      if (msg.name === 'fix-sentence' && el) {
        if (el !== S.el) activate(el);
        const text = TM.getText(el).text;
        const o = TM.selectionOffsets(el);
        const s = sentenceAt(text, o ? o.start : text.length);
        if (!s) return;
        toast('✨ Fixing sentence…');
        send({ type: 'ai', task: 'fix', text: s.text }).then((r) => {
          const fixed = String(r.result || '').trim();
          if (!fixed || fixed === s.text) return toast('This sentence looks correct ✓', 'ok');
          replacePiece(el, s.text, s.start, fixed) ? toast('Sentence fixed ✓', 'ok') : toast('Text changed meanwhile – try again', 'err');
        }, (e) => toast(e.message, 'err'));
      }
      if (msg.name === 'fix-all' && el) {
        if (el !== S.el) activate(el);
        const text = TM.getText(el).text.replace(/\n+$/, '');
        if (!text.trim()) return;
        toast('✨ Fixing with AI…');
        send({ type: 'ai', task: 'fix', text }).then((r) => {
          if (TM.getText(el).text.replace(/\n+$/, '') !== text) return toast('Text changed meanwhile – try again', 'err');
          TM.replaceAll(el, r.result); setTimeout(onInput, 30); toast('Fixed ✓', 'ok');
        }, (e) => toast(e.message, 'err'));
      }
    }
    if (msg.type === 'menu') {
      ensureUI();
      const s = getSelection();
      const anchor = s?.anchorNode?.nodeType === 1 ? s.anchorNode : s?.anchorNode?.parentElement;
      const el = TM.editableRoot(anchor) || TM.editableRoot(document.activeElement);
      if (el) { const offs = TM.selectionOffsets(el); selInfo = { text: offs ? TM.getText(el).text.slice(offs.start, offs.end) : msg.text, el, offs }; selAction(msg.action); }
      else selAction(msg.action, msg.text);
    }
  });

  // ----------------------------------------------------------------- styles
  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans Arabic",Tahoma,sans-serif}
  .hidden{display:none!important}
  .layer{position:fixed;left:0;top:0;width:0;height:0;pointer-events:none}
  .ul{position:fixed;pointer-events:none;border-bottom:2px solid;border-radius:1px}
  .ul.spell{border-color:#e5484d}.ul.grammar{border-color:#f59e0b}.ul.style{border-color:#3b82f6}
  .ul.active.spell{background:rgba(229,72,77,.15)}.ul.active.grammar{background:rgba(245,158,11,.18)}.ul.active.style{background:rgba(59,130,246,.15)}
  .badge{position:fixed;pointer-events:auto;display:flex;align-items:center;gap:3px;height:22px;padding:0 2px;border-radius:99px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:opacity .15s}
  .badge button{border:0;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:transform .15s}
  .badge button:hover{transform:scale(1.12)}
  .bulb{width:18px;height:18px;background:#15c39a;color:#fff}
  .g{position:relative;width:18px;height:18px;background:#15c39a;color:#fff}
  .gl{font:800 10.5px/1 Inter,system-ui,sans-serif}
  .badge.bad .g{background:#e5484d}.badge.err .g{background:#6b7280}
  .badge.busy .g{background:#15c39a;animation:pulse 1s ease-in-out infinite}
  @keyframes pulse{50%{opacity:.45}}
  .count{position:absolute;top:-7px;right:-7px;min-width:14px;height:14px;padding:0 3px;border-radius:99px;background:#e5484d;color:#fff;font:700 9px/14px Inter,system-ui,sans-serif;text-align:center;border:1.5px solid #fff}
  @keyframes spin{to{transform:rotate(1turn)}}
  .card,.panel,.selbar,.toast{pointer-events:auto;position:fixed;background:var(--bg);color:var(--fg);border:1px solid var(--bd);box-shadow:0 10px 30px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08)}
  :host{--bg:#fff;--fg:#1f2330;--mut:#6b7280;--bd:#e6e7ee;--soft:#f4f5fa;--acc:#4f46e5;--acc2:#7c3aed}
  @media (prefers-color-scheme:dark){:host{--bg:#1d2030;--fg:#eceef6;--mut:#9aa0b4;--bd:#30344a;--soft:#262a3d;--acc:#7c83ff;--acc2:#a78bfa}}
  .card{width:300px;border-radius:12px;padding:12px;font-size:13px}
  .card-head{display:flex;align-items:center;gap:8px;font-weight:600;font-size:12px;color:var(--mut);text-transform:uppercase;letter-spacing:.03em}
  .dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
  .dot.spell{background:#e5484d}.dot.grammar{background:#f59e0b}.dot.style{background:#3b82f6}
  .card-msg{margin:8px 0;line-height:1.45}
  .chips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
  .chip{border:0;background:var(--acc);color:#fff;border-radius:8px;padding:6px 10px;font-size:13px;font-weight:600;cursor:pointer}
  .chip:hover{filter:brightness(1.1)}
  .chip.big{background:var(--soft);color:var(--fg);border:1px solid var(--bd);font-weight:500}
  .chip.big:hover{border-color:var(--acc);color:var(--acc)}
  .card-actions{display:flex;gap:14px;margin-top:6px}
  .link{background:none;border:0;padding:0;color:var(--mut);font-size:12px;cursor:pointer}
  .link:hover{color:var(--acc)}
  .muted{color:var(--mut)}.small{font-size:12px}
  .panel{border-radius:14px;max-height:min(560px,80vh);display:flex;flex-direction:column;font-size:13px;overflow:hidden}
  .p-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px}
  .brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}
  .logo{width:22px;height:22px;border-radius:7px;background:linear-gradient(135deg,var(--acc),var(--acc2));color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px}
  .logo.sm{width:20px;height:20px;font-size:11px;margin:0 2px}
  .x{border:0;background:none;font-size:20px;color:var(--mut);cursor:pointer;line-height:1}
  .tabs{display:flex;gap:2px;padding:0 10px;border-bottom:1px solid var(--bd)}
  .tab{border:0;background:none;padding:8px 10px;font-size:13px;color:var(--mut);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
  .tab.on{color:var(--acc);border-color:var(--acc);font-weight:600}
  .p-body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:10px}
  .row{display:flex;align-items:center;gap:8px}.row.end{justify-content:flex-end}.grow{flex:1;min-width:0}
  .btn{border:1px solid var(--acc);background:var(--acc);color:#fff;border-radius:8px;padding:6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
  .btn.ghost{background:transparent;color:var(--acc)}
  .btn.accent{background:linear-gradient(135deg,var(--acc),var(--acc2));border:0}
  .mini{border:0;background:var(--acc);color:#fff;border-radius:6px;padding:4px 9px;font-size:12px;font-weight:600;cursor:pointer}
  .mini.ghost{background:var(--soft);color:var(--fg)}
  .score{font-weight:700}.score.bad{color:#e5484d}.score.ok{color:#10b981}
  .issues{display:flex;flex-direction:column;gap:4px;max-height:220px;overflow:auto}
  .issue{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;background:var(--soft)}
  .iw s{color:#e5484d}.iw b{color:#10b981;font-weight:600}
  .im{font-size:11.5px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sep{height:1px;background:var(--bd)}
  .sent{line-height:1.45;white-space:pre-wrap;word-break:break-word}
  .sent ins{background:rgba(16,185,129,.18);color:inherit;text-decoration:none;border-radius:3px}
  .sent del{color:#e5484d;opacity:.75}
  .card-ai{margin-top:10px;display:flex;flex-direction:column;gap:8px}
  .card-ai .out{max-height:160px}
  .btn[disabled]{opacity:.5;cursor:default}
  .inp{width:100%;border:1px solid var(--bd);background:var(--soft);color:var(--fg);border-radius:8px;padding:8px;font-size:13px;resize:vertical;outline:none}
  .inp:focus{border-color:var(--acc)}
  .sel{width:auto;padding:5px 6px}
  .lbl{font-weight:600;font-size:12px}
  .result{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--bd);padding-top:10px}
  .out{white-space:pre-wrap;line-height:1.5;background:var(--soft);border-radius:8px;padding:10px;max-height:220px;overflow:auto}
  .out ins{background:rgba(16,185,129,.18);color:inherit;text-decoration:none;border-radius:3px}
  .out del{color:#e5484d;opacity:.75}
  .opt{background:var(--soft);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px}
  .opt-t{white-space:pre-wrap;line-height:1.45}
  .error{background:rgba(229,72,77,.1);color:#e5484d;border-radius:8px;padding:8px 10px;font-size:12.5px;line-height:1.4}
  .busy-row{display:flex;align-items:center;gap:8px;color:var(--mut)}
  .spin{width:14px;height:14px;border-radius:50%;border:2px solid var(--bd);border-top-color:var(--acc);animation:spin .8s linear infinite}
  .foot{margin-top:2px}
  .selbar{display:flex;align-items:center;gap:2px;padding:4px;border-radius:10px}
  .sb{border:0;background:none;color:var(--fg);padding:5px 9px;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer}
  .sb:hover{background:var(--soft);color:var(--acc)}
  .toast{left:50%;bottom:24px;transform:translateX(-50%);padding:9px 14px;border-radius:10px;font-size:13px;max-width:min(520px,90vw)}
  .toast.ok{border-color:#10b981}.toast.err{border-color:#e5484d;color:#e5484d}
  `;
})();
