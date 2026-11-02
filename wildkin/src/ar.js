// Camera-passthrough AR. The rear camera fills the screen and the creature is pinned to a real-world
// direction using the phone's orientation sensors: turn away and it slides off screen, turn back and it is there.
// Works in any modern mobile browser (no WebXR needed). Without a camera it shows a painted backdrop.
import { $ } from './ui.js';

const FOV_DEG = 62; // approximate horizontal field of view of a phone's main camera

const state = {
  stream: null,
  yaw: null, pitch: null, // where the camera points (degrees)
  smoothYaw: null, smoothPitch: null,
  anchorYaw: null, anchorPitch: null,
  hasSensor: false,
  raf: 0,
  running: false,
};

function onOrientation(e) {
  if (e.alpha == null && e.beta == null) return;
  // Rear camera direction from the W3C device orientation rotation matrix.
  const a = ((e.alpha || 0) * Math.PI) / 180;
  const b = ((e.beta || 0) * Math.PI) / 180;
  const g = ((e.gamma || 0) * Math.PI) / 180;
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g);
  const vx = -(cG * sA * sB + cA * sG);
  const vy = -(sA * sG - cA * cG * sB);
  const vz = -cB * cG;
  // Relative yaw is all we need: the creature is anchored to wherever you were facing when it appeared.
  state.yaw = (Math.atan2(vx, vy) * 180) / Math.PI;
  state.pitch = (Math.asin(Math.max(-1, Math.min(1, vz))) * 180) / Math.PI;
  state.hasSensor = true;
}

// Must be called from inside a tap handler (iOS asks for permission).
export function requestSensors() {
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === 'function') {
    D.requestPermission().catch(() => {});
  }
}

const wrap = (d) => ((d + 540) % 360) - 180;

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  const v = $('#cam');
  v.srcObject = stream;
  await v.play().catch(() => {});
  return stream;
}

export async function startAR(useCamera) {
  state.running = true;
  state.anchorYaw = null;
  state.anchorPitch = null;
  window.addEventListener('deviceorientation', onOrientation);
  const scene = $('#encounter');
  scene.classList.toggle('night', new Date().getHours() >= 19 || new Date().getHours() < 6);
  scene.classList.remove('camera-on');
  if (useCamera && !state.stream) {
    try {
      state.stream = await startCamera();
    } catch (e) {
      console.warn('camera unavailable', e);
      state.stream = null;
    }
  }
  if (!state.running) return stopAR(); // closed while starting
  scene.classList.toggle('camera-on', !!state.stream);
  cancelAnimationFrame(state.raf);
  loop();
}

export function stopAR() {
  state.running = false;
  cancelAnimationFrame(state.raf);
  window.removeEventListener('deviceorientation', onOrientation);
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
  const v = $('#cam');
  if (v) v.srcObject = null;
}

export const cameraOn = () => !!state.stream;

// Pin the creature where the phone is pointing right now.
export function anchorHere() {
  state.anchorYaw = state.yaw;
  state.anchorPitch = state.pitch == null ? null : Math.max(-35, Math.min(20, state.pitch));
}

function loop() {
  state.raf = requestAnimationFrame(loop);
  const actor = $('#ar-anchor');
  const hint = $('#ar-hint');
  const bg = $('#ar-backdrop');
  if (!actor) return;
  if (state.yaw == null) {
    actor.style.transform = 'translate(0px, 0px)';
    hint.classList.remove('show');
    return;
  }
  if (state.anchorYaw == null) anchorHere();
  if (state.smoothYaw == null) {
    state.smoothYaw = state.yaw;
    state.smoothPitch = state.pitch;
  }
  state.smoothYaw += wrap(state.yaw - state.smoothYaw) * 0.25;
  state.smoothPitch += (state.pitch - state.smoothPitch) * 0.25;
  const ppd = window.innerWidth / FOV_DEG;
  const dx = wrap(state.anchorYaw - state.smoothYaw) * ppd;
  const dy = (state.smoothPitch - state.anchorPitch) * ppd;
  actor.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
  if (bg) bg.style.backgroundPosition = `${(-state.smoothYaw * ppd * 0.5).toFixed(0)}px ${(state.smoothPitch * ppd * 0.5).toFixed(0)}px`;
  const off = Math.abs(dx) > window.innerWidth * 0.6 || Math.abs(dy) > window.innerHeight * 0.6;
  hint.classList.toggle('show', off);
  if (off) hint.textContent = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? '⟵ It is over here' : 'It is over here ⟶') : (dy < 0 ? '↑ Look up' : '↓ Look down');
}
