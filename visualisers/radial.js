import { Visualiser, bandLevel, logBands } from './base.js';

const BAND_COUNT = 128;
const BASS_BANDS = 12; // lowest bands drive the pulsing centre

// Spectrum bars arranged in a ring whose radius pulses with the bass.
export class RadialVisualiser extends Visualiser {
  static id = 'radial';
  static label = 'Radial pulse';

  constructor(ctx, audio) {
    super(ctx, audio);
    this.bands = logBands(BAND_COUNT, audio);
    this.levels = new Float32Array(BAND_COUNT);
    this.rotation = 0;
  }

  draw({ frequencyData, deltaTime }) {
    const { ctx, width, height, dpr } = this;
    this.clear();

    const { levels } = this;
    let bass = 0;
    this.bands.forEach((band, i) => {
      levels[i] = bandLevel(frequencyData, band);
      if (i < BASS_BANDS) bass += levels[i] / BASS_BANDS;
    });

    const size = Math.min(width, height);
    const innerRadius = size * (0.15 + bass * 0.08);
    const maxBarLength = size * 0.32;
    this.rotation += (deltaTime / 1000) * (0.1 + bass * 0.6);

    ctx.translate(width / 2, height / 2);
    ctx.rotate(this.rotation);

    ctx.fillStyle = `hsla(260, 80%, ${20 + bass * 40}%, 0.9)`;
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 0.9, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, ((Math.PI * 2 * innerRadius) / BAND_COUNT) * 0.6);

    // Mirror the bands so the ring is seamless: bass meets bass on one side,
    // treble meets treble on the other.
    for (let i = 0; i < BAND_COUNT * 2; i++) {
      const bandIndex = i < BAND_COUNT ? i : BAND_COUNT * 2 - 1 - i;
      const level = levels[bandIndex];
      const angle = (i / (BAND_COUNT * 2)) * Math.PI * 2;
      const length = 2 * dpr + level * maxBarLength;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      ctx.strokeStyle = `hsl(${200 + (bandIndex / BAND_COUNT) * 140}, 85%, ${45 + level * 25}%)`;
      ctx.beginPath();
      ctx.moveTo(cos * innerRadius, sin * innerRadius);
      ctx.lineTo(cos * (innerRadius + length), sin * (innerRadius + length));
      ctx.stroke();
    }
  }
}
