// Fully synthesized audio: ocean ambience, gentle generative chimes and UI feedback.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const noteHz = (n, base = 392) => base * Math.pow(2, n / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicTimer = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(ctx.destination);
      // reverb
      this.verb = ctx.createConvolver();
      this.verb.buffer = this._impulse(3.2);
      this.verbGain = ctx.createGain();
      this.verbGain.gain.value = 0.55;
      this.verb.connect(this.verbGain).connect(this.master);
      this.fx = ctx.createGain();
      this.fx.connect(this.master);
      this.fx.connect(this.verb);
      this._ocean();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.1);
  }

  _impulse(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  _ocean() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // brown noise
        d[i] = last * 3.2;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain).connect(g.gain);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.13;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = 220;
    lfo2.connect(lfo2Gain).connect(lp.frequency);
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    lfo.start();
    lfo2.start();
  }

  _tone(freq, { type = 'sine', attack = 0.005, decay = 1.2, gain = 0.2, when = 0, detune = 0, dest = this.fx } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  _bell(freq, gain = 0.12, when = 0) {
    this._tone(freq, { gain, decay: 1.8, when });
    this._tone(freq * 2.01, { gain: gain * 0.35, decay: 0.9, when });
    this._tone(freq * 3.03, { gain: gain * 0.12, decay: 0.5, when });
  }

  _click(gain = 0.08, freq = 2200) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.fx);
    src.start();
  }

  grab() { this._click(0.06, 1400); }
  release() { this._click(0.05, 900); }

  /** Called whenever the beam changes; pitch follows how far the light travels. */
  tick(beamLength) {
    const i = Math.max(0, Math.min(PENTA.length - 1, Math.round(beamLength / 2.2)));
    this._click(0.07, 2600);
    this._tone(noteHz(PENTA[i]), { gain: 0.07, decay: 0.7, type: 'triangle' });
  }

  locked() {
    this._click(0.1, 500);
    this._tone(110, { gain: 0.08, decay: 0.15, type: 'square' });
  }

  boat() {
    this._bell(noteHz(12), 0.1);
    this._bell(noteHz(19), 0.07, 0.12);
  }

  depart() {
    [0, 4, 7, 12].forEach((n, i) => this._tone(noteHz(n + 12), { gain: 0.05, decay: 0.6, when: i * 0.07, type: 'triangle' }));
  }

  win() {
    [0, 7, 12, 16, 19, 24].forEach((n, i) => this._bell(noteHz(n), 0.09, i * 0.11));
    this._tone(noteHz(-12), { gain: 0.12, attack: 0.4, decay: 3.5 });
    this._tone(noteHz(-5), { gain: 0.08, attack: 0.5, decay: 3.5 });
  }

  ui() { this._tone(noteHz(14), { gain: 0.05, decay: 0.25, type: 'triangle' }); }

  star(i) { this._bell(noteHz(12 + [0, 4, 7][i]), 0.09); }

  /** Sparse generative music, call every frame. */
  update(dt) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 2.4 + Math.random() * 3.5;
      const n = PENTA[Math.floor(Math.random() * 7)];
      this._tone(noteHz(n - 12), { gain: 0.035, attack: 0.6, decay: 4, type: 'sine' });
      if (Math.random() < 0.5) this._tone(noteHz(n - 5), { gain: 0.02, attack: 0.8, decay: 4, type: 'sine', when: 0.4 });
    }
  }
}
