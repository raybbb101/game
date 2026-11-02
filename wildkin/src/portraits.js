// Renders 3D portraits of monsters and fairies to images (cached) so the same 3D look is used on the map,
// in menus and on cards. Falls back to the flat SVG art if WebGL is unavailable.
import * as THREE from '../vendor/three/three.module.js';
import { RoomEnvironment } from '../vendor/three/addons/environments/RoomEnvironment.js';
import { buildMonster, buildFairy, Actor, disposeModel } from './model3d.js';
import { monsterSVG, fairySVG } from './art.js';

const SIZE = 320;
let R = null; // { renderer, scene, camera }
let failed = false;
const cache = new Map();

export function addStudioLights(scene) {
  const hemi = new THREE.HemisphereLight('#ffffff', '#8f7f6a', 0.8);
  const key = new THREE.DirectionalLight('#fff4e6', 2.6);
  key.position.set(2.5, 4, 3.5);
  const fill = new THREE.DirectionalLight('#dfe8ff', 0.7);
  fill.position.set(-3, 1.5, 2);
  const rim = new THREE.DirectionalLight('#d6ecff', 1.6);
  rim.position.set(-1, 2.5, -4);
  scene.add(hemi, key, fill, rim);
  return { hemi, key, fill, rim };
}

export function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

function init() {
  if (R || failed) return R;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.environment = makeEnvironment(renderer);
    scene.environmentIntensity = 0.4;
    addStudioLights(scene);
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    R = { renderer, scene, camera };
  } catch (e) {
    console.warn('WebGL unavailable, using flat art', e);
    failed = true;
  }
  return R;
}

function render(key, build) {
  if (cache.has(key)) return cache.get(key);
  const r = init();
  if (!r) return null;
  const model = build();
  const actor = new Actor(model);
  actor.t = 0;
  actor.blinkAt = 99;
  actor.update(0);
  r.scene.add(model.root);
  model.root.rotation.y = -0.4;
  // frame the model
  const box = new THREE.Box3().setFromObject(model.root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(r.camera.fov / 2))) * 0.98;
  const target = sphere.center.clone();
  r.camera.position.set(target.x + dist * 0.06, target.y + dist * 0.2, target.z + dist * 0.98);
  r.camera.lookAt(target);
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL('image/png');
  r.scene.remove(model.root);
  disposeModel(model);
  cache.set(key, url);
  return url;
}

export const monsterPortrait = (speciesId) => render(`m:${speciesId}`, () => buildMonster(speciesId));
export const fairyPortrait = (kind) => render(`f:${kind}`, () => buildFairy(kind));

// HTML for a monster picture; drop-in replacement for monsterSVG().
export function monsterArt(speciesId, { size = 120, cls = '' } = {}) {
  const url = monsterPortrait(speciesId);
  if (!url) return monsterSVG(speciesId, { size, cls });
  return `<img class="mon-img ${cls}" src="${url}" width="${size}" height="${size}" alt="" draggable="false">`;
}

export function fairyArt(kind, size = 64) {
  const url = fairyPortrait(kind);
  if (!url) return fairySVG(kind, size);
  return `<img class="fairy-img" src="${url}" width="${size}" height="${size}" alt="" draggable="false">`;
}
