// Small DOM helpers: element builder, toast, bottom sheet, modal, sound effects.

export const $ = (sel, root = document) => root.querySelector(sel);

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let toastTimer;
export function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- Bottom sheet ----------
let sheetStack = [];
export function openSheet(title, render) {
  sheetStack = [{ title, render }];
  drawSheet();
  $('#sheet').classList.add('show');
}
export function pushSheet(title, render) {
  sheetStack.push({ title, render });
  drawSheet();
}
export function refreshSheet() {
  if ($('#sheet').classList.contains('show')) drawSheet();
}
export function closeSheet() {
  $('#sheet').classList.remove('show');
  sheetStack = [];
}
function drawSheet() {
  const top = sheetStack[sheetStack.length - 1];
  if (!top) return;
  const body = $('#sheet-body');
  const scroll = body.scrollTop;
  $('#sheet-title').textContent = top.title;
  $('#sheet-back').hidden = sheetStack.length < 2;
  body.replaceChildren(top.render());
  body.scrollTop = scroll;
}
export function initSheet() {
  $('#sheet-close').onclick = closeSheet;
  $('#sheet-back').onclick = () => {
    sheetStack.pop();
    drawSheet();
  };
  $('#sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheet') closeSheet();
  });
}

// ---------- Modal ----------
// choices: [{label, cls, value}] -> resolves with the chosen value
export function modal({ art = '', title = '', text = '', body = null, choices = [{ label: 'OK', value: true, cls: 'primary' }] }) {
  return new Promise((resolve) => {
    const m = $('#modal');
    $('#toast').classList.remove('show');
    const card = h('div', { class: 'modal-card pop' },
      art ? h('div', { class: 'modal-art', html: art }) : null,
      title ? h('h3', {}, title) : null,
      text ? h('p', { class: 'modal-text', html: text }) : null,
      body,
      h('div', { class: 'modal-actions' }, choices.map((c) => h('button', {
        class: `btn ${c.cls || 'ghost'}`,
        onclick: () => {
          m.classList.remove('show');
          resolve(c.value);
        },
      }, c.label))),
    );
    m.replaceChildren(card);
    m.classList.add('show');
  });
}

// ---------- Sound ----------
let ctx = null;
export const sound = { on: true };
function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, start, dur, type = 'sine', vol = 0.15, slide = 0) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
export function sfx(name) {
  if (!sound.on) return;
  try {
    switch (name) {
      case 'tap': tone(660, 0, 0.08, 'triangle', 0.08); break;
      case 'appear': tone(520, 0, 0.12, 'sine'); tone(780, 0.08, 0.16, 'sine'); break;
      case 'talk': tone(900 + Math.random() * 300, 0, 0.05, 'square', 0.03); break;
      case 'happy': [523, 659, 784].forEach((f, i) => tone(f, i * 0.07, 0.18, 'triangle', 0.12)); break;
      case 'sad': tone(400, 0, 0.3, 'sine', 0.1, 0.6); break;
      case 'join': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.13)); break;
      case 'hit': tone(180, 0, 0.15, 'sawtooth', 0.12, 0.5); break;
      case 'super': tone(240, 0, 0.2, 'sawtooth', 0.15, 0.4); tone(900, 0.02, 0.12, 'square', 0.05); break;
      case 'miss': tone(500, 0, 0.12, 'sine', 0.06, 1.6); break;
      case 'faint': tone(300, 0, 0.5, 'triangle', 0.12, 0.3); break;
      case 'fairy': [1319, 1568, 1760, 2093].forEach((f, i) => tone(f, i * 0.06, 0.2, 'sine', 0.07)); break;
      case 'gift': [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.1)); break;
      case 'shutter': tone(2000, 0, 0.04, 'square', 0.05); tone(1200, 0.05, 0.05, 'square', 0.04); break;
      default: break;
    }
  } catch {
    /* audio is optional */
  }
}

export function vibrate(p) {
  if (navigator.vibrate) try { navigator.vibrate(p); } catch { /* ignore */ }
}
