// Board: builds a level in 3D, handles touch rotation of mirrors, draws the beam,
// and plays Lumi's journey home when the lighthouse is reached.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { parseLevel, trace, solve, initialTypes } from './logic.js';
import { BEAM_Y, WATER_Y } from './scene.js';

const HALF_PI = Math.PI / 2;
const QUARTER = Math.PI / 4;
const BEAM_SPEED = 16; // tiles / second
const ORB_SPEED = 4.2;

const snapIndex = (a) => Math.round((a - QUARTER) / HALF_PI);
const snapAngle = (a) => QUARTER + snapIndex(a) * HALF_PI;
const typeOfAngle = (a) => ((snapIndex(a) % 2) + 2) % 2;
const angleOfType = (t) => QUARTER + t * HALF_PI;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function seeded(x, y, n = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// ---------- shared materials & geometries ----------
function makeKit(stage) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const kit = {
    sand: std({ color: 0xe9d2a6, roughness: 0.92 }),
    cliff: std({ color: 0x7a6f7e, roughness: 0.95, flatShading: true }),
    stone: std({ color: 0x9a96a8, roughness: 0.85 }),
    darkStone: std({ color: 0x5d5a6e, roughness: 0.9 }),
    rock: std({ color: 0x6f6d84, roughness: 0.88, flatShading: true }),
    brass: std({ color: 0xd8b26a, metalness: 0.85, roughness: 0.3 }),
    iron: std({ color: 0x6d6a72, metalness: 0.7, roughness: 0.6 }),
    mirror: std({ color: 0xdbe8ff, metalness: 0.92, roughness: 0.06, envMapIntensity: 2.6, emissive: 0x5d86c4, emissiveIntensity: 0.45 }),
    oldMirror: std({ color: 0xb9b6c4, metalness: 0.9, roughness: 0.22, envMapIntensity: 1.6, emissive: 0x4a4658, emissiveIntensity: 0.4 }),
    crystal: std({
      color: 0x8fe6ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55,
      emissive: 0x2a9fd6, emissiveIntensity: 0.8, envMapIntensity: 2, side: THREE.DoubleSide, depthWrite: false,
    }),
    grass: std({ color: 0x6f9d63, roughness: 0.9, flatShading: true }),
    shell: std({ color: 0xf6d9cf, roughness: 0.6 }),
    white: std({ color: 0xf3ede2, roughness: 0.7 }),
    red: std({ color: 0xc8463e, roughness: 0.6 }),
    wood: std({ color: 0x7a5236, roughness: 0.8 }),
    hullRed: std({ color: 0xb4483c, roughness: 0.7 }),
    sail: std({ color: 0xfff4de, roughness: 0.9, side: THREE.DoubleSide }),
    glass: std({ color: 0xffe2a8, emissive: 0xffb24a, emissiveIntensity: 0.15, roughness: 0.1, transparent: true, opacity: 0.85 }),
    rune: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 1.8), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
    glow: stage.glowTexture,
  };
  kit.tileTop = new RoundedBoxGeometry(0.98, 0.34, 0.98, 2, 0.07);
  kit.tilePillar = new RoundedBoxGeometry(0.9, 2.2, 0.9, 1, 0.12);
  return kit;
}

function glowSprite(kit, color, scale, opacity = 1) {
  const m = new THREE.SpriteMaterial({
    map: kit.glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  return s;
}

function shadowed(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

// ---------- beam rendering ----------
function makeBeamGeometry() {
  // two crossed ribbons running along +X from 0..1, unit width
  const g = new THREE.BufferGeometry();
  const p = [];
  const uv = [];
  const idx = [];
  const ribbon = (ay, az) => {
    const b = p.length / 3;
    p.push(0, -ay, -az, 1, -ay, -az, 1, ay, az, 0, ay, az);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  ribbon(0.5, 0);
  ribbon(0, 0.5);
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function makeBeamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uLen: { value: 1 },
      uWidth: { value: 0.32 },
      uStart: { value: 0 },
      uTime: { value: 0 },
      uTail: { value: 0 },
      uFull: { value: 1 },
      uIntensity: { value: 1 },
      uColor: { value: new THREE.Color(1.0, 0.62, 0.26) },
    },
    vertexShader: /* glsl */ `
      uniform float uLen, uWidth;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.x *= uLen;
        p.yz *= uWidth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uLen, uStart, uTime, uTail, uFull, uIntensity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main(){
        float a = abs(vUv.y - 0.5) * 2.0;
        float core = exp(-a * a * 60.0);
        float glow = exp(-a * a * 6.0);
        float s = vUv.x * uLen;
        float along = s + uStart;
        float flow = 0.7 + 0.3 * sin(along * 8.0 - uTime * 9.0) * sin(along * 3.1 - uTime * 4.0 + 1.3);
        float tail = uTail > 0.0 ? 1.0 - smoothstep(uFull - uTail, uFull, s) : 1.0;
        float head = smoothstep(0.0, 0.12, uLen - s) * 0.6 + 0.4;
        vec3 col = uColor * glow * flow * 0.9 + vec3(1.0, 0.92, 0.78) * core * 2.4;
        gl_FragColor = vec4(col * uIntensity * tail * head, 1.0);
      }
    `,
  });
}

export class Board {
  constructor(stage, audio, events) {
    this.stage = stage;
    this.audio = audio;
    this.events = events;
    this.kit = makeKit(stage);
    this.beamGeo = makeBeamGeometry();
    this.root = null;
    this.beams = [];
    this.flares = [];
    this.inputEnabled = false;
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    this.tmpV = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
    this._orb();
    this._sparks();
    this._bindInput();
  }

  // ---------- coordinates ----------
  world(x, y, out = new THREE.Vector3(), h = 0) {
    return out.set(x - (this.lvl.w - 1) / 2, h, y - (this.lvl.h - 1) / 2);
  }

  // ---------- level lifecycle ----------
  load(index, def) {
    this.unload();
    this.index = index;
    this.lvl = parseLevel(def);
    this.solution = solve(this.lvl);
    this.types = initialTypes(this.lvl);
    this.moves = 0;
    this.won = false;
    this.winTimer = 0;
    this.journey = null;
    this.reveal = 0;
    this.segments = [];
    this.litBoats = new Set();
    this.hintPiece = null;
    this.root = new THREE.Group();
    this.stage.scene.add(this.root);
    this._buildIsland();
    this._buildPieces();
    this._placeOrb();
    this._recompute(true);
    this.inputEnabled = true;
    this.events.onMoves?.(this.moves, this.solution.par);
  }

  unload() {
    if (!this.root) return;
    this.stage.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        if (o.userData.ownGeo) o.geometry.dispose();
        if (o.userData.ownMat) o.material.dispose();
      }
      if (o.isSprite) o.material.dispose();
    });
    for (const b of this.beams) b.material.dispose();
    this.beams = [];
    this.flares = [];
    this.root = null;
    this.pieces = [];
  }

  bounds() {
    return { hx: this.lvl.w / 2 + 0.25, hz: this.lvl.h / 2 + 0.25 };
  }

  // ---------- island ----------
  _buildIsland() {
    const { lvl, kit } = this;
    const land = lvl.cells.filter((c) => c.land && c.kind !== 'boat');
    const tops = new THREE.InstancedMesh(kit.tileTop, kit.sand, land.length);
    const pillars = new THREE.InstancedMesh(kit.tilePillar, kit.cliff, land.length);
    const m = new THREE.Matrix4();
    const col = new THREE.Color();
    const v = new THREE.Vector3();
    land.forEach((c, i) => {
      this.world(c.x, c.y, v);
      const jitter = (seeded(c.x, c.y) - 0.5) * 0.04;
      m.makeTranslation(v.x, -0.17 + jitter, v.z);
      tops.setMatrixAt(i, m);
      col.setHSL(0.11 + (seeded(c.x, c.y, 1) - 0.5) * 0.02, 0.5, 0.74 + (seeded(c.x, c.y, 2) - 0.5) * 0.07);
      tops.setColorAt(i, col);
      m.makeTranslation(v.x, -1.35 - seeded(c.x, c.y, 3) * 0.1, v.z);
      pillars.setMatrixAt(i, m);
      col.setHSL(0.72 + (seeded(c.x, c.y, 4) - 0.5) * 0.05, 0.1, 0.42 + (seeded(c.x, c.y, 5) - 0.5) * 0.1);
      pillars.setColorAt(i, col);
    });
    tops.receiveShadow = true;
    tops.castShadow = true;
    pillars.receiveShadow = true;
    this.root.add(tops, pillars);

    // decorations on empty sand + sea stacks around the island
    for (const c of lvl.cells) {
      if (c.kind !== 'sand') continue;
      const r = seeded(c.x, c.y, 7);
      const p = this.world(c.x, c.y);
      if (r < 0.35) this._tuft(p, c);
      else if (r < 0.55) this._pebbles(p, c);
      else if (r < 0.65) this._shell(p, c);
    }
    const ringCount = 7;
    for (let i = 0; i < ringCount; i++) {
      const a = (i / ringCount) * Math.PI * 2 + seeded(i, lvl.w) * 0.6;
      const rx = lvl.w / 2 + 1.2 + seeded(i, 3) * 2.5;
      const rz = lvl.h / 2 + 1.2 + seeded(i, 9) * 2.5;
      const stack = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + seeded(i, 5) * 0.45, 0), kit.rock);
      stack.userData.ownGeo = true;
      stack.position.set(Math.cos(a) * rx, WATER_Y - 0.1 + seeded(i, 6) * 0.15, Math.sin(a) * rz);
      stack.scale.y = 1.2 + seeded(i, 8);
      stack.rotation.set(seeded(i, 1) * 3, seeded(i, 2) * 3, 0);
      this.root.add(shadowed(stack));
    }

    // island mask for the ocean shader (foam + shallows)
    const PX = 12;
    const pad = 3;
    const mw = (lvl.w + pad * 2) * PX;
    const mh = (lvl.h + pad * 2) * PX;
    let a = new Float32Array(mw * mh);
    for (const c of land) {
      for (let yy = 1; yy < PX - 1; yy++) for (let xx = 1; xx < PX - 1; xx++) {
        a[((c.y + pad) * PX + yy) * mw + (c.x + pad) * PX + xx] = 1;
      }
    }
    const blur = (src, r) => {
      const tmp = new Float32Array(src.length);
      const out = new Float32Array(src.length);
      for (let y = 0; y < mh; y++) {
        let acc = 0;
        for (let x = -r; x < mw + r; x++) {
          if (x + r < mw) acc += src[y * mw + x + r];
          if (x - r - 1 >= 0) acc -= src[y * mw + x - r - 1];
          if (x >= 0 && x < mw) tmp[y * mw + x] = acc / (2 * r + 1);
        }
      }
      for (let x = 0; x < mw; x++) {
        let acc = 0;
        for (let y = -r; y < mh + r; y++) {
          if (y + r < mh) acc += tmp[(y + r) * mw + x];
          if (y - r - 1 >= 0) acc -= tmp[(y - r - 1) * mw + x];
          if (y >= 0 && y < mh) out[y * mw + x] = acc / (2 * r + 1);
        }
      }
      return out;
    };
    a = blur(blur(blur(a, 7), 7), 5);
    const bytes = new Uint8Array(mw * mh);
    for (let i = 0; i < a.length; i++) bytes[i] = Math.min(255, Math.round(Math.min(1, a[i] * 1.6) * 255));
    const minX = -lvl.w / 2 - pad;
    const minZ = -lvl.h / 2 - pad;
    this.stage.setIslandMask(bytes, mw, mh, [minX, minZ, lvl.w + pad * 2, lvl.h + pad * 2]);
  }

  _tuft(p, c) {
    const g = new THREE.Group();
    const n = 3 + Math.floor(seeded(c.x, c.y, 11) * 4);
    for (let i = 0; i < n; i++) {
      const h = 0.14 + seeded(c.x, c.y, 20 + i) * 0.16;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, h, 4), this.kit.grass);
      blade.userData.ownGeo = true;
      const ang = seeded(c.x, c.y, 30 + i) * Math.PI * 2;
      const rr = seeded(c.x, c.y, 40 + i) * 0.12;
      blade.position.set(Math.cos(ang) * rr, h / 2, Math.sin(ang) * rr);
      blade.rotation.set((seeded(c.x, c.y, 50 + i) - 0.5) * 0.6, 0, (seeded(c.x, c.y, 60 + i) - 0.5) * 0.6);
      g.add(blade);
    }
    g.position.set(p.x + (seeded(c.x, c.y, 12) - 0.5) * 0.5, 0, p.z + (seeded(c.x, c.y, 13) - 0.5) * 0.5);
    g.userData.sway = seeded(c.x, c.y, 14) * 6;
    this.root.add(shadowed(g));
  }

  _pebbles(p, c) {
    for (let i = 0; i < 3; i++) {
      const s = 0.04 + seeded(c.x, c.y, 70 + i) * 0.05;
      const peb = new THREE.Mesh(new THREE.SphereGeometry(s, 7, 5), this.kit.stone);
      peb.userData.ownGeo = true;
      peb.scale.y = 0.6;
      peb.position.set(p.x + (seeded(c.x, c.y, 80 + i) - 0.5) * 0.6, s * 0.4, p.z + (seeded(c.x, c.y, 90 + i) - 0.5) * 0.6);
      this.root.add(shadowed(peb));
    }
  }

  _shell(p, c) {
    const shell = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), this.kit.shell);
    shell.userData.ownGeo = true;
    shell.rotation.set(HALF_PI, 0, seeded(c.x, c.y, 15) * 6);
    shell.position.set(p.x + (seeded(c.x, c.y, 16) - 0.5) * 0.5, 0.03, p.z + (seeded(c.x, c.y, 17) - 0.5) * 0.5);
    this.root.add(shadowed(shell));
  }

  // ---------- pieces ----------
  _buildPieces() {
    const { lvl } = this;
    this.pieces = [];
    this.boatObjs = [];
    for (const c of lvl.cells) {
      const p = this.world(c.x, c.y);
      if (c.kind === 'mirror' || c.kind === 'splitter') this._mirror(c, p);
      else if (c.kind === 'rock') this._rock(c, p);
      else if (c.kind === 'boat') this._boat(c, p);
      else if (c.kind === 'home') this._lighthouse(c, p);
      else if (c.kind === 'source') this._shrine(c, p);
    }
  }

  _mirror(c, p) {
    const { kit } = this;
    const g = new THREE.Group();
    g.position.copy(p);
    const locked = c.locked;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.4, 0.14, 28), locked ? kit.darkStone : kit.stone);
    ped.userData.ownGeo = true;
    ped.position.y = 0.07;
    g.add(ped);

    let ring = null;
    if (!locked) {
      ring = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.46, 56),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.0, 1.3), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      ring.userData.ownGeo = true;
      ring.userData.ownMat = true;
      ring.rotation.x = -HALF_PI;
      ring.position.y = 0.012;
      g.add(ring);
      // tick marks on the pedestal show it can turn
      for (let i = 0; i < 4; i++) {
        const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.1), kit.rune);
        tick.userData.ownGeo = true;
        const a = i * HALF_PI;
        tick.position.set(Math.cos(a) * 0.36, 0.145, Math.sin(a) * 0.36);
        tick.rotation.y = -a;
        g.add(tick);
      }
    }

    const spin = new THREE.Group();
    spin.position.y = 0.14;
    g.add(spin);
    const metal = locked ? kit.iron : kit.brass;
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.05, 28), metal);
    table.userData.ownGeo = true;
    table.position.y = 0.025;
    spin.add(table);
    const panelH = 0.5;
    const panelY = BEAM_Y - 0.14;
    const isSplit = c.kind === 'splitter';
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, panelH, isSplit ? 0.05 : 0.035),
      isSplit ? kit.crystal : locked ? kit.oldMirror : kit.mirror,
    );
    panel.userData.ownGeo = true;
    panel.position.y = panelY;
    spin.add(panel);
    if (!isSplit) {
      // soft sheen line so the reflective face reads from above
      const sheen = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.012, 0.045),
        new THREE.MeshBasicMaterial({ color: locked ? new THREE.Color(0.7, 0.68, 0.75) : new THREE.Color(1.3, 1.6, 2.0) }),
      );
      sheen.userData.ownGeo = true;
      sheen.userData.ownMat = true;
      sheen.position.y = panelY + panelH / 2 - 0.035;
      spin.add(sheen);
    }
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, panelH + 0.12, 10), metal);
      post.userData.ownGeo = true;
      post.position.set(sx * 0.4, panelY, 0);
      spin.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), metal);
      cap.userData.ownGeo = true;
      cap.position.set(sx * 0.4, panelY + panelH / 2 + 0.07, 0);
      spin.add(cap);
    }
    for (const sy of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.035, 0.06), metal);
      bar.userData.ownGeo = true;
      bar.position.set(0, panelY + sy * (panelH / 2 + 0.01), 0);
      spin.add(bar);
    }
    if (isSplit) {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), kit.crystal);
      gem.userData.ownGeo = true;
      gem.position.y = panelY + panelH / 2 + 0.14;
      spin.add(gem);
      const gl = glowSprite(kit, new THREE.Color(0.4, 0.9, 1.2), 0.5, 0.6);
      gl.position.copy(gem.position);
      spin.add(gl);
    }
    shadowed(g);
    if (ring) ring.castShadow = false;
    this.root.add(g);
    const angle = angleOfType(c.type);
    spin.rotation.y = angle;
    const piece = {
      cell: c, id: c.piece, group: g, spin, ring, locked,
      angle, target: angle, vel: 0, dragging: false, pulse: 0, hint: 0,
    };
    this.pieces.push(piece);
  }

  _rock(c, p) {
    const g = new THREE.Group();
    g.position.copy(p);
    const big = new THREE.DodecahedronGeometry(0.36, 0);
    const pos = big.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.85 + seeded(c.x + i, c.y, 3) * 0.3;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
    }
    big.computeVertexNormals();
    const m = new THREE.Mesh(big, this.kit.rock);
    m.userData.ownGeo = true;
    m.position.y = 0.26;
    m.scale.set(1, 1.15, 1);
    m.rotation.set(seeded(c.x, c.y, 1), seeded(c.x, c.y, 2) * 6, 0);
    g.add(m);
    const small = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), this.kit.rock);
    small.userData.ownGeo = true;
    small.position.set(0.28, 0.1, 0.18);
    small.rotation.set(1, 2, 3);
    g.add(small);
    this.root.add(shadowed(g));
  }

  _boat(c, p) {
    const { kit } = this;
    const g = new THREE.Group();
    g.position.set(p.x, WATER_Y, p.z);
    const hullGeo = new THREE.BoxGeometry(0.7, 0.2, 0.32, 6, 2, 2);
    const pos = hullGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      const t = Math.abs(x) / 0.35;
      z *= 1 - Math.pow(t, 2.2) * 0.85;
      if (y < 0) z *= 0.45;
      y += Math.pow(t, 2) * 0.06;
      pos.setXYZ(i, x, y, z);
    }
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, kit.wood);
    hull.userData.ownGeo = true;
    hull.position.y = 0.06;
    g.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.27), kit.hullRed);
    stripe.userData.ownGeo = true;
    stripe.position.y = 0.15;
    g.add(stripe);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.85, 6), kit.wood);
    mast.userData.ownGeo = true;
    mast.position.set(-0.02, 0.55, 0);
    g.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.22, 0, 0, 0.92, 0, 0.3, 0.26, 0], 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, kit.sail);
    sail.userData.ownGeo = true;
    sail.position.x = 0.0;
    g.add(sail);
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x332a20, emissive: 0xffa040, emissiveIntensity: 0 });
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), lanternMat);
    lantern.userData.ownGeo = true;
    lantern.userData.ownMat = true;
    lantern.position.set(-0.22, 0.32, 0);
    g.add(lantern);
    const halo = glowSprite(kit, new THREE.Color(1.6, 0.9, 0.35), 0.9, 0);
    halo.position.copy(lantern.position);
    g.add(halo);
    g.rotation.y = (seeded(c.x, c.y, 4) - 0.5) * 1.2 + (seeded(c.x, c.y, 5) > 0.5 ? Math.PI : 0);
    g.scale.setScalar(1.25);
    shadowed(g);
    this.root.add(g);
    this.boatObjs[c.boat] = { group: g, lanternMat, halo, lit: 0, target: 0, phase: seeded(c.x, c.y, 6) * 6, base: g.rotation.y };
  }

  _lighthouse(c, p) {
    const { kit } = this;
    const g = new THREE.Group();
    g.position.copy(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 0.16, 24), kit.darkStone);
    base.userData.ownGeo = true;
    base.position.y = 0.08;
    g.add(base);
    const segs = 4;
    const H = 1.2;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.34 - (i / segs) * 0.1;
      const r1 = 0.34 - ((i + 1) / segs) * 0.1;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, H / segs, 28), i % 2 ? kit.red : kit.white);
      s.userData.ownGeo = true;
      s.position.y = 0.16 + (i + 0.5) * (H / segs);
      g.add(s);
    }
    const top = 0.16 + H;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.3, 0.06, 24), kit.darkStone);
    gallery.userData.ownGeo = true;
    gallery.position.y = top + 0.03;
    g.add(gallery);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.012, 6, 32), kit.iron);
    rail.userData.ownGeo = true;
    rail.rotation.x = HALF_PI;
    rail.position.y = top + 0.14;
    g.add(rail);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0xffc070, emissiveIntensity: 0.2, roughness: 0.2 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.26, 12), kit.glass);
    lamp.userData.ownGeo = true;
    lamp.position.y = top + 0.19;
    g.add(lamp);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), lampMat);
    core.userData.ownGeo = true;
    core.userData.ownMat = true;
    core.position.y = top + 0.19;
    g.add(core);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.24, 24), kit.red);
    roof.userData.ownGeo = true;
    roof.position.y = top + 0.44;
    g.add(roof);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), kit.brass);
    fin.userData.ownGeo = true;
    fin.position.y = top + 0.58;
    g.add(fin);
    // door that glows when the beam arrives
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, emissive: 0xffb050, emissiveIntensity: 0 });
    for (let k = 0; k < 4; k++) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.02), doorMat);
      door.userData.ownGeo = true;
      const a = k * HALF_PI;
      door.position.set(Math.sin(a) * 0.335, BEAM_Y - 0.05, Math.cos(a) * 0.335);
      door.rotation.y = a;
      door.rotation.x = -0.08;
      g.add(door);
    }
    shadowed(g);
    // lamp halo and sweeping beams (hidden until lit)
    const halo = glowSprite(kit, new THREE.Color(1.8, 1.2, 0.6), 1.6, 0);
    halo.position.y = top + 0.19;
    g.add(halo);
    const sweep = new THREE.Group();
    sweep.position.y = top + 0.19;
    const coneMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uOpacity; varying vec2 vUv; void main(){ float f = pow(vUv.y, 1.5) * (1.0 - smoothstep(0.0, 0.5, abs(vUv.x - 0.5))*0.0); gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * f * uOpacity, 1.0); }',
    });
    for (const dir of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 24, 1, true), coneMat);
      cone.userData.ownGeo = true;
      cone.rotation.z = dir * HALF_PI;
      cone.position.x = -dir * 3.5;
      sweep.add(cone);
    }
    sweep.children.forEach((m) => (m.frustumCulled = false));
    sweep.visible = false;
    g.add(sweep);
    const light = new THREE.PointLight(0xffc070, 0, 6, 1.6);
    light.position.y = top + 0.19;
    g.add(light);
    this.root.add(g);
    this.home = { group: g, lampMat, doorMat, halo, sweep, coneMat, light, lit: 0, glow: 0, lampY: top + 0.19 };
  }

  _shrine(c, p) {
    const { kit } = this;
    const g = new THREE.Group();
    g.position.copy(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 8), kit.stone);
    base.userData.ownGeo = true;
    base.position.y = 0.07;
    g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 6, 40), kit.rune);
    ring.userData.ownGeo = true;
    ring.rotation.x = HALF_PI;
    ring.position.y = 0.15;
    g.add(ring);
    // chevron showing which way Lumi shines
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.09);
    shape.lineTo(0.1, -0.02);
    shape.lineTo(0.06, -0.02);
    shape.lineTo(0, 0.04);
    shape.lineTo(-0.06, -0.02);
    shape.lineTo(-0.1, -0.02);
    shape.closePath();
    const chev = new THREE.Mesh(new THREE.ShapeGeometry(shape), kit.rune);
    chev.userData.ownGeo = true;
    chev.rotation.x = -HALF_PI;
    const [dx, dy] = c.dir;
    chev.rotation.z = Math.atan2(-dx, -dy) + Math.PI;
    chev.position.set(dx * 0.42, 0.015, dy * 0.42);
    g.add(chev);
    shadowed(base);
    this.root.add(g);
    this.shrine = { ring };
  }

  // ---------- Lumi ----------
  _orb() {
    const { kit } = this;
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.2, 1.5) }));
    g.add(core);
    const inner = glowSprite(kit, new THREE.Color(1.6, 1.1, 0.5), 0.75, 0.9);
    const outer = glowSprite(kit, new THREE.Color(1.0, 0.55, 0.2), 1.8, 0.45);
    g.add(inner, outer);
    // little face: two eyes that always face the camera
    const face = new THREE.Group();
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2a1a10 });
    const eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), eyeMat);
      eye.scale.set(1, 1.5, 0.6);
      eye.position.set(sx * 0.04, 0.015, 0.115);
      face.add(eye);
      eyes.push(eye);
    }
    g.add(face);
    const light = new THREE.PointLight(0xffc27a, 2.6, 4.5, 1.6);
    g.add(light);
    this.orb = { group: g, core, inner, outer, face, eyes, light, blink: 2, pos: new THREE.Vector3(), base: new THREE.Vector3(), scale: 1 };
  }

  _placeOrb() {
    const s = this.lvl.source;
    this.world(s.x, s.y, this.orb.base, BEAM_Y);
    this.orb.pos.copy(this.orb.base);
    this.orb.scale = 1;
    this.orb.group.visible = true;
    this.root.add(this.orb.group);
  }

  _sparks() {
    const N = 160;
    const geo = new THREE.BufferGeometry();
    this.sparkData = { N, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), col: new Float32Array(N), next: 0 };
    geo.setAttribute('position', new THREE.BufferAttribute(this.sparkData.pos, 3));
    geo.setAttribute('life', new THREE.BufferAttribute(this.sparkData.life, 1));
    geo.setAttribute('hue', new THREE.BufferAttribute(this.sparkData.col, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: this.kit.glow }, uScale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float life; attribute float hue; uniform float uScale; varying float vL; varying float vH;
        void main(){ vL = life; vH = hue; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uScale * 0.09 * (0.4 + 0.6 * life) / -mv.z; }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying float vL; varying float vH;
        void main(){ float a = texture2D(uMap, gl_PointCoord).r; vec3 c = mix(vec3(1.4, 0.85, 0.4), vec3(0.6, 1.2, 1.5), vH); gl_FragColor = vec4(c * a * vL, 1.0); }
      `,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.stage.scene.add(pts);
    this.sparkPoints = pts;
  }

  emit(p, n, spread = 0.5, up = 0.6, hue = 0) {
    const d = this.sparkData;
    for (let i = 0; i < n; i++) {
      const k = d.next;
      d.next = (d.next + 1) % d.N;
      d.pos[k * 3] = p.x + (Math.random() - 0.5) * 0.1;
      d.pos[k * 3 + 1] = p.y + (Math.random() - 0.5) * 0.1;
      d.pos[k * 3 + 2] = p.z + (Math.random() - 0.5) * 0.1;
      d.vel[k * 3] = (Math.random() - 0.5) * spread;
      d.vel[k * 3 + 1] = Math.random() * up;
      d.vel[k * 3 + 2] = (Math.random() - 0.5) * spread;
      d.max[k] = 0.6 + Math.random() * 0.8;
      d.life[k] = 1;
      d.col[k] = hue;
    }
  }

  _updateSparks(dt) {
    const d = this.sparkData;
    for (let k = 0; k < d.N; k++) {
      if (d.life[k] <= 0) continue;
      d.life[k] = Math.max(0, d.life[k] - dt / d.max[k]);
      d.vel[k * 3 + 1] -= dt * 0.25;
      d.pos[k * 3] += d.vel[k * 3] * dt;
      d.pos[k * 3 + 1] += d.vel[k * 3 + 1] * dt;
      d.pos[k * 3 + 2] += d.vel[k * 3 + 2] * dt;
    }
    const g = this.sparkPoints.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.life.needsUpdate = true;
    g.attributes.hue.needsUpdate = true;
    this.sparkPoints.material.uniforms.uScale.value = this.stage.projScale();
  }

  // ---------- beam ----------
  _recompute(initial = false) {
    const r = trace(this.lvl, this.types);
    const key = (s) => `${s.x1},${s.y1},${s.dir},${s.start}`;
    const old = new Map(this.segments.map((s) => [key(s), s]));
    let resetTo = Infinity;
    for (const s of r.segments) {
      const o = old.get(key(s));
      if (!o || o.len !== s.len || o.end !== s.end) resetTo = Math.min(resetTo, s.start + (o ? Math.min(o.len, s.len) : 0));
    }
    if (initial) this.reveal = 0;
    else if (resetTo < Infinity) this.reveal = Math.min(this.reveal, resetTo);
    this.segments = r.segments;
    this.result = r;

    // beams
    while (this.beams.length < r.segments.length) {
      const m = new THREE.Mesh(this.beamGeo, makeBeamMaterial());
      m.frustumCulled = false;
      m.renderOrder = 5;
      this.root.add(m);
      this.beams.push(m);
      const f = glowSprite(this.kit, new THREE.Color(1.6, 1.0, 0.5), 0.7, 0);
      this.root.add(f);
      this.flares.push(f);
    }
    this.beams.forEach((b, i) => {
      const s = r.segments[i];
      b.visible = !!s;
      this.flares[i].visible = !!s;
      if (!s) return;
      this.world(s.x1, s.y1, b.position, BEAM_Y);
      b.rotation.y = Math.atan2(-s.dir[1], s.dir[0]);
      const u = b.material.uniforms;
      u.uStart.value = s.start;
      let full = s.len;
      if (s.end === 'out') full = s.len + 1.6;
      else if (s.end === 'home') full = s.len - 0.3;
      else if (s.end === 'block') full = s.len - 0.32;
      s.full = full;
      u.uTail.value = s.end === 'out' ? 2.0 : 0;
      u.uFull.value = full;
      this.world(s.x1 + s.dir[0] * full, s.y1 + s.dir[1] * full, this.flares[i].position, BEAM_Y);
    });

    // boats
    for (let i = 0; i < this.boatObjs.length; i++) {
      const lit = r.boats.has(i);
      const b = this.boatObjs[i];
      if (lit && !this.litBoats.has(i)) b.pending = true;
      if (!lit) {
        b.pending = false;
        b.target = 0;
      }
    }
    this.litBoats = new Set(r.boats);
    this.events.onBoats?.(r.boats.size, this.lvl.boats.length);
    if (!initial) this.audio.tick(r.segments.reduce((a, s) => a + s.len, 0));
  }

  _updateBeams(dt, t) {
    this.reveal += dt * BEAM_SPEED;
    let homeReached = false;
    this.segments.forEach((s, i) => {
      const b = this.beams[i];
      const vis = THREE.MathUtils.clamp(this.reveal - s.start, 0, s.full);
      const u = b.material.uniforms;
      u.uLen.value = Math.max(vis, 0.0001);
      u.uTime.value = t;
      u.uIntensity.value = this.won ? 1.35 : 1;
      b.visible = vis > 0.001;
      const done = vis >= s.full - 0.001;
      const f = this.flares[i];
      const target = done && s.end !== 'out' ? 0.85 : 0;
      f.material.opacity += (target - f.material.opacity) * Math.min(1, dt * 10);
      f.scale.setScalar(0.55 + 0.1 * Math.sin(t * 6 + i));
      if (done && s.end === 'home') homeReached = true;
    });
    // boats light up once the beam actually reaches them
    for (let i = 0; i < this.boatObjs.length; i++) {
      const b = this.boatObjs[i];
      if (!b.pending) continue;
      const c = this.lvl.boats[i];
      const reached = this.segments.some((s) => {
        const along = (c.x - s.x1) * s.dir[0] + (c.y - s.y1) * s.dir[1];
        const perp = (c.x - s.x1) * s.dir[1] - (c.y - s.y1) * s.dir[0];
        return perp === 0 && along > 0 && along <= s.len && this.reveal - s.start >= along;
      });
      if (reached) {
        b.pending = false;
        b.target = 1;
        this.emit(b.group.position.clone().setY(BEAM_Y), 18, 1.2, 1.0, 0);
        this.audio.boat();
        this.events.onBoatLit?.();
      }
    }
    return homeReached;
  }

  // ---------- input ----------
  _bindInput() {
    const el = this.stage.canvas;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e, true));
  }

  _rayPoint(e, y) {
    const rect = this.stage.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.stage.camera);
    this.plane.constant = -y;
    return this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  _down(e) {
    if (!this.inputEnabled || this.drag || !this.lvl) return;
    this.audio.unlock();
    // test a couple of heights so tapping the top of a tall mirror still works
    let best = null;
    let bestD = 0.78;
    for (const y of [0.15, 0.45, 0.7]) {
      const p = this._rayPoint(e, y);
      if (!p) continue;
      for (const pc of this.pieces) {
        if (pc.locked) continue;
        const d = Math.hypot(p.x - pc.group.position.x, p.z - pc.group.position.z);
        if (d < bestD) { bestD = d; best = pc; }
      }
    }
    if (!best) {
      // tapped a locked mirror? give gentle feedback
      const p = this._rayPoint(e, 0.3);
      const lockedHit = p && this.pieces.find((pc) => pc.locked && Math.hypot(p.x - pc.group.position.x, p.z - pc.group.position.z) < 0.5);
      if (lockedHit) {
        lockedHit.wobble = 1;
        this.audio.locked();
      }
      return;
    }
    e.preventDefault();
    this.stage.canvas.setPointerCapture?.(e.pointerId);
    const wp = this._rayPoint(e, 0.3);
    this.drag = {
      piece: best, id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY,
      t0: performance.now(), lt: performance.now(), moved: false, startType: this.types[best.id], last: wp, angVel: 0,
    };
    best.dragging = true;
    best.target = best.angle;
    best.pulse = 1;
    this.audio.grab();
    if (this.hintPiece === best) this.hintPiece = null;
  }

  _move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const pc = d.piece;
    const now = performance.now();
    const dtm = Math.max(1, now - d.lt) / 1000;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) d.moved = true;
    if (!d.moved) return;
    const wp = this._rayPoint(e, 0.3);
    let delta = 0;
    if (wp && d.last) {
      const cx = pc.group.position.x;
      const cz = pc.group.position.z;
      const r0 = Math.hypot(d.last.x - cx, d.last.z - cz);
      const r1 = Math.hypot(wp.x - cx, wp.z - cz);
      if (r0 > 0.42 && r1 > 0.42) {
        const a0 = Math.atan2(-(d.last.z - cz), d.last.x - cx);
        const a1 = Math.atan2(-(wp.z - cz), wp.x - cx);
        delta = wrapPi(a1 - a0);
      } else {
        // finger is near the pivot: treat it as a horizontal swipe
        delta = -(e.clientX - d.lx) * 0.016;
      }
    }
    pc.target += delta;
    d.angVel = d.angVel * 0.6 + (delta / dtm) * 0.4;
    d.last = wp;
    d.lx = e.clientX;
    d.ly = e.clientY;
    d.lt = now;
    this._setType(pc, typeOfAngle(pc.target));
  }

  _up(e, cancel = false) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const pc = d.piece;
    this.drag = null;
    pc.dragging = false;
    const quick = performance.now() - d.t0 < 400;
    if (!d.moved && quick && !cancel) {
      // tap: quarter turn clockwise
      pc.target = snapAngle(pc.target) - HALF_PI;
      pc.vel -= 2.5;
    } else {
      // flick: carry momentum into the snap
      const fling = THREE.MathUtils.clamp(d.angVel * 0.09, -HALF_PI, HALF_PI);
      pc.target = snapAngle(pc.target + fling);
      pc.vel = d.angVel * 0.5;
    }
    this._setType(pc, typeOfAngle(pc.target));
    this.audio.release();
    if (this.types[pc.id] !== d.startType) {
      this.moves++;
      this.events.onMoves?.(this.moves, this.solution.par);
      this.events.onMove?.();
    }
    this._checkWin();
  }

  _setType(pc, t) {
    if (this.types[pc.id] === t) return;
    this.types[pc.id] = t;
    pc.pulse = 1;
    if (navigator.vibrate) try { navigator.vibrate(8); } catch { /* ignore */ }
    this._recompute();
  }

  _checkWin() {
    if (this.won || this.drag) return;
    if (this.result.home) {
      this.won = true;
      this.inputEnabled = false;
      this.winTimer = 0;
    }
  }

  // ---------- public helpers ----------
  showHint() {
    if (!this.solution.best || this.won) return false;
    const wrong = this.pieces.filter((p) => !p.locked && this.types[p.id] !== this.solution.best[p.id]);
    if (!wrong.length) return false;
    this.hintPiece = wrong[0];
    this.hintPiece.hint = 3.5;
    return true;
  }

  pointAtFirstMirror() {
    const p = this.pieces.find((q) => !q.locked);
    if (p) {
      this.hintPiece = p;
      p.hint = 6;
    }
  }

  stars() {
    const boats = this.result.boats.size === this.lvl.boats.length;
    let s = 1;
    if (boats) s++;
    if (boats && this.moves <= this.solution.par) s++;
    return s;
  }

  // ---------- frame update ----------
  update(dt, t) {
    if (!this.lvl) return;
    // pieces: springy rotation
    for (const pc of this.pieces) {
      if (pc.dragging) {
        const prev = pc.angle;
        pc.angle += (pc.target - pc.angle) * (1 - Math.exp(-dt * 28));
        pc.vel = (pc.angle - prev) / Math.max(dt, 1e-4);
      } else {
        const k = 240;
        const c = 2 * Math.sqrt(k) * 0.62;
        const acc = k * (pc.target - pc.angle) - c * pc.vel;
        pc.vel += acc * dt;
        pc.angle += pc.vel * dt;
        if (Math.abs(pc.target - pc.angle) < 1e-4 && Math.abs(pc.vel) < 1e-3) {
          pc.angle = pc.target;
          pc.vel = 0;
        }
      }
      pc.spin.rotation.y = pc.angle;
      pc.pulse = Math.max(0, pc.pulse - dt * 2.5);
      pc.hint = Math.max(0, pc.hint - dt);
      if (pc.wobble) {
        pc.wobble = Math.max(0, pc.wobble - dt * 3);
        pc.spin.rotation.y = pc.angle + Math.sin(t * 50) * 0.05 * pc.wobble;
      }
      if (pc.ring) {
        const hint = pc.hint > 0 ? 0.5 + 0.5 * Math.sin(t * 7) : 0;
        pc.ring.material.opacity = 0.28 + 0.12 * Math.sin(t * 2 + pc.id) + pc.pulse * 0.6 + hint * 0.9 + (pc.dragging ? 0.4 : 0);
        const s = 1 + pc.pulse * 0.12 + hint * 0.1;
        pc.ring.scale.setScalar(s);
        pc.ring.material.color.setRGB(0.35 + hint * 1.4, 1.0 + hint * 0.3, 1.3 - hint * 0.8);
      }
      const lift = pc.dragging ? 0.05 : 0;
      pc.spin.position.y += (0.14 + lift - pc.spin.position.y) * Math.min(1, dt * 12);
    }

    // grass sway
    for (const ch of this.root.children) {
      if (ch.userData.sway !== undefined) ch.rotation.z = Math.sin(t * 1.3 + ch.userData.sway) * 0.06;
    }

    const homeReached = this._updateBeams(dt, t);

    // boats bob + lanterns
    this.boatObjs.forEach((b, i) => {
      b.lit += (b.target - b.lit) * Math.min(1, dt * 4);
      const g = b.group;
      g.position.y = WATER_Y + Math.sin(t * 1.6 + b.phase) * 0.03;
      g.rotation.z = Math.sin(t * 1.2 + b.phase) * 0.06;
      g.rotation.x = Math.sin(t * 1.0 + b.phase * 2) * 0.04;
      b.lanternMat.emissiveIntensity = b.lit * 6;
      b.halo.material.opacity = b.lit * 0.9;
      b.halo.scale.setScalar(0.8 + 0.1 * Math.sin(t * 5 + i));
    });

    // lighthouse
    const h = this.home;
    h.glow += ((homeReached ? 1 : 0) - h.glow) * Math.min(1, dt * 5);
    h.doorMat.emissiveIntensity = h.glow * 3;
    h.lampMat.emissiveIntensity = 0.2 + h.lit * 9;
    h.halo.material.opacity = h.lit * 0.95;
    h.halo.scale.setScalar(1.4 + h.lit * 0.6 + Math.sin(t * 3) * 0.08 * h.lit);
    h.light.intensity = h.lit * 5;
    h.sweep.visible = h.lit > 0.02;
    h.sweep.rotation.y = t * 0.9;
    h.coneMat.uniforms.uOpacity.value = h.lit * 0.22;

    // shrine
    if (this.shrine) this.shrine.ring.rotation.z = t * 0.6;

    // Lumi
    const o = this.orb;
    if (!this.journey) {
      o.pos.lerp(o.base, Math.min(1, dt * 6));
      o.group.position.copy(o.pos);
      o.group.position.y += Math.sin(t * 2.2) * 0.04;
    }
    if (this.won) this._updateWin(dt, t, homeReached);
    o.group.scale.setScalar(o.scale * (1 + Math.sin(t * 4) * 0.04));
    o.light.intensity = 2.6 * o.scale + 0.5;
    o.outer.material.opacity = 0.4 + 0.08 * Math.sin(t * 3);
    // face looks at camera, blinks
    o.face.lookAt(this.stage.camera.position);
    o.blink -= dt;
    let eyeY = 1.5;
    if (o.blink < 0.12) eyeY = 0.2;
    if (o.blink < 0) o.blink = 2 + Math.random() * 3;
    if (this.won) eyeY = 0.5; // happy squint
    o.eyes.forEach((e) => (e.scale.y = eyeY));
    if (Math.random() < dt * 6) this.emit(o.group.position, 1, 0.15, 0.25, 0);
    const wp = o.group.position;
    this.stage.waterUniforms.uOrb.value.set(wp.x, wp.y, wp.z, o.scale * 0.55);

    this._updateSparks(dt);
  }

  _updateWin(dt, t, homeReached) {
    const o = this.orb;
    this.winTimer += dt;
    if (!this.journey) {
      if (!homeReached || this.winTimer < 0.35) return;
      // build Lumi's path home
      const segs = this.segments;
      let i = segs.findIndex((s) => s.end === 'home');
      const chain = [];
      while (i >= 0) { chain.unshift(segs[i]); i = segs[i].parent; }
      const pts = [this.world(this.lvl.source.x, this.lvl.source.y, new THREE.Vector3(), BEAM_Y)];
      for (const s of chain) pts.push(this.world(s.x1 + s.dir[0] * s.full, s.y1 + s.dir[1] * s.full, new THREE.Vector3(), BEAM_Y));
      const lens = [];
      let total = 0;
      for (let k = 1; k < pts.length; k++) { const l = pts[k].distanceTo(pts[k - 1]); lens.push(l); total += l; }
      this.journey = { pts, lens, total, d: 0, phase: 'travel', t: 0 };
      this.audio.depart();
      this.events.onJourney?.();
    }
    const j = this.journey;
    j.t += dt;
    if (j.phase === 'travel') {
      const speed = ORB_SPEED * Math.min(1, 0.3 + j.t * 1.5);
      j.d = Math.min(j.total, j.d + speed * dt);
      let d = j.d;
      let k = 0;
      while (k < j.lens.length - 1 && d > j.lens[k]) { d -= j.lens[k]; k++; }
      const a = j.pts[k];
      const b = j.pts[k + 1];
      o.group.position.lerpVectors(a, b, Math.min(1, d / j.lens[k]));
      o.group.position.y += Math.sin(j.t * 9) * 0.03;
      if (Math.random() < dt * 40) this.emit(o.group.position, 1, 0.2, 0.3, 0);
      if (j.d >= j.total) { j.phase = 'rise'; j.t = 0; j.from = o.group.position.clone(); }
    } else if (j.phase === 'rise') {
      const p = Math.min(1, j.t / 1.0);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const hp = this.home.group.position;
      const to = new THREE.Vector3(hp.x, this.home.lampY, hp.z);
      o.group.position.lerpVectors(j.from, to, e);
      o.group.position.x += Math.sin(p * Math.PI) * 0.25;
      o.scale = 1 - e * 0.6;
      if (p >= 1) {
        j.phase = 'lit';
        j.t = 0;
        this.emit(to, 50, 2.2, 1.6, 0);
        this.audio.win();
        if (navigator.vibrate) try { navigator.vibrate([20, 40, 30]); } catch { /* ignore */ }
      }
    } else if (j.phase === 'lit') {
      this.home.lit = Math.min(1, this.home.lit + dt * 1.6);
      o.scale = Math.max(0, o.scale - dt * 1.2);
      if (j.t > 1.4 && !j.reported) {
        j.reported = true;
        this.events.onWin?.({ stars: this.stars(), moves: this.moves, par: this.solution.par, boats: this.result.boats.size, totalBoats: this.lvl.boats.length });
      }
    }
  }
}
