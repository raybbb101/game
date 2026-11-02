// Rendering stage: renderer, sky, ocean, lights, post-processing and camera framing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const BEAM_Y = 0.45;
export const WATER_Y = -0.32;

const PALETTE = {
  skyTop: new THREE.Color('#0b1030'),
  skyMid: new THREE.Color('#2a2f6b'),
  horizon: new THREE.Color('#d9897a'),
  glow: new THREE.Color('#ffb17a'),
  deep: new THREE.Color('#0a2a45'),
  shallow: new THREE.Color('#2fa3a8'),
  foam: new THREE.Color('#eaf6ff'),
  fog: new THREE.Color('#4a4a82'),
};

const MOON_DIR = new THREE.Vector3(-0.45, 0.55, -0.7).normalize();
const GLOW_DIR = new THREE.Vector3(0.35, 0.02, -1).normalize();

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
`;

const SKY_FN = /* glsl */ `
uniform vec3 uTop, uMid, uHorizon, uGlow, uMoonDir, uGlowDir;
vec3 skyColor(vec3 d){
  float h = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.05, 0.28, h));
  col = mix(col, uTop, smoothstep(0.25, 0.95, h));
  float g = pow(max(dot(d, uGlowDir), 0.0), 5.0) * smoothstep(0.55, -0.05, h);
  col += uGlow * g * 0.9;
  if (h < 0.0) col = mix(col, uMid * 0.55, smoothstep(0.0, -0.2, h));
  return col;
}
`;

export function makeGlowTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.pixelRatio = this.maxPixelRatio;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.glowTexture = makeGlowTexture();

    this.time = 0;
    this.camState = { pos: new THREE.Vector3(0, 14, 12), look: new THREE.Vector3() };
    this.camTarget = { pos: new THREE.Vector3(0, 14, 12), look: new THREE.Vector3() };
    this.orbit = null;

    this._lights();
    this._sky();
    this._environment();
    this._water();
    this._motes();
    this._post();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x9fb3ff, 0x3a2848, 1.1));
    const moon = new THREE.DirectionalLight(0xc8d8ff, 2.0);
    moon.position.copy(MOON_DIR).multiplyScalar(14);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.near = 1;
    sc.far = 40;
    moon.shadow.bias = -0.0004;
    moon.shadow.normalBias = 0.025;
    s.add(moon);
    this.moon = moon;
    const warm = new THREE.DirectionalLight(0xff9b70, 0.9);
    warm.position.copy(GLOW_DIR).multiplyScalar(10).setY(2.5);
    s.add(warm);
  }

  _skyUniforms() {
    return {
      uTop: { value: PALETTE.skyTop },
      uMid: { value: PALETTE.skyMid },
      uHorizon: { value: PALETTE.horizon },
      uGlow: { value: PALETTE.glow },
      uMoonDir: { value: MOON_DIR },
      uGlowDir: { value: GLOW_DIR },
      uTime: { value: 0 },
    };
  }

  _skyMaterial(stars) {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this._skyUniforms(),
      defines: stars ? { STARS: 1 } : {},
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vDir;
        uniform float uTime;
        ${SKY_FN}
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          vec3 d = normalize(vDir);
          vec3 col = skyColor(d);
          float m = dot(d, uMoonDir);
          col += vec3(1.0, 0.96, 0.88) * smoothstep(0.99935, 0.9997, m) * 2.4;
          col += vec3(0.55, 0.65, 1.0) * pow(max(m, 0.0), 120.0) * 0.5;
          #ifdef STARS
          vec3 sp = d * 160.0;
          vec3 cell = floor(sp);
          float r = hash(cell);
          if (r > 0.93) {
            vec3 f = fract(sp) - 0.5;
            float s = smoothstep(0.16, 0.0, length(f));
            float tw = 0.55 + 0.45 * sin(uTime * (1.0 + r * 3.0) + r * 90.0);
            col += vec3(0.9, 0.95, 1.0) * s * tw * 2.2 * smoothstep(0.08, 0.5, d.y);
          }
          #endif
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
  }

  _sky() {
    this.skyMat = this._skyMaterial(true);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;
  }

  _environment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this._skyMaterial(false)));
    // a few bright patches so metal and mirrors catch highlights
    const patch = (color, pos, r) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.copy(pos);
      envScene.add(m);
    };
    patch(new THREE.Color(3, 2.6, 2.2), MOON_DIR.clone().multiplyScalar(40), 3);
    patch(new THREE.Color(2.4, 1.3, 0.8), GLOW_DIR.clone().multiplyScalar(40).setY(4), 7);
    const env = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.7;
    pmrem.dispose();
  }

  _water() {
    const geo = new THREE.PlaneGeometry(240, 240, 220, 220);
    geo.rotateX(-Math.PI / 2);
    // pack more vertices near the centre: remap positions with a power curve
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 120;
      const z = pos.getZ(i) / 120;
      const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), 2.2) * 120;
      pos.setXYZ(i, f(x), 0, f(z));
    }
    const maskTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    maskTex.needsUpdate = true;
    this.waterUniforms = {
      ...this._skyUniforms(),
      uDeep: { value: PALETTE.deep },
      uShallow: { value: PALETTE.shallow },
      uFoam: { value: PALETTE.foam },
      uFog: { value: PALETTE.fog },
      uMask: { value: maskTex },
      uMaskRect: { value: new THREE.Vector4(-1, -1, 2, 2) },
      uOrb: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uMask;
        uniform vec4 uMaskRect;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vMask;
        varying float vCrest;
        void wave(vec2 p, vec2 dir, float k, float a, float s, inout float h, inout vec2 dh){
          float ph = dot(dir, p) * k + uTime * s;
          h += a * sin(ph);
          dh += a * k * cos(ph) * dir;
        }
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec2 muv = (wp.xz - uMaskRect.xy) / uMaskRect.zw;
          float m = (muv.x > 0.0 && muv.x < 1.0 && muv.y > 0.0 && muv.y < 1.0) ? texture2D(uMask, muv).r : 0.0;
          float amp = 1.0 - 0.65 * smoothstep(0.0, 0.6, m);
          float h = 0.0; vec2 dh = vec2(0.0);
          wave(wp.xz, normalize(vec2(1.0, 0.35)), 0.55, 0.06, 1.1, h, dh);
          wave(wp.xz, normalize(vec2(-0.4, 1.0)), 0.9, 0.035, 1.6, h, dh);
          wave(wp.xz, normalize(vec2(0.8, -0.7)), 1.7, 0.016, 2.3, h, dh);
          wave(wp.xz, normalize(vec2(-1.0, -0.2)), 2.6, 0.009, 3.1, h, dh);
          h *= amp; dh *= amp;
          wp.y += h;
          vWorld = wp.xyz;
          vNormal = normalize(vec3(-dh.x, 1.0, -dh.y));
          vMask = m;
          vCrest = h;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uDeep, uShallow, uFoam, uFog;
        uniform vec4 uOrb;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vMask;
        varying float vCrest;
        ${SKY_FN}
        ${NOISE_GLSL}
        void main(){
          vec2 p = vWorld.xz;
          float n1 = vnoise(p * 3.0 + vec2(uTime * 0.4, uTime * 0.25));
          float n2 = vnoise(p * 7.0 - vec2(uTime * 0.3, -uTime * 0.5));
          vec3 N = normalize(vNormal + vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.1);
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          vec3 R = reflect(-V, N);
          R.y = max(abs(R.y), 0.35);
          vec3 refl = skyColor(normalize(R));
          float m = vMask;
          vec3 base = mix(uDeep, uShallow, smoothstep(0.02, 0.75, m) * 0.85);
          base *= 0.75 + 0.5 * vCrest / 0.08 * 0.3 + 0.1;
          vec3 col = mix(base, refl * 0.55, clamp(fres, 0.0, 1.0) * 0.6);
          float spec = pow(max(dot(R, uMoonDir), 0.0), 420.0);
          col += vec3(0.9, 0.95, 1.0) * spec * 1.1;
          float gspec = pow(max(dot(R, normalize(vec3(uGlowDir.x, 0.15, uGlowDir.z))), 0.0), 90.0);
          col += uGlow * gspec * 0.35;
          // shoreline foam
          float shore = smoothstep(0.2, 0.42, m) * (1.0 - smoothstep(0.55, 0.85, m));
          float fn = vnoise(p * 9.0 + vec2(uTime * 0.6, uTime * 0.2)) * vnoise(p * 4.0 - uTime * 0.3);
          float band = 0.5 + 0.5 * sin(m * 26.0 - uTime * 1.6);
          float foam = shore * smoothstep(0.35, 0.6, fn * 1.1 + band * 0.4);
          foam += smoothstep(0.86, 0.95, m) * 0.35;
          col = mix(col, uFoam * 0.75, clamp(foam, 0.0, 1.0) * 0.7);
          // Lumi's light on the water
          vec2 od = p - uOrb.xz;
          col += vec3(1.0, 0.75, 0.4) * uOrb.w * exp(-dot(od, od) * 1.8) * (0.7 + 0.6 * n1);
          // fog toward horizon
          float dist = length(vWorld.xz);
          float fog = smoothstep(14.0, 110.0, dist);
          fog = fog * fog * (3.0 - 2.0 * fog);
          vec3 fogCol = skyColor(normalize(vec3(-V.x, 0.02, -V.z)));
          col = mix(col, fogCol, clamp(fog, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const water = new THREE.Mesh(geo, mat);
    water.position.y = WATER_Y;
    water.frustumCulled = false;
    water.receiveShadow = false;
    this.scene.add(water);
    this.water = water;
  }

  /** mask: grayscale Uint8 array (w*h), rect = [minX, minZ, sizeX, sizeZ] in world units */
  setIslandMask(data, w, h, rect) {
    const old = this.waterUniforms.uMask.value;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = data[i];
      rgba[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(rgba, w, h, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.waterUniforms.uMask.value = tex;
    this.waterUniforms.uMaskRect.value.set(...rect);
    old.dispose();
  }

  _motes() {
    const count = 90;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uMap: { value: this.glowTexture }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uScale;
        varying float vA; varying float vS;
        void main(){
          vec3 p = position;
          float t = uTime * (0.15 + seed * 0.2) + seed * 50.0;
          p.x += sin(t) * 0.6; p.z += cos(t * 0.8) * 0.6;
          p.y = mod(p.y + uTime * (0.05 + seed * 0.08), 3.0) + 0.1;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.05 + seed * 0.08) * uScale / -mv.z;
          vA = (0.35 + 0.65 * sin(uTime * 1.5 + seed * 30.0) * 0.5 + 0.5) * smoothstep(0.0, 0.6, p.y) * smoothstep(3.0, 2.2, p.y);
          vS = seed;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying float vA; varying float vS;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).r;
          vec3 c = mix(vec3(1.0, 0.8, 0.45), vec3(0.5, 0.9, 1.0), step(0.6, vS));
          gl_FragColor = vec4(c * a * vA * 0.9, 1.0);
        }
      `,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.motes = pts;
  }

  _post() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, rt);
    composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.32, 0.92);
    composer.addPass(this.bloom);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.motes.material.uniforms.uScale.value = this.projScale();
    if (this.onResize) this.onResize();
  }

  /** pixels per world unit at distance 1 (for point sprites) */
  projScale() {
    return (this.height * this.pixelRatio) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
  }

  /**
   * Compute a camera position that frames a box of half-extents (hx, hz) and height range.
   * ndc: allowed rect {left,right,bottom,top} in NDC to leave room for UI.
   */
  frameBox(hx, hz, ndc, tiltDeg = 56, yaw = 0) {
    const cam = this.camera.clone();
    cam.aspect = this.width / this.height;
    cam.updateProjectionMatrix();
    const tilt = THREE.MathUtils.degToRad(tiltDeg);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));
    const corners = [];
    for (const x of [-hx, hx]) for (const y of [-0.2, 1.3]) for (const z of [-hz, hz]) corners.push(new THREE.Vector3(x, y, z));
    const look = new THREE.Vector3(0, 0, 0);
    const fits = (d, lookZ) => {
      look.set(0, 0, lookZ);
      cam.position.copy(dir).multiplyScalar(d).add(look);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      let minY = Infinity, maxY = -Infinity, ok = true;
      for (const c of corners) {
        const p = c.clone().project(cam);
        if (p.x < ndc.left || p.x > ndc.right) ok = false;
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      return { ok: ok && maxY - minY <= ndc.top - ndc.bottom, minY, maxY };
    };
    let lo = 2, hi = 80;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, 0).ok) hi = mid; else lo = mid;
    }
    // shift look target so the board sits centred in the allowed vertical band
    let lookZ = 0;
    for (let i = 0; i < 4; i++) {
      const r = fits(hi, lookZ);
      const off = (ndc.top + ndc.bottom) / 2 - (r.maxY + r.minY) / 2;
      lookZ += off * hz * 0.6;
    }
    fits(hi, lookZ);
    return { pos: cam.position.clone(), look: look.clone() };
  }

  setCamera(pos, look, instant = false) {
    this.orbit = null;
    this.camTarget.pos.copy(pos);
    this.camTarget.look.copy(look);
    if (instant) {
      this.camState.pos.copy(pos);
      this.camState.look.copy(look);
    }
  }

  setOrbit(radius, height, lookY = 0.5) {
    this.orbit = { radius, height, look: new THREE.Vector3(0, lookY, 0), angle: this.orbit ? this.orbit.angle : 0.6 };
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.skyMat.uniforms.uTime.value = t;
    this.waterUniforms.uTime.value = t;
    this.motes.material.uniforms.uTime.value = t;

    if (this.orbit) {
      this.orbit.angle += dt * 0.08;
      const o = this.orbit;
      this.camTarget.pos.set(Math.sin(o.angle) * o.radius, o.height, Math.cos(o.angle) * o.radius).add(o.look);
      this.camTarget.look.copy(o.look);
    }
    const k = 1 - Math.exp(-dt * 2.6);
    this.camState.pos.lerp(this.camTarget.pos, k);
    this.camState.look.lerp(this.camTarget.look, k);
    const sway = this.orbit ? 0 : 0.05;
    this.camera.position.copy(this.camState.pos);
    this.camera.position.x += Math.sin(t * 0.25) * sway;
    this.camera.position.y += Math.sin(t * 0.33) * sway * 0.6;
    this.camera.lookAt(this.camState.look);
  }

  render() {
    this.composer.render();
  }
}
