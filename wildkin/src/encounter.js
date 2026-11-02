// Encounters in AR: meeting a monster (luck / talk / battle) and meeting a fairy (task -> present).
import {
  SPECIES_BY_ID, PERSONALITIES, ELEMENTS, RARITY, MOVES, ITEMS, CHAT_QUESTIONS, LINES,
  FAIRY_KINDS, FAIRY_SUCCESS, FAIRY_FAIL, REQUESTS_BY_ID,
} from './data.js';
import {
  makeMonster, currentHp, setHp, giveXp, givePlayerXp, luckChance, pickRequest, chatScore,
  teamPower, pickFairyTask, fairyHello, rollPresents, displayName,
} from './game.js';
import { createBattle, takeTurn, activeFighter, rollLoss, xpReward } from './battle.js';
import { scanPhoto } from './scan.js';
import { monsterArt } from './portraits.js';
import {
  startAR, stopAR, anchorHere, requestSensors, setCamera, showMonster, showFairy, showBuddy, hideBuddy,
  act as arAct, attack, sparkleAt, setPetHandler, xrSupported, startXR,
} from './ar.js';
import { S, persist, team, addItem, useItem } from './store.js';
import { $, h, sleep, toast, modal, sfx, vibrate } from './ui.js';
import { R, rng } from './util.js';

export const QUEST_MS = 24 * 60 * 60 * 1000;

let cur = null; // the open encounter
const memory = new Map(); // spawn id -> { lucky, talked }
let onClosed = () => {};

export function setEncounterHooks({ closed }) {
  onClosed = closed;
}

// ---------- Screen plumbing ----------

let tipShown = false;

function openScene(show) {
  requestSensors();
  const scene = $('#encounter');
  $('#ar-actor').className = 'actor';
  $('#ar-actor').innerHTML = '';
  $('#bubble').classList.remove('show');
  $('#enc-panel').replaceChildren();
  $('#battle-hud').hidden = true;
  scene.classList.remove('battling');
  scene.classList.add('show');
  startAR(S.save.settings.ar);
  const info = show() || {};
  if (!tipShown) {
    tipShown = true;
    setTimeout(() => toast(info.flies
      ? '🪽 It is flying! Tap the floor to call it over · swipe to spin it'
      : '👣 It is standing on the floor. Tap the floor to move it · swipe to spin it', 4200), 1600);
  }
  $('#enc-ar').onclick = async () => {
    const on = await setCamera(!scene.classList.contains('camera-on'));
    S.save.settings.ar = on;
    persist();
    toast(on ? 'AR camera on' : 'AR camera off');
  };
  const xrBtn = $('#enc-xr');
  xrBtn.hidden = true;
  xrSupported().then((ok) => { xrBtn.hidden = !ok; });
  xrBtn.onclick = async () => {
    const ok = await startXR(() => toast('Back to normal AR'));
    if (!ok) toast('AR+ is not available on this device');
  };
  setPetHandler(() => {
    sfx('happy');
    vibrate(15);
  });
  $('#enc-close').onclick = () => closeScene();
  $('#enc-recenter').onclick = () => {
    anchorHere();
    toast($('#encounter').classList.contains('xr') ? 'Pick a new spot for it' : 'Brought it in front of you');
  };
}

export function closeScene() {
  if (!cur) return;
  if (cur.busy) {
    toast('Finish what you are doing first!');
    return;
  }
  stopAR();
  $('#encounter').classList.remove('show');
  cur = null;
  onClosed();
}

async function say(text, { wait = 900 } = {}) {
  const b = $('#bubble');
  b.classList.add('show');
  b.textContent = '';
  const speedy = text.length > 70 ? 2 : 1;
  for (let i = 0; i < text.length; i += speedy) {
    b.textContent = text.slice(0, i + speedy);
    if (i % 6 === 0) sfx('talk');
    await sleep(18);
  }
  b.textContent = text;
  await sleep(wait);
}

function act(name, who = 'foe') {
  return arAct(name, who);
}

// options: [{label, value, disabled, cls, sub}] -> Promise(value)
function choose(options, { layout = 'list', prompt = '' } = {}) {
  return new Promise((resolve) => {
    const panel = $('#enc-panel');
    const wrap = h('div', { class: `choices ${layout}` },
      prompt ? h('p', { class: 'choice-prompt' }, prompt) : null,
      options.map((o) => h('button', {
        class: `choice ${o.cls || ''}`,
        disabled: o.disabled,
        onclick: () => {
          sfx('tap');
          panel.replaceChildren();
          resolve(o.value);
        },
      }, h('span', { class: 'choice-label', html: o.label }), o.sub ? h('small', {}, o.sub) : null)));
    panel.replaceChildren(wrap);
  });
}

// Pick a photo with the phone camera. Resolves null if cancelled.
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = $('#photo-input');
    input.value = '';
    let done = false;
    const finish = (f) => {
      if (done) return;
      done = true;
      window.removeEventListener('focus', onFocus);
      resolve(f);
    };
    const onFocus = () => setTimeout(() => finish(input.files?.[0] || null), 1200);
    input.onchange = () => finish(input.files?.[0] || null);
    input.oncancel = () => finish(null);
    setTimeout(() => window.addEventListener('focus', onFocus), 300);
    input.click();
  });
}

// ---------- Befriending ----------

const HOW = {
  luck: { label: 'Fate', icon: '🍀', text: 'It simply liked you.' },
  talk: { label: 'Chat', icon: '💬', text: 'You became friends by talking.' },
  photo: { label: 'Request', icon: '📷', text: 'You found what it wished to see.' },
  game: { label: 'Game', icon: '🎲', text: 'You won its little game.' },
  respect: { label: 'Respect', icon: '💪', text: 'It respected your strength.' },
  battle: { label: 'Battle', icon: '⚔️', text: 'You won it over in battle.' },
  starter: { label: 'Partner', icon: '⭐', text: 'Your very first partner.' },
};
export const howInfo = (how) => HOW[how] || HOW.talk;

export async function befriend(data, how) {
  const mon = makeMonster(data, how);
  if (team().length < 3) mon.inTeam = true;
  S.save.buddies.push(mon);
  S.save.stats.befriended++;
  const isNew = (S.save.dex ||= {})[data.species] !== 'friend';
  S.save.dex[data.species] = 'friend';
  const sp = SPECIES_BY_ID[data.species];
  const xp = RARITY[sp.rarity].xp + (how === 'battle' ? 15 : 0);
  const ups = givePlayerXp(S.save, xp);
  persist();
  sfx('join');
  vibrate([30, 40, 60]);
  await modal({
    art: `<div class="celebrate">${monsterArt(data.species, { size: 170 })}</div>`,
    title: `${isNew ? '✨ New! ' : ''}${sp.name} is now your buddy!`,
    text: `${HOW[how].icon} <b>${HOW[how].label}</b> — ${HOW[how].text}<br><span class="xp">+${xp} XP${ups ? ` · Level up! You are now Lv ${S.save.level}` : ''}</span>${mon.inTeam ? '' : '<br><small>Your team is full, so it is resting in Buddies.</small>'}`,
    choices: [{ label: 'Yay!', value: true, cls: 'primary' }],
  });
  return mon;
}

function resolveSpawn(spawn) {
  S.save.resolved[spawn.id] = spawn.expires + 60000;
  persist();
}

// ---------- Monster encounter ----------

const INTRO = {
  friendly: '*waves at you happily*',
  curious: '*tilts its head and stares at your phone*',
  playful: '*bounces around you in circles*',
  shy: '*peeks out at you from a safe distance*',
  proud: '*looks down at you, unimpressed*',
  fierce: '*growls and stamps the ground*',
};

export async function openMonster(spawn) {
  const sp = SPECIES_BY_ID[spawn.species];
  const pers = PERSONALITIES[spawn.personality];
  const el = ELEMENTS[sp.element];
  const wild = { species: spawn.species, level: spawn.level, personality: spawn.personality };
  cur = { spawn, wild, busy: false };
  const mem = memory.get(spawn.id) || {};
  memory.set(spawn.id, mem);
  S.save.dex ||= {};
  if (!S.save.dex[spawn.species]) {
    S.save.dex[spawn.species] = 'seen';
    persist();
  }

  openScene(() => showMonster(spawn.species));
  $('#enc-title').innerHTML = `<b>${sp.name}</b><span class="lv">Lv ${spawn.level}</span>
    <span class="chip el" style="--c:${el.color}">${el.icon} ${el.name}</span>
    <span class="chip">${pers.emoji} ${pers.label}</span>
    ${sp.look.flies ? '<span class="chip">🪽 Flying</span>' : ''}
    ${sp.rarity !== 'common' ? `<span class="chip rar" style="--c:${RARITY[sp.rarity].color}">${RARITY[sp.rarity].label}</span>` : ''}`;
  sfx('appear');
  vibrate(25);
  await sleep(700);

  // Way 3: luck — it just likes you.
  if (mem.lucky == null) {
    mem.lucky = R() < luckChance(wild, S.save);
    if (S.save.flags.clover || S.save.flags.feather) {
      if (S.save.flags.feather && sp.rarity !== 'legendary') S.save.flags.feather = false;
      S.save.flags.clover = false;
      persist();
    }
  }
  if (mem.lucky) {
    act('love');
    await say(rng(spawn.seed).pick(LINES.luck));
    const yes = await choose([
      { label: '💖 Yes! Let us be friends', value: true, cls: 'primary' },
      { label: 'Not right now', value: false },
    ]);
    if (!cur) return;
    if (yes) {
      resolveSpawn(spawn);
      await befriend(wild, 'luck');
      closeScene();
      return;
    }
    mem.lucky = false;
  }
  await say(INTRO[spawn.personality], { wait: 300 });
  menu();
}

async function menu() {
  if (!cur) return;
  const mem = memory.get(cur.spawn.id);
  const healthy = team().filter((m) => currentHp(m) > 0);
  const choice = await choose([
    { label: '💬 Talk', value: 'talk', disabled: mem.talked, sub: mem.talked ? 'It does not want to chat anymore' : 'Make friends' },
    { label: '⚔️ Battle', value: 'battle', disabled: !healthy.length, sub: healthy.length ? `Win and it joins you — lose and a buddy might leave` : S.save.buddies.length ? 'Your team needs rest' : 'You have no buddies to fight with' },
    { label: '👋 Leave', value: 'leave' },
  ], { layout: 'grid' });
  if (!cur) return;
  if (choice === 'leave') return closeScene();
  if (choice === 'battle') return battle();
  mem.talked = true;
  return talk();
}

// Way 2: talk. What happens depends on the monster's personality.
async function talk() {
  const { wild, spawn } = cur;
  switch (wild.personality) {
    case 'friendly':
      return chat(0, 4);
    case 'curious':
      return request();
    case 'playful':
      return play();
    case 'shy': {
      act('shake');
      await say(rng(spawn.seed).pick(LINES.shyHide));
      const opts = [];
      if (S.save.bag.berry) opts.push({ label: `${ITEMS.berry.icon} Offer a Sweetberry`, value: 'berry', sub: `You have ${S.save.bag.berry}` });
      if (S.save.bag.cake) opts.push({ label: `${ITEMS.cake.icon} Offer a Honey Cake`, value: 'cake', sub: `You have ${S.save.bag.cake}` });
      opts.push({ label: '🤫 Talk to it softly', value: 'soft', sub: 'Harder without a treat' });
      opts.push({ label: '👋 Leave it be', value: 'leave' });
      const c = await choose(opts);
      if (c === 'leave') return closeScene();
      if (c === 'soft') return chat(0, 5);
      useItem(c);
      persist();
      act('love');
      sfx('happy');
      await say('*nibbles happily* ...You are nice.');
      return chat(c === 'cake' ? 3 : 2, 4);
    }
    case 'proud': {
      const power = teamPower(S.save.buddies);
      if (power >= wild.level + 3) {
        act('hop');
        await say(rng(spawn.seed).pick(LINES.proudHigh));
        resolveSpawn(spawn);
        await befriend(wild, 'respect');
        return closeScene();
      }
      await say(rng(spawn.seed).pick(LINES.proudLow));
      await say(`(It respects partners around Lv ${wild.level + 3}. Or prove yourself in battle!)`, { wait: 500 });
      return menu();
    }
    case 'fierce':
    default:
      act('shake');
      sfx('sad');
      await say(rng(spawn.seed).pick(LINES.fierce));
      await say('(It will not listen. Only a battle will win it over.)', { wait: 500 });
      return menu();
  }
}

async function chat(bonus, need) {
  const { wild, spawn } = cur;
  const sp = SPECIES_BY_ID[wild.species];
  const r = rng(spawn.seed + 3);
  const questions = r.shuffle(CHAT_QUESTIONS).slice(0, 3);
  let score = bonus;
  for (const q of questions) {
    await say(q.q, { wait: 150 });
    const ans = await choose(r.shuffle(q.a).map((a) => ({ label: a.text, value: a })));
    if (!cur) return;
    const s = chatScore(ans.tags, sp.likes);
    score += s;
    if (s > 0) {
      act('hop');
      sfx('happy');
      await say(r.pick(['Ooh, me too!! 💖', 'Yes yes yes! 💕', 'I knew I liked you! ✨', 'Wow, same! 💖']));
    } else {
      sfx('sad');
      await say(r.pick(['Hmm... okay.', 'Oh. I see...', '*blinks*', 'Huh. Interesting.']));
    }
  }
  if (score >= need) {
    act('love');
    await say(r.pick(LINES.chatWin));
    resolveSpawn(spawn);
    await befriend(wild, 'talk');
    return closeScene();
  }
  // Not quite friends — maybe it asks for something instead.
  if (wild.personality !== 'shy' && r() < 0.6) {
    await say('Hmm... but maybe if you showed me something...', { wait: 300 });
    return request();
  }
  act('sad');
  await say(r.pick(LINES.chatLose));
  return menu();
}

async function play() {
  const { spawn } = cur;
  const r = rng(spawn.seed + 11);
  await say(r.pick(LINES.playIntro));
  let wins = 0;
  for (let round = 1; round <= 3; round++) {
    const pick = await choose([
      { label: '🐾 Left paw', value: 0 },
      { label: 'Right paw 🐾', value: 1 },
    ], { layout: 'grid', prompt: `Round ${round} of 3 — you need 2 wins` });
    if (!cur) return;
    const hidden = R() < 0.5 ? 0 : 1;
    if (pick === hidden) {
      wins++;
      act('hop');
      sfx('happy');
      await say('Aww, you found it!', { wait: 500 });
    } else {
      sfx('miss');
      await say('Hee hee, wrong paw!', { wait: 500 });
    }
    if (wins === 2 || round - wins === 2) break;
  }
  if (wins >= 2) {
    act('love');
    await say('You are good at this! Let us play forever!');
    resolveSpawn(spawn);
    await befriend(cur.wild, 'game');
    return closeScene();
  }
  await say('I win! Okay okay... then do something for me instead!', { wait: 300 });
  return request();
}

// It asks for something from the real world. Accepting it means it follows you for 24 hours.
async function request() {
  const { wild, spawn } = cur;
  const req = pickRequest(wild, spawn.seed);
  act('hop');
  await say(req.line);
  const c = await choose([
    { label: '📷 I will find it!', value: 'yes', cls: 'primary', sub: 'It will follow you for 24 hours while you look' },
    { label: 'Sorry, not now', value: 'no' },
  ]);
  if (!cur) return;
  if (c === 'no') {
    act('sad');
    await say('Aww... okay.');
    return menu();
  }
  const quest = {
    id: spawn.id, mon: wild, request: req.id, startedAt: Date.now(), expires: Date.now() + QUEST_MS,
  };
  S.save.quests.push(quest);
  resolveSpawn(spawn);
  persist();
  act('love');
  await say('Yay! I will follow you! Show me when you find it~');
  const now = await choose([
    { label: '📷 I see one right now!', value: 'now', cls: 'primary' },
    { label: '🚶 Let us go look', value: 'later', sub: 'Open Quests any time to show it a photo' },
  ]);
  if (!cur) return;
  if (now === 'now') {
    cur.busy = true;
    const file = await pickPhoto();
    cur.busy = false;
    if (file) {
      const ok = await judgeQuestPhoto(quest, file);
      if (ok) return closeScene();
    }
  }
  toast(`${SPECIES_BY_ID[wild.species].name} is following you (24h)`);
  closeScene();
}

// Shared with the Quests screen. Returns true if the monster joined.
export async function judgeQuestPhoto(quest, file) {
  const req = REQUESTS_BY_ID[quest.request];
  const sp = SPECIES_BY_ID[quest.mon.species];
  sfx('shutter');
  toast(req.kind === 'object' ? 'Looking closely at your photo...' : 'Scanning your photo...', 6000);
  let res;
  try {
    res = await scanPhoto(file, req);
  } catch (e) {
    console.warn(e);
    toast('Could not read that photo');
    return false;
  }
  S.save.stats.photos++;
  const viaNote = res.via === 'colors-fallback' ? '<br><small>(Offline check — judged by colors)</small>' : '';
  if (res.ok) {
    S.save.quests = S.save.quests.filter((q) => q.id !== quest.id);
    persist();
    sfx('happy');
    await modal({
      art: `<div class="photo-pair"><img src="${res.url}" alt="your photo"><div>${monsterArt(sp.id, { size: 110, cls: 'love' })}</div></div>`,
      title: `${sp.name} loves it!`,
      text: `“${rng(quest.startedAt).pick(LINES.requestThanks)}”${viaNote}`,
      choices: [{ label: 'Hooray!', value: true, cls: 'primary' }],
    });
    await befriend(quest.mon, 'photo');
    return true;
  }
  persist();
  sfx('sad');
  await modal({
    art: `<div class="photo-pair"><img src="${res.url}" alt="your photo"><div>${monsterArt(sp.id, { size: 110, cls: 'sad' })}</div></div>`,
    title: 'Not quite...',
    text: `“${rng(Date.now()).pick(LINES.requestNope)} I wanted <b>${req.ask}</b>.”${res.seen ? `<br><small>It thinks it sees: ${res.seen.split(',')[0]}</small>` : ''}${viaNote}`,
    choices: [{ label: 'I will keep looking', value: true, cls: 'primary' }],
  });
  return false;
}

// ---------- Way 1: battle ----------

function hpBar(f) {
  const pct = Math.max(0, (f.hp / f.maxHp) * 100);
  return `<div class="hp"><i style="width:${pct}%;background:${pct > 50 ? '#5fd38d' : pct > 20 ? '#ffc94a' : '#ff6b6b'}"></i></div><small>${f.hp}/${f.maxHp}</small>`;
}

function drawBattle(b) {
  const me = activeFighter(b);
  $('#bh-foe').innerHTML = `<b>${b.foe.name}</b> <span class="lv">Lv ${b.foe.mon.level}</span> ${ELEMENTS[b.foe.element].icon}${hpBar(b.foe)}`;
  $('#bh-you').innerHTML = `<div class="bh-art">${monsterArt(me.mon.species, { size: 74 })}</div><div><b>${me.name}</b> <span class="lv">Lv ${me.mon.level}</span> ${ELEMENTS[me.element].icon}${hpBar(me)}<div class="bench">${b.you.map((f, i) => `<i class="${f.hp > 0 ? 'ok' : 'down'} ${i === b.active ? 'cur' : ''}"></i>`).join('')}</div></div>`;
}

function floatText(text, target, cls = '') {
  const el = h('div', { class: `float ${cls} ${target}` }, text);
  $('#fx').append(el);
  setTimeout(() => el.remove(), 1100);
}

async function battle() {
  const { wild, spawn } = cur;
  const members = team();
  if (!members.some((m) => currentHp(m) > 0)) {
    toast('Your team needs rest first');
    return menu();
  }
  cur.busy = true;
  const b = createBattle(members, makeMonster(wild, 'wild'));
  $('#encounter').classList.add('battling');
  $('#battle-hud').hidden = false;
  $('#bubble').classList.remove('show');
  act('shake');
  await say(wild.personality === 'fierce' ? 'GRAAAH!' : 'Show me what you have got!', { wait: 500 });
  $('#bubble').classList.remove('show');
  const log = $('#battle-log');
  log.textContent = `Go, ${activeFighter(b).name}!`;
  showBuddy(activeFighter(b).mon.species);
  drawBattle(b);
  await sleep(600);

  while (!b.over) {
    const me = activeFighter(b);
    const moves = SPECIES_BY_ID[me.mon.species].moves;
    const bench = b.you.map((f, i) => ({ f, i })).filter(({ f, i }) => f.hp > 0 && i !== b.active);
    let action = await choose([
      ...moves.map((id) => {
        const mv = MOVES[id];
        const el = mv.element ? ELEMENTS[mv.element] : null;
        return { label: `${el ? el.icon : '✊'} ${mv.name}`, value: { type: 'move', move: id }, cls: 'move', sub: mv.kind === 'hit' ? `Power ${mv.power}` : mv.kind === 'guard' ? 'Block the next hit' : 'Raise attack' };
      }),
      { label: `${ITEMS.tonic.icon} Tonic`, value: { type: 'item' }, disabled: !S.save.bag.tonic || me.hp === me.maxHp, sub: `${S.save.bag.tonic || 0} left`, cls: 'move' },
      { label: '🔁 Switch', value: 'switch', disabled: !bench.length, cls: 'move' },
      { label: '🏃 Run', value: { type: 'flee' }, cls: 'move' },
    ], { layout: 'battle' });
    if (action === 'switch') {
      action = await choose([
        ...bench.map(({ f, i }) => ({ label: `${f.name} <small>Lv ${f.mon.level} · ${f.hp}/${f.maxHp} HP</small>`, value: { type: 'switch', index: i } })),
        { label: '↩ Back', value: null },
      ]);
      if (!action) continue;
    }
    if (action.type === 'item') {
      useItem('tonic');
      persist();
    }
    const events = takeTurn(b, action, R);
    for (const ev of events) {
      log.textContent = ev.text;
      if (ev.kind === 'hit') {
        const target = ev.target === 'foe' ? 'foe' : 'you';
        await attack(ev.who, ev.element, { crit: ev.mult > 1 });
        sfx(ev.mult > 1 ? 'super' : 'hit');
        if (target === 'you') {
          $('#bh-you').classList.remove('hurt');
          void $('#bh-you').offsetWidth;
          $('#bh-you').classList.add('hurt');
          vibrate(40);
        }
        floatText(`-${ev.dmg}`, target, ev.mult > 1 ? 'crit' : '');
      } else if (ev.kind === 'miss') {
        await attack(ev.who, ev.element, { hit: false });
        sfx('miss');
      } else if (ev.kind === 'faint') {
        sfx('faint');
        act('faint', ev.who);
      } else if (ev.kind === 'heal') {
        floatText('+HP', 'you', 'heal');
        sparkleAt('you', '#5fd38d');
      } else if (ev.kind === 'switch') {
        showBuddy(activeFighter(b).mon.species);
      } else if (ev.kind === 'buff') {
        act('hop', ev.who);
        sparkleAt(ev.who, '#ff6b6b');
      } else if (ev.kind === 'guard') {
        act('spin', ev.who);
        sparkleAt(ev.who, '#7cc4ff');
      }
      drawBattle(b);
      await sleep(ev.kind === 'hit' ? 450 : 750);
    }
  }

  // write battle damage back to your buddies
  for (const f of b.you) setHp(f.mon, f.hp);
  cur.busy = false;
  if (b.over === 'win') {
    act('wave', 'you');
    await sleep(900);
  }
  hideBuddy();
  act('enter');
  $('#battle-hud').hidden = true;
  $('#encounter').classList.remove('battling');

  if (b.over === 'fled') {
    persist();
    await say('*watches you run off*', { wait: 400 });
    return menu();
  }
  if (b.over === 'win') {
    S.save.stats.battlesWon++;
    const xp = xpReward(b);
    const grown = [];
    for (const f of b.you) {
      if (f.fought && f.hp > 0 && giveXp(f.mon, xp)) grown.push(`${f.name} grew to Lv ${f.mon.level}!`);
    }
    persist();
    act('love');
    await say(wild.personality === 'fierce' ? '...You are strong. I will follow you.' : 'Wow... you are really strong! Take me with you!');
    if (grown.length) toast(grown.join(' '));
    resolveSpawn(spawn);
    await befriend(wild, 'battle');
    return closeScene();
  }
  // lost
  S.save.stats.battlesLost++;
  resolveSpawn(spawn);
  let lost = rollLoss(b, S.save.buddies.length, false, R);
  let bell = false;
  if (lost && S.save.bag.bell) {
    useItem('bell');
    bell = true;
    lost = null;
  }
  if (lost) {
    S.save.buddies = S.save.buddies.filter((m) => m.uid !== lost.uid);
    S.save.stats.lost++;
  }
  persist();
  act('hop');
  await say('Hmph. Too weak!', { wait: 500 });
  sfx('sad');
  await modal({
    art: lost ? `<div class="gone">${monsterArt(lost.species, { size: 130, cls: 'sad' })}</div>` : bell ? '<div class="big-emoji">🔔</div>' : '',
    title: 'You lost the battle...',
    text: lost
      ? `<b>${displayName(lost)}</b> was so upset by the defeat that it ran off with the wild ${SPECIES_BY_ID[wild.species].name}. 💔<br><small>Train your team and pick good element matchups!</small>`
      : bell
        ? 'Your <b>Guardian Bell</b> rang out and kept your buddies safe! (The bell is used up.)'
        : `The wild ${SPECIES_BY_ID[wild.species].name} left. Luckily all your buddies stayed with you. Let them rest a bit.`,
    choices: [{ label: 'OK', value: true, cls: 'primary' }],
  });
  closeScene();
}

// ---------- Fairies ----------

export async function openFairy(fairy) {
  const k = FAIRY_KINDS[fairy.fairy];
  cur = { spawn: fairy, busy: false };
  openScene(() => showFairy(fairy.fairy));
  $('#enc-title').innerHTML = `<b>${k.name}</b><span class="chip" style="--c:${k.color}">${fairy.fairy === 'trickster' ? '😈 Mischievous' : '❓ Curious'}</span>`;
  sfx('fairy');
  await sleep(500);
  await say(fairyHello(fairy), { wait: 500 });
  const task = pickFairyTask(fairy);
  let success = false;
  let bonus = 0.2;

  switch (task.type) {
    case 'guess': {
      await say(task.text, { wait: 100 });
      const pick = await choose(task.options.map((o, i) => ({ label: o, value: i })), { layout: task.options.length > 2 ? 'list' : 'grid' });
      if (!cur) return;
      success = pick === Math.floor(R() * task.options.length);
      if (!success && S.save.bag.berry && R() < 0.5) {
        useItem('berry');
        persist();
        await say('Wrong~! And I am taking a Sweetberry for my trouble! Hee hee!');
        toast('The fairy snatched a Sweetberry! 🍓');
        return fairyEnd(fairy, false, true);
      }
      bonus = 0.3;
      break;
    }
    case 'riddle':
    case 'quiz': {
      await say(task.text, { wait: 100 });
      const pick = await choose(task.options.map((o, i) => ({ label: o, value: i })));
      if (!cur) return;
      success = pick === task.answer;
      if (!success) await say(`It was “${task.options[task.answer]}”!`, { wait: 500 });
      bonus = 0.5;
      break;
    }
    case 'opinion': {
      await say(task.text, { wait: 100 });
      await choose(task.options.map((o, i) => ({ label: o, value: i })));
      if (!cur) return;
      act('love');
      await say(fairy.fairy === 'trickster' ? 'HAHAHA! *falls over laughing*' : 'Ooh! I am writing that down! *scribble scribble*', { wait: 500 });
      success = true;
      bonus = 0.1;
      break;
    }
    case 'give': {
      await say(task.text, { wait: 100 });
      const has = S.save.bag[task.item] > 0;
      const c = await choose([
        { label: `${ITEMS[task.item].icon} Give one`, value: 'give', disabled: !has, sub: has ? `You have ${S.save.bag[task.item]}` : 'You do not have any' },
        { label: 'Nope!', value: 'no' },
      ], { layout: 'grid' });
      if (!cur) return;
      if (c === 'give') {
        useItem(task.item);
        persist();
        success = true;
        bonus = 0.6;
      }
      break;
    }
    case 'photo': {
      const req = REQUESTS_BY_ID[task.request];
      await say(task.text, { wait: 100 });
      const c = await choose([
        { label: '📷 Take a photo', value: 'snap', cls: 'primary', sub: `Show it ${req.ask}` },
        { label: 'Sorry, not now', value: 'no' },
      ]);
      if (!cur) return;
      if (c === 'snap') {
        cur.busy = true;
        const file = await pickPhoto();
        if (file) {
          sfx('shutter');
          await say('*squints at your photo*', { wait: 200 });
          try {
            const res = await scanPhoto(file, req);
            success = res.ok;
            S.save.stats.photos++;
          } catch {
            success = false;
          }
        }
        cur.busy = false;
        bonus = 0.7;
      }
      break;
    }
    default:
      break;
  }
  return fairyEnd(fairy, success, false, bonus);
}

async function fairyEnd(fairy, success, already, bonus = 0.2) {
  if (!cur) return;
  S.save.resolved[fairy.id] = fairy.expires + 60000;
  persist();
  if (!success) {
    if (!already) {
      sfx('sad');
      await say(rng(fairy.seed).pick(FAIRY_FAIL));
    }
    await act('flyaway');
    return closeScene();
  }
  act('love');
  sfx('fairy');
  await say(rng(fairy.seed + 1).pick(FAIRY_SUCCESS), { wait: 200 });
  const presents = rollPresents(R, bonus);
  const id = await choose(presents.map((p) => {
    const it = ITEMS[p.id];
    return {
      label: `<span class="gift-icon">${it.icon}</span>${it.name}${p.qty > 1 ? ` ×${p.qty}` : ''}`,
      sub: RARITY[it.rarity].label,
      value: p,
      cls: `gift ${it.rarity}`,
    };
  }), { layout: 'gifts', prompt: 'Choose your present!' });
  if (!cur) return;
  addItem(id.id, id.qty);
  S.save.stats.fairies++;
  const ups = givePlayerXp(S.save, 25);
  persist();
  sfx('gift');
  vibrate([20, 30, 20]);
  const it = ITEMS[id.id];
  await say(`Here you go: ${it.icon} ${it.name}${id.qty > 1 ? ` ×${id.qty}` : ''}! Bye-bye~`, { wait: 700 });
  toast(`+25 XP${ups ? ` · Level up! Lv ${S.save.level}` : ''}`);
  await act('flyaway');
  closeScene();
}

