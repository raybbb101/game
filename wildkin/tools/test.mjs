// Logic tests for Wildkin. Run: node wildkin/tools/test.mjs [-v]
import assert from 'node:assert/strict';
import { SPECIES, SPECIES_BY_ID, MOVES, ITEMS, REQUESTS, FAIRY_TASKS, PERSONALITIES, CHAT_QUESTIONS } from '../src/data.js';
import { rng, distance, offset, bearing } from '../src/util.js';
import {
  monsterSpawns, fairySpawns, fairyPosition, makeMonster, stats, currentHp, setHp, giveXp,
  rollPresents, pickRequest, luckChance, newSave, pruneSave, HEAL_FULL_MS, isNight,
} from '../src/game.js';
import { createBattle, takeTurn, rollLoss, typeMultiplier } from '../src/battle.js';
import { classifyPixel, analyzePixels, judge } from '../src/scan.js';

const verbose = process.argv.includes('-v');
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    if (verbose) console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n`, e);
    process.exitCode = 1;
  }
}

test('data integrity', () => {
  for (const s of SPECIES) {
    assert.ok(s.moves.every((m) => MOVES[m]), `${s.id} moves`);
    assert.ok(Object.keys(s.personalities).every((p) => PERSONALITIES[p]), `${s.id} personalities`);
    assert.ok(s.likes.length >= 4, `${s.id} likes`);
  }
  for (const t of Object.values(FAIRY_TASKS).flat()) {
    if (t.type === 'photo') assert.ok(REQUESTS.find((r) => r.id === t.request), t.text);
    if (t.type === 'give') assert.ok(ITEMS[t.item]);
    if (t.type === 'quiz' || t.type === 'riddle') assert.ok(t.answer < t.options.length);
  }
  // every species should find at least one chat answer it likes
  for (const s of SPECIES) {
    const liked = CHAT_QUESTIONS.filter((q) => q.a.some((a) => a.tags.some((t) => s.likes.includes(t))));
    assert.ok(liked.length >= 4, `${s.id} has enough chat topics (${liked.length})`);
  }
});

test('geo helpers', () => {
  const a = { lat: 35.7, lng: 139.77 };
  const b = offset(a, 100, 90);
  assert.ok(Math.abs(distance(a, b) - 100) < 0.5);
  assert.ok(Math.abs(bearing(a, b) - 90) < 0.5);
});

test('spawns are deterministic and nearby', () => {
  const pos = { lat: 35.7148, lng: 139.7731 };
  const now = Date.UTC(2026, 10, 2, 3, 0);
  const a = monsterSpawns(pos, now, 3);
  const b = monsterSpawns({ lat: pos.lat + 0.0001, lng: pos.lng }, now + 1000, 3);
  assert.ok(a.length >= 25 && a.length <= 75, `count ${a.length}`);
  const idsA = new Set(a.map((s) => s.id));
  assert.ok(b.filter((s) => idsA.has(s.id)).length > 15, 'overlapping cells give the same spawns');
  const within = a.filter((s) => distance(pos, s) < 250).length;
  assert.ok(within >= 3, `monsters within 250 m: ${within}`);
  if (verbose) console.log(`      ${a.length} spawns, ${within} within 250 m`);
  const f = fairySpawns(pos, now);
  assert.ok(f.length >= 2, `fairies ${f.length}`);
  const p1 = fairyPosition(f[0], now);
  const p2 = fairyPosition(f[0], now + 20000);
  assert.ok(distance(p1, p2) > 1, 'fairies move');
});

test('rarity distribution', () => {
  const counts = {};
  for (let i = 0; i < 300; i++) {
    for (const s of monsterSpawns({ lat: 40 + i * 0.01, lng: -74 }, Date.UTC(2026, 0, 1, 15), 5)) {
      const r = SPECIES_BY_ID[s.species].rarity;
      counts[r] = (counts[r] || 0) + 1;
    }
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (verbose) console.log('      rarity', Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, (v / total * 100).toFixed(1) + '%'])));
  assert.ok(counts.legendary > 0 && counts.legendary / total < 0.04);
  assert.ok(counts.common / total > 0.45);
});

test('hp regenerates over time', () => {
  const m = makeMonster({ species: 'sprigling', level: 5, personality: 'friendly' });
  const max = stats(m).maxHp;
  setHp(m, 0, 0);
  assert.equal(currentHp(m, 0), 0);
  assert.ok(Math.abs(currentHp(m, HEAL_FULL_MS / 2) - max / 2) <= 1);
  assert.equal(currentHp(m, HEAL_FULL_MS * 2), max);
});

test('leveling', () => {
  const m = makeMonster({ species: 'zapple', level: 1, personality: 'playful' });
  const ups = giveXp(m, 100);
  assert.ok(ups >= 3, `levels ${ups}`);
});

test('type chart', () => {
  assert.equal(typeMultiplier('tide', 'flame'), 1.5);
  assert.equal(typeMultiplier('flame', 'tide'), 0.7);
  assert.equal(typeMultiplier(null, 'tide'), 1);
});

function simulate(mySpecies, myLevel, foeSpecies, foeLevel, trials = 400, teamSize = 1) {
  let wins = 0, turns = 0;
  const r = rng(42);
  for (let t = 0; t < trials; t++) {
    const team = Array.from({ length: teamSize }, () => makeMonster({ species: mySpecies, level: myLevel, personality: 'friendly' }));
    const foe = makeMonster({ species: foeSpecies, level: foeLevel, personality: 'fierce' });
    const b = createBattle(team, foe);
    let guard = 0;
    while (!b.over && guard++ < 200) {
      const moves = SPECIES_BY_ID[b.you[b.active].mon.species].moves;
      takeTurn(b, { type: 'move', move: r() < 0.7 ? moves[1] : moves[0] }, r);
    }
    assert.ok(b.over, 'battle ends');
    if (b.over === 'win') wins++;
    turns += b.turn;
  }
  return { winRate: wins / trials, avgTurns: turns / trials };
}

test('battle balance', () => {
  const even = simulate('emberkit', 5, 'zapple', 5);
  const adv = simulate('bubbloo', 5, 'emberkit', 5);
  const under = simulate('sprigling', 3, 'cindermaw', 9);
  const team = simulate('bubbloo', 6, 'cindermaw', 8, 400, 3);
  if (verbose) console.log('      even', even, '\n      type-advantage', adv, '\n      underleveled', under, '\n      team of 3 vs rare', team);
  assert.ok(even.avgTurns >= 3 && even.avgTurns <= 9, 'fights last a few turns');
  assert.ok(adv.winRate > 0.75, 'type advantage matters');
  assert.ok(under.winRate < 0.15, 'strong monsters are dangerous alone');
  assert.ok(team.winRate > 0.35, 'a team can take down a strong one');
});

test('battle loss rules', () => {
  const r = rng(1);
  const team = [makeMonster({ species: 'sprigling', level: 1, personality: 'friendly' })];
  const b = createBattle(team, makeMonster({ species: 'nyxtail', level: 20, personality: 'fierce' }));
  while (!b.over) takeTurn(b, { type: 'move', move: 'tackle' }, r);
  assert.equal(b.over, 'lose');
  assert.equal(rollLoss(b, 1, false, r), null, 'never lose your only buddy');
  assert.equal(rollLoss(b, 5, true, r), null, 'bell protects');
  let lost = 0;
  for (let i = 0; i < 1000; i++) if (rollLoss(b, 5, false, r)) lost++;
  assert.ok(lost > 250 && lost < 450, `loss rate ${lost / 10}%`);
});

function img(fill, w = 60, h = 60) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y, w, h);
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return analyzePixels(d, w, h);
}

test('pixel colors', () => {
  assert.equal(classifyPixel(220, 30, 40), 'red');
  assert.equal(classifyPixel(255, 140, 20), 'orange');
  assert.equal(classifyPixel(250, 220, 40), 'yellow');
  assert.equal(classifyPixel(40, 160, 60), 'green');
  assert.equal(classifyPixel(40, 90, 220), 'blue');
  assert.equal(classifyPixel(130, 50, 200), 'purple');
  assert.equal(classifyPixel(250, 120, 190), 'pink');
  assert.equal(classifyPixel(245, 245, 245), 'white');
  assert.equal(classifyPixel(10, 10, 12), 'black');
});

test('photo judging', () => {
  const R = Object.fromEntries(REQUESTS.map((q) => [q.id, q]));
  const redThing = img((x, y, w, h) => (x > w / 3 && x < (2 * w) / 3 ? [210, 30, 35] : [120, 120, 120]));
  assert.ok(judge(R.red, redThing).ok, 'red object');
  assert.ok(!judge(R.blue, redThing).ok, 'not blue');
  const sky = img((x, y, w, h) => (y < h / 2 ? [110, 170, 240] : [70, 90, 60]));
  assert.ok(judge(R.sky, sky).ok, 'sky');
  const park = img(() => [60, 150, 70]);
  assert.ok(judge(R.greenery, park).ok, 'greenery');
  assert.ok(!judge(R.sky, park).ok, 'park is not sky');
  const night = img((x, y) => ((x * 7 + y * 13) % 97 === 0 ? [255, 240, 200] : [15, 15, 30]));
  assert.ok(judge(R.night, night).ok, 'night lights');
  const sunset = img((x, y, w, h) => (y < h / 2 ? [255, 130, 60] : [90, 50, 80]));
  assert.ok(judge(R.sunset, sunset).ok, 'sunset');
  // object via labels
  assert.ok(judge(R.fruit, park, [{ className: 'banana', probability: 0.8 }]).ok);
  assert.ok(!judge(R.fruit, park, [{ className: 'park bench', probability: 0.8 }]).ok);
  assert.ok(judge(R.cup, park, [{ className: 'coffee mug', probability: 0.3 }]).ok);
});

test('requests fit the monster', () => {
  for (const s of SPECIES) {
    const q = pickRequest({ species: s.id }, 5);
    assert.ok(q.tags.some((t) => s.likes.includes(t)), `${s.id} -> ${q.id}`);
  }
});

test('presents', () => {
  const r = rng(9);
  let rare = 0;
  for (let i = 0; i < 500; i++) {
    const p = rollPresents(r, 0.5);
    assert.equal(p.length, 3);
    assert.equal(new Set(p.map((x) => x.id)).size, 3);
    if (p.some((x) => ITEMS[x.id].rarity === 'rare' || ITEMS[x.id].rarity === 'legendary')) rare++;
  }
  if (verbose) console.log(`      rare item offered in ${(rare / 5).toFixed(0)}% of presents`);
  assert.ok(rare > 100 && rare < 450);
});

test('luck and save', () => {
  const save = newSave('Tester');
  assert.equal(luckChance({ species: 'cindermaw', personality: 'fierce' }, save), 0);
  save.flags.feather = true;
  assert.equal(luckChance({ species: 'sprigling', personality: 'shy' }, save), 1);
  assert.ok(luckChance({ species: 'nyxtail', personality: 'proud' }, save) < 1, 'feather does not work on legendaries');
  save.quests.push({ id: 'q', expires: 5 });
  save.resolved.x = 5;
  const expired = pruneSave(save, 10);
  assert.equal(expired.length, 1);
  assert.equal(save.quests.length, 0);
  assert.deepEqual(save.resolved, {});
  assert.equal(typeof isNight(new Date()), 'boolean');
});

console.log(process.exitCode ? 'Some tests failed.' : `All ${passed} tests passed.`);
