// Procedural SVG art for monsters and fairies. Every species is built from parts described in data.js `look`.
import { SPECIES_BY_ID, FAIRY_KINDS } from './data.js';

let gid = 0;

function bodyPath(shape) {
  switch (shape) {
    case 'pear':
      return 'M60 34 C80 34 88 52 90 70 C93 92 80 102 60 102 C40 102 27 92 30 70 C32 52 40 34 60 34 Z';
    case 'lump':
      return 'M30 74 C26 54 38 40 52 40 C56 34 68 34 72 40 C86 40 96 54 92 74 C96 90 84 102 60 102 C36 102 24 90 30 74 Z';
    case 'long':
      return 'M18 74 C18 56 38 48 62 48 C88 48 104 58 104 74 C104 92 88 100 62 100 C36 100 18 92 18 74 Z';
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 21 : 40;
        pts.push([60 + Math.cos(a) * r, 72 + Math.sin(a) * r]);
      }
      // rounded star via quadratic curves through midpoints
      let d = '';
      for (let i = 0; i < 10; i++) {
        const p = pts[i];
        const n = pts[(i + 1) % 10];
        const mx = (p[0] + n[0]) / 2;
        const my = (p[1] + n[1]) / 2;
        d += i === 0 ? `M${mx.toFixed(1)} ${my.toFixed(1)} ` : '';
        const nn = pts[(i + 2) % 10];
        d += `Q${n[0].toFixed(1)} ${n[1].toFixed(1)} ${((n[0] + nn[0]) / 2).toFixed(1)} ${((n[1] + nn[1]) / 2).toFixed(1)} `;
      }
      return `${d}Z`;
    }
    default:
      return 'M60 40 C84 40 94 56 94 72 C94 92 80 102 60 102 C40 102 26 92 26 72 C26 56 36 40 60 40 Z';
  }
}

// where the face sits for each shape
const FACE = {
  round: { x: 60, y: 66, gap: 15 },
  pear: { x: 60, y: 62, gap: 13 },
  lump: { x: 60, y: 66, gap: 15 },
  long: { x: 70, y: 68, gap: 14 },
  star: { x: 60, y: 70, gap: 10 },
};
const HEAD_TOP = { round: 42, pear: 36, lump: 40, long: 50, star: 34 };

function top(look, f) {
  const { main, accent } = look;
  const y = HEAD_TOP[look.shape];
  const x = f.x;
  switch (look.top) {
    case 'sprout':
      return `<path d="M${x} ${y + 2} C${x} ${y - 8} ${x + 1} ${y - 12} ${x} ${y - 16}" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M${x} ${y - 14} C${x - 14} ${y - 26} ${x - 22} ${y - 14} ${x - 18} ${y - 8} C${x - 12} ${y - 6} ${x - 4} ${y - 8} ${x} ${y - 14}Z" fill="${accent}"/>
        <path d="M${x} ${y - 14} C${x + 14} ${y - 28} ${x + 24} ${y - 16} ${x + 18} ${y - 9} C${x + 12} ${y - 6} ${x + 4} ${y - 8} ${x} ${y - 14}Z" fill="#9be57a"/>`;
    case 'cat':
      return `<path d="M${x - 26} ${y + 14} L${x - 22} ${y - 10} L${x - 6} ${y + 4}Z" fill="${main}" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M${x + 26} ${y + 14} L${x + 22} ${y - 10} L${x + 6} ${y + 4}Z" fill="${main}" stroke="${accent}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M${x - 21} ${y + 6} L${x - 20} ${y - 3} L${x - 12} ${y + 4}Z" fill="#ffc2c2"/>
        <path d="M${x + 21} ${y + 6} L${x + 20} ${y - 3} L${x + 12} ${y + 4}Z" fill="#ffc2c2"/>`;
    case 'bunny':
      return `<ellipse cx="${x - 12}" cy="${y - 14}" rx="7" ry="22" transform="rotate(-12 ${x - 12} ${y - 14})" fill="${main}" stroke="${accent}" stroke-width="2"/>
        <ellipse cx="${x + 12}" cy="${y - 14}" rx="7" ry="22" transform="rotate(12 ${x + 12} ${y - 14})" fill="${main}" stroke="${accent}" stroke-width="2"/>
        <ellipse cx="${x - 12}" cy="${y - 12}" rx="3" ry="14" transform="rotate(-12 ${x - 12} ${y - 12})" fill="${accent}" opacity=".7"/>
        <ellipse cx="${x + 12}" cy="${y - 12}" rx="3" ry="14" transform="rotate(12 ${x + 12} ${y - 12})" fill="${accent}" opacity=".7"/>`;
    case 'fins':
      return `<path d="M${x - 30} ${y + 22} C${x - 46} ${y + 10} ${x - 44} ${y - 2} ${x - 34} ${y - 4} C${x - 32} ${y + 8} ${x - 26} ${y + 14} ${x - 22} ${y + 18}Z" fill="${accent}"/>
        <path d="M${x + 30} ${y + 22} C${x + 46} ${y + 10} ${x + 44} ${y - 2} ${x + 34} ${y - 4} C${x + 32} ${y + 8} ${x + 26} ${y + 14} ${x + 22} ${y + 18}Z" fill="${accent}"/>
        <path d="M${x - 6} ${y + 2} C${x - 4} ${y - 12} ${x + 8} ${y - 14} ${x + 8} ${y - 4} C${x + 4} ${y - 4} ${x + 2} ${y} ${x + 2} ${y + 4}Z" fill="${accent}"/>`;
    case 'bolts':
      return `<path d="M${x - 12} ${y + 4} L${x - 18} ${y - 8} L${x - 10} ${y - 8} L${x - 16} ${y - 22}" stroke="${accent}" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M${x + 12} ${y + 4} L${x + 18} ${y - 8} L${x + 10} ${y - 8} L${x + 16} ${y - 22}" stroke="${accent}" stroke-width="4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;
    case 'tuft':
      return `<path d="M${x - 8} ${y + 4} C${x - 14} ${y - 8} ${x - 4} ${y - 14} ${x - 2} ${y - 6}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M${x} ${y + 2} C${x - 2} ${y - 14} ${x + 10} ${y - 18} ${x + 8} ${y - 8}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M${x + 8} ${y + 4} C${x + 12} ${y - 6} ${x + 20} ${y - 6} ${x + 18} ${y}" stroke="${accent}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case 'antennae':
      return `<path d="M${x - 8} ${y + 4} C${x - 12} ${y - 8} ${x - 18} ${y - 14} ${x - 22} ${y - 16}" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M${x + 8} ${y + 4} C${x + 12} ${y - 8} ${x + 18} ${y - 14} ${x + 22} ${y - 16}" stroke="${accent}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <circle cx="${x - 23}" cy="${y - 17}" r="5" fill="${accent}"/><circle cx="${x + 23}" cy="${y - 17}" r="5" fill="${accent}"/>`;
    case 'mushroom':
      return `<path d="M${x - 34} ${y + 10} C${x - 34} ${y - 16} ${x + 34} ${y - 16} ${x + 34} ${y + 10} C${x + 20} ${y + 4} ${x - 20} ${y + 4} ${x - 34} ${y + 10}Z" fill="${accent}"/>
        <circle cx="${x - 16}" cy="${y - 2}" r="4.5" fill="#fff"/><circle cx="${x + 2}" cy="${y - 7}" r="5.5" fill="#fff"/><circle cx="${x + 19}" cy="${y}" r="4" fill="#fff"/>`;
    case 'spikes':
      return `<path d="M${x - 26} ${y + 14} L${x - 22} ${y - 6} L${x - 12} ${y + 6} L${x - 6} ${y - 12} L${x} ${y + 3} L${x + 6} ${y - 12} L${x + 12} ${y + 6} L${x + 22} ${y - 6} L${x + 26} ${y + 14}Z" fill="${accent}" stroke-linejoin="round"/>`;
    case 'horns':
      return `<path d="M${x - 20} ${y + 8} C${x - 30} ${y} ${x - 34} ${y - 12} ${x - 28} ${y - 22} C${x - 26} ${y - 12} ${x - 20} ${y - 6} ${x - 10} ${y + 2}Z" fill="#f4ead8" stroke="${accent}" stroke-width="2"/>
        <path d="M${x + 20} ${y + 8} C${x + 30} ${y} ${x + 34} ${y - 12} ${x + 28} ${y - 22} C${x + 26} ${y - 12} ${x + 20} ${y - 6} ${x + 10} ${y + 2}Z" fill="#f4ead8" stroke="${accent}" stroke-width="2"/>`;
    case 'crest':
      return `<path d="M${x - 4} ${y + 4} C${x - 14} ${y - 10} ${x - 6} ${y - 26} ${x + 2} ${y - 28} C${x - 2} ${y - 16} ${x + 6} ${y - 8} ${x + 4} ${y + 4}Z" fill="${accent}"/>
        <path d="M${x + 2} ${y + 4} C${x + 4} ${y - 10} ${x + 16} ${y - 20} ${x + 24} ${y - 18} C${x + 16} ${y - 10} ${x + 14} ${y - 2} ${x + 10} ${y + 6}Z" fill="${main}" stroke="${accent}" stroke-width="2"/>`;
    case 'crown':
      return `<path d="M${x - 14} ${y + 2} L${x - 16} ${y - 14} L${x - 7} ${y - 6} L${x} ${y - 18} L${x + 7} ${y - 6} L${x + 16} ${y - 14} L${x + 14} ${y + 2}Z" fill="${accent}" stroke="#c98b00" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="${x}" cy="${y - 4}" r="2.5" fill="#ff5d8f"/>`;
    default:
      return '';
  }
}

function behind(look) {
  const { main, accent } = look;
  switch (look.extra) {
    case 'flametail':
      return `<path d="M88 88 C104 86 108 70 102 58 C110 60 114 50 108 42 C118 50 122 66 114 80 C108 92 96 96 88 94Z" fill="#ffb347"/>
        <path d="M92 88 C102 86 106 76 102 66 C108 70 110 80 104 88Z" fill="#fff07a"/>`;
    case 'wings':
      return `<path d="M30 70 C12 60 6 72 10 80 C14 86 24 84 32 80Z" fill="${main}" stroke="${accent}" stroke-width="2"/>
        <path d="M90 70 C108 60 114 72 110 80 C106 86 96 84 88 80Z" fill="${main}" stroke="${accent}" stroke-width="2"/>`;
    case 'mothwings':
      return `<path d="M50 62 C24 30 2 40 8 64 C12 80 32 84 50 76Z" fill="${accent}" opacity=".9"/>
        <path d="M70 62 C96 30 118 40 112 64 C108 80 88 84 70 76Z" fill="${accent}" opacity=".9"/>
        <circle cx="24" cy="58" r="7" fill="#fff6a8"/><circle cx="96" cy="58" r="7" fill="#fff6a8"/>
        <path d="M50 78 C30 84 22 100 34 106 C44 108 52 94 54 84Z" fill="${main}" stroke="${accent}" stroke-width="2"/>
        <path d="M70 78 C90 84 98 100 86 106 C76 108 68 94 66 84Z" fill="${main}" stroke="${accent}" stroke-width="2"/>`;
    case 'fintail':
      return `<path d="M22 76 C10 64 4 62 2 64 C6 72 6 80 2 88 C6 90 14 86 22 80Z" fill="${accent}"/>`;
    case 'startail':
      return `<path d="M82 90 C102 96 112 84 108 70" stroke="${main}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M108 60 l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z" fill="${accent}"/>`;
    default:
      return '';
  }
}

function overlay(look, clipId) {
  const { accent } = look;
  switch (look.extra) {
    case 'spots':
      return `<g clip-path="url(#${clipId})" opacity=".35" fill="${accent}"><circle cx="34" cy="62" r="6"/><circle cx="86" cy="80" r="7"/><circle cx="40" cy="92" r="4"/><circle cx="82" cy="54" r="3.5"/></g>`;
    case 'stripes':
      return `<g clip-path="url(#${clipId})" fill="${accent}" opacity=".85"><rect x="0" y="80" width="120" height="7"/><rect x="0" y="93" width="120" height="7"/></g>`;
    default:
      return '';
  }
}

function eyes(look, f) {
  const lx = f.x - f.gap, rx = f.x + f.gap, y = f.y;
  switch (look.eyes) {
    case 'sleepy':
      return `<path d="M${lx - 6} ${y} Q${lx} ${y + 5} ${lx + 6} ${y}" stroke="#2b2133" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M${rx - 6} ${y} Q${rx} ${y + 5} ${rx + 6} ${y}" stroke="#2b2133" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'fierce':
      return `<ellipse cx="${lx}" cy="${y}" rx="6.5" ry="6" fill="#fff"/><ellipse cx="${rx}" cy="${y}" rx="6.5" ry="6" fill="#fff"/>
        <ellipse cx="${lx + 1}" cy="${y + 1}" rx="2.4" ry="4.5" fill="#2b2133"/><ellipse cx="${rx - 1}" cy="${y + 1}" rx="2.4" ry="4.5" fill="#2b2133"/>
        <path d="M${lx - 9} ${y - 10} L${lx + 7} ${y - 4}" stroke="#2b2133" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M${rx + 9} ${y - 10} L${rx - 7} ${y - 4}" stroke="#2b2133" stroke-width="3.5" stroke-linecap="round"/>`;
    case 'sparkle':
      return `<ellipse cx="${lx}" cy="${y}" rx="7" ry="8.5" fill="#2b2133"/><ellipse cx="${rx}" cy="${y}" rx="7" ry="8.5" fill="#2b2133"/>
        <circle cx="${lx + 2.5}" cy="${y - 3}" r="2.8" fill="#fff"/><circle cx="${rx + 2.5}" cy="${y - 3}" r="2.8" fill="#fff"/>
        <circle cx="${lx - 2.5}" cy="${y + 3.5}" r="1.4" fill="#fff"/><circle cx="${rx - 2.5}" cy="${y + 3.5}" r="1.4" fill="#fff"/>`;
    default:
      return `<ellipse cx="${lx}" cy="${y}" rx="6.5" ry="8" fill="#2b2133"/><ellipse cx="${rx}" cy="${y}" rx="6.5" ry="8" fill="#2b2133"/>
        <circle cx="${lx + 2}" cy="${y - 3}" r="2.6" fill="#fff"/><circle cx="${rx + 2}" cy="${y - 3}" r="2.6" fill="#fff"/>`;
  }
}

function mouth(look, f) {
  const y = f.y + 11, x = f.x;
  if (look.eyes === 'fierce') {
    return `<path d="M${x - 7} ${y + 1} Q${x} ${y - 3} ${x + 7} ${y + 1}" stroke="#2b2133" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M${x - 5} ${y} l2 4 2-3.4Z" fill="#fff"/><path d="M${x + 5} ${y} l-2 4-2-3.4Z" fill="#fff"/>`;
  }
  return `<path d="M${x - 5} ${y} Q${x - 2.5} ${y + 3.5} ${x} ${y} Q${x + 2.5} ${y + 3.5} ${x + 5} ${y}" stroke="#2b2133" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
}

export function monsterSVG(speciesId, { size = 120, cls = '' } = {}) {
  const sp = SPECIES_BY_ID[speciesId];
  const look = sp.look;
  const f = FACE[look.shape];
  const id = `wk${gid++}`;
  const body = bodyPath(look.shape);
  const cheeks = look.eyes === 'fierce' ? '' : `<ellipse cx="${f.x - f.gap - 6}" cy="${f.y + 10}" rx="5" ry="3" fill="#ff8fa3" opacity=".55"/><ellipse cx="${f.x + f.gap + 6}" cy="${f.y + 10}" rx="5" ry="3" fill="#ff8fa3" opacity=".55"/>`;
  const bubbles = look.extra === 'bubbles'
    ? `<circle cx="98" cy="40" r="6" fill="none" stroke="#bfe8ff" stroke-width="2"/><circle cx="106" cy="26" r="3.5" fill="none" stroke="#bfe8ff" stroke-width="2"/><circle cx="18" cy="48" r="4" fill="none" stroke="#bfe8ff" stroke-width="2"/>`
    : '';
  const belly = look.shape === 'long'
    ? `<ellipse cx="62" cy="88" rx="30" ry="10" fill="${look.belly}"/>`
    : `<ellipse cx="60" cy="${look.shape === 'star' ? 80 : 86}" rx="${look.shape === 'star' ? 13 : 21}" ry="${look.shape === 'star' ? 10 : 14}" fill="${look.belly}"/>`;
  return `<svg class="mon-svg ${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" aria-label="${sp.name}">
    <defs><clipPath id="${id}"><path d="${body}"/></clipPath>
    <radialGradient id="${id}g" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity=".18"/>
    ${behind(look)}
    ${look.shape !== 'star' ? `<ellipse cx="46" cy="101" rx="9" ry="5" fill="${look.accent}"/><ellipse cx="74" cy="101" rx="9" ry="5" fill="${look.accent}"/>` : ''}
    <path d="${body}" fill="${look.main}" stroke="${look.accent}" stroke-width="2.5" stroke-linejoin="round"/>
    ${belly}
    ${overlay(look, id)}
    <path d="${body}" fill="url(#${id}g)"/>
    ${top(look, f)}
    ${eyes(look, f)}${cheeks}${mouth(look, f)}
    ${bubbles}
  </svg>`;
}

export function fairySVG(kind, size = 64) {
  const k = FAIRY_KINDS[kind];
  const id = `wf${gid++}`;
  const hat = kind === 'trickster'
    ? `<path d="M50 30 L44 12 L56 24 Z" fill="${k.color}"/><circle cx="44" cy="12" r="2.5" fill="#fff6a8"/>`
    : `<circle cx="50" cy="22" r="3" fill="#fff6a8"/><path d="M50 25 L50 30" stroke="#fff6a8" stroke-width="2"/>`;
  return `<svg class="fairy-svg" viewBox="0 0 100 100" width="${size}" height="${size}">
    <defs><radialGradient id="${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${k.glow}" stop-opacity=".9"/><stop offset="1" stop-color="${k.glow}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="50" r="48" fill="url(#${id})"/>
    <g class="wing-l"><path d="M46 46 C26 22 10 30 18 46 C24 56 40 54 46 50Z" fill="#fff" opacity=".75" stroke="${k.color}" stroke-width="1.5"/><path d="M46 54 C30 62 24 76 34 76 C42 76 46 64 47 56Z" fill="#fff" opacity=".6" stroke="${k.color}" stroke-width="1.5"/></g>
    <g class="wing-r"><path d="M54 46 C74 22 90 30 82 46 C76 56 60 54 54 50Z" fill="#fff" opacity=".75" stroke="${k.color}" stroke-width="1.5"/><path d="M54 54 C70 62 76 76 66 76 C58 76 54 64 53 56Z" fill="#fff" opacity=".6" stroke="${k.color}" stroke-width="1.5"/></g>
    <path d="M44 52 C44 66 46 70 50 72 C54 70 56 66 56 52Z" fill="${k.color}"/>
    <circle cx="50" cy="42" r="10" fill="#ffe9dc"/>
    ${hat}
    <circle cx="46.5" cy="42" r="1.8" fill="#2b2133"/><circle cx="53.5" cy="42" r="1.8" fill="#2b2133"/>
    <path d="M47 46.5 Q50 49 53 46.5" stroke="#2b2133" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <circle cx="44" cy="45.5" r="1.8" fill="#ff8fa3" opacity=".7"/><circle cx="56" cy="45.5" r="1.8" fill="#ff8fa3" opacity=".7"/>
  </svg>`;
}
