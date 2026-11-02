// Core rules: monster stats, world spawns, fairies, presents, levels. Pure — runs in Node for tests.
import { SPECIES, SPECIES_BY_ID, PERSONALITIES, RARITY, ITEMS, REQUESTS, FAIRY_KINDS, FAIRY_TASKS } from './data.js';
import { rng, offset, clamp } from './util.js';

// ---------- Monsters ----------

export function stats(mon) {
  const sp = SPECIES_BY_ID[mon.species];
  const L = mon.level;
  return {
    maxHp: Math.round(sp.base.hp * (1 + L * 0.1)) + 10,
    atk: Math.round(sp.base.atk * (1 + L * 0.12)),
    def: Math.round(sp.base.def * (1 + L * 0.12)),
    spd: Math.round(sp.base.spd * (1 + L * 0.12)),
  };
}

export const HEAL_FULL_MS = 20 * 60 * 1000; // a buddy fully recovers in 20 minutes of rest

export function currentHp(mon, now = Date.now()) {
  const max = stats(mon).maxHp;
  if (mon.hp == null) return max;
  const healed = ((now - (mon.hpAt ?? now)) / HEAL_FULL_MS) * max;
  return Math.min(max, Math.round(mon.hp + healed));
}

export function setHp(mon, hp, now = Date.now()) {
  mon.hp = clamp(Math.round(hp), 0, stats(mon).maxHp);
  mon.hpAt = now;
}

export const xpToNext = (level) => 12 + level * 8;

// returns number of levels gained
export function giveXp(mon, amount) {
  mon.xp = (mon.xp || 0) + amount;
  let gained = 0;
  while (mon.xp >= xpToNext(mon.level) && mon.level < 50) {
    mon.xp -= xpToNext(mon.level);
    mon.level++;
    gained++;
  }
  return gained;
}

let uidCounter = 0;
export function makeMonster({ species, level, personality }, how = 'wild') {
  return {
    uid: `${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    species, level, personality, xp: 0, hp: null, hpAt: null,
    how, metAt: Date.now(), nickname: null, inTeam: false,
  };
}

export const displayName = (mon) => mon.nickname || SPECIES_BY_ID[mon.species].name;

// ---------- Player ----------

export const playerXpToNext = (level) => 100 + (level - 1) * 60;

export function givePlayerXp(save, amount) {
  save.xp += amount;
  let ups = 0;
  while (save.xp >= playerXpToNext(save.level)) {
    save.xp -= playerXpToNext(save.level);
    save.level++;
    ups++;
  }
  return ups;
}

export const teamPower = (buddies) => buddies.reduce((m, b) => Math.max(m, b.level), 0);

// ---------- World spawns ----------
// The world is split into ~165 m cells. Each cell rolls its own monsters every 20 minutes from a seed,
// so everybody standing in the same place sees the same monsters at the same time.

export const CELL_DEG = 0.0015;
export const MONSTER_WINDOW_MS = 20 * 60 * 1000;
export const FAIRY_WINDOW_MS = 10 * 60 * 1000;

function cellSize(lat) {
  const band = Math.cos((Math.floor(lat) * Math.PI) / 180) || 1;
  return { dLat: CELL_DEG, dLng: CELL_DEG / band };
}

function cellsAround(pos, radius = 2) {
  const { dLat, dLng } = cellSize(pos.lat);
  const cx = Math.floor(pos.lng / dLng);
  const cy = Math.floor(pos.lat / dLat);
  const out = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      out.push({ x, y, lat0: y * dLat, lng0: x * dLng, dLat, dLng });
    }
  }
  return out;
}

export function isNight(date) {
  const h = date.getHours();
  return h >= 19 || h < 6;
}

function speciesWeights(night) {
  const w = {};
  for (const s of SPECIES) {
    let weight = RARITY[s.rarity].weight / SPECIES.filter((o) => o.rarity === s.rarity).length;
    if (s.element === 'dream') weight *= night ? 3 : 0.4;
    if (s.element === 'spark' && night) weight *= 1.4;
    if (s.element === 'leaf' && !night) weight *= 1.2;
    w[s.id] = weight;
  }
  return w;
}

export function rollWild(r, playerLevel, speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const personality = r.weighted(sp.personalities);
  let level = clamp(playerLevel + r.int(-2, 2), 1, 60);
  if (personality === 'proud' || personality === 'fierce') level += 1;
  if (sp.rarity === 'rare') level += 1;
  if (sp.rarity === 'legendary') level += 4;
  return { species: speciesId, personality, level };
}

export function monsterSpawns(pos, now, playerLevel = 1) {
  const window = Math.floor(now / MONSTER_WINDOW_MS);
  const night = isNight(new Date(now));
  const weights = speciesWeights(night);
  const out = [];
  for (const c of cellsAround(pos)) {
    const r = rng(`m:${c.x}:${c.y}:${window}`);
    const count = r.weighted({ 1: 3, 2: 4, 3: 2 });
    for (let i = 0; i < Number(count); i++) {
      const speciesId = r.weighted(weights);
      const wild = rollWild(r, playerLevel, speciesId);
      out.push({
        id: `m:${c.x}:${c.y}:${window}:${i}`,
        kind: 'monster',
        lat: c.lat0 + r() * c.dLat,
        lng: c.lng0 + r() * c.dLng,
        expires: (window + 1) * MONSTER_WINDOW_MS,
        seed: Math.floor(r() * 2 ** 31),
        ...wild,
      });
    }
  }
  return out;
}

// Fairies drift in slow circles through the air above a cell.
export function fairySpawns(pos, now) {
  const window = Math.floor(now / FAIRY_WINDOW_MS);
  const out = [];
  for (const c of cellsAround(pos)) {
    const r = rng(`f:${c.x}:${c.y}:${window}`);
    if (r() > 0.4) continue;
    const kind = r() < 0.5 ? 'trickster' : 'quizzy';
    out.push({
      id: `f:${c.x}:${c.y}:${window}`,
      kind: 'fairy',
      fairy: kind,
      center: { lat: c.lat0 + (0.25 + r() * 0.5) * c.dLat, lng: c.lng0 + (0.25 + r() * 0.5) * c.dLng },
      radius: 18 + r() * 30,
      period: 90000 + r() * 120000,
      phase: r() * Math.PI * 2,
      dir: r() < 0.5 ? 1 : -1,
      expires: (window + 1) * FAIRY_WINDOW_MS,
      seed: Math.floor(r() * 2 ** 31),
    });
  }
  return out;
}

export function fairyPosition(f, now) {
  const angle = f.phase + f.dir * ((now % f.period) / f.period) * Math.PI * 2;
  const wobble = Math.sin(now / 2300 + f.phase) * 4;
  return offset(f.center, f.radius + wobble, (angle * 180) / Math.PI);
}

// ---------- Encounters ----------

export function luckChance(wild, save) {
  const p = PERSONALITIES[wild.personality];
  const sp = SPECIES_BY_ID[wild.species];
  if (save.flags.feather && sp.rarity !== 'legendary') return 1;
  if (p.luck === 0) return 0;
  let chance = p.luck + Math.min(0.06, save.level * 0.004);
  if (save.flags.clover) chance *= 3;
  if (sp.rarity === 'rare') chance *= 0.6;
  if (sp.rarity === 'legendary') chance *= 0.25;
  return clamp(chance, 0, 0.9);
}

// a photo request matching what this monster likes
export function pickRequest(wild, seed) {
  const sp = SPECIES_BY_ID[wild.species];
  const r = rng(seed);
  const scored = REQUESTS.map((q) => ({ q, s: q.tags.filter((t) => sp.likes.includes(t)).length + r() * 0.5 }));
  scored.sort((a, b) => b.s - a.s);
  return r.pick(scored.slice(0, 4)).q;
}

export function chatScore(answerTags, likes) {
  return answerTags.some((t) => likes.includes(t)) ? 2 : 0;
}

// ---------- Fairy tasks & presents ----------

export function pickFairyTask(fairy) {
  const r = rng(fairy.seed);
  return r.pick(FAIRY_TASKS[fairy.fairy]);
}

export function fairyHello(fairy) {
  const r = rng(fairy.seed + 7);
  return r.pick(FAIRY_KINDS[fairy.fairy].hello);
}

const ITEM_IDS_BY_RARITY = Object.entries(ITEMS).reduce((acc, [id, it]) => {
  (acc[it.rarity] ||= []).push(id);
  return acc;
}, {});

// Three different presents to choose from. `bonus` (0..1) raises the odds of rare ones.
export function rollPresents(r, bonus = 0) {
  const picks = [];
  let guard = 0;
  while (picks.length < 3 && guard++ < 50) {
    const rarity = r.weighted({
      common: 60 - bonus * 20,
      uncommon: 28,
      rare: 11 + bonus * 15,
      legendary: 1 + bonus * 3,
    });
    const id = r.pick(ITEM_IDS_BY_RARITY[rarity]);
    if (!picks.includes(id)) picks.push(id);
  }
  return picks.map((id) => ({ id, qty: ITEMS[id].rarity === 'common' ? r.int(2, 3) : 1 }));
}

// ---------- Save ----------

export function newSave(name) {
  return {
    v: 1, name, level: 1, xp: 0, createdAt: Date.now(),
    buddies: [],
    bag: { berry: 3, tonic: 3, cake: 1 },
    resolved: {}, // spawn id -> expiry timestamp (caught, left, or fairy visited)
    quests: [], // monsters following you while you look for what they asked for
    flags: { clover: false, feather: false },
    stats: { befriended: 0, battlesWon: 0, battlesLost: 0, fairies: 0, photos: 0, lost: 0 },
    settings: { sound: true, mode: 'gps', ar: true },
    lastPos: null,
  };
}

export function pruneSave(save, now = Date.now()) {
  for (const [id, exp] of Object.entries(save.resolved)) if (exp < now) delete save.resolved[id];
  const expired = save.quests.filter((q) => q.expires <= now);
  save.quests = save.quests.filter((q) => q.expires > now);
  return expired;
}
