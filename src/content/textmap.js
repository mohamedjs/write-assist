// Text <-> DOM mapping helpers for <textarea>, <input> and contenteditable editors
// (Gmail, Slack, WhatsApp Web, Telegram, LinkedIn, Outlook ...).
(() => {
  if (window.__WA_TM) return;

  const TEXT_INPUTS = new Set(['text', '']);
  const BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|TABLE|SECTION|ARTICLE|HEADER|FOOTER|FIGURE|HR|DD|DT)$/;
  const SKIP_ANCESTORS = '.monaco-editor,.CodeMirror,.cm-editor,.ace_editor,[data-wa-ignore]';

  function isTextField(el) {
    return el && ((el.tagName === 'TEXTAREA') || (el.tagName === 'INPUT' && TEXT_INPUTS.has((el.getAttribute('type') || '').toLowerCase())));
  }

  /** Returns the editable root for a focused element, or null if not supported. */
  function editableRoot(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.closest?.(SKIP_ANCESTORS)) return null;
    if (isTextField(el)) {
      if (el.readOnly || el.disabled) return null;
      if (el.tagName === 'INPUT' && (el.autocomplete === 'username' || /search|user|login|email|code|otp/i.test(el.name + ' ' + el.id))) return null;
      return el;
    }
    if (el.isContentEditable) {
      let root = el;
      while (root.parentElement && root.parentElement.isContentEditable) root = root.parentElement;
      return root;
    }
    return null;
  }

  /** Build plain text + segment map for a contenteditable root. */
  function buildCE(root) {
    const segs = [];
    let text = '';
    const nl = () => { if (text.length && !text.endsWith('\n')) text += '\n'; };
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          const v = c.nodeValue;
          if (v) { segs.push({ node: c, start: text.length, len: v.length }); text += v; }
        } else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (tag === 'BR') { text += '\n'; continue; }
          if (tag === 'STYLE' || tag === 'SCRIPT' || tag === 'TEMPLATE') continue;
          if (c.getAttribute('contenteditable') === 'false' && !c.textContent.trim()) continue;
          const block = BLOCK.test(tag);
          if (block) nl();
          walk(c);
          if (block) nl();
        }
      }
    };
    walk(root);
    return { text, segs };
  }

  function getText(el) {
    if (isTextField(el)) return { text: el.value, segs: null };
    return buildCE(el);
  }

  function locate(segs, pos, preferEnd) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (pos >= s.start && pos <= s.start + s.len) {
        if (!preferEnd && pos === s.start + s.len && segs[i + 1] && segs[i + 1].start === pos) continue;
        return { node: s.node, offset: pos - s.start };
      }
    }
    // pos inside a virtual newline: snap to next segment start
    const next = segs.find((s) => s.start >= pos);
    if (next) return { node: next.node, offset: 0 };
    const last = segs[segs.length - 1];
    return last ? { node: last.node, offset: last.len } : null;
  }

  function rangeCE(el, start, end, map) {
    map = map || buildCE(el);
    const a = locate(map.segs, start, false);
    const b = locate(map.segs, end, true);
    if (!a || !b) return null;
    const r = document.createRange();
    try { r.setStart(a.node, a.offset); r.setEnd(b.node, b.offset); } catch { return null; }
    return r;
  }

  // ------------------------------------------------------------ rects
  const MIRROR_PROPS = ['boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
    'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'direction', 'wordBreak', 'overflowWrap'];

  function clip(rects, box) {
    const out = [];
    for (const r of rects) {
      if (r.width < 1 && r.height < 1) continue;
      const left = Math.max(r.left, box.left), right = Math.min(r.right, box.right);
      const top = Math.max(r.top, box.top), bottom = Math.min(r.bottom, box.bottom);
      if (right - left > 0.5 && bottom - top > 0.5) out.push({ left, top, right, bottom, width: right - left, height: bottom - top });
    }
    return out;
  }

  function visibleBox(el) {
    let b = el.getBoundingClientRect();
    let box = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden)/.test(cs.overflow + cs.overflowY + cs.overflowX)) {
        const pb = p.getBoundingClientRect();
        box = { left: Math.max(box.left, pb.left), top: Math.max(box.top, pb.top), right: Math.min(box.right, pb.right), bottom: Math.min(box.bottom, pb.bottom) };
      }
      p = p.parentElement;
    }
    box.right = Math.min(box.right, innerWidth); box.bottom = Math.min(box.bottom, innerHeight);
    box.left = Math.max(box.left, 0); box.top = Math.max(box.top, 0);
    return box;
  }

  /** ranges: [{start,end}] -> array (same order) of arrays of viewport rects */
  function rectsFor(el, ranges) {
    const box = visibleBox(el);
    if (box.right <= box.left || box.bottom <= box.top) return ranges.map(() => []);
    if (!isTextField(el)) {
      const map = buildCE(el);
      return ranges.map(({ start, end }) => {
        const r = rangeCE(el, start, end, map);
        return r ? clip(Array.from(r.getClientRects()), box) : [];
      });
    }
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const m = document.createElement('div');
    m.setAttribute('data-wa-ignore', '');
    const isInput = el.tagName === 'INPUT';
    for (const p of MIRROR_PROPS) m.style[p] = cs[p];
    Object.assign(m.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px',
      visibility: 'hidden', pointerEvents: 'none', overflow: 'hidden', zIndex: '-1', margin: '0',
      whiteSpace: isInput ? 'pre' : 'pre-wrap', wordWrap: isInput ? 'normal' : 'break-word'
    });
    if (isInput) m.style.lineHeight = cs.height; // vertically center like inputs
    const val = el.value;
    const sorted = ranges.map((r, i) => ({ ...r, i })).sort((a, b) => a.start - b.start);
    const spans = [];
    let pos = 0;
    for (const r of sorted) {
      if (r.start < pos) { spans[r.i] = null; continue; }
      m.appendChild(document.createTextNode(val.slice(pos, r.start)));
      const sp = document.createElement('span');
      sp.textContent = val.slice(r.start, r.end) || '​';
      m.appendChild(sp);
      spans[r.i] = sp;
      pos = r.end;
    }
    m.appendChild(document.createTextNode(val.slice(pos) + '​'));
    document.documentElement.appendChild(m);
    m.scrollTop = el.scrollTop; m.scrollLeft = el.scrollLeft;
    const out = ranges.map((_, i) => (spans[i] ? clip(Array.from(spans[i].getClientRects()), box) : []));
    m.remove();
    return out;
  }

  // ------------------------------------------------------------ editing
  function selectRange(el, start, end) {
    el.focus({ preventScroll: true });
    if (isTextField(el)) { el.setSelectionRange(start, end); return true; }
    const r = rangeCE(el, start, end);
    if (!r) return false;
    const sel = el.ownerDocument.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
    return true;
  }

  function firePaste(el, text) {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const target = el.ownerDocument.getSelection()?.anchorNode?.parentElement || el;
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    } catch { return false; }
  }

  /** Replace [start,end) with text in a way rich editors (React, Lexical, Quill, Draft) understand. */
  function replaceRange(el, start, end, text) {
    const before = getText(el).text;
    if (!selectRange(el, start, end)) return false;
    const expected = before.slice(0, start) + text + before.slice(end);
    const ok = () => getText(el).text.replace(/\n+$/, '') === expected.replace(/\n+$/, '');

    if (!isTextField(el) && text.includes('\n')) {
      if (firePaste(el, text) && ok()) return true;
      selectRange(el, start, end);
    }
    let done = false;
    try { done = document.execCommand('insertText', false, text); } catch {}
    if (done && (ok() || !isTextField(el))) return true;
    if (isTextField(el)) {
      el.value = before; // revert partial
      el.setRangeText(text, start, end, 'end');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
      return true;
    }
    // last resort for contenteditable
    if (!firePaste(el, text)) {
      const sel = el.ownerDocument.getSelection();
      const r = sel.getRangeAt(0);
      r.deleteContents(); r.insertNode(document.createTextNode(text));
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText', data: text }));
    }
    return true;
  }

  function replaceAll(el, text) {
    const cur = getText(el).text;
    let end = cur.length;
    if (!isTextField(el)) end = cur.replace(/\n+$/, '').length;
    return replaceRange(el, 0, end, text);
  }

  function selectionOffsets(el) {
    if (isTextField(el)) return { start: el.selectionStart, end: el.selectionEnd };
    const sel = el.ownerDocument.getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.startContainer)) return null;
    const map = buildCE(el);
    const toOff = (node, off) => {
      if (node.nodeType === 3) { const s = map.segs.find((x) => x.node === node); return s ? s.start + off : null; }
      // element container: find first text seg after child[off]
      const child = node.childNodes[off];
      if (!child) { const last = [...map.segs].reverse().find((s) => node.contains(s.node)); return last ? last.start + last.len : map.text.length; }
      const s = map.segs.find((x) => child === x.node || child.contains(x.node));
      return s ? s.start : map.text.length;
    };
    const start = toOff(r.startContainer, r.startOffset), end = toOff(r.endContainer, r.endOffset);
    if (start == null || end == null) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }

  window.__WA_TM = { isTextField, editableRoot, getText, rectsFor, replaceRange, replaceAll, selectRange, selectionOffsets, visibleBox };
})();
