// Photo scanning. Colors and scenes are judged from the pixels on the device;
// objects (food, flowers, cups...) use MobileNet image classification, loaded on demand.
// analyzePixels / judge are pure and tested in Node.

export const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white', 'grey', 'black', 'brown'];

export function classifyPixel(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (v < 0.16) return 'black';
  if (s < 0.14) return v > 0.78 ? 'white' : 'grey';
  if (s < 0.22 && v > 0.88) return 'white';
  let h;
  const R = r / 255, G = g / 255, B = b / 255;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 12 || h >= 345) {
    if (s < 0.5 && v > 0.65) return 'pink';
    return v < 0.45 ? 'brown' : 'red';
  }
  if (h < 42) return v < 0.55 && s > 0.3 ? 'brown' : 'orange';
  if (h < 70) return v < 0.4 ? 'brown' : 'yellow';
  if (h < 165) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

// data: RGBA array, w x h. Returns shares of each color overall and in the top third, plus brightness info.
export function analyzePixels(data, w, h) {
  const shares = Object.fromEntries(COLOR_NAMES.map((c) => [c, 0]));
  const top = Object.fromEntries(COLOR_NAMES.map((c) => [c, 0]));
  let total = 0, topTotal = 0, bright = 0, lum = 0, topLum = 0;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const c = classifyPixel(r, g, b);
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      shares[c]++;
      total++;
      lum += l;
      if (l > 0.85) bright++;
      if (y < h / 3) {
        top[c]++;
        topTotal++;
        topLum += l;
      }
    }
  }
  for (const c of COLOR_NAMES) {
    shares[c] /= total || 1;
    top[c] /= topTotal || 1;
  }
  return { shares, top, lum: lum / (total || 1), topLum: topLum / (topTotal || 1), bright: bright / (total || 1) };
}

const COLOR_MIN = { white: 0.25, black: 0.3, grey: 0.35, default: 0.14 };

function judgeColor(color, a) {
  const share = a.shares[color] + (color === 'red' ? a.shares.pink * 0.3 : 0) + (color === 'pink' ? a.shares.red * 0.2 : 0);
  const need = COLOR_MIN[color] ?? COLOR_MIN.default;
  return { ok: share >= need, score: share / need };
}

function judgeScene(id, a) {
  switch (id) {
    case 'sky': {
      const s = a.top.blue + a.top.white * 0.9 + a.top.grey * 0.5;
      return { ok: s >= 0.55 && a.topLum > 0.42, score: s / 0.55 };
    }
    case 'greenery': {
      const s = a.shares.green + a.shares.brown * 0.2;
      return { ok: s >= 0.28, score: s / 0.28 };
    }
    case 'sunset': {
      const s = a.shares.orange + a.shares.pink + a.shares.red * 0.8 + a.shares.purple * 0.6 + a.shares.yellow * 0.5;
      return { ok: s >= 0.3, score: s / 0.3 };
    }
    case 'night': {
      const ok = a.lum < 0.32 && a.bright >= 0.004;
      return { ok, score: ok ? 1 : 0.4 };
    }
    default:
      return { ok: false, score: 0 };
  }
}

// labels: array of {className, probability} from the classifier, or null if it is unavailable.
export function judge(request, analysis, labels) {
  if (request.kind === 'color') return { ...judgeColor(request.id, analysis), via: 'colors' };
  if (request.kind === 'scene') return { ...judgeScene(request.id, analysis), via: 'scene' };
  if (labels && labels.length) {
    const hit = labels.find((l) => l.probability >= 0.04 && request.labels.some((k) => l.className.toLowerCase().includes(k)));
    return { ok: !!hit, score: hit ? 1 + hit.probability : 0.3, via: 'vision', seen: labels[0]?.className };
  }
  // offline fallback: judge by typical colors
  const f = request.fallback;
  const share = f.colors.reduce((s, c) => s + analysis.shares[c], 0);
  const plusOk = !f.plus || analysis.shares[f.plus] >= 0.1;
  return { ok: share >= f.min && plusOk, score: share / f.min, via: 'colors-fallback' };
}

// ---------- Browser-only helpers ----------

export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = reject;
    img.src = url;
  });
}

export function imageToAnalysis(img) {
  const size = 224;
  const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const analysis = analyzePixels(ctx.getImageData(0, 0, w, h).data, w, h);
  // square crop for the classifier
  const sq = document.createElement('canvas');
  sq.width = sq.height = size;
  const m = Math.min(img.naturalWidth, img.naturalHeight);
  sq.getContext('2d').drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, size, size);
  return { analysis, square: sq };
}

let modelPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export function loadVision() {
  if (!modelPromise) {
    modelPromise = (async () => {
      if (!window.tf) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
      if (!window.mobilenet) await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js');
      return window.mobilenet.load({ version: 2, alpha: 1.0 });
    })().catch((e) => {
      console.warn('Vision model unavailable, using color fallback', e);
      modelPromise = null;
      return null;
    });
  }
  return modelPromise;
}

export async function scanPhoto(file, request) {
  const { img, url } = await loadImageFile(file);
  const { analysis, square } = imageToAnalysis(img);
  let labels = null;
  if (request.kind === 'object') {
    const model = await Promise.race([loadVision(), new Promise((r) => setTimeout(() => r(null), 25000))]);
    if (model) {
      try {
        labels = await model.classify(square, 5);
      } catch (e) {
        console.warn(e);
      }
    }
  }
  return { ...judge(request, analysis, labels), url, analysis };
}
