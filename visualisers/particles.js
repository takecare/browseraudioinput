import { Visualiser, bandLevel, logBands } from './base.js';

const MAX_PARTICLES = 900;
const BAND_COUNT = 24;
const BASS_BANDS = 5;
const TRAIL = 'rgba(11, 13, 18, 0.3)';
const BEAT_THRESHOLD = 1.25; // bass must jump this far above its recent average
const BEAT_MIN_LEVEL = 0.35;
const BEAT_COOLDOWN = 0.12; // seconds
const DRAG = 0.35; // fraction of speed kept after one second

// Sparks burst from the centre on every bass hit, with a steady trickle
// that follows overall loudness.
export class ParticlesVisualiser extends Visualiser {
  static id = 'particles';
  static label = 'Particles';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(BAND_COUNT, audio);
    // Particles live in a ring buffer of typed arrays: no allocation per frame.
    this.x = new Float32Array(MAX_PARTICLES);
    this.y = new Float32Array(MAX_PARTICLES);
    this.vx = new Float32Array(MAX_PARTICLES);
    this.vy = new Float32Array(MAX_PARTICLES);
    this.life = new Float32Array(MAX_PARTICLES);
    this.hue = new Float32Array(MAX_PARTICLES);
    this.next = 0;
    this.bassAverage = 0;
    this.cooldown = 0;
    this.emitDebt = 0;
  }

  resize(width, height, dpr) {
    super.resize(width, height, dpr);
    this.clear();
  }

  spawn(count, energy, baseHue) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const size = Math.min(this.width, this.height);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (i + 1) % MAX_PARTICLES;
      const angle = Math.random() * Math.PI * 2;
      const speed = size * (0.15 + Math.random() * 0.6) * (0.5 + energy);
      this.x[i] = cx;
      this.y[i] = cy;
      this.vx[i] = Math.cos(angle) * speed;
      this.vy[i] = Math.sin(angle) * speed;
      this.life[i] = 0.6 + Math.random() * 0.4;
      this.hue[i] = baseHue + Math.random() * 50;
    }
  }

  draw({ frequencyData, time, deltaTime }) {
    const { ctx, width, height, dpr } = this;
    const dt = deltaTime / 1000;

    let bass = 0;
    let overall = 0;
    this.bands.forEach((band, i) => {
      const level = bandLevel(frequencyData, band);
      overall += level / BAND_COUNT;
      if (i < BASS_BANDS) bass += level / BASS_BANDS;
    });

    const baseHue = (time / 60) % 360;
    this.cooldown -= dt;
    if (bass > BEAT_MIN_LEVEL && bass > this.bassAverage * BEAT_THRESHOLD && this.cooldown <= 0) {
      this.spawn(Math.round(60 + bass * 140), bass, baseHue);
      this.cooldown = BEAT_COOLDOWN;
    }
    this.bassAverage += (bass - this.bassAverage) * Math.min(1, dt * 4);

    this.emitDebt += overall * dt * 180;
    const trickle = Math.floor(this.emitDebt);
    this.emitDebt -= trickle;
    this.spawn(trickle, overall * 0.5, baseHue + 180);

    ctx.fillStyle = TRAIL;
    ctx.fillRect(0, 0, width, height);

    // A soft core that swells with the bass. Kept faint: with the trail fade,
    // anything drawn every frame builds up towards full opacity.
    const coreRadius = Math.min(width, height) * (0.02 + bass * 0.05);
    const core = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, coreRadius);
    core.addColorStop(0, `hsla(${baseHue}, 90%, 70%, ${0.05 + bass * 0.15})`);
    core.addColorStop(1, `hsla(${baseHue}, 90%, 60%, 0)`);
    ctx.fillStyle = core;
    ctx.fillRect(width / 2 - coreRadius, height / 2 - coreRadius, coreRadius * 2, coreRadius * 2);

    ctx.globalCompositeOperation = 'lighter';

    const drag = DRAG ** dt;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.7;
      if (this.life[i] <= 0) continue;
      this.vx[i] *= drag;
      this.vy[i] *= drag;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;

      const life = this.life[i];
      ctx.fillStyle = `hsla(${this.hue[i]}, 95%, 65%, ${life})`;
      ctx.beginPath();
      ctx.arc(this.x[i], this.y[i], (1.2 + life * 3) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
