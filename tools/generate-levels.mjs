// Seeded level generator. Builds a beam path from Lumi's shrine to the lighthouse,
// sprinkles boats, decoy mirrors, rocks and water, scrambles the mirrors and keeps
// the candidate the solver likes best (few solutions, high par).
// Usage: node tools/generate-levels.mjs > src/levels.js
import { parseLevel, solve } from '../src/logic.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRCH = { '1,0': '>', '-1,0': '<', '0,-1': '^', '0,1': 'v' };
const mirrorFor = (din, dout) => {
  // '/' maps (dx,dy)->(-dy,-dx)
  if (dout[0] === -din[1] && dout[1] === -din[0]) return '/';
  return '\\';
};

function build(cfg, rand) {
  const { w, h } = cfg;
  const g = Array.from({ length: h }, () => Array(w).fill('.'));
  const used = new Set();
  const key = (x, y) => `${x},${y}`;
  const ri = (n) => Math.floor(rand() * n);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;

  // source on an edge pointing inward
  const side = ri(4);
  let x, y, d;
  if (side === 0) { x = 0; y = 1 + ri(h - 2); d = [1, 0]; }
  else if (side === 1) { x = w - 1; y = 1 + ri(h - 2); d = [-1, 0]; }
  else if (side === 2) { x = 1 + ri(w - 2); y = h - 1; d = [0, -1]; }
  else { x = 1 + ri(w - 2); y = 0; d = [0, 1]; }
  g[y][x] = DIRCH[d.join(',')];
  used.add(key(x, y));
  const path = [];
  const turns = [];
  for (let t = 0; t <= cfg.turns; t++) {
    // choose length
    const options = [];
    for (let L = 1; L < Math.max(w, h); L++) {
      const nx = x + d[0] * L;
      const ny = y + d[1] * L;
      if (!inside(nx, ny)) break;
      if (used.has(key(nx, ny))) break;
      if (L >= (t === cfg.turns ? 1 : 2)) options.push(L);
    }
    if (!options.length) return null;
    const L = options[ri(options.length)];
    for (let i = 1; i < L; i++) {
      const px = x + d[0] * i;
      const py = y + d[1] * i;
      path.push([px, py]);
      used.add(key(px, py));
    }
    x += d[0] * L;
    y += d[1] * L;
    used.add(key(x, y));
    if (t === cfg.turns) {
      g[y][x] = 'L';
    } else {
      const nd = rand() < 0.5 ? [d[1], d[0]] : [-d[1], -d[0]];
      const m = mirrorFor(d, nd);
      const splitter = turns.length > 0 && turns.filter((q) => q.split).length < cfg.splitters && rand() < 0.5;
      const locked = !splitter && turns.filter((q) => q.locked).length < cfg.locked && rand() < 0.35;
      let ch = m;
      if (splitter) ch = m === '/' ? 's' : 'z';
      else if (locked) ch = m === '/' ? 'P' : 'Q';
      g[y][x] = ch;
      turns.push({ x, y, split: splitter, locked });
      d = nd;
    }
  }
  if (turns.filter((q) => q.split).length < cfg.splitters) return null;
  if (turns.filter((q) => q.locked).length < cfg.locked) return null;
  // boats on the path
  const pathCells = path.filter(([px, py]) => g[py][px] === '.');
  for (let i = 0; i < cfg.boats; i++) {
    if (!pathCells.length) return null;
    const [bx, by] = pathCells.splice(ri(pathCells.length), 1)[0];
    g[by][bx] = 'b';
  }
  // free cells
  const free = [];
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (!used.has(key(xx, yy)) && g[yy][xx] === '.') free.push([xx, yy]);
  const take = () => (free.length ? free.splice(ri(free.length), 1)[0] : null);
  for (let i = 0; i < cfg.decoys; i++) { const c = take(); if (c) g[c[1]][c[0]] = rand() < 0.5 ? '/' : '\\'; }
  for (let i = 0; i < cfg.rocks; i++) { const c = take(); if (c) g[c[1]][c[0]] = '#'; }
  // water: prefer corners / edges for an island silhouette
  const edgeFree = free.filter(([fx, fy]) => fx === 0 || fy === 0 || fx === w - 1 || fy === h - 1);
  for (let i = 0; i < cfg.water && edgeFree.length; i++) {
    const [wx, wy] = edgeFree.splice(ri(edgeFree.length), 1)[0];
    g[wy][wx] = '~';
  }
  // scramble rotatable optics
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const c = g[yy][xx];
    if (rand() < 0.75) {
      if (c === '/') g[yy][xx] = '\\';
      else if (c === '\\') g[yy][xx] = '/';
      else if (c === 's') g[yy][xx] = 'z';
      else if (c === 'z') g[yy][xx] = 's';
    }
  }
  return g.map((r) => r.join('')).join('\n');
}

const TIERS = [
  { name: 'First Light', hint: 'Tap the mirror to turn it.', fixed: '~.L.~\n~...~\n>.\\..\n~...~' },
  { name: 'Two Turns', hint: 'Drag around a mirror to spin it smoothly.', fixed: 'L...~\n....~\n/../.\n..#..\n...^.' },
  { name: 'Lost Boat', hint: 'Shine on boats to guide them home too.', w: 5, h: 6, turns: 2, boats: 1, decoys: 1, rocks: 2, water: 3, splitters: 0, locked: 0, minPar: 2 },
  { name: 'Stepping Stones', w: 5, h: 6, turns: 3, boats: 1, decoys: 1, rocks: 2, water: 3, splitters: 0, locked: 0, minPar: 3 },
  { name: 'The Old Pier', hint: 'Grey-framed mirrors are rusted in place.', w: 6, h: 6, turns: 4, boats: 1, decoys: 2, rocks: 3, water: 4, splitters: 0, locked: 1, minPar: 3 },
  { name: 'Prism Bay', hint: 'Crystal prisms split your light in two.', w: 6, h: 6, turns: 3, boats: 2, decoys: 1, rocks: 3, water: 4, splitters: 1, locked: 0, minPar: 2 },
  { name: 'Reef Walk', w: 6, h: 7, turns: 5, boats: 2, decoys: 2, rocks: 4, water: 4, splitters: 0, locked: 1, minPar: 4 },
  { name: 'Twin Lanterns', w: 6, h: 7, turns: 5, boats: 2, decoys: 2, rocks: 4, water: 4, splitters: 1, locked: 0, minPar: 4 },
  { name: 'Tidepools', w: 6, h: 7, turns: 6, boats: 2, decoys: 3, rocks: 4, water: 5, splitters: 1, locked: 1, minPar: 4 },
  { name: 'Lighthouse Row', w: 6, h: 8, turns: 6, boats: 3, decoys: 3, rocks: 5, water: 5, splitters: 1, locked: 1, minPar: 5 },
  { name: 'Storm Wake', w: 7, h: 8, turns: 7, boats: 3, decoys: 3, rocks: 5, water: 6, splitters: 2, locked: 1, minPar: 5 },
  { name: 'Homecoming', w: 7, h: 8, turns: 8, boats: 3, decoys: 4, rocks: 6, water: 6, splitters: 2, locked: 2, minPar: 6 },
];

const out = [];
TIERS.forEach((tier, ti) => {
  if (tier.fixed) { out.push({ name: tier.name, hint: tier.hint, map: tier.fixed }); return; }
  const rand = rng(1000 + ti * 7919);
  let best = null;
  let bestScore = -Infinity;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const map = build(tier, rand);
    if (!map) continue;
    let lvl;
    try { lvl = parseLevel({ name: tier.name, map }); } catch { continue; }
    const s = solve(lvl);
    if (!s.solvable || s.initiallySolved || s.par < tier.minPar) continue;
    // a boat should matter: the shortest home-only route should be cheaper or different
    const score = s.par * 3 - s.solutions * 4 + (s.minHomeCost < s.par ? 2 : 0) + rand();
    if (score > bestScore) { bestScore = score; best = { map, s }; }
  }
  if (!best) throw new Error(`No level for tier ${tier.name}`);
  out.push({ name: tier.name, hint: tier.hint, map: best.map });
  console.error(`${tier.name}: par ${best.s.par}, ${best.s.solutions} solution(s)`);
});

let src = '// Level definitions. See parseLevel() in logic.js for the tile legend.\n';
src += '// Generated by tools/generate-levels.mjs and verified by tools/check-levels.mjs.\n';
src += 'export const LEVELS = [\n';
for (const l of out) {
  src += '  {\n';
  src += `    name: ${JSON.stringify(l.name)},\n`;
  if (l.hint) src += `    hint: ${JSON.stringify(l.hint)},\n`;
  src += '    map: String.raw`\n' + l.map + '\n`,\n';
  src += '  },\n';
}
src += '];\n';
process.stdout.write(src);
