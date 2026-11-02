// Game flow: screens, saving, level transitions and the main loop.
import { Stage } from './scene.js';
import { Board } from './board.js';
import { Sound } from './audio.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'tidekeeper.v1';

const save = (() => {
  let data = { stars: [], sound: true };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) data = { ...data, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return {
    data,
    write() {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    },
  };
})();

const unlocked = (i) => i === 0 || (save.data.stars[i - 1] || 0) > 0;
const firstOpen = () => {
  const i = LEVELS.findIndex((_, k) => !(save.data.stars[k] > 0));
  return i < 0 ? LEVELS.length - 1 : i;
};

const stage = new Stage($('view'));
const sound = new Sound();
sound.enabled = save.data.sound;

const ui = {
  screen: null,
  show(name) {
    for (const id of ['title', 'select', 'hud', 'win']) $(id).classList.toggle('show', id === name);
    this.screen = name;
  },
};

let current = 0;
let toastTimer = 0;

function toast(text, seconds = 3.5) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  toastTimer = seconds;
}

function bump(id) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 220);
}

const board = new Board(stage, sound, {
  onMoves(moves, par) {
    $('hud-moves').textContent = moves;
    $('hud-par').textContent = `/ ${par}`;
    if (moves) {
      bump('chip-moves');
      if (current === 0) $('toast').classList.remove('show');
    }
  },
  onBoats(lit, total) {
    $('chip-boats').classList.toggle('hidden', total === 0);
    $('hud-boats').textContent = `${lit}/${total}`;
    $('chip-boats').classList.toggle('done', total > 0 && lit === total);
  },
  onBoatLit() { bump('chip-boats'); },
  onJourney() {
    $('toast').classList.remove('show');
    // lean the camera in a little as Lumi heads home
    const { hx, hz } = board.bounds();
    const f = stage.frameBox(hx * 0.92, hz * 0.92, { left: -0.95, right: 0.95, bottom: -0.7, top: 0.75 }, 50);
    stage.setCamera(f.pos, f.look);
  },
  onWin(result) { showWin(result); },
});

// ---------- sound toggles ----------
const SOUND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>';
function renderSound() {
  const html = save.data.sound ? SOUND_ON : SOUND_OFF;
  $('btn-sound').innerHTML = html;
  $('btn-sound-title').innerHTML = html;
}
function toggleSound() {
  save.data.sound = !save.data.sound;
  save.write();
  sound.unlock();
  sound.setEnabled(save.data.sound);
  renderSound();
}
$('btn-sound').onclick = toggleSound;
$('btn-sound-title').onclick = toggleSound;
renderSound();

// ---------- camera helpers ----------
function framePlay(instant = false) {
  if (!board.lvl) return;
  const { hx, hz } = board.bounds();
  const portrait = stage.height > stage.width;
  const ndc = portrait
    ? { left: -0.94, right: 0.94, bottom: -0.68, top: 0.7 }
    : { left: -0.8, right: 0.8, bottom: -0.74, top: 0.72 };
  const f = stage.frameBox(hx, hz, ndc, 57);
  stage.setCamera(f.pos, f.look, instant);
}

function frameShowcase() {
  if (!board.lvl) return;
  const { hx, hz } = board.bounds();
  const R = Math.hypot(hx, hz);
  const vfov = (stage.camera.fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (stage.width / stage.height));
  const dist = (R / Math.tan(Math.min(hfov, vfov) / 2)) * 1.0 + 2;
  const tilt = 0.55;
  // look above the island so it sits in the lower part of the screen under the title
  stage.setOrbit(dist * Math.cos(tilt), dist * Math.sin(tilt), R * 0.55);
}

stage.onResize = () => {
  if (ui.screen === 'hud') framePlay();
};

// ---------- screens ----------
function fadeThen(fn) {
  const f = $('fade');
  f.classList.add('on');
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => f.classList.remove('on'));
  }, 450);
}

function renderSelect() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  const open = firstOpen();
  let total = 0;
  LEVELS.forEach((lv, i) => {
    const stars = save.data.stars[i] || 0;
    total += stars;
    const b = document.createElement('button');
    b.className = 'level' + (unlocked(i) ? '' : ' locked') + (i === open ? ' current' : '');
    b.style.animationDelay = `${i * 0.035}s`;
    b.innerHTML = `<span class="num">${i + 1}</span><span class="lname">${lv.name}</span>` +
      `<span class="mini-stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}"></i>`).join('')}</span>`;
    b.onclick = () => {
      sound.unlock();
      if (!unlocked(i)) { sound.locked(); return; }
      sound.ui();
      startLevel(i);
    };
    grid.appendChild(b);
  });
  $('total-stars').innerHTML = `★ ${total}<small style="opacity:.6">/${LEVELS.length * 3}</small>`;
}

function showTitle() {
  ui.show('title');
  board.inputEnabled = false;
  frameShowcase();
}

function showSelect() {
  renderSelect();
  ui.show('select');
  board.inputEnabled = false;
  frameShowcase();
}

function startLevel(i) {
  fadeThen(() => {
    current = i;
    board.load(i, LEVELS[i]);
    $('hud-num').textContent = `Island ${i + 1}`;
    $('hud-name').textContent = LEVELS[i].name;
    ui.show('hud');
    framePlay(true);
    // start slightly higher and settle in for a gentle arrival
    stage.camState.pos.y += 3;
    stage.camState.pos.z += 2;
    $('toast').classList.remove('show');
    if (LEVELS[i].hint) setTimeout(() => ui.screen === 'hud' && current === i && toast(LEVELS[i].hint, 5), 900);
    if (i === 0) setTimeout(() => board.pointAtFirstMirror(), 1400);
  });
}

function showWin(r) {
  const prev = save.data.stars[current] || 0;
  save.data.stars[current] = Math.max(prev, r.stars);
  save.write();
  const last = current === LEVELS.length - 1;
  $('win-eyebrow').textContent = last ? 'The light returns' : `Island ${current + 1} restored`;
  $('win-title').textContent = last ? 'The lighthouse shines again' : ['Home at last', 'Safe harbour', 'Shining bright'][r.stars - 1];
  $('win-boats').textContent = r.totalBoats ? `${r.boats}/${r.totalBoats}` : '—';
  $('win-boats').className = r.boats === r.totalBoats ? 'good' : '';
  $('win-moves').textContent = `${r.moves} (${r.par})`;
  $('win-moves').className = r.moves <= r.par ? 'good' : '';
  $('btn-next').textContent = last ? 'All islands' : 'Next island';
  const stars = [...$('win-stars').children];
  stars.forEach((s) => s.classList.remove('on'));
  ui.show('win');
  stars.forEach((s, k) => {
    if (k < r.stars) setTimeout(() => { s.classList.add('on'); sound.star(k); }, 450 + k * 280);
  });
}

$('btn-play').onclick = () => { sound.unlock(); sound.ui(); showSelect(); };
$('btn-select-back').onclick = () => { sound.ui(); showTitle(); };
$('btn-menu').onclick = () => { sound.ui(); showSelect(); };
$('btn-restart').onclick = () => {
  sound.ui();
  if (board.won) return;
  board.load(current, LEVELS[current]);
};
$('btn-hint').onclick = () => {
  sound.unlock();
  sound.ui();
  if (board.showHint()) toast('Try turning the glowing mirror.', 2.5);
};
$('btn-replay').onclick = () => { sound.ui(); startLevel(current); };
$('btn-next').onclick = () => {
  sound.ui();
  if (current < LEVELS.length - 1) startLevel(current + 1);
  else showSelect();
};

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (!sound.ctx) return;
  if (document.hidden) sound.ctx.suspend();
  else if (save.data.sound) sound.ctx.resume();
});

// ---------- main loop ----------
let last = performance.now();
let perfAcc = 0;
let perfFrames = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stage.update(dt);
  board.update(dt, stage.time);
  sound.update(dt);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.remove('show');
  }
  stage.render();
  // adaptive resolution: keep things smooth on slower phones
  perfAcc += dt;
  perfFrames++;
  if (perfAcc > 2.5) {
    const avg = perfAcc / perfFrames;
    if (avg > 1 / 45 && stage.pixelRatio > 1) {
      stage.pixelRatio = Math.max(1, stage.pixelRatio - 0.25);
      stage.resize();
    } else if (avg < 1 / 58 && stage.pixelRatio < stage.maxPixelRatio) {
      stage.pixelRatio = Math.min(stage.maxPixelRatio, stage.pixelRatio + 0.25);
      stage.resize();
    }
    perfAcc = 0;
    perfFrames = 0;
  }
  requestAnimationFrame(frame);
}

// boot: show the next unsolved island as the title backdrop
board.load(firstOpen(), LEVELS[firstOpen()]);
board.inputEnabled = false;
current = firstOpen();
showTitle();
stage.camState.pos.set(0, 30, 30);
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
  setTimeout(() => $('loading').classList.remove('show'), 300);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for automated testing
window.__tk = { board, stage, startLevel, LEVELS };
