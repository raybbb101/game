// 3D AR encounter scene.
//  • Camera mode (all phones): live rear-camera video with a transparent WebGL scene on top. The 3D camera
//    follows the phone's orientation sensors, so creatures stay put in the room while you look around.
//  • AR+ (WebXR, e.g. Android Chrome): real floor detection — tap to place the creature on the ground.
//  • No camera: a 3D meadow (day or night) is rendered behind the creature instead.
import * as THREE from '../vendor/three/three.module.js';
import { SPECIES_BY_ID, ELEMENTS } from './data.js';
import { buildMonster, buildFairy, Actor, disposeModel, glowTexture } from './model3d.js';
import { addStudioLights, makeEnvironment } from './portraits.js';
import { monsterSVG, fairySVG } from './art.js';
import { $ } from './ui.js';

const EYE_HEIGHT = 1.35; // phone held at chest height, meters

const S = {
  ok: null, renderer: null, scene: null, camera: null, clock: new THREE.Clock(),
  stage: null, foe: null, buddy: null, backdrop: null, shadowGround: null, lights: null,
  stream: null, running: false, sensorQ: null, hasSensor: false, anchored: false,
  dist: 1.8, foeHover: 0, onPet: null, spin: 0, spinVel: 0,
  fx: [], xr: null, reticle: null, hitSource: null, placed: true,
};

// ---------- Setup ----------

function init() {
  if (S.ok !== null) return S.ok;
  try {
    const canvas = $('#ar-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.environment = makeEnvironment(renderer);
    scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
    camera.position.set(0, EYE_HEIGHT, 0);
    const lights = addStudioLights(scene);
    lights.key.castShadow = true;
    lights.key.shadow.mapSize.set(1024, 1024);
    lights.key.shadow.radius = 6;
    lights.key.shadow.bias = -0.0008;
    const sc = lights.key.shadow.camera;
    sc.left = -2; sc.right = 2; sc.top = 2; sc.bottom = -2; sc.near = 0.1; sc.far = 15;
    const stage = new THREE.Group();
    scene.add(stage);
    // soft shadow catcher on the real floor
    const shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShadowMaterial({ opacity: 0.28 }));
    shadowGround.rotation.x = -Math.PI / 2;
    shadowGround.receiveShadow = true;
    stage.add(shadowGround);
    lights.key.target = stage;
    Object.assign(S, { renderer, scene, camera, stage, shadowGround, lights });
    S.backdrop = makeBackdrop();
    scene.add(S.backdrop);
    bindTouch(canvas);
    window.addEventListener('resize', resize);
    resize();
    S.ok = true;
  } catch (e) {
    console.warn('3D AR unavailable, using flat art', e);
    S.ok = false;
  }
  return S.ok;
}

function resize() {
  if (!S.renderer || S.xr) return;
  const w = window.innerWidth, h = window.innerHeight;
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h;
  // match the phone camera: ~63° across the long side of the image
  const longFov = 63;
  S.camera.fov = cameraOn()
    ? (h >= w ? longFov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(longFov / 2)) * (h / w))))
    : (h >= w ? 58 : 40);
  S.camera.updateProjectionMatrix();
}

// ---------- 3D meadow backdrop (used when the camera is off) ----------

function makeBackdrop() {
  const g = new THREE.Group();
  const night = isNight();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(night ? '#0b0a2a' : '#5fb4ff') },
      mid: { value: new THREE.Color(night ? '#2b2468' : '#bfe6ff') },
      bot: { value: new THREE.Color(night ? '#3a3a6a' : '#f2fbff') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : bot; gl_FragColor = vec4(c, 1.0); }',
  }));
  g.add(sky);
  // ground with gentle color variation
  const gg = new THREE.CircleGeometry(60, 96);
  const cols = [];
  const c1 = new THREE.Color(night ? '#25453a' : '#7dc95e'), c2 = new THREE.Color(night ? '#1c3530' : '#5fae4a');
  const p = gg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const n = 0.5 + 0.5 * Math.sin(p.getX(i) * 0.7) * Math.sin(p.getY(i) * 0.9);
    const c = c1.clone().lerp(c2, n);
    cols.push(c.r, c.g, c.b);
  }
  gg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  ground.receiveShadow = true;
  g.add(ground);
  // grass tufts, flowers, rocks, trees
  const rnd = mulberry(7);
  const tuft = new THREE.ConeGeometry(0.035, 0.22, 5);
  const grass = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: night ? '#2f5a45' : '#4fa63f', roughness: 0.9 }), 1400);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < grass.count; i++) {
    const r = 1.3 + Math.pow(rnd(), 0.7) * 14, a = rnd() * Math.PI * 2;
    q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.5, rnd() * 3, (rnd() - 0.5) * 0.5));
    const s = 0.6 + rnd() * 0.9;
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0.1 * s, Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
    grass.setMatrixAt(i, m);
  }
  g.add(grass);
  const flowerCols = ['#ff7aa8', '#ffd23f', '#ffffff', '#b48cff', '#ff8a5a'];
  const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: night ? '#332244' : '#000000' }), 260);
  for (let i = 0; i < flowers.count; i++) {
    const r = 1.4 + rnd() * 12, a = rnd() * Math.PI * 2;
    m.compose(new THREE.Vector3(Math.cos(a) * r, 0.12 + rnd() * 0.06, Math.sin(a) * r), q.identity(), new THREE.Vector3(1, 0.7, 1));
    flowers.setMatrixAt(i, m);
    flowers.setColorAt(i, new THREE.Color(flowerCols[i % flowerCols.length]));
  }
  g.add(flowers);
  const rockM = new THREE.MeshStandardMaterial({ color: '#9a958d', roughness: 0.9 });
  for (let i = 0; i < 14; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15 + rnd() * 0.3, 1), rockM);
    const r = 3 + rnd() * 10, a = rnd() * Math.PI * 2;
    rock.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
    rock.scale.y = 0.6;
    rock.castShadow = true;
    g.add(rock);
  }
  const trunkM = new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 0.9 });
  const leafM = new THREE.MeshStandardMaterial({ color: night ? '#24503a' : '#3f9a48', roughness: 0.8 });
  for (let i = 0; i < 22; i++) {
    const tree = new THREE.Group();
    const h = 1.5 + rnd() * 2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, h, 8), trunkM);
    trunk.position.y = h / 2;
    tree.add(trunk);
    for (let k = 0; k < 3; k++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + rnd() * 0.5, 1), leafM);
      leaf.position.set((rnd() - 0.5) * 0.8, h + k * 0.4, (rnd() - 0.5) * 0.8);
      tree.add(leaf);
    }
    const r = 9 + rnd() * 18, a = rnd() * Math.PI * 2;
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(tree);
  }
  if (night) {
    const stars = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 600; i++) {
      const a = rnd() * Math.PI * 2, el = 0.15 + rnd() * 1.3;
      sp.push(Math.cos(a) * Math.cos(el) * 70, Math.sin(el) * 70, Math.sin(a) * Math.cos(el) * 70);
    }
    stars.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    g.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, sizeAttenuation: true })));
    const flies = new THREE.Group();
    const fm = new THREE.SpriteMaterial({ map: glowTexture('soft'), color: '#fff3a0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 40; i++) {
      const f = new THREE.Sprite(fm);
      f.scale.setScalar(0.12);
      f.userData = { a: rnd() * 6, r: 1 + rnd() * 6, y: 0.3 + rnd() * 1.5, s: 0.2 + rnd() * 0.4 };
      flies.add(f);
    }
    flies.userData.fireflies = true;
    g.add(flies);
    g.userData.flies = flies;
  }
  g.traverse((o) => { if (o.isMesh && o !== sky) o.receiveShadow = true; });
  return g;
}

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isNight = () => {
  const h = new Date().getHours();
  return h >= 19 || h < 6;
};

// ---------- Orientation sensors ----------

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // camera looks out the back of the device

function onOrientation(e) {
  if (e.alpha == null || e.beta == null) return;
  const d = Math.PI / 180;
  const orient = (screen.orientation?.angle ?? window.orientation ?? 0) * d;
  euler.set(e.beta * d, e.alpha * d, -(e.gamma || 0) * d, 'YXZ');
  const q = (S.sensorQ ||= new THREE.Quaternion());
  q.setFromEuler(euler);
  q.multiply(q1);
  q.multiply(q0.setFromAxisAngle(zee, -orient));
  if (!S.hasSensor) {
    S.hasSensor = true;
    S.camera.quaternion.copy(q);
    S.anchored = false; // re-place the creature where the phone is now pointing
  }
}

export function requestSensors() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {});
}

// ---------- Camera video ----------

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
  });
  const v = $('#cam');
  v.srcObject = stream;
  await v.play().catch(() => {});
  return stream;
}

export const cameraOn = () => !!S.stream || !!S.xr;

// Turn the camera feed on/off without touching the creatures.
export async function setCamera(on) {
  if (S.xr) return;
  if (on && !S.stream) {
    try {
      S.stream = await startCamera();
    } catch (e) {
      console.warn('camera unavailable', e);
    }
  } else if (!on && S.stream) {
    S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
    $('#cam').srcObject = null;
  }
  $('#encounter').classList.toggle('camera-on', !!S.stream);
  if (S.ok) {
    S.backdrop.visible = !S.stream;
    S.shadowGround.material.opacity = S.stream ? 0.32 : 0.22;
    resize();
  }
  return !!S.stream;
}
export const is3D = () => init();

export async function startAR(useCamera) {
  S.running = true;
  S.anchored = false;
  S.hasSensor = false;
  S.sensorQ = null;
  window.addEventListener('deviceorientation', onOrientation);
  const scene = $('#encounter');
  scene.classList.toggle('night', isNight());
  scene.classList.remove('camera-on');
  scene.classList.toggle('flat', !init());
  if (useCamera && !S.stream) {
    try {
      S.stream = await startCamera();
    } catch (e) {
      console.warn('camera unavailable', e);
      S.stream = null;
    }
  }
  if (!S.running) return stopAR();
  scene.classList.toggle('camera-on', !!S.stream);
  if (S.ok) {
    S.backdrop.visible = !S.stream;
    S.shadowGround.material.opacity = S.stream ? 0.32 : 0.22;
    resize();
    S.clock.getDelta();
    S.renderer.setAnimationLoop(frame);
  }
}

export function stopAR() {
  S.running = false;
  window.removeEventListener('deviceorientation', onOrientation);
  if (S.xr) S.xr.end().catch(() => {});
  if (S.stream) {
    S.stream.getTracks().forEach((t) => t.stop());
    S.stream = null;
  }
  const v = $('#cam');
  if (v) v.srcObject = null;
  if (S.ok) {
    S.renderer.setAnimationLoop(null);
    clearActors();
  }
}

// ---------- Actors ----------

function clearActors() {
  for (const k of ['foe', 'buddy']) {
    if (S[k]) {
      S.stage.remove(S[k].holder);
      disposeModel(S[k].actor.model);
      S[k] = null;
    }
  }
  for (const p of S.fx) S.scene.remove(p.obj);
  S.fx = [];
}

function blobShadow(size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture('shadow'), transparent: true, depthWrite: false, opacity: 0.8 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  m.scale.setScalar(size);
  return m;
}

function place(kind, model, size, { hover = 0 } = {}) {
  const holder = new THREE.Group();
  const actor = new Actor(model);
  model.root.scale.setScalar(size);
  model.root.position.y = hover;
  model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  holder.add(model.root);
  const shadow = blobShadow(Math.max(model.width, model.depth) * size * 0.9);
  holder.add(shadow);
  S.stage.add(holder);
  S[kind] = { holder, actor, size, hover, shadow, spin: 0 };
  return S[kind];
}

function fallbackArt(html, cls) {
  const el = $('#ar-actor');
  el.className = `actor ${cls} enter`;
  el.innerHTML = html;
}

export function showMonster(speciesId) {
  const sp = SPECIES_BY_ID[speciesId];
  if (!init()) return fallbackArt(monsterSVG(speciesId, { size: 260 }), `monster ${sp.rarity}`);
  clearActors();
  $('#ar-actor').innerHTML = '';
  const size = sp.look.size;
  S.dist = 1.15 + size * 1.25;
  const f = place('foe', buildMonster(speciesId), size);
  f.actor.play('enter');
  burst(f, ELEMENTS[sp.element].color, 26, 'star');
  S.foeHover = 0;
}

export function showFairy(kind) {
  if (!init()) return fallbackArt(fairySVG(kind, 200), `fairy ${kind}`);
  clearActors();
  $('#ar-actor').innerHTML = '';
  S.dist = 1.6;
  const f = place('foe', buildFairy(kind), 0.45, { hover: 0.55 });
  f.fairy = true;
  f.actor.play('enter');
  burst(f, '#ffffff', 30, 'star');
  S.foeHover = 0.55;
}

export function showBuddy(speciesId) {
  if (!S.ok) return;
  if (S.buddy) {
    S.stage.remove(S.buddy.holder);
    disposeModel(S.buddy.actor.model);
    S.buddy = null;
  }
  const size = SPECIES_BY_ID[speciesId].look.size;
  const b = place('buddy', buildMonster(speciesId), Math.min(size, 0.8) * 0.75);
  b.holder.position.set(-0.34 - size * 0.1, 0, 0.12);
  b.holder.rotation.y = Math.PI - 0.4;
  b.actor.play('enter');
  burst(b, '#ffffff', 18, 'star');
  if (S.foe) {
    S.foe.holder.position.z = -0.55;
    S.foe.holder.position.x = 0.12;
    S.foe.holder.rotation.y = -0.25;
  }
}

export function hideBuddy() {
  if (!S.buddy) return;
  S.stage.remove(S.buddy.holder);
  disposeModel(S.buddy.actor.model);
  S.buddy = null;
  if (S.foe) {
    S.foe.holder.rotation.y = 0;
    S.foe.holder.position.set(0, 0, 0);
  }
}

const who = (w) => (w === 'you' || w === 'buddy' ? S.buddy : S.foe);

// Play an animation on the wild creature ('foe') or your buddy ('you'). Returns when done.
export function act(name, w = 'foe') {
  const t = who(w);
  if (!t) {
    const el = $('#ar-actor');
    if (el && w === 'foe') {
      el.classList.remove('hop', 'shake', 'sad', 'love', 'enter', 'flyaway');
      void el.offsetWidth;
      el.classList.add({ attack: 'hop', hit: 'shake', faint: 'sad', spin: 'hop', wave: 'hop' }[name] || name);
    }
    return Promise.resolve();
  }
  if (name === 'love') hearts(t);
  return t.actor.play(name);
}

export function setPetHandler(fn) {
  S.onPet = fn;
}

// ---------- Particles & attack effects ----------

function sprite(color, kind = 'soft', size = 0.1, additive = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(kind), color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  s.scale.setScalar(size);
  return s;
}

function chest(t) {
  const h = t.size * (t.actor.model.top || 1);
  return t.holder.localToWorld(new THREE.Vector3(0, t.hover + h * 0.5, 0));
}

function addParticle(obj, vel, life, { gravity = 0, grow = 0, fade = true } = {}) {
  S.scene.add(obj);
  S.fx.push({ obj, vel, life, max: life, gravity, grow, fade, base: obj.scale.x });
}

function burst(t, color, n = 24, kind = 'soft') {
  if (!S.ok || !t) return;
  const c = chest(t);
  for (let i = 0; i < n; i++) {
    const s = sprite(color, kind, 0.05 + Math.random() * 0.08);
    s.position.copy(c);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(0.6 + Math.random() * 1.2);
    addParticle(s, v, 0.6 + Math.random() * 0.5, { gravity: -1.2 });
  }
}

function hearts(t) {
  if (!S.ok) return;
  const c = chest(t);
  for (let i = 0; i < 6; i++) {
    const s = sprite('#ffffff', 'heart', 0.12 + Math.random() * 0.06, false);
    s.position.copy(c).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, t.size * 0.4, (Math.random() - 0.5) * 0.2));
    addParticle(s, new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, 0), 1.4 + Math.random() * 0.4);
  }
}

// Attacker lunges, a glowing shot flies to the target, it bursts and the target flinches.
export async function attack(from, element, { hit = true, crit = false } = {}) {
  const a = who(from);
  const b = who(from === 'foe' ? 'you' : 'foe');
  if (!S.ok || !a || !b) return act('hit', from === 'foe' ? 'you' : 'foe');
  const color = element ? ELEMENTS[element].color : '#ffffff';
  a.actor.play('attack');
  await wait(180);
  const p0 = chest(a), p1 = chest(b);
  const ball = sprite(color, element === 'spark' || element === 'dream' ? 'star' : 'soft', crit ? 0.4 : 0.28);
  S.scene.add(ball);
  const dur = 0.42;
  const t0 = performance.now();
  await new Promise((res) => {
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 1000 / dur);
      ball.position.lerpVectors(p0, p1, p);
      ball.position.y += Math.sin(Math.PI * p) * 0.25;
      ball.material.rotation += 0.3;
      if (Math.random() < 0.9) {
        const tr = sprite(color, 'soft', 0.06 + Math.random() * 0.06);
        tr.position.copy(ball.position);
        addParticle(tr, new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.2, (Math.random() - 0.5) * 0.2), 0.35);
      }
      if (p < 1) requestAnimationFrame(step);
      else res();
    };
    step();
  });
  S.scene.remove(ball);
  ball.material.dispose();
  if (hit) {
    burst(b, color, crit ? 40 : 26);
    burst(b, '#ffffff', 8, 'star');
    await b.actor.play('hit');
  } else {
    await wait(200);
  }
}

export function sparkleAt(w, color = '#ffffff') {
  burst(who(w), color, 20, 'star');
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Touch: swipe to spin, tap to pet ----------

function bindTouch(canvas) {
  let down = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || !S.foe) return;
    const dx = e.clientX - down.lx;
    down.lx = e.clientX;
    S.foe.spin += dx * 0.012;
    S.spinVel = dx * 0.012;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 350;
    down = null;
    if (moved < 10 && quick) tap(e.clientX, e.clientY);
  });
}

function tap(x, y) {
  if (S.xr && !S.placed) return;
  if (!S.foe) return;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), S.xr ? S.renderer.xr.getCamera() : S.camera);
  const hit = ray.intersectObject(S.foe.holder, true).length > 0;
  if (hit) {
    S.foe.actor.play('hop');
    hearts(S.foe);
    S.onPet?.();
  }
}

// ---------- Placement ----------

// Put the creature on the ground in front of wherever the phone is pointing.
export function anchorHere() {
  S.anchored = false;
}

function anchor() {
  const cam = S.camera;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  f.y = 0;
  if (f.lengthSq() < 0.01) f.set(0, 0, -1);
  f.normalize();
  // Stand on the real floor if it is in view; if the phone is held level (floor out of view),
  // lift the creature just enough that it sits in the lower part of the screen.
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const down = Math.max(0, -Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)));
  const half = THREE.MathUtils.degToRad(cam.fov / 2);
  const reach = down + half * 0.3;
  const groundAngle = Math.atan(EYE_HEIGHT / S.dist);
  const y = groundAngle > reach ? Math.max(0, EYE_HEIGHT - S.dist * Math.tan(reach)) : 0;
  S.stage.position.set(cam.position.x + f.x * S.dist, y, cam.position.z + f.z * S.dist);
  S.stage.lookAt(cam.position.x, y, cam.position.z);
  S.lights.key.position.copy(S.stage.position).add(new THREE.Vector3(1.5, 4, 2.5));
  S.lights.key.target = S.stage;
  S.anchored = true;
}

// ---------- WebXR AR+ ----------

export async function xrSupported() {
  try {
    return !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar'));
  } catch {
    return false;
  }
}

export async function startXR(onEnd) {
  if (!init() || S.xr) return false;
  try {
    const root = $('#encounter');
    const session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root },
    });
    S.renderer.xr.enabled = true;
    S.renderer.xr.setReferenceSpaceType('local');
    await S.renderer.xr.setSession(session);
    S.xr = session;
    if (S.stream) {
      S.stream.getTracks().forEach((t) => t.stop());
      S.stream = null;
    }
    root.classList.add('xr');
    S.backdrop.visible = false;
    S.stage.visible = false;
    S.placed = false;
    const viewer = await session.requestReferenceSpace('viewer');
    S.hitSource = await session.requestHitTestSource({ space: viewer });
    if (!S.reticle) {
      S.reticle = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
      S.reticle.matrixAutoUpdate = false;
      S.scene.add(S.reticle);
    }
    S.reticle.visible = false;
    for (const el of root.querySelectorAll('.enc-top, #enc-panel, #battle-hud')) el.addEventListener('beforexrselect', (e) => e.preventDefault());
    session.addEventListener('select', () => {
      if (!S.reticle.visible) return;
      const p = new THREE.Vector3().setFromMatrixPosition(S.reticle.matrix);
      S.stage.position.copy(p);
      const cam = S.renderer.xr.getCamera();
      const cp = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
      S.stage.lookAt(cp.x, p.y, cp.z);
      S.lights.key.position.copy(p).add(new THREE.Vector3(1.5, 4, 2.5));
      S.stage.visible = true;
      S.placed = true;
      $('#ar-hint').classList.remove('show');
    });
    session.addEventListener('end', () => {
      S.xr = null;
      S.hitSource = null;
      S.renderer.xr.enabled = false;
      if (S.reticle) S.reticle.visible = false;
      S.stage.visible = true;
      S.placed = true;
      root.classList.remove('xr');
      S.anchored = false;
      if (S.running) {
        S.backdrop.visible = true;
        resize();
        S.renderer.setAnimationLoop(frame);
      }
      onEnd?.();
    });
    S.renderer.setAnimationLoop(frame);
    return true;
  } catch (e) {
    console.warn('AR+ failed', e);
    return false;
  }
}

// ---------- Frame loop ----------

const tmpV = new THREE.Vector3();

function frame(time, xrFrame) {
  const dt = Math.min(0.05, S.clock.getDelta());
  const t = S.clock.elapsedTime;
  const cam = S.xr ? S.renderer.xr.getCamera() : S.camera;
  if (!S.xr) {
    if (S.hasSensor && S.sensorQ) S.camera.quaternion.slerp(S.sensorQ, 0.35);
    else S.camera.quaternion.setFromEuler(new THREE.Euler(-0.5, 0, 0));
    if (!S.anchored) anchor();
    if (!S.hasSensor && S.foe) {
      // no motion sensors (desktop, or permission denied): frame the creature nicely
      const look = S.stage.localToWorld(new THREE.Vector3(S.buddy ? -0.15 : 0, S.foe.hover * 0.8 + S.foe.size * 0.35, S.buddy ? -0.2 : 0));
      S.camera.lookAt(look);
    }
  } else if (xrFrame && S.hitSource) {
    const hits = xrFrame.getHitTestResults(S.hitSource);
    if (hits.length) {
      const pose = hits[0].getPose(S.renderer.xr.getReferenceSpace());
      S.reticle.visible = !S.placed;
      S.reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      S.reticle.visible = false;
    }
    if (!S.placed) {
      const h = $('#ar-hint');
      h.textContent = S.reticle.visible ? 'Tap to place it on the floor' : 'Point at the floor and move your phone slowly';
      h.classList.add('show');
    }
  }
  // actors
  for (const k of ['foe', 'buddy']) {
    const a = S[k];
    if (!a) continue;
    a.actor.update(dt);
    if (a.fairy) {
      // fairies flit around in the air
      a.holder.position.set(Math.sin(t * 0.7) * 0.35, Math.sin(t * 1.3) * 0.12, Math.sin(t * 0.45) * 0.15);
      a.shadow.position.y = -a.holder.position.y + 0.003;
      a.shadow.material.opacity = 0.35;
    }
    if (k === 'foe') {
      S.spinVel *= 0.92;
      if (Math.abs(S.spinVel) > 0.0005) a.spin += S.spinVel * 0.3;
      a.spin *= 0.985; // drift back to facing you
      a.actor.model.root.rotation.y = a.spin;
    }
  }
  if (S.backdrop?.userData.flies && S.backdrop.visible) {
    for (const f of S.backdrop.userData.flies.children) {
      const u = f.userData;
      const a = u.a + t * u.s;
      f.position.set(Math.cos(a) * u.r, u.y + Math.sin(t + u.a) * 0.2, Math.sin(a) * u.r);
      f.material.opacity = 0.5 + 0.5 * Math.sin(t * 3 + u.a * 5);
    }
  }
  // particles
  for (let i = S.fx.length - 1; i >= 0; i--) {
    const p = S.fx[i];
    p.life -= dt;
    p.vel.y += p.gravity * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    const k = p.life / p.max;
    if (p.fade) p.obj.material.opacity = Math.max(0, k);
    if (p.life <= 0) {
      S.scene.remove(p.obj);
      p.obj.material.dispose();
      S.fx.splice(i, 1);
    }
  }
  S.renderer.render(S.scene, S.camera);
  positionBubble(cam);
}

// Keep the speech bubble above the creature's head, and point to it when it is off screen.
function positionBubble(cam) {
  const el = $('#ar-anchor');
  const hint = $('#ar-hint');
  if (!S.foe || !el) return;
  const a = S.foe;
  const top = a.size * (a.actor.model.top || 1) + a.hover + 0.06;
  a.holder.localToWorld(tmpV.set(0, top, 0));
  tmpV.project(cam);
  const behind = tmpV.z > 1;
  const x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
  const half = Math.min(window.innerWidth / 2, ($('#bubble').offsetWidth || 0) / 2 + 10);
  const cx = Math.max(half, Math.min(window.innerWidth - half, x));
  const cy = Math.max(130, Math.min(window.innerHeight * 0.74, y));
  el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
  if (S.xr && !S.placed) return;
  const off = behind || x < -40 || x > window.innerWidth + 40 || y < -80 || y > window.innerHeight + 40;
  hint.classList.toggle('show', off);
  if (off) {
    hint.textContent = behind ? '↻ Turn around — it is behind you' : x < 0 ? '⟵ It is over here' : x > window.innerWidth ? 'It is over here ⟶' : y < 0 ? '↑ Look up' : '↓ Look down';
  }
}
