import { Visualiser } from './base.js';

const STAR_COUNT = 500;
const MIN_Z = 0.02;
const BASE_SPEED = 0.12; // depth units per second when silent
const LOUDNESS_SPEED = 3.5; // extra speed at full loudness
const TRAIL = 'rgba(5, 6, 10, 0.45)';

// Flying through a starfield: the louder the music, the faster you go.
export class StarfieldVisualiser extends Visualiser {
  static id = 'starfield';
  static label = 'Starfield';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.x = new Float32Array(STAR_COUNT);
    this.y = new Float32Array(STAR_COUNT);
    this.z = new Float32Array(STAR_COUNT);
    this.hue = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      this.resetStar(i);
      this.z[i] = MIN_Z + Math.random() * (1 - MIN_Z); // spread out the first stars
    }
    this.speed = BASE_SPEED;
  }

  resetStar(i) {
    this.x[i] = Math.random() * 2 - 1;
    this.y[i] = Math.random() * 2 - 1;
    this.z[i] = 1;
    this.hue[i] = 180 + Math.random() * 100;
  }

  resize(width, height, dpr) {
    super.resize(width, height, dpr);
    this.clear();
  }

  draw({ waveformData, deltaTime }) {
    const { ctx, width, height, dpr } = this;
    const dt = deltaTime / 1000;

    // RMS of the waveform is a good measure of loudness.
    let sumSquares = 0;
    for (let i = 0; i < waveformData.length; i++) {
      const sample = (waveformData[i] - 128) / 128;
      sumSquares += sample * sample;
    }
    const loudness = Math.min(1, Math.sqrt(sumSquares / waveformData.length) * 2.5);
    const targetSpeed = BASE_SPEED + loudness * LOUDNESS_SPEED;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 6);

    ctx.fillStyle = TRAIL;
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';

    const cx = width / 2;
    const cy = height / 2;
    const focal = Math.max(width, height) * 0.5;

    for (let i = 0; i < STAR_COUNT; i++) {
      const previousZ = this.z[i];
      this.z[i] -= this.speed * dt;
      const z = this.z[i];
      if (z <= MIN_Z) {
        this.resetStar(i);
        continue;
      }

      const x0 = cx + (this.x[i] / previousZ) * focal;
      const y0 = cy + (this.y[i] / previousZ) * focal;
      const x1 = cx + (this.x[i] / z) * focal;
      const y1 = cy + (this.y[i] / z) * focal;
      if (x1 < 0 || x1 > width || y1 < 0 || y1 > height) {
        this.resetStar(i);
        continue;
      }

      const closeness = 1 - z;
      ctx.strokeStyle = `hsla(${this.hue[i]}, 70%, ${60 + loudness * 30}%, ${closeness})`;
      ctx.lineWidth = (0.5 + closeness * 2.5) * dpr;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }
}
