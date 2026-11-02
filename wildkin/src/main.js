// Wildkin — boot, real-world map, GPS, and the menu screens.
import { SPECIES, SPECIES_BY_ID, PERSONALITIES, ELEMENTS, RARITY, ITEMS, MOVES, REQUESTS_BY_ID } from './data.js';
import {
  monsterSpawns, fairySpawns, fairyPosition, stats, currentHp, setHp, giveXp, newSave, pruneSave,
  playerXpToNext, xpToNext, displayName, makeMonster,
} from './game.js';
import { distance, bearing, offset, formatDuration, formatDistance, clamp } from './util.js';
import { monsterSVG, fairySVG } from './art.js';
import { S, load, persist, reset, team, useItem } from './store.js';
import { $, h, toast, openSheet, pushSheet, refreshSheet, closeSheet, initSheet, modal, sfx, sound } from './ui.js';
import { openMonster, openFairy, setEncounterHooks, pickPhoto, judgeQuestPhoto, howInfo } from './encounter.js';
import { requestSensors } from './ar.js';

const L = window.L;
const DEFAULT_POS = { lat: 35.71477, lng: 139.77344 }; // Ueno Park, Tokyo — used until GPS answers
const VIEW_RADIUS = 450; // meters of world shown around you
const EXPLORE_SPEED = 40; // m/s when tapping to move in Explore mode
const FAIRY_EXTRA_REACH = 12; // fairies fly overhead, so you can reach them from a bit further

const world = {
  map: null, me: DEFAULT_POS, accuracy: null, gpsOk: false, watch: null,
  playerMarker: null, reachCircle: null,
  markers: new Map(), // spawn id -> {marker, spawn}
  followers: new Map(), // quest id -> marker
  walkTarget: null, walkThen: null, follow: true, lastFrame: 0,
  inEncounter: false,
};

// How close you need to be. The design says 1 meter; GPS on phones is only accurate to a few meters,
// so in GPS mode the reach grows with the reported accuracy (capped). Explore mode walks you right up to it.
function reach() {
  if (S.save.settings.mode === 'explore') return 1;
  return 1 + clamp(world.accuracy ?? 10, 3, 25);
}

// ---------- Boot ----------

function boot() {
  initSheet();
  setEncounterHooks({ closed: () => { world.inEncounter = false; refreshWorld(true); } });
  if (load()) {
    sound.on = S.save.settings.sound;
    startGame();
  } else {
    showIntro();
  }
  $('#loading').classList.remove('show');
}

function showIntro() {
  const intro = $('#intro');
  intro.classList.add('show');
  $('#intro-go').onclick = () => {
    const name = $('#intro-name').value.trim().slice(0, 16) || 'Explorer';
    sfx('tap');
    S.save = newSave(name);
    showStarters();
  };
}

function showStarters() {
  $('#intro-step1').hidden = true;
  $('#intro-step2').hidden = false;
  const list = $('#starter-list');
  list.replaceChildren(...['sprigling', 'emberkit', 'bubbloo'].map((id) => {
    const sp = SPECIES_BY_ID[id];
    const el = ELEMENTS[sp.element];
    return h('button', {
      class: 'starter',
      onclick: async () => {
        sfx('tap');
        const ok = await modal({
          art: monsterSVG(id, { size: 150 }),
          title: `Choose ${sp.name}?`,
          text: `${el.icon} ${el.name} type. ${sp.blurb}`,
          choices: [{ label: 'Not yet', value: false }, { label: `Yes, ${sp.name}!`, value: true, cls: 'primary' }],
        });
        if (!ok) return;
        const mon = makeMonster({ species: id, level: 5, personality: 'friendly' }, 'starter');
        mon.inTeam = true;
        S.save.buddies.push(mon);
        persist();
        $('#intro').classList.remove('show');
        startGame(true);
      },
    }, h('div', { html: monsterSVG(id, { size: 96 }) }), h('b', {}, sp.name), h('small', {}, `${el.icon} ${el.name}`));
  }));
}

function startGame(fresh = false) {
  const expired = pruneSave(S.save);
  if (expired.length) setTimeout(() => toast(`${expired.map((q) => SPECIES_BY_ID[q.mon.species].name).join(', ')} waited 24h and went home 🍂`), 1500);
  persist();
  if (S.save.lastPos) world.me = S.save.lastPos;
  $('#app').classList.add('show');
  initMap();
  setTimeout(() => world.map.invalidateSize(), 200);
  window.addEventListener('resize', () => world.map.invalidateSize());
  bindDock();
  drawTopbar();
  startLocation();
  requestAnimationFrame(frame);
  setInterval(() => refreshWorld(), 4000);
  setInterval(tickQuests, 30000);
  if (fresh) {
    setTimeout(() => modal({
      art: '<div class="big-emoji">🗺️</div>',
      title: 'Welcome to Wildkin!',
      text: 'Walk around the real world to find monsters and fairies.<br><br>Get <b>right next to</b> one and tap it to meet it in AR.<br>Befriend monsters by <b>talking</b>, showing them <b>photos</b> of things they want, <b>battling</b> them — or by pure <b>luck</b>!<br><br>Fairies flutter around too. Make them happy for a present 🎁',
      choices: [{ label: 'Let us go!', value: true, cls: 'primary' }],
    }), 600);
  }
}

// ---------- Map ----------

function initMap() {
  world.map = L.map('map', {
    zoomControl: false, attributionControl: true, minZoom: 15, maxZoom: 20, zoomSnap: 0.25,
    inertia: true, tap: false,
  }).setView([world.me.lat, world.me.lng], 18.5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(world.map);
  world.reachCircle = L.circle([world.me.lat, world.me.lng], { radius: reach(), className: 'reach-circle', interactive: false }).addTo(world.map);
  world.playerMarker = L.marker([world.me.lat, world.me.lng], {
    icon: L.divIcon({ className: 'mk-player', html: `<div class="me"><span>${(S.save.name[0] || '?').toUpperCase()}</span></div>`, iconSize: [44, 44], iconAnchor: [22, 22] }),
    zIndexOffset: 1000, interactive: false,
  }).addTo(world.map);
  world.map.on('dragstart', () => {
    world.follow = false;
    $('#btn-center').classList.add('show');
  });
  world.map.on('click', (e) => {
    if (S.save.settings.mode !== 'explore') return;
    walkTo({ lat: e.latlng.lat, lng: e.latlng.lng });
  });
  $('#btn-center').onclick = () => {
    world.follow = true;
    world.map.setView([world.me.lat, world.me.lng], Math.max(world.map.getZoom(), 18), { animate: true });
    $('#btn-center').classList.remove('show');
  };
  refreshWorld(true);
}

function setMe(pos) {
  world.me = pos;
  world.playerMarker.setLatLng([pos.lat, pos.lng]);
  world.reachCircle.setLatLng([pos.lat, pos.lng]);
  world.reachCircle.setRadius(reach());
  if (world.follow) world.map.panTo([pos.lat, pos.lng], { animate: false });
}

let lastSpawnKey = '';
function refreshWorld(force = false) {
  if (!world.map || !S.save) return;
  const now = Date.now();
  const expired = pruneSave(S.save, now);
  if (expired.length) {
    persist();
    toast(`${expired.map((q) => SPECIES_BY_ID[q.mon.species].name).join(', ')} waited 24h and went home 🍂`);
  }
  const all = [...monsterSpawns(world.me, now, S.save.level), ...fairySpawns(world.me, now)]
    .filter((s) => !S.save.resolved[s.id] && s.expires > now)
    .filter((s) => distance(world.me, s.kind === 'fairy' ? s.center : s) < VIEW_RADIUS);
  const key = all.map((s) => s.id).join('|');
  if (force || key !== lastSpawnKey) {
    lastSpawnKey = key;
    const keep = new Set(all.map((s) => s.id));
    for (const [id, m] of world.markers) {
      if (!keep.has(id)) {
        m.marker.remove();
        world.markers.delete(id);
      }
    }
    for (const s of all) {
      if (world.markers.has(s.id)) continue;
      const html = s.kind === 'fairy'
        ? `<div class="mk-fairy ${s.fairy}">${fairySVG(s.fairy, 46)}</div>`
        : `<div class="mk-mon ${SPECIES_BY_ID[s.species].rarity}" style="animation-delay:${(s.seed % 1000) / -500}s">${monsterSVG(s.species, { size: 54 })}${['proud', 'fierce'].includes(s.personality) ? '<i class="tag">!</i>' : ''}</div>`;
      const pos = s.kind === 'fairy' ? fairyPosition(s, now) : s;
      const marker = L.marker([pos.lat, pos.lng], {
        icon: L.divIcon({ className: 'mk', html, iconSize: s.kind === 'fairy' ? [46, 46] : [54, 54], iconAnchor: s.kind === 'fairy' ? [23, 23] : [27, 50] }),
        zIndexOffset: s.kind === 'fairy' ? 500 : 0,
      }).addTo(world.map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        tapSpawn(s);
      });
      world.markers.set(s.id, { marker, spawn: s });
    }
  }
  syncFollowers();
  updateRangeClasses();
  drawTopbar();
}

function spawnPos(s, now = Date.now()) {
  return s.kind === 'fairy' ? fairyPosition(s, now) : s;
}

function updateRangeClasses() {
  for (const { marker, spawn } of world.markers.values()) {
    const el = marker.getElement();
    if (!el) continue;
    const d = distance(world.me, spawnPos(spawn));
    el.classList.toggle('near', d <= reach() + (spawn.kind === 'fairy' ? FAIRY_EXTRA_REACH : 0));
  }
}

function tapSpawn(s) {
  if (world.inEncounter) return;
  requestSensors(); // iOS needs this inside the tap
  sfx('tap');
  const d = distance(world.me, spawnPos(s));
  const r = reach() + (s.kind === 'fairy' ? FAIRY_EXTRA_REACH : 0);
  if (d <= r) return enter(s);
  if (S.save.settings.mode === 'explore') {
    walkTo(spawnPos(s), () => enter(s), s);
    return;
  }
  const name = s.kind === 'fairy' ? 'that fairy' : SPECIES_BY_ID[s.species].name;
  toast(`Walk ${formatDistance(d - r + 0.5)} closer to reach ${name}`);
}

function enter(s) {
  world.inEncounter = true;
  world.walkTarget = null;
  if (s.kind === 'fairy') openFairy(s);
  else openMonster(s);
}

// ---------- Movement: GPS or Explore ----------

function startLocation() {
  stopLocation();
  if (S.save.settings.mode === 'explore') {
    setGpsChip('explore');
    return;
  }
  if (!navigator.geolocation) {
    setGpsChip('none');
    toast('No GPS here — switched to Explore mode');
    setMode('explore');
    return;
  }
  setGpsChip('searching');
  world.watch = navigator.geolocation.watchPosition((p) => {
    world.accuracy = p.coords.accuracy;
    world.gpsOk = true;
    const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
    const jumped = distance(world.me, pos) > 2000;
    world.gpsTarget = pos;
    if (jumped || !world.hadFix) {
      world.hadFix = true;
      setMe(pos);
      world.map.setView([pos.lat, pos.lng], 18.5, { animate: false });
      refreshWorld(true);
    }
    S.save.lastPos = pos;
    setGpsChip('ok');
  }, (err) => {
    console.warn(err);
    if (err.code === 1) {
      setGpsChip('denied');
      toast('Location is blocked — using Explore mode (tap the map to move)', 4000);
      setMode('explore');
    } else {
      setGpsChip('weak');
    }
  }, { enableHighAccuracy: true, maximumAge: 1500, timeout: 20000 });
}

function stopLocation() {
  if (world.watch != null) navigator.geolocation.clearWatch(world.watch);
  world.watch = null;
  world.gpsTarget = null;
}

function setMode(mode) {
  S.save.settings.mode = mode;
  persist();
  startLocation();
  setMe(world.me);
  refreshWorld(true);
  refreshSheet();
}

function setGpsChip(st) {
  const chip = $('#gps-chip');
  const text = {
    ok: `📡 GPS ±${Math.round(world.accuracy || 0)} m`,
    searching: '📡 Finding you...',
    weak: '📡 Weak GPS',
    denied: '🚫 GPS blocked',
    none: '🚫 No GPS',
    explore: '🧭 Explore mode',
  }[st];
  chip.textContent = text;
  chip.className = `chip-btn ${st}`;
  chip.onclick = () => openMe();
}

function walkTo(target, then, spawn) {
  world.walkTarget = target;
  world.walkSpawn = spawn || null;
  world.walkThen = then || null;
  world.follow = true;
  $('#btn-center').classList.remove('show');
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - (world.lastFrame || t)) / 1000);
  world.lastFrame = t;
  if (!world.map) return;
  const now = Date.now();
  // smooth GPS updates
  if (world.gpsTarget && S.save.settings.mode === 'gps') {
    const d = distance(world.me, world.gpsTarget);
    if (d > 0.3) {
      const k = Math.min(1, dt * 4);
      setMe({ lat: world.me.lat + (world.gpsTarget.lat - world.me.lat) * k, lng: world.me.lng + (world.gpsTarget.lng - world.me.lng) * k });
    }
  }
  // explore walking
  if (world.walkTarget && !world.inEncounter) {
    if (world.walkSpawn?.kind === 'fairy') world.walkTarget = fairyPosition(world.walkSpawn, now);
    const d = distance(world.me, world.walkTarget);
    const stopAt = world.walkThen ? 0.8 : 0.1;
    if (d <= stopAt + 0.05) {
      const then = world.walkThen;
      world.walkTarget = null;
      world.walkThen = null;
      S.save.lastPos = world.me;
      persist();
      refreshWorld();
      if (then) then();
    } else {
      const step = Math.min(d - stopAt, EXPLORE_SPEED * dt);
      setMe(offset(world.me, step, bearing(world.me, world.walkTarget)));
    }
  }
  // fairies drift
  for (const { marker, spawn } of world.markers.values()) {
    if (spawn.kind === 'fairy') {
      const p = fairyPosition(spawn, now);
      marker.setLatLng([p.lat, p.lng]);
    }
  }
  // followers trail behind you
  let i = 0;
  for (const [, m] of world.followers) {
    const ang = (now / 3000 + i * 1.7) % (Math.PI * 2);
    const p = offset(world.me, 10 + i * 4, 200 + Math.sin(ang) * 30 + i * 55);
    m.setLatLng([p.lat, p.lng]);
    i++;
  }
  if (Math.floor(t / 500) !== Math.floor((t - dt * 1000) / 500)) updateRangeClasses();
}

function syncFollowers() {
  const ids = new Set(S.save.quests.map((q) => q.id));
  for (const [id, m] of world.followers) {
    if (!ids.has(id)) {
      m.remove();
      world.followers.delete(id);
    }
  }
  for (const q of S.save.quests) {
    if (world.followers.has(q.id)) continue;
    const m = L.marker([world.me.lat, world.me.lng], {
      icon: L.divIcon({ className: 'mk', html: `<div class="mk-follow">${monsterSVG(q.mon.species, { size: 38 })}<i>📷</i></div>`, iconSize: [38, 38], iconAnchor: [19, 34] }),
      zIndexOffset: 900,
    }).addTo(world.map);
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      openQuests();
    });
    world.followers.set(q.id, m);
  }
  const badge = $('#badge-quests');
  badge.textContent = S.save.quests.length || '';
  badge.hidden = !S.save.quests.length;
}

function tickQuests() {
  refreshWorld();
  refreshSheet();
}

// ---------- Top bar & dock ----------

function drawTopbar() {
  const s = S.save;
  $('#tb-name').textContent = s.name;
  $('#tb-level').textContent = `Lv ${s.level}`;
  $('#tb-xp').style.width = `${(s.xp / playerXpToNext(s.level)) * 100}%`;
  $('#tb-avatar').textContent = (s.name[0] || '?').toUpperCase();
  const flags = [];
  if (s.flags.clover) flags.push('🍀');
  if (s.flags.feather) flags.push('🪶');
  $('#tb-flags').textContent = flags.join(' ');
}

function bindDock() {
  $('#dock-buddies').onclick = () => { sfx('tap'); openBuddies(); };
  $('#dock-bag').onclick = () => { sfx('tap'); openBag(); };
  $('#dock-nearby').onclick = () => { sfx('tap'); openNearby(); };
  $('#dock-quests').onclick = () => { sfx('tap'); openQuests(); };
  $('#dock-me').onclick = () => { sfx('tap'); openMe(); };
}

// ---------- Buddies ----------

function hpLine(mon) {
  const max = stats(mon).maxHp;
  const hp = currentHp(mon);
  const pct = (hp / max) * 100;
  return h('div', { class: 'hpline' }, h('div', { class: 'hp' }, h('i', { style: { width: `${pct}%`, background: pct > 50 ? '#5fd38d' : pct > 20 ? '#ffc94a' : '#ff6b6b' } })), h('small', {}, hp ? `${hp}/${max}` : 'Resting'));
}

function buddyCard(mon, onclick) {
  const sp = SPECIES_BY_ID[mon.species];
  return h('button', { class: `buddy-card ${mon.inTeam ? 'in-team' : ''}`, onclick },
    h('div', { class: 'art', html: monsterSVG(mon.species, { size: 76 }) }),
    h('b', {}, displayName(mon)),
    h('small', {}, `Lv ${mon.level} ${ELEMENTS[sp.element].icon}`),
    hpLine(mon),
    mon.inTeam ? h('i', { class: 'team-star' }, '★') : null);
}

function openBuddies(pickFor) {
  openSheet(pickFor ? `Use ${ITEMS[pickFor].name} on...` : 'Buddies', () => {
    const s = S.save;
    if (!s.buddies.length) return h('div', { class: 'empty' }, h('div', { class: 'big-emoji' }, '🥚'), h('p', {}, 'No buddies yet. Go meet some monsters!'));
    const tm = team();
    const others = s.buddies.filter((b) => !b.inTeam);
    return h('div', {},
      pickFor ? null : h('p', { class: 'hint' }, `Your battle team (${tm.length}/3) ★ — tap a buddy for details. Buddies heal fully after 20 minutes of rest.`),
      h('div', { class: 'buddy-grid' }, [...tm, ...others].map((m) => buddyCard(m, () => (pickFor ? applyItem(pickFor, m) : pushSheet(displayName(m), () => buddyDetail(m)))))),
      pickFor ? null : h('p', { class: 'hint center' }, `Species found ${new Set(s.buddies.map((b) => b.species)).size}/${SPECIES.length}`),
    );
  });
}

function buddyDetail(mon) {
  const sp = SPECIES_BY_ID[mon.species];
  const st = stats(mon);
  const el = ELEMENTS[sp.element];
  const pers = PERSONALITIES[mon.personality];
  const how = howInfo(mon.how);
  return h('div', { class: 'detail' },
    h('div', { class: 'detail-art', html: monsterSVG(mon.species, { size: 170 }) }),
    h('div', { class: 'chips-row', html: `<span class="chip el" style="--c:${el.color}">${el.icon} ${el.name}</span><span class="chip">${pers.emoji} ${pers.label}</span><span class="chip rar" style="--c:${RARITY[sp.rarity].color}">${RARITY[sp.rarity].label}</span>` }),
    h('p', { class: 'blurb' }, sp.blurb),
    h('div', { class: 'stat-grid' },
      h('div', {}, h('small', {}, 'Level'), h('b', {}, mon.level), h('div', { class: 'xpbar' }, h('i', { style: { width: `${(mon.xp / xpToNext(mon.level)) * 100}%` } }))),
      h('div', {}, h('small', {}, 'HP'), hpLine(mon)),
      h('div', {}, h('small', {}, 'Attack'), h('b', {}, st.atk)),
      h('div', {}, h('small', {}, 'Defense'), h('b', {}, st.def)),
      h('div', {}, h('small', {}, 'Speed'), h('b', {}, st.spd)),
      h('div', {}, h('small', {}, 'Met by'), h('b', {}, `${how.icon} ${how.label}`)),
    ),
    h('div', { class: 'moves' }, sp.moves.map((id) => {
      const mv = MOVES[id];
      return h('span', { class: 'move-pill' }, `${mv.element ? ELEMENTS[mv.element].icon : '✊'} ${mv.name}`);
    })),
    h('div', { class: 'detail-actions' },
      h('button', {
        class: `btn ${mon.inTeam ? 'ghost' : 'primary'}`,
        onclick: () => {
          if (!mon.inTeam && team().length >= 3) return toast('Your team is full (3). Remove someone first.');
          if (mon.inTeam && team().length <= 1) return toast('You need at least one buddy in your team.');
          mon.inTeam = !mon.inTeam;
          persist();
          refreshSheet();
        },
      }, mon.inTeam ? 'Remove from team' : '★ Add to team'),
      h('button', { class: 'btn ghost', disabled: !S.save.bag.tonic || currentHp(mon) >= st.maxHp, onclick: () => applyItem('tonic', mon, true) }, `🧪 Tonic (${S.save.bag.tonic || 0})`),
      h('button', { class: 'btn ghost', disabled: !S.save.bag.candy, onclick: () => applyItem('candy', mon, true) }, `🍬 Star Candy (${S.save.bag.candy || 0})`),
      h('button', {
        class: 'btn ghost',
        onclick: () => {
          const name = prompt('Nickname', displayName(mon));
          if (name == null) return;
          mon.nickname = name.trim().slice(0, 14) || null;
          persist();
          refreshSheet();
        },
      }, '✏️ Nickname'),
      h('button', {
        class: 'btn danger',
        onclick: async () => {
          if (S.save.buddies.length <= 1) return toast('You cannot say goodbye to your last buddy!');
          const ok = await modal({ art: monsterSVG(mon.species, { size: 110, cls: 'sad' }), title: `Say goodbye to ${displayName(mon)}?`, text: 'It will go back to the wild. This cannot be undone.', choices: [{ label: 'Keep', value: false, cls: 'primary' }, { label: 'Goodbye', value: true, cls: 'danger' }] });
          if (!ok) return;
          S.save.buddies = S.save.buddies.filter((b) => b.uid !== mon.uid);
          if (!team().length) S.save.buddies[0].inTeam = true;
          persist();
          openBuddies();
        },
      }, '👋 Release'),
    ),
  );
}

function applyItem(id, mon, stay = false) {
  const st = stats(mon);
  if (id === 'tonic') {
    if (currentHp(mon) >= st.maxHp) return toast(`${displayName(mon)} is already healthy`);
    useItem('tonic');
    setHp(mon, currentHp(mon) + st.maxHp * 0.5);
    toast(`${displayName(mon)} feels better! 🧪`);
  } else if (id === 'candy') {
    useItem('candy');
    giveXp(mon, xpToNext(mon.level) - mon.xp);
    toast(`${displayName(mon)} grew to Lv ${mon.level}! 🍬`);
  }
  sfx('happy');
  persist();
  if (stay) refreshSheet();
  else openBag();
}

// ---------- Bag ----------

function openBag() {
  openSheet('Bag', () => {
    const bag = S.save.bag;
    const ids = Object.keys(ITEMS).filter((id) => bag[id] > 0);
    if (!ids.length) return h('div', { class: 'empty' }, h('div', { class: 'big-emoji' }, '🎒'), h('p', {}, 'Your bag is empty. Make fairies happy to get presents!'));
    return h('div', { class: 'item-list' }, ids.map((id) => {
      const it = ITEMS[id];
      let action = null;
      if (id === 'tonic' || id === 'candy') action = h('button', { class: 'btn small primary', onclick: () => openBuddies(id) }, 'Use');
      if (id === 'clover') action = h('button', { class: 'btn small primary', disabled: S.save.flags.clover, onclick: () => activate('clover') }, S.save.flags.clover ? 'Active' : 'Use');
      if (id === 'feather') action = h('button', { class: 'btn small primary', disabled: S.save.flags.feather, onclick: () => activate('feather') }, S.save.flags.feather ? 'Active' : 'Use');
      if (id === 'prism') action = h('button', { class: 'btn small primary', onclick: usePrism }, 'Use');
      return h('div', { class: `item-row ${it.rarity}` },
        h('div', { class: 'item-icon' }, it.icon),
        h('div', { class: 'item-text' }, h('b', {}, `${it.name} `, h('span', { class: 'qty' }, `×${bag[id]}`)), h('small', {}, it.desc), h('span', { class: 'rar-tag', style: { color: RARITY[it.rarity].color } }, RARITY[it.rarity].label)),
        action);
    }));
  });
}

function activate(flag) {
  if (!useItem(flag)) return;
  S.save.flags[flag] = true;
  persist();
  sfx('happy');
  toast(flag === 'clover' ? '🍀 The next monster you meet is more likely to like you!' : '🪶 The next monster you meet will want to be friends!');
  drawTopbar();
  refreshSheet();
}

function usePrism() {
  if (!useItem('prism')) return;
  for (const m of team()) {
    giveXp(m, xpToNext(m.level) - m.xp);
    setHp(m, stats(m).maxHp);
  }
  persist();
  sfx('join');
  toast('💎 Your team glows with rainbow light! Healed and +1 level!');
  refreshSheet();
}

// ---------- Quests (monsters following you) ----------

function openQuests() {
  openSheet('Following you', () => {
    const qs = S.save.quests;
    if (!qs.length) return h('div', { class: 'empty' }, h('div', { class: 'big-emoji' }, '👣'), h('p', {}, 'Nobody is following you. When a monster asks for something and you accept, it follows you for 24 hours while you look for it.'));
    return h('div', { class: 'quest-list' }, qs.map((q) => {
      const sp = SPECIES_BY_ID[q.mon.species];
      const req = REQUESTS_BY_ID[q.request];
      return h('div', { class: 'quest' },
        h('div', { class: 'art', html: monsterSVG(q.mon.species, { size: 70 }) }),
        h('div', { class: 'quest-text' },
          h('b', {}, `${sp.name} `, h('span', { class: 'lv' }, `Lv ${q.mon.level}`)),
          h('p', {}, `Wants to see ${req.ask}`),
          h('small', {}, `⏳ Leaves in ${formatDuration(q.expires - Date.now())}`)),
        h('div', { class: 'quest-actions' },
          h('button', {
            class: 'btn small primary',
            onclick: async () => {
              const file = await pickPhoto();
              if (!file) return;
              await judgeQuestPhoto(q, file);
              refreshWorld(true);
              refreshSheet();
            },
          }, '📷 Show photo'),
          h('button', {
            class: 'btn small ghost',
            onclick: async () => {
              const ok = await modal({ title: `Let ${sp.name} go?`, text: 'It will stop following you and go home.', choices: [{ label: 'Keep', value: false, cls: 'primary' }, { label: 'Let go', value: true }] });
              if (!ok) return;
              S.save.quests = S.save.quests.filter((x) => x.id !== q.id);
              persist();
              refreshWorld(true);
              refreshSheet();
            },
          }, 'Let go')));
    }));
  });
}

// ---------- Nearby radar ----------

function openNearby() {
  openSheet('Nearby', () => {
    const now = Date.now();
    const list = [...world.markers.values()].map(({ spawn }) => ({ spawn, d: distance(world.me, spawnPos(spawn, now)), b: bearing(world.me, spawnPos(spawn, now)) }))
      .sort((a, b) => a.d - b.d).slice(0, 25);
    if (!list.length) return h('div', { class: 'empty' }, h('p', {}, 'Nothing nearby right now. Monsters move every 20 minutes — try walking somewhere new!'));
    return h('div', { class: 'nearby' }, list.map(({ spawn, d, b }) => {
      const isF = spawn.kind === 'fairy';
      const sp = isF ? null : SPECIES_BY_ID[spawn.species];
      return h('button', {
        class: 'near-row',
        onclick: () => {
          closeSheet();
          world.follow = false;
          $('#btn-center').classList.add('show');
          const p = spawnPos(spawn);
          world.map.setView([p.lat, p.lng], 19);
        },
      },
      h('div', { class: 'art', html: isF ? fairySVG(spawn.fairy, 44) : monsterSVG(spawn.species, { size: 48 }) }),
      h('div', { class: 'near-text' },
        h('b', {}, isF ? (spawn.fairy === 'trickster' ? 'Trickster Fairy' : 'Question Fairy') : sp.name),
        h('small', {}, isF ? 'Flying around' : `Lv ${spawn.level} · ${PERSONALITIES[spawn.personality].emoji} ${PERSONALITIES[spawn.personality].label}${sp.rarity !== 'common' ? ` · ${RARITY[sp.rarity].label}` : ''}`)),
      h('div', { class: 'near-dist' }, h('i', { class: 'arrow', style: { transform: `rotate(${b}deg)` } }, '↑'), formatDistance(d)));
    }));
  });
}

// ---------- Me / settings ----------

function openMe() {
  openSheet('Me', () => {
    const s = S.save;
    const st = s.stats;
    return h('div', { class: 'me' },
      h('div', { class: 'me-head' }, h('div', { class: 'avatar big' }, (s.name[0] || '?').toUpperCase()), h('div', {}, h('b', {}, s.name), h('small', {}, `Level ${s.level} · ${s.xp}/${playerXpToNext(s.level)} XP`))),
      h('div', { class: 'stat-grid' },
        h('div', {}, h('small', {}, 'Buddies'), h('b', {}, s.buddies.length)),
        h('div', {}, h('small', {}, 'Befriended'), h('b', {}, st.befriended)),
        h('div', {}, h('small', {}, 'Battles won'), h('b', {}, st.battlesWon)),
        h('div', {}, h('small', {}, 'Fairies helped'), h('b', {}, st.fairies)),
        h('div', {}, h('small', {}, 'Photos shown'), h('b', {}, st.photos)),
        h('div', {}, h('small', {}, 'Buddies lost'), h('b', {}, st.lost)),
      ),
      h('h4', {}, 'Settings'),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Movement'), h('small', {}, s.settings.mode === 'gps' ? 'Real GPS — walk around outside' : 'Explore — tap the map to move (for testing / indoors)')),
        h('div', { class: 'seg' },
          h('button', { class: s.settings.mode === 'gps' ? 'on' : '', onclick: () => setMode('gps') }, 'GPS'),
          h('button', { class: s.settings.mode === 'explore' ? 'on' : '', onclick: () => setMode('explore') }, 'Explore'))),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'AR camera'), h('small', {}, 'Show monsters through your camera')),
        h('div', { class: 'seg' },
          h('button', { class: s.settings.ar ? 'on' : '', onclick: () => { s.settings.ar = true; persist(); refreshSheet(); } }, 'On'),
          h('button', { class: !s.settings.ar ? 'on' : '', onclick: () => { s.settings.ar = false; persist(); refreshSheet(); } }, 'Off'))),
      h('div', { class: 'setting' }, h('div', {}, h('b', {}, 'Sound')),
        h('div', { class: 'seg' },
          h('button', { class: s.settings.sound ? 'on' : '', onclick: () => { s.settings.sound = sound.on = true; persist(); refreshSheet(); } }, 'On'),
          h('button', { class: !s.settings.sound ? 'on' : '', onclick: () => { s.settings.sound = sound.on = false; persist(); refreshSheet(); } }, 'Off'))),
      h('h4', {}, 'How to play'),
      h('ul', { class: 'howto' },
        h('li', { html: '🗺️ Monsters appear around you on the real map and move every 20 minutes. Get <b>right next to one</b> (about 1 m, plus your GPS error) and tap it.' }),
        h('li', { html: '🍀 <b>Luck</b>: some monsters like you at first sight and just ask to join.' }),
        h('li', { html: '💬 <b>Talk</b>: friendly ones want a chat, shy ones want a treat, playful ones want a game, curious ones want a <b>photo</b> of something from your world. Accept and they follow you for 24 hours while you look.' }),
        h('li', { html: '⚔️ <b>Battle</b>: proud and fierce monsters respect strength. Win with your team of 3 and they join — but lose and one of your buddies may leave you. Use element matchups!' }),
        h('li', { html: '🧚 <b>Fairies</b> fly around. Answer their questions, survive their tricks, or give them what they want, then pick a present — sometimes a rare one.' }),
        h('li', { html: '🔥 beats 🌿🌀 · 💧 beats 🔥🪨 · 🌿 beats 💧🪨 · ⚡ beats 💧🌀 · 🪨 beats ⚡🔥 · 🌀 beats 🌿⚡ · 🌙 beats 🌙' }),
      ),
      h('button', {
        class: 'btn danger wide',
        onclick: async () => {
          const ok = await modal({ title: 'Start over?', text: 'This deletes your buddies, items and progress on this device.', choices: [{ label: 'Cancel', value: false, cls: 'primary' }, { label: 'Delete everything', value: true, cls: 'danger' }] });
          if (ok) reset();
        },
      }, 'Reset game'),
      h('p', { class: 'hint center' }, 'Map data © OpenStreetMap contributors'),
    );
  });
}

window.addEventListener('pagehide', () => S.save && persist());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && S.save) persist();
});

boot();
