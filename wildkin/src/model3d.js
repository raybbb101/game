// Procedural 3D monsters and fairies. Every species is sculpted from its `look` in data.js:
// a deformed sphere body with a painted texture, glossy eyes, and parts (ears, horns, wings, tails, flames...).
// Models are 1 unit tall, standing on y = 0, facing +Z. Runs in Node too (without textures) for tests.
import * as THREE from '../vendor/three/three.module.js';
import { SPECIES_BY_ID, FAIRY_KINDS } from './data.js';
import { rng } from './util.js';

const hasDOM = typeof document !== 'undefined';
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = new THREE.Color('#ffffff');
const Y = V(0, 1, 0);
const Z = V(0, 0, 1);

// ---------- Shape deformation (unit sphere -> body surface) ----------

export function deform(shape, v, out = new THREE.Vector3()) {
  let { x, y, z } = v;
  switch (shape) {
    case 'pear': {
      const k = 1.1 - 0.3 * ((y + 1) / 2);
      x *= k; z *= k; y *= 1.06;
      break;
    }
    case 'lump': {
      const n = 1 + 0.055 * Math.sin(x * 5 + 1) * Math.sin(y * 4 + 2) * Math.sin(z * 5 + 0.5) + 0.03 * Math.sin(x * 9 + y * 7);
      x *= 1.12 * n; y *= 0.9 * n; z *= 1.02 * n;
      break;
    }
    case 'long':
      x *= 0.8; y *= 0.76; z *= 1.32;
      break;
    case 'tall': {
      const k = 1.0 - 0.14 * ((y + 1) / 2);
      x *= 0.8 * k; z *= 0.78 * k; y *= 1.3;
      break;
    }
    case 'blob':
      if (y > 0) {
        const k = 1 - 0.42 * Math.pow(y, 1.6);
        x *= k; z *= k; y *= 1.2;
      } else {
        y *= 0.72;
      }
      x *= 1.1; z *= 1.05;
      break;
    case 'star': {
      const a = Math.atan2(y, x);
      const f = 1 + 0.5 * Math.pow(0.5 + 0.5 * Math.cos(5 * (a - Math.PI / 2)), 2.2);
      x *= f; y *= f; z *= 0.62;
      break;
    }
    default:
      y *= 0.93; z *= 0.96;
  }
  return out.set(x, y, z);
}

// ---------- Small geometry helpers ----------

// Tube along points whose radius tapers from r0 to r1.
function taperTube(points, r0, r1, { seg = 28, radial = 14, linear = false } = {}) {
  let curve;
  if (linear) {
    curve = new THREE.CurvePath();
    for (let i = 0; i < points.length - 1; i++) curve.add(new THREE.LineCurve3(points[i], points[i + 1]));
  } else {
    curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }
  const geo = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const pos = geo.attributes.position;
  const P = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Teardrop flame shape, pointing up, 1 unit tall.
function flameGeo() {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = 0.42 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * Math.pow(1 - t, 0.55);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), t));
  }
  return new THREE.LatheGeometry(pts, 24);
}

function starShape(outer = 1, inner = 0.45) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? inner : outer;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

// ---------- Textures (browser only) ----------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function bodyTextures(look, seed) {
  if (!hasDOM) return {};
  const W = 512, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = look.main;
  g.fillRect(0, 0, W, H);
  // baked light: lighter crown, darker underside
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(255,255,255,0.16)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  grad.addColorStop(0.8, 'rgba(0,0,0,0.06)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  const r = rng(seed);
  const extra = look.extra;
  if (extra.includes('stripes')) {
    g.fillStyle = look.accent;
    for (const yy of [0.52, 0.66]) g.fillRect(0, yy * H, W, H * 0.07);
  }
  if (extra.includes('spots')) {
    g.fillStyle = look.accent;
    g.globalAlpha = 0.42;
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = (0.15 + r() * 0.7) * H;
      if (Math.abs(x - 0.25 * W) < 0.12 * W && y > 0.4 * H) continue; // keep belly clean
      g.beginPath();
      g.ellipse(x, y, 6 + r() * 12, (6 + r() * 12) * 0.8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  // belly patch on the front (+Z is u = 0.25 on a sphere)
  if (look.shape !== 'star') {
    const bx = 0.25 * W, by = look.shape === 'long' ? 0.78 * H : 0.66 * H;
    const rx = (look.shape === 'long' ? 0.16 : 0.105) * W, ry = (look.shape === 'long' ? 0.3 : 0.27) * H;
    const bg = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    bg.addColorStop(0, look.belly);
    bg.addColorStop(0.8, look.belly);
    bg.addColorStop(1, `${look.belly}00`);
    g.save();
    g.translate(bx, by);
    g.scale(rx, ry);
    g.fillStyle = bg;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  let emissiveMap = null;
  if (extra.includes('cracks')) {
    const e = canvas(W, H);
    const eg = e.getContext('2d');
    eg.fillStyle = '#000';
    eg.fillRect(0, 0, W, H);
    eg.strokeStyle = look.accent;
    eg.lineCap = 'round';
    eg.shadowColor = look.accent;
    eg.shadowBlur = 8;
    for (let i = 0; i < 14; i++) {
      eg.lineWidth = 2 + r() * 3;
      eg.beginPath();
      let x = r() * W, y = (0.15 + r() * 0.7) * H;
      eg.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 40;
        eg.lineTo(x, y);
      }
      eg.stroke();
    }
    emissiveMap = new THREE.CanvasTexture(e);
    emissiveMap.colorSpace = THREE.SRGBColorSpace;
    // also draw the cracks dark on the color map
    g.globalAlpha = 0.5;
    g.drawImage(e, 0, 0);
    g.globalAlpha = 1;
    map.needsUpdate = true;
  }
  return { map, emissiveMap };
}

const texCache = new Map();
export function glowTexture(kind = 'soft') {
  if (!hasDOM) return null;
  if (texCache.has(kind)) return texCache.get(kind);
  const c = canvas(128, 128);
  const g = c.getContext('2d');
  if (kind === 'star') {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(64, 4); g.quadraticCurveTo(70, 58, 124, 64); g.quadraticCurveTo(70, 70, 64, 124);
    g.quadraticCurveTo(58, 70, 4, 64); g.quadraticCurveTo(58, 58, 64, 4);
    g.fill();
  } else if (kind === 'heart') {
    g.font = '100px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('💖', 64, 70);
  } else if (kind === 'shadow') {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  } else {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(kind, t);
  return t;
}

// ---------- Materials ----------

function skin(color, extra = {}) {
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({
    color: c, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35,
    sheen: 0.25, sheenRoughness: 0.5, sheenColor: c.clone().lerp(WHITE, 0.35), ...extra,
  });
}
const glossyBlack = () => new THREE.MeshPhysicalMaterial({ color: '#1b1430', roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
const glossyWhite = () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.15, clearcoat: 1 });
const shine = () => new THREE.MeshBasicMaterial({ color: '#ffffff' });
const glow = (color, intensity = 2.2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6, toneMapped: true });
const ivory = () => new THREE.MeshPhysicalMaterial({ color: '#f4ead8', roughness: 0.35, clearcoat: 0.8 });
const gold = () => new THREE.MeshStandardMaterial({ color: '#ffcf55', metalness: 1, roughness: 0.22 });

// ---------- Monster builder ----------

const SPHERE = new THREE.SphereGeometry(1, 32, 24);

function frame(shape) {
  switch (shape) {
    case 'long': return { face: V(0, 0.18, 1), top: V(0, 0.8, 0.55), eyeYaw: 0.32, eyePitch: 0.22, eye: 0.2 };
    case 'star': return { face: V(0, 0.02, 1), top: V(0, 1, 0), eyeYaw: 0.3, eyePitch: 0.16, eye: 0.24 };
    case 'tall': return { face: V(0, 0.42, 1), top: V(0, 1, 0.08), eyeYaw: 0.36, eyePitch: 0.1, eye: 0.19 };
    case 'blob': return { face: V(0, 0.05, 1), top: V(0, 1, 0), eyeYaw: 0.36, eyePitch: 0.2, eye: 0.21 };
    default: return { face: V(0, 0.1, 1), top: V(0, 1, 0.1), eyeYaw: 0.36, eyePitch: 0.15, eye: 0.21 };
  }
}

// rotate a direction by yaw (around Y) and pitch (toward +Y)
function turn(dir, yaw, pitch) {
  const d = dir.clone().normalize();
  d.applyAxisAngle(Y, yaw);
  const side = new THREE.Vector3().crossVectors(d, Y).normalize();
  if (side.lengthSq() > 0) d.applyAxisAngle(side, pitch);
  return d.normalize();
}

export function buildMonster(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  const look = sp.look;
  const extra = look.extra;
  const r = rng(`look:${speciesId}`);
  const F = frame(look.shape);
  const group = new THREE.Group();
  const body = new THREE.Group(); // everything that breathes
  group.add(body);
  const anim = { ears: [], tails: [], wings: [], flames: [], bubbles: [], sparkles: [], eyes: [], arms: [], spin: [], float: extra.includes('ghost') || extra.includes('cloud') };
  const skinMats = [];

  // surface sampling
  const tmp = new THREE.Vector3();
  const surf = (d) => deform(look.shape, tmp.copy(d).normalize(), new THREE.Vector3());
  const at = (dir) => {
    const d = (dir.isVector3 ? dir.clone() : V(...dir)).normalize();
    const p = surf(d);
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? Z : Y).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
    const e = 0.01;
    const a = surf(d.clone().addScaledVector(t1, e)).sub(p);
    const b = surf(d.clone().addScaledVector(t2, e)).sub(p);
    const n = new THREE.Vector3().crossVectors(a, b).normalize();
    if (n.dot(p) < 0) n.negate();
    return { p, n };
  };
  // stick an object on the surface, its local `axis` pointing out along the normal
  const attach = (obj, dir, { inset = 0.02, axis = 'z', parent = body } = {}) => {
    const { p, n } = at(dir);
    obj.position.copy(p).addScaledVector(n, -inset);
    obj.quaternion.setFromUnitVectors(axis === 'z' ? Z : Y, n);
    parent.add(obj);
    return obj;
  };
  const mesh = (geo, mat, s = [1, 1, 1], pos = [0, 0, 0], rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(...s);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.castShadow = true;
    return m;
  };

  // --- body ---
  const geo = new THREE.SphereGeometry(1, 72, 52);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    deform(look.shape, v.fromBufferAttribute(pos, i), v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const tex = bodyTextures(look, `tex:${speciesId}`);
  const bodyMat = skin(look.main, {
    map: tex.map || null,
    emissive: tex.emissiveMap ? new THREE.Color(look.accent) : new THREE.Color('#000'),
    emissiveMap: tex.emissiveMap || null,
    emissiveIntensity: tex.emissiveMap ? 1.6 : 0,
    transparent: extra.includes('ghost'),
    opacity: extra.includes('ghost') ? 0.82 : 1,
  });
  if (tex.map) bodyMat.color.set('#ffffff');
  if (extra.includes('ghost')) bodyMat.emissive = new THREE.Color(look.main), bodyMat.emissiveIntensity = 0.25;
  skinMats.push(bodyMat);
  const bodyMesh = mesh(geo, bodyMat);
  body.add(bodyMesh);
  const accentMat = skin(look.accent);
  const mainMat = skin(look.main);
  const bellyMat = skin(look.belly);
  skinMats.push(accentMat, mainMat, bellyMat);

  // --- feet ---
  const noFeet = ['long', 'blob', 'star'].includes(look.shape) || extra.includes('ghost') || extra.includes('cloud');
  if (!noFeet) {
    for (const s of [-1, 1]) {
      const foot = mesh(SPHERE, accentMat, [0.26, 0.15, 0.32]);
      const { p } = at([s * 0.45, -1, 0.3]);
      foot.position.set(p.x, p.y + 0.06, p.z + 0.05);
      body.add(foot);
    }
  }
  if (look.shape === 'long') {
    for (const s of [-1, 1]) for (const zz of [0.55, -0.55]) {
      const foot = mesh(SPHERE, accentMat, [0.16, 0.12, 0.2]);
      const { p } = at([s * 0.5, -1, zz]);
      foot.position.set(p.x, p.y + 0.05, p.z);
      body.add(foot);
    }
  }

  // --- eyes ---
  const eyeDir = (s) => turn(F.face, s * F.eyeYaw, F.eyePitch);
  const E = F.eye;
  const makeEye = (s) => {
    const g = new THREE.Group();
    switch (look.eyes) {
      case 'sleepy': {
        const m = new THREE.Mesh(taperTube([V(-0.11, 0.02, 0), V(0, -0.05, 0.02), V(0.11, 0.02, 0)], 0.028, 0.028, { seg: 16, radial: 8 }), glossyBlack());
        g.add(m);
        attach(g, eyeDir(s), { inset: -0.005 });
        return g;
      }
      case 'fierce': {
        g.add(mesh(SPHERE, glossyWhite(), [E * 0.95, E * 0.75, E * 0.45]));
        g.add(mesh(SPHERE, glossyBlack(), [E * 0.32, E * 0.62, E * 0.3], [s * -0.02, -0.01, E * 0.25]));
        g.add(mesh(SPHERE, shine(), [0.022, 0.022, 0.01], [0.03, 0.04, E * 0.4]));
        const brow = mesh(new THREE.CapsuleGeometry(0.035, 0.2, 6, 12), skin('#2b2133'), [1, 1, 1], [0, E * 0.95, 0.03], [0, 0, Math.PI / 2 + s * 0.45]);
        g.add(brow);
        break;
      }
      case 'dot':
        g.add(mesh(SPHERE, glossyBlack(), [E * 0.5, E * 0.62, E * 0.35]));
        g.add(mesh(SPHERE, shine(), [0.022, 0.022, 0.01], [0.025, 0.035, E * 0.3]));
        break;
      case 'single': {
        g.add(mesh(SPHERE, glossyWhite(), [E * 1.7, E * 1.6, E * 0.7]));
        g.add(mesh(SPHERE, skin(look.accent, { roughness: 0.15, clearcoat: 1 }), [E * 1.05, E * 1.05, E * 0.4], [0, 0, E * 0.42]));
        g.add(mesh(SPHERE, glossyBlack(), [E * 0.5, E * 0.75, E * 0.3], [0, 0, E * 0.6]));
        g.add(mesh(SPHERE, shine(), [0.05, 0.05, 0.02], [0.08, 0.09, E * 0.82]));
        g.add(mesh(SPHERE, shine(), [0.025, 0.025, 0.01], [-0.07, -0.08, E * 0.78]));
        attach(g, turn(F.face, 0, F.eyePitch), { inset: E * 0.25 });
        anim.eyes.push(g);
        return g;
      }
      case 'sparkle':
        g.add(mesh(SPHERE, glossyBlack(), [E * 0.85, E * 1.1, E * 0.5]));
        g.add(mesh(SPHERE, new THREE.MeshBasicMaterial({ color: look.accent, transparent: true, opacity: 0.55 }), [E * 0.5, E * 0.32, E * 0.1], [0, -E * 0.55, E * 0.36]));
        g.add(mesh(SPHERE, shine(), [0.045, 0.05, 0.02], [0.045, 0.06, E * 0.45]));
        g.add(mesh(SPHERE, shine(), [0.02, 0.02, 0.01], [-0.04, -0.035, E * 0.46]));
        g.add(mesh(SPHERE, shine(), [0.014, 0.014, 0.01], [0.06, -0.06, E * 0.42]));
        break;
      default:
        g.add(mesh(SPHERE, glossyBlack(), [E * 0.75, E * 0.95, E * 0.45]));
        g.add(mesh(SPHERE, shine(), [0.04, 0.045, 0.02], [0.04, 0.055, E * 0.4]));
        g.add(mesh(SPHERE, shine(), [0.018, 0.018, 0.01], [-0.035, -0.04, E * 0.42]));
    }
    attach(g, eyeDir(s), { inset: E * 0.2 });
    anim.eyes.push(g);
    return g;
  };
  if (look.eyes === 'single') makeEye(0);
  else for (const s of [-1, 1]) makeEye(s);

  // cheeks + mouth
  if (look.eyes !== 'fierce') {
    for (const s of [-1, 1]) {
      const ch = mesh(SPHERE, new THREE.MeshStandardMaterial({ color: '#ff7f9f', transparent: true, opacity: 0.5, roughness: 0.9 }), [0.1, 0.06, 0.02]);
      attach(ch, turn(F.face, s * (F.eyeYaw + 0.2), F.eyePitch - 0.2), { inset: 0.005 });
    }
  }
  {
    const m = new THREE.Group();
    const dark = skin('#2b2133', { roughness: 0.4 });
    if (look.eyes === 'fierce') {
      m.add(new THREE.Mesh(taperTube([V(-0.1, -0.01, 0), V(0, 0.025, 0.01), V(0.1, -0.01, 0)], 0.018, 0.018, { seg: 12, radial: 6 }), dark));
      for (const s of [-1, 1]) m.add(mesh(new THREE.ConeGeometry(0.025, 0.07, 10), glossyWhite(), [1, 1, 1], [s * 0.055, -0.035, 0.01], [Math.PI, 0, 0]));
    } else {
      m.add(new THREE.Mesh(taperTube([V(-0.07, 0.01, 0), V(-0.035, -0.025, 0.01), V(0, 0.005, 0.01), V(0.035, -0.025, 0.01), V(0.07, 0.01, 0)], 0.016, 0.016, { seg: 20, radial: 6 }), dark));
    }
    m.scale.setScalar(1.5);
    attach(m, turn(F.face, 0, F.eyePitch - 0.32), { inset: 0.005 });
    anim.mouth = m;
  }

  // --- tops ---
  const TOP = (dirArr) => (dirArr ? V(...dirArr) : F.top.clone());
  const topPart = (obj, dir, inset = 0.04) => attach(obj, dir || F.top, { inset, axis: 'y' });
  switch (look.top) {
    case 'sprout': {
      const g = new THREE.Group();
      g.add(mesh(taperTube([V(0, -0.05, 0), V(0, 0.18, 0), V(0.04, 0.32, 0)], 0.045, 0.035), accentMat));
      g.add(mesh(SPHERE, skin('#5cc46a'), [0.2, 0.045, 0.11], [-0.14, 0.33, 0], [0, 0.3, 0.45]));
      g.add(mesh(SPHERE, skin('#9be57a'), [0.22, 0.045, 0.12], [0.17, 0.37, 0], [0, -0.3, -0.5]));
      topPart(g);
      anim.ears.push(g);
      break;
    }
    case 'cat':
    case 'tufts': {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        const h = look.top === 'cat' ? 0.42 : 0.3;
        g.add(mesh(new THREE.ConeGeometry(look.top === 'cat' ? 0.2 : 0.12, h, 24), look.top === 'cat' ? mainMat : accentMat, [1, 1, 0.6], [0, h / 2 - 0.04, 0]));
        if (look.top === 'cat') g.add(mesh(new THREE.ConeGeometry(0.12, 0.28, 20), skin('#ffb3c1'), [1, 1, 0.4], [0, 0.15, 0.05]));
        topPart(g, TOP([s * 0.52, 0.85, 0.05]), 0.06);
        g.rotateZ(-s * (look.top === 'cat' ? 0.12 : 0.35));
        anim.ears.push(g);
      }
      break;
    }
    case 'bunny': {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.add(mesh(new THREE.CapsuleGeometry(0.11, 0.5, 8, 16), mainMat, [1, 1, 0.55], [0, 0.34, 0]));
        g.add(mesh(new THREE.CapsuleGeometry(0.06, 0.4, 8, 12), skin('#ffc2cf'), [1, 1, 0.3], [0, 0.34, 0.04]));
        topPart(g, TOP([s * 0.3, 1, 0]), 0.05);
        g.rotateZ(-s * 0.18);
        anim.ears.push(g);
      }
      break;
    }
    case 'dog': {
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        const { p } = at([s * 0.72, 0.62, 0.05]);
        pivot.position.copy(p);
        pivot.add(mesh(SPHERE, accentMat, [0.16, 0.32, 0.08], [s * 0.04, -0.24, 0]));
        pivot.rotation.set(0.1, 0, s * 0.45);
        body.add(pivot);
        anim.ears.push(pivot);
      }
      break;
    }
    case 'fins': {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.add(mesh(SPHERE, accentMat, [0.07, 0.3, 0.2], [0, 0.2, 0]));
        topPart(g, TOP([s * 0.95, 0.4, 0]), 0.08);
        g.rotateZ(-s * 0.35);
        anim.ears.push(g);
      }
      const t = new THREE.Group();
      t.add(mesh(SPHERE, accentMat, [0.06, 0.22, 0.2], [0, 0.12, -0.05], [-0.4, 0, 0]));
      topPart(t, F.top, 0.06);
      break;
    }
    case 'bolts': {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.add(mesh(taperTube([V(0, 0, 0), V(-s * 0.08, 0.15, 0), V(s * 0.06, 0.2, 0), V(-s * 0.02, 0.42, 0)], 0.06, 0.02, { linear: true }), glow(look.accent, 0.6)));
        topPart(g, TOP([s * 0.32, 1, 0]), 0.03);
        anim.ears.push(g);
      }
      break;
    }
    case 'tuft': {
      const g = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        g.add(mesh(taperTube([V(i * 0.06, 0, 0), V(i * 0.1, 0.16, 0), V(i * 0.2 + 0.04, 0.26, 0), V(i * 0.22 + 0.12, 0.2, 0)], 0.06, 0.02), accentMat));
      }
      topPart(g);
      anim.ears.push(g);
      break;
    }
    case 'antennae': {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.add(mesh(taperTube([V(0, 0, 0), V(s * 0.04, 0.2, 0), V(s * 0.16, 0.36, 0.02)], 0.03, 0.02), accentMat));
        const tip = mesh(SPHERE, glow(look.accent, 0.5), [0.07, 0.07, 0.07], [s * 0.17, 0.38, 0.02]);
        g.add(tip);
        topPart(g, TOP([s * 0.25, 1, 0.05]), 0.03);
        anim.ears.push(g);
      }
      break;
    }
    case 'mushroom': {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), skin(look.accent, { clearcoat: 0.8 }), [0.85, 0.5, 0.85], [0, 0.05, 0]));
      g.add(mesh(new THREE.CircleGeometry(1, 40), skin('#fff4e6', { side: THREE.DoubleSide }), [0.84, 0.84, 1], [0, 0.05, 0], [Math.PI / 2, 0, 0]));
      for (let i = 0; i < 7; i++) {
        const a = r() * Math.PI * 2, el = 0.35 + r() * 0.9;
        const d = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
        const spot = mesh(SPHERE, skin('#ffffff'), [0.09, 0.02, 0.09]);
        spot.position.set(d.x * 0.85, 0.05 + d.y * 0.5, d.z * 0.85);
        spot.quaternion.setFromUnitVectors(Y, V(d.x / 0.85, d.y / 0.5, d.z / 0.85).normalize());
        g.add(spot);
      }
      topPart(g, V(0, 1, 0), 0.22);
      break;
    }
    case 'spikes': {
      for (let i = 0; i < 5; i++) {
        const t = (i - 2) / 2;
        const cone = mesh(new THREE.ConeGeometry(0.1, 0.32, 16), skin(look.accent, { clearcoat: 0.9, roughness: 0.25 }));
        cone.position.y = 0.14;
        const g = new THREE.Group();
        g.add(cone);
        topPart(g, TOP([t * 0.55, 1, -0.05 - Math.abs(t) * 0.1]), 0.04);
      }
      break;
    }
    case 'horns': {
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.add(mesh(taperTube([V(0, 0, 0), V(s * 0.12, 0.16, 0), V(s * 0.16, 0.34, -0.06), V(s * 0.08, 0.48, -0.12)], 0.1, 0.012), ivory()));
        topPart(g, TOP([s * 0.48, 0.85, 0.1]), 0.04);
      }
      break;
    }
    case 'crest': {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const k = i - 1;
        g.add(mesh(taperTube([V(k * 0.06, 0, 0), V(k * 0.08, 0.22 - Math.abs(k) * 0.04, -0.05), V(k * 0.12, 0.4 - Math.abs(k) * 0.1, -0.22), V(k * 0.14, 0.42 - Math.abs(k) * 0.12, -0.4)], 0.07, 0.01), i === 1 ? accentMat : mainMat));
      }
      topPart(g);
      anim.ears.push(g);
      break;
    }
    case 'crown': {
      const g = new THREE.Group();
      const gm = gold();
      g.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.14, 40, 1, true), gm, [1, 1, 1], [0, 0.07, 0]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.add(mesh(new THREE.ConeGeometry(0.06, 0.18, 12), gm, [1, 1, 1], [Math.sin(a) * 0.28, 0.22, Math.cos(a) * 0.28]));
        g.add(mesh(SPHERE, gm, [0.035, 0.035, 0.035], [Math.sin(a) * 0.28, 0.32, Math.cos(a) * 0.28]));
      }
      g.add(mesh(SPHERE, new THREE.MeshPhysicalMaterial({ color: '#ff3d7f', roughness: 0.05, clearcoat: 1, emissive: '#ff3d7f', emissiveIntensity: 0.3 }), [0.06, 0.06, 0.04], [0, 0.07, 0.31]));
      topPart(g, V(0, 1, 0.05), 0.08);
      break;
    }
    case 'flame': {
      const g = new THREE.Group();
      const fg = flameGeo();
      const outer = mesh(fg, glow('#ff8a1f', 2.4), [0.75, 1.0, 0.75]);
      const inner = mesh(fg, glow('#fff07a', 2.8), [0.42, 0.62, 0.42], [0, 0.03, 0.06]);
      g.add(outer, inner);
      topPart(g, V(0, 1, 0), 0.06);
      anim.flames.push(outer, inner);
      break;
    }
    case 'rays': {
      const g = new THREE.Group();
      const m = glow(look.accent, 1.2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const c = mesh(new THREE.ConeGeometry(0.11, 0.38, 14), m);
        c.position.set(Math.sin(a) * 1.05, Math.cos(a) * 1.0, -0.25);
        c.rotation.z = -a;
        g.add(c);
      }
      g.userData.axis = Z;
      body.add(g);
      anim.spin.push(g);
      break;
    }
    case 'coral': {
      const g = new THREE.Group();
      const m = skin(look.accent, { clearcoat: 0.6 });
      const branch = (x, lean) => {
        g.add(mesh(taperTube([V(x, 0, 0), V(x + lean * 0.05, 0.18, 0), V(x + lean * 0.12, 0.34, 0)], 0.06, 0.03), m));
        g.add(mesh(taperTube([V(x + lean * 0.05, 0.18, 0), V(x + lean * 0.15, 0.24, 0.02), V(x + lean * 0.2, 0.3, 0.02)], 0.035, 0.02), m));
        g.add(mesh(SPHERE, m, [0.035, 0.035, 0.035], [x + lean * 0.12, 0.34, 0]));
      };
      branch(-0.15, -1); branch(0.15, 1); branch(0, 0.4);
      topPart(g);
      break;
    }
    case 'flower': {
      const g = new THREE.Group();
      const pm = skin(look.accent, { side: THREE.DoubleSide });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const pet = mesh(SPHERE, pm, [0.22, 0.045, 0.12]);
        pet.position.set(Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2);
        pet.rotation.set(0, -a, 0.35);
        g.add(pet);
      }
      g.add(mesh(SPHERE, skin('#ffd23f', { clearcoat: 0.5 }), [0.12, 0.08, 0.12], [0, 0.08, 0]));
      topPart(g, F.top, 0.02);
      anim.spin.push(g);
      break;
    }
    case 'cap': {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), skin(look.accent, { roughness: 0.75, sheen: 0 }), [0.92, 0.42, 0.92]));
      g.add(mesh(new THREE.TorusGeometry(0.88, 0.07, 12, 48), skin(look.accent, { roughness: 0.8 }), [1, 1, 1], [0, 0.02, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.18, 12), skin('#4a2e18'), [1, 1, 1], [0.04, 0.48, 0], [0, 0, -0.3]));
      topPart(g, V(0, 1, 0), 0.32);
      break;
    }
    case 'antlers': {
      const am = skin('#8a6a45', { roughness: 0.6 });
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.add(mesh(taperTube([V(0, 0, 0), V(s * 0.08, 0.2, 0), V(s * 0.22, 0.4, -0.04), V(s * 0.28, 0.6, -0.08)], 0.05, 0.02), am));
        g.add(mesh(taperTube([V(s * 0.12, 0.27, 0), V(s * 0.02, 0.42, 0.02), V(s * 0.04, 0.52, 0.02)], 0.03, 0.015), am));
        g.add(mesh(taperTube([V(s * 0.22, 0.42, -0.04), V(s * 0.36, 0.5, -0.04), V(s * 0.42, 0.58, -0.04)], 0.025, 0.012), am));
        for (const [x, y] of [[0.04, 0.53], [0.28, 0.61], [0.42, 0.59]]) g.add(mesh(SPHERE, skin('#ff9ec4', { clearcoat: 0.6 }), [0.04, 0.04, 0.04], [s * x, y, 0]));
        topPart(g, TOP([s * 0.3, 1, 0]), 0.03);
      }
      break;
    }
    case 'tree': {
      const g = new THREE.Group();
      const lm = skin('#5aa84f', { roughness: 0.7, sheenColor: new THREE.Color('#c9f2a8') });
      const lm2 = skin('#7cc35a', { roughness: 0.7 });
      const blobs = [[0, 0.35, 0, 0.5], [-0.38, 0.22, 0.05, 0.38], [0.4, 0.25, -0.05, 0.4], [0.05, 0.62, -0.05, 0.36], [0, 0.2, -0.35, 0.36]];
      for (const [x, y, z, s] of blobs) g.add(mesh(SPHERE, r() > 0.5 ? lm : lm2, [s, s * 0.85, s], [x, y, z]));
      for (let i = 0; i < 6; i++) g.add(mesh(SPHERE, skin('#ff5d6c', { clearcoat: 1, roughness: 0.2 }), [0.05, 0.05, 0.05], [(r() - 0.5) * 0.9, 0.2 + r() * 0.5, 0.3 + r() * 0.15]));
      topPart(g, V(0, 1, 0), 0.2);
      break;
    }
    case 'gems': {
      const g = new THREE.Group();
      const gm = new THREE.MeshPhysicalMaterial({ color: look.accent, roughness: 0.05, metalness: 0.1, clearcoat: 1, iridescence: 0.9, iridescenceIOR: 1.6, transparent: true, opacity: 0.88, emissive: look.accent, emissiveIntensity: 0.25 });
      const oct = new THREE.OctahedronGeometry(0.16, 0);
      for (const [x, h, tilt] of [[0, 2.6, 0], [-0.17, 1.8, 0.4], [0.18, 2, -0.35]]) {
        g.add(mesh(oct, gm, [1, h, 1], [x, 0.16 * h * 0.8, 0], [0, 0.4, tilt]));
      }
      topPart(g, F.top, 0.06);
      break;
    }
    case 'nightcap': {
      const g = new THREE.Group();
      const cm = skin(look.accent, { roughness: 0.8, sheen: 1 });
      g.add(mesh(taperTube([V(0, 0, 0), V(0, 0.3, 0), V(0.25, 0.55, 0), V(0.55, 0.42, 0.05)], 0.48, 0.05, { seg: 36, radial: 24 }), cm));
      g.add(mesh(new THREE.TorusGeometry(0.47, 0.08, 14, 40), skin('#ffffff', { roughness: 0.9, sheen: 1 }), [1, 1, 1], [0, 0.02, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(SPHERE, skin('#ffffff', { roughness: 0.9, sheen: 1 }), [0.1, 0.1, 0.1], [0.56, 0.4, 0.05]));
      topPart(g, V(0, 1, 0), 0.25);
      anim.ears.push(g);
      break;
    }
    case 'moon': {
      const g = new THREE.Group();
      g.add(mesh(new THREE.TorusGeometry(0.2, 0.06, 16, 40, Math.PI * 1.25), glow('#fff2b0', 1.4), [1, 1, 0.6], [0, 0, 0.02], [0, 0, Math.PI * 0.62]));
      attach(g, turn(F.face, 0, F.eyePitch + 0.42), { inset: 0.02 });
      const halo = mesh(new THREE.TorusGeometry(0.3, 0.025, 12, 48), glow('#e8e2ff', 1.2), [1, 1, 1], [0, 0, 0], [Math.PI / 2, 0, 0]);
      const hp = at(F.top);
      halo.position.copy(hp.p).addScaledVector(hp.n, 0.25);
      halo.userData.axis = Z;
      body.add(halo);
      anim.spin.push(halo);
      break;
    }
    case 'halo': {
      const halo = mesh(new THREE.TorusGeometry(0.3, 0.03, 12, 48), glow('#ffe58a', 1.4), [1, 1, 1], [0, 0, 0], [Math.PI / 2, 0, 0]);
      const hp = at(F.top);
      halo.position.copy(hp.p).addScaledVector(hp.n, 0.25);
      halo.userData.axis = Z;
      body.add(halo);
      anim.spin.push(halo);
      break;
    }
    default:
      break;
  }

  // --- extras ---
  const tailRoot = () => at(look.shape === 'long' ? [0, 0.05, -1] : [0, -0.35, -1]);
  if (extra.includes('tail') || extra.includes('flametail') || extra.includes('startail')) {
    const pivot = new THREE.Group();
    const { p } = tailRoot();
    pivot.position.copy(p).add(V(0, 0, 0.08));
    const fl = extra.includes('flametail');
    const st = extra.includes('startail');
    const pts = st
      ? [V(0, 0, 0), V(0.1, 0.1, -0.35), V(0.35, 0.45, -0.55), V(0.45, 0.85, -0.45)]
      : [V(0, 0, 0), V(0.06, 0.08, -0.25), V(0.2, 0.3, -0.42), V(0.3, 0.55, -0.36)];
    pivot.add(mesh(taperTube(pts, fl ? 0.12 : 0.13, 0.05), mainMat));
    const tip = pts[pts.length - 1];
    if (fl) {
      const fg = flameGeo();
      const o = mesh(fg, glow('#ff8a1f', 2.4), [0.38, 0.5, 0.38], [tip.x, tip.y - 0.05, tip.z]);
      const i = mesh(fg, glow('#fff07a', 2.8), [0.2, 0.32, 0.2], [tip.x, tip.y - 0.02, tip.z + 0.03]);
      pivot.add(o, i);
      anim.flames.push(o, i);
    } else if (st) {
      const star = mesh(new THREE.ExtrudeGeometry(starShape(0.18, 0.08), { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 }), glow(look.accent, 1.8), [1, 1, 1], [tip.x, tip.y + 0.1, tip.z]);
      pivot.add(star);
      anim.spin.push(star);
    } else {
      pivot.add(mesh(SPHERE, accentMat, [0.09, 0.09, 0.09], [tip.x, tip.y, tip.z]));
    }
    body.add(pivot);
    anim.tails.push(pivot);
  }
  if (extra.includes('fintail')) {
    const pivot = new THREE.Group();
    const { p } = at([0, 0, -1]);
    pivot.position.copy(p);
    pivot.add(mesh(SPHERE, accentMat, [0.05, 0.32, 0.28], [0, 0.12, -0.18], [0.5, 0, 0]));
    pivot.add(mesh(SPHERE, accentMat, [0.05, 0.28, 0.24], [0, -0.1, -0.16], [-0.6, 0, 0]));
    body.add(pivot);
    anim.tails.push(pivot);
  }
  if (extra.includes('wings')) {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const { p } = at([s * 0.85, 0.25, -0.45]);
      pivot.position.copy(p);
      const wm = s > 0 ? mainMat : mainMat;
      pivot.add(mesh(SPHERE, wm, [0.42, 0.22, 0.05], [s * 0.36, 0.12, -0.04], [0, 0, s * 0.35]));
      pivot.add(mesh(SPHERE, bellyMat, [0.32, 0.15, 0.04], [s * 0.3, 0.02, -0.02], [0, 0, s * 0.15]));
      pivot.add(mesh(SPHERE, accentMat, [0.22, 0.1, 0.035], [s * 0.24, -0.08, 0], [0, 0, -s * 0.05]));
      pivot.rotation.y = -s * 0.5;
      pivot.userData.side = s;
      body.add(pivot);
      anim.wings.push(pivot);
    }
  }
  if (extra.includes('mothwings')) {
    const wingShape = (w, h) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.bezierCurveTo(w * 0.3, h * 1.1, w * 1.1, h * 1.1, w, h * 0.3);
      sh.bezierCurveTo(w * 0.95, -h * 0.1, w * 0.4, -h * 0.15, 0, 0);
      return sh;
    };
    const wmat = new THREE.MeshPhysicalMaterial({ color: look.accent, roughness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.92, iridescence: 1, sheen: 1, sheenColor: new THREE.Color('#ffffff') });
    const spotM = glow('#fff6a8', 1.3);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const { p } = at([s * 0.3, 0.3, -1]);
      pivot.position.copy(p);
      const up = new THREE.Mesh(new THREE.ShapeGeometry(wingShape(1.0, 0.75), 24), wmat);
      up.scale.set(s, 1, 1);
      up.position.set(0, 0.05, -0.02);
      const lo = new THREE.Mesh(new THREE.ShapeGeometry(wingShape(0.7, 0.55), 24), wmat);
      lo.scale.set(s, -1, 1);
      lo.position.set(0, 0, -0.03);
      pivot.add(up, lo);
      pivot.add(mesh(new THREE.CircleGeometry(0.11, 24), spotM, [s, 1, 1], [s * 0.62, 0.48, -0.01]));
      pivot.add(mesh(new THREE.CircleGeometry(0.07, 24), spotM, [s, 1, 1], [s * 0.4, -0.3, -0.02]));
      pivot.rotation.y = -s * 0.35;
      pivot.userData.side = s;
      body.add(pivot);
      anim.wings.push(pivot);
    }
  }
  if (extra.includes('shell')) {
    const g = new THREE.Group();
    const sm = skin(look.accent, { clearcoat: 1, roughness: 0.3 });
    g.add(mesh(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), sm, [0.85, 0.6, 0.85]));
    for (let i = 0; i < 3; i++) g.add(mesh(new THREE.TorusGeometry(0.6 - i * 0.18, 0.03, 10, 40), skin('#f6d7a8'), [1, 1, 1], [0, 0.18 + i * 0.13, 0], [Math.PI / 2, 0, 0]));
    attach(g, [0, 0.2, -1], { inset: 0.35, axis: 'y' });
  }
  if (extra.includes('spikesback')) {
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const g = new THREE.Group();
      g.add(mesh(new THREE.ConeGeometry(0.08, 0.24, 12), skin(look.accent, { clearcoat: 0.8 }), [1, 1, 1], [0, 0.1, 0]));
      attach(g, look.shape === 'long' ? [0, 1, 0.4 - t * 1.2] : [0, 0.9 - t * 1.0, -0.3 - t * 0.7], { inset: 0.03, axis: 'y' });
    }
  }
  if (extra.includes('arms') || look.shape === 'tall') {
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const { p } = at([s * 1, -0.05, 0.2]);
      pivot.position.copy(p);
      pivot.add(mesh(SPHERE, mainMat, [0.17, 0.28, 0.17], [s * 0.06, -0.18, 0.04], [0, 0, s * 0.25]));
      pivot.userData.side = s;
      body.add(pivot);
      anim.arms.push(pivot);
    }
  }
  if (extra.includes('leaves')) {
    const lm = skin('#6cc46a');
    for (let i = 0; i < 9; i++) {
      const lf = mesh(SPHERE, lm, [0.1, 0.03, 0.06]);
      attach(lf, [(r() - 0.5) * 2, r() * 1.2 - 0.3, -r()], { inset: 0, axis: 'y' });
      lf.rotateY(r() * Math.PI);
    }
  }
  if (extra.includes('cloud')) {
    const cm = skin(extra.includes('ghost') ? look.main : '#ffffff', { roughness: 0.9, sheen: 1, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const s = 0.28 + r() * 0.12;
      const puff = mesh(SPHERE, cm, [s, s * 0.8, s]);
      const { p } = at([Math.cos(a), -0.6, Math.sin(a)]);
      puff.position.copy(p).add(V(0, 0.05, 0));
      body.add(puff);
    }
  }
  if (extra.includes('bubbles') && hasDOM) {
    const bm = new THREE.MeshPhysicalMaterial({ color: '#dff4ff', roughness: 0.05, transparent: true, opacity: 0.35, iridescence: 1, clearcoat: 1 });
    for (let i = 0; i < 6; i++) {
      const b = mesh(SPHERE, bm, [1, 1, 1]);
      b.userData = { phase: r() * 10, x: (r() - 0.5) * 2.4, z: (r() - 0.2) * 1.4, s: 0.05 + r() * 0.07 };
      group.add(b);
      anim.bubbles.push(b);
    }
  }

  // --- normalize: stand on the ground, 1 unit tall ---
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(bodyMesh);
  const h = box.max.y - box.min.y;
  const k = 1 / h;
  body.position.y = -box.min.y;
  const outer = new THREE.Group();
  outer.add(group);
  group.scale.setScalar(k);
  // sparkles orbit around (outside the scaled group so they stay small)
  if (extra.includes('sparkles') && hasDOM) {
    const sm = new THREE.SpriteMaterial({ map: glowTexture('star'), color: look.accent, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(sm);
      s.userData = { phase: (i / 8) * Math.PI * 2, rad: 0.55 + r() * 0.25, y: 0.2 + r() * 0.8, sp: 0.4 + r() * 0.5 };
      s.scale.setScalar(0.08);
      outer.add(s);
      anim.sparkles.push(s);
    }
  }
  const full = new THREE.Box3().setFromObject(outer);
  return {
    root: outer, inner: group, body, anim, skinMats,
    height: 1, top: full.max.y, width: full.max.x - full.min.x, depth: full.max.z - full.min.z,
    speciesId,
  };
}

// ---------- Fairy builder ----------

export function buildFairy(kind) {
  const k = FAIRY_KINDS[kind];
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  const anim = { wings: [], ears: [], tails: [], flames: [], bubbles: [], sparkles: [], eyes: [], arms: [], spin: [], float: true };
  const skinM = skin('#ffe6d6');
  const dressM = skin(k.color, { sheen: 1, clearcoat: 0.6 });
  const m = (geo, mat, s, p, r = [0, 0, 0]) => {
    const x = new THREE.Mesh(geo, mat);
    x.scale.set(...s);
    x.position.set(...p);
    x.rotation.set(...r);
    x.castShadow = true;
    g.add(x);
    return x;
  };
  // dress (lathe)
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector2(0.05 + 0.2 * Math.pow(1 - t, 1.6), t * 0.42));
  }
  m(new THREE.LatheGeometry(pts, 32), dressM, [1, 1, 1], [0, 0.12, 0]);
  m(SPHERE, skinM, [0.05, 0.12, 0.05], [-0.07, 0.04, 0], [0, 0, 0.15]);
  m(SPHERE, skinM, [0.05, 0.12, 0.05], [0.07, 0.04, 0], [0, 0, -0.15]);
  m(SPHERE, skinM, [0.04, 0.12, 0.04], [-0.17, 0.42, 0.02], [0, 0, 0.9]);
  m(SPHERE, skinM, [0.04, 0.12, 0.04], [0.17, 0.42, 0.02], [0, 0, -0.9]);
  // head
  m(SPHERE, skinM, [0.2, 0.19, 0.19], [0, 0.72, 0]);
  m(SPHERE, skin(kind === 'trickster' ? '#ff9ad5' : '#9be4ff', { sheen: 1 }), [0.215, 0.17, 0.21], [0, 0.77, -0.03]);
  for (const s of [-1, 1]) {
    m(SPHERE, glossyBlack(), [0.03, 0.04, 0.02], [s * 0.065, 0.72, 0.175]);
    m(SPHERE, shine(), [0.01, 0.01, 0.01], [s * 0.065 + 0.01, 0.735, 0.19]);
    m(SPHERE, new THREE.MeshStandardMaterial({ color: '#ff7f9f', transparent: true, opacity: 0.55 }), [0.035, 0.02, 0.01], [s * 0.11, 0.68, 0.16]);
  }
  m(taperTube([V(-0.03, 0.665, 0.18), V(0, 0.65, 0.19), V(0.03, 0.665, 0.18)], 0.008, 0.008, { seg: 10, radial: 6 }), skin('#2b2133'), [1, 1, 1], [0, 0, 0]);
  if (kind === 'trickster') {
    m(taperTube([V(0, 0.86, 0), V(0, 1.0, -0.02), V(0.08, 1.12, -0.05), V(0.18, 1.1, -0.04)], 0.12, 0.015), dressM, [1, 1, 1], [0, 0, 0]);
    m(SPHERE, glow('#fff6a8', 1.5), [0.035, 0.035, 0.035], [0.19, 1.1, -0.04]);
  } else {
    m(taperTube([V(0, 0.88, 0), V(0.02, 1.0, 0), V(0.0, 1.08, 0)], 0.015, 0.012), skin('#5a4a6a'), [1, 1, 1], [0, 0, 0]);
    m(SPHERE, glow('#fff6a8', 1.8), [0.045, 0.045, 0.045], [0, 1.1, 0]);
  }
  // wings
  const wmat = new THREE.MeshPhysicalMaterial({ color: k.glow, roughness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.6, iridescence: 1, emissive: k.color, emissiveIntensity: 0.25, depthWrite: false });
  const wingShape = (w, h) => {
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.bezierCurveTo(w * 0.2, h * 1.2, w * 1.2, h * 1.0, w, h * 0.2);
    sh.bezierCurveTo(w * 0.8, -h * 0.1, w * 0.3, -h * 0.05, 0, 0);
    return sh;
  };
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.45, -0.06);
    const up = new THREE.Mesh(new THREE.ShapeGeometry(wingShape(0.42, 0.36), 20), wmat);
    up.scale.set(s, 1, 1);
    const lo = new THREE.Mesh(new THREE.ShapeGeometry(wingShape(0.3, 0.26), 20), wmat);
    lo.scale.set(s, -1, 1);
    pivot.add(up, lo);
    pivot.userData.side = s;
    pivot.userData.fast = true;
    g.add(pivot);
    anim.wings.push(pivot);
  }
  // glow aura
  if (hasDOM) {
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('soft'), color: k.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 }));
    aura.scale.setScalar(1.3);
    aura.position.y = 0.55;
    outer.add(aura);
    const sm = new THREE.SpriteMaterial({ map: glowTexture('star'), color: k.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(sm);
      s.userData = { phase: (i / 6) * Math.PI * 2, rad: 0.45, y: 0.3 + (i % 3) * 0.25, sp: 1.2 };
      s.scale.setScalar(0.07);
      outer.add(s);
      anim.sparkles.push(s);
    }
  }
  return { root: outer, inner: g, body: g, anim, skinMats: [skinM, dressM], height: 1.1, top: 1.15, width: 0.9, depth: 0.4, fairy: kind };
}

// ---------- Animation ----------

const ease = (t) => 1 - Math.pow(1 - t, 3);
const _q = new THREE.Quaternion();
const _x = new THREE.Vector3(1, 0, 0);

// Wraps a built model with idle animation and one-shot actions.
export class Actor {
  constructor(model) {
    this.model = model;
    this.root = model.root;
    this.t = Math.random() * 10;
    this.action = null;
    this.blinkAt = 1.5 + Math.random() * 3;
    this.fainted = false;
    this.base = new THREE.Vector3();
  }

  play(name, dur) {
    const D = { hop: 0.55, shake: 0.5, sad: 0.9, love: 1.2, attack: 0.55, hit: 0.45, faint: 0.9, enter: 0.9, flyaway: 1.0, wave: 1.0, spin: 0.8 };
    if (name !== 'faint' && name !== 'flyaway') this.fainted = false;
    return new Promise((resolve) => {
      if (this.action) this.action.resolve();
      this.action = { name, t: 0, dur: dur || D[name] || 0.6, resolve };
    });
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const { inner, body, anim, skinMats } = this.model;
    // idle
    const breath = Math.sin(t * 2.4);
    body.scale.set(1 - breath * 0.012, 1 + breath * 0.025, 1 - breath * 0.012);
    let px = 0, py = anim.float ? 0.06 + Math.sin(t * 1.6) * 0.04 : 0, pz = 0;
    let rx = 0, ry = Math.sin(t * 0.45) * 0.14, rz = Math.sin(t * 1.3) * 0.025;
    let sc = 1;
    let flash = 0;
    // blink
    this.blinkAt -= dt;
    let lid = 1;
    if (this.blinkAt < 0) {
      lid = Math.abs(this.blinkAt) < 0.07 ? 0.1 : 1;
      if (this.blinkAt < -0.14) this.blinkAt = 2 + Math.random() * 4;
    }
    for (const e of anim.eyes) e.scale.y = lid;
    for (const e of anim.ears) {
      e.userData.q0 ??= e.quaternion.clone();
      e.quaternion.copy(e.userData.q0).multiply(_q.setFromAxisAngle(_x, Math.sin(t * 2.2 + e.id) * 0.07));
    }
    for (const tl of anim.tails) tl.rotation.y = Math.sin(t * 2.6) * 0.35;
    for (const w of anim.wings) {
      const f = w.userData.fast ? Math.sin(t * 28) * 0.55 : Math.sin(t * 3.2) * 0.35;
      w.rotation.y = -w.userData.side * (0.35 + f);
    }
    for (const a of anim.arms) a.rotation.z = a.userData.side * (0.1 + Math.sin(t * 1.8) * 0.08);
    for (const f of anim.flames) {
      if (f.userData.base == null) f.userData.base = f.scale.clone();
      const b = f.userData.base;
      const k = 1 + Math.sin(t * 13 + b.x * 50) * 0.08 + Math.sin(t * 21) * 0.05;
      f.scale.set(b.x * (2 - k), b.y * k, b.z * (2 - k));
    }
    for (const s of anim.spin) s.rotateOnAxis(s.userData.axis || Y, dt * 0.6);
    for (const b of anim.bubbles) {
      const u = b.userData;
      const p = ((t * 0.35 + u.phase) % 1);
      b.position.set(u.x + Math.sin(t * 2 + u.phase) * 0.08, 0.3 + p * 1.6, u.z);
      b.scale.setScalar(u.s * (p < 0.1 ? p * 10 : p > 0.9 ? (1 - p) * 10 : 1));
    }
    for (const s of anim.sparkles) {
      const u = s.userData;
      const a = u.phase + t * u.sp;
      s.position.set(Math.cos(a) * u.rad, u.y + Math.sin(t * 2 + u.phase) * 0.08, Math.sin(a) * u.rad);
      s.material.opacity = 0.6 + Math.sin(t * 6 + u.phase) * 0.4;
    }

    // one-shot actions
    const A = this.action;
    if (A) {
      A.t += dt;
      const p = Math.min(1, A.t / A.dur);
      switch (A.name) {
        case 'hop':
          py += Math.sin(Math.PI * p) * 0.35;
          sc = 1 + Math.sin(Math.PI * p) * 0.05;
          break;
        case 'shake':
          rz += Math.sin(p * Math.PI * 8) * 0.15 * (1 - p);
          px += Math.sin(p * Math.PI * 8) * 0.06 * (1 - p);
          break;
        case 'sad':
          rx += ease(p) * 0.25;
          sc = 1 - ease(p) * 0.06;
          break;
        case 'love': {
          const j = (p * 2) % 1;
          py += Math.sin(Math.PI * j) * 0.3;
          ry += ease(p) * Math.PI * 2;
          break;
        }
        case 'spin':
          ry += ease(p) * Math.PI * 2;
          break;
        case 'attack':
          pz += Math.sin(Math.PI * Math.min(1, p * 1.4)) * 0.55;
          py += Math.sin(Math.PI * p) * 0.12;
          rx += Math.sin(Math.PI * p) * 0.2;
          break;
        case 'hit':
          pz -= Math.sin(Math.PI * p) * 0.25;
          rz += Math.sin(p * Math.PI * 6) * 0.12 * (1 - p);
          flash = 1 - p;
          break;
        case 'faint':
          rz += ease(p) * Math.PI / 2;
          py -= ease(p) * 0.1;
          break;
        case 'enter': {
          const e = 1 - Math.pow(1 - p, 3);
          sc = e * (1 + Math.sin(p * Math.PI * 3) * 0.12 * (1 - p));
          py += (1 - e) * 0.5;
          break;
        }
        case 'flyaway':
          py += ease(p) * 3;
          px += ease(p) * 1.2;
          sc = 1 - p * 0.8;
          ry += p * 6;
          break;
        case 'wave':
          for (const a of anim.arms) a.rotation.z = a.userData.side * (0.4 + Math.sin(p * Math.PI * 6) * 0.4);
          py += Math.abs(Math.sin(p * Math.PI * 2)) * 0.08;
          break;
        default:
          break;
      }
      if (p >= 1) {
        if (A.name === 'faint') this.fainted = true;
        if (A.name === 'flyaway') this.root.visible = false;
        this.action = null;
        A.resolve();
      }
    }
    if (this.fainted) {
      rz += Math.PI / 2;
      py -= 0.1;
    }
    inner.position.set(px, py, pz);
    inner.rotation.set(rx, ry, rz);
    inner.scale.setScalar(this.model.inner.userData.k0 ?? (this.model.inner.userData.k0 = inner.scale.x));
    inner.scale.multiplyScalar(sc);
    for (const m of skinMats) {
      if (flash > 0) {
        m.userData.e ??= { c: m.emissive.clone(), i: m.emissiveIntensity };
        m.emissive.setRGB(1, 0.15, 0.1);
        m.emissiveIntensity = flash * 0.45;
      } else if (m.userData.e) {
        m.emissive.copy(m.userData.e.c);
        m.emissiveIntensity = m.userData.e.i;
        delete m.userData.e;
      }
    }
  }
}

export function disposeModel(model) {
  model.root.traverse((o) => {
    if (o.geometry && o.geometry !== SPHERE) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const key of ['map', 'emissiveMap']) if (m[key] && !Array.from(texCache.values()).includes(m[key])) m[key].dispose();
        m.dispose();
      }
    }
  });
}
