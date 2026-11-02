// Pure game logic: level parsing, beam tracing and solving.
// No DOM / Three.js dependencies so it can be tested in Node.

export const DIRS = {
  '>': [1, 0],
  '<': [-1, 0],
  '^': [0, -1],
  'v': [0, 1],
};

// Tile legend (levels are written with String.raw so backslashes are literal)
//  .  sand            ~  open water (beam passes over it)
//  /  \  rotatable mirror          P  Q  locked mirror (/ and \)
//  s  z  rotatable splitter (/ \)  #  rock (blocks light)
//  b  lost boat (light passes, boat is rescued)
//  L  lighthouse (home)            > < ^ v  Lumi's starting shrine + direction
export function parseLevel(def) {
  const rows = def.map.replace(/^\n+|\n+\s*$/g, '').split('\n').map((r) => r.trimEnd());
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells = [];
  let source = null;
  let home = null;
  const pieces = []; // rotatable / locked optics
  const boats = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? '~';
      const cell = { x, y, ch, kind: 'sand', land: ch !== '~' };
      switch (ch) {
        case '~': cell.kind = 'water'; break;
        case '.': cell.kind = 'sand'; break;
        case '#': cell.kind = 'rock'; break;
        case 'L': cell.kind = 'home'; home = cell; break;
        case 'b': cell.kind = 'boat'; cell.boat = boats.length; boats.push(cell); break;
        case '/': case '\\': case 'P': case 'Q': case 's': case 'z': {
          cell.kind = ch === 's' || ch === 'z' ? 'splitter' : 'mirror';
          cell.locked = ch === 'P' || ch === 'Q';
          cell.type = ch === '/' || ch === 'P' || ch === 's' ? 0 : 1;
          cell.piece = pieces.length;
          pieces.push(cell);
          break;
        }
        default:
          if (DIRS[ch]) {
            cell.kind = 'source';
            cell.dir = DIRS[ch];
            source = cell;
          } else {
            throw new Error(`Unknown tile '${ch}' in level ${def.name}`);
          }
      }
      cells.push(cell);
    }
  }
  if (!source || !home) throw new Error(`Level ${def.name} needs a source and a lighthouse`);
  return { ...def, w, h, cells, source, home, pieces, boats };
}

export const cellAt = (lvl, x, y) =>
  x < 0 || y < 0 || x >= lvl.w || y >= lvl.h ? null : lvl.cells[y * lvl.w + x];

// type 0 is '/', type 1 is '\'
const reflect = (type, [dx, dy]) => (type === 0 ? [-dy, -dx] : [dy, dx]);

/**
 * Trace the light from the source.
 * types: array of mirror types (0|1) indexed by piece id.
 * Returns { segments: [{x1,y1,x2,y2,start,len,end,dir,parent}], home, boats:Set, hits:[] }
 * Coordinates are tile centres; a segment that leaves the grid ends half a tile past the edge.
 */
export function trace(lvl, types) {
  const segments = [];
  const boats = new Set();
  const seen = new Set();
  const hits = [];
  let home = false;
  // queue of rays: start point, direction, travelled distance
  const queue = [{ x: lvl.source.x, y: lvl.source.y, d: lvl.source.dir, dist: 0, parent: -1 }];
  let guard = 0;
  while (queue.length && guard++ < 500) {
    const ray = queue.shift();
    let { x, y } = ray;
    const [dx, dy] = ray.d;
    const sx = x;
    const sy = y;
    let steps = 0;
    let endKind = 'out';
    for (;;) {
      x += dx;
      y += dy;
      steps++;
      const c = cellAt(lvl, x, y);
      if (!c) { endKind = 'out'; break; }
      const key = `${x},${y},${dx},${dy}`;
      if (seen.has(key)) { endKind = 'loop'; break; }
      seen.add(key);
      if (c.kind === 'rock' || c.kind === 'source') { endKind = 'block'; break; }
      if (c.kind === 'home') { endKind = 'home'; home = true; break; }
      if (c.kind === 'boat') boats.add(c.boat);
      if (c.kind === 'mirror' || c.kind === 'splitter') {
        const t = types[c.piece];
        const parent = segments.length;
        queue.push({ x, y, d: reflect(t, [dx, dy]), dist: ray.dist + steps, parent });
        if (c.kind === 'splitter') queue.push({ x, y, d: [dx, dy], dist: ray.dist + steps, parent });
        endKind = c.kind;
        break;
      }
    }
    const extra = endKind === 'out' ? -0.5 : 0; // stop at the island edge
    const len = steps + extra;
    segments.push({
      x1: sx, y1: sy,
      x2: sx + dx * len, y2: sy + dy * len,
      start: ray.dist, len, end: endKind, dir: [dx, dy], parent: ray.parent,
    });
    if (endKind !== 'out') hits.push({ x, y, kind: endKind });
  }
  return { segments, home, boats, hits };
}

export const initialTypes = (lvl) => lvl.pieces.map((p) => p.type);

/**
 * Brute force every rotatable configuration.
 * Returns { par, best, solvable, initiallySolved, solutions } where
 * best = types for a solution that lights home + all boats with fewest changes.
 */
export function solve(lvl) {
  const rot = lvl.pieces.filter((p) => !p.locked).map((p) => p.piece);
  const base = initialTypes(lvl);
  let best = null;
  let bestCost = Infinity;
  let anyHome = null;
  let anyHomeCost = Infinity;
  let solutions = 0;
  const total = 1 << rot.length;
  for (let mask = 0; mask < total; mask++) {
    const types = base.slice();
    let cost = 0;
    rot.forEach((pid, i) => {
      const t = (mask >> i) & 1;
      if (t !== base[pid]) cost++;
      types[pid] = t;
    });
    const r = trace(lvl, types);
    if (!r.home) continue;
    if (cost < anyHomeCost) { anyHomeCost = cost; anyHome = types; }
    if (r.boats.size === lvl.boats.length) {
      solutions++;
      if (cost < bestCost) { bestCost = cost; best = types; }
    }
  }
  return {
    solvable: !!best,
    par: bestCost,
    best,
    minHomeCost: anyHomeCost,
    homeOnly: anyHome,
    solutions,
    initiallySolved: trace(lvl, base).home,
  };
}
