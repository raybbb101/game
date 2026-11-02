// Verifies every level: solvable with all boats, not solved at start.
// Usage: node tools/check-levels.mjs [-v]
import { LEVELS } from '../src/levels.js';
import { parseLevel, solve, trace } from '../src/logic.js';

const verbose = process.argv.includes('-v');
let ok = true;

function render(lvl, types) {
  const r = trace(lvl, types);
  const lit = new Set();
  for (const s of r.segments) {
    const [dx, dy] = s.dir;
    for (let i = 0; i <= Math.floor(s.len); i++) lit.add(`${s.x1 + dx * i},${s.y1 + dy * i}`);
  }
  const out = [];
  for (let y = 0; y < lvl.h; y++) {
    let row = '';
    for (let x = 0; x < lvl.w; x++) {
      const c = lvl.cells[y * lvl.w + x];
      let ch = c.ch;
      if (c.piece !== undefined) {
        ch = c.kind === 'splitter' ? (types[c.piece] ? 'z' : 's') : types[c.piece] ? '\\' : '/';
      }
      if (ch === '.' && lit.has(`${x},${y}`)) ch = '*';
      row += ch;
    }
    out.push('   ' + row);
  }
  return out.join('\n');
}

LEVELS.forEach((def, i) => {
  const lvl = parseLevel(def);
  const s = solve(lvl);
  const rot = lvl.pieces.filter((p) => !p.locked).length;
  const status = !s.solvable ? 'UNSOLVABLE' : s.initiallySolved ? 'PRE-SOLVED' : 'ok';
  if (status !== 'ok') ok = false;
  console.log(
    `${String(i + 1).padStart(2)} ${def.name.padEnd(16)} ${lvl.w}x${lvl.h} rot=${rot} boats=${lvl.boats.length} ` +
      `par=${s.par} homeOnly=${s.minHomeCost} solutions=${s.solutions}/${1 << rot} ${status}`,
  );
  if (verbose && s.best) console.log(render(lvl, s.best));
});
process.exit(ok ? 0 : 1);
